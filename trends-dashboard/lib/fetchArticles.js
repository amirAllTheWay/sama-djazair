const { searchNews, enrichArticle } = require('./newsClient');
const {
  detectBrands,
  detectOccasions,
  detectGarments,
  isFashionQuery,
} = require('./fashionVocabulary');

// More candidates are enriched than kept, so the cards shown are the best of a
// real field rather than whatever happened to be newest. The pool is smaller
// than it was with several sources: every Google link now costs a browser
// navigation, so widening it buys little and costs seconds.
const MAX_ARTICLES = 4;
const CANDIDATES_TO_ENRICH = 8;
const ENRICH_CONCURRENCY = 4;
const RECENT_WINDOW_DAYS = 60;

// Coverage is read from the US press, matching the market being tracked.
const DEFAULT_GEO = 'US';
const DEFAULT_HL = 'en-US';

function defaultArticleQueries(keyword) {
  return [`${keyword} outfit`, `${keyword} style`, `${keyword} wore`, `${keyword} red carpet`];
}

function dedupeKey(article) {
  // Same story syndicated across outlets keeps its headline; the URL does not.
  return article.title
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 70);
}

function ageInDays(publishedAt) {
  const time = Date.parse(publishedAt);
  if (Number.isNaN(time)) return null;
  return (Date.now() - time) / (1000 * 60 * 60 * 24);
}

// No public API reports share counts any more, so "most shared" is inferred:
// a story several outlets picked up travelled further than one nobody else
// touched, and recency decays that weight. A photo stays a tie-breaker rather
// than a gate, since resolving a relay link can fail and a story worth knowing
// about is worth a card either way.
function buzzScore(article) {
  const age = ageInDays(article.publishedAt);
  const recency = age === null ? 0.3 : Math.max(0, 1 - age / RECENT_WINDOW_DAYS);
  const pickup = Math.min(article.outletCount / 4, 1);
  const illustrated = article.image ? 0.1 : 0;
  const identified = article.brands.length ? 0.15 : 0;
  return recency * 0.5 + pickup * 0.35 + illustrated + identified;
}

async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;

  async function run() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

async function fetchStarArticles(star, { geo = DEFAULT_GEO, hl = DEFAULT_HL } = {}) {
  const queries = star.articleQueries || defaultArticleQueries(star.keyword);
  const collected = new Map();
  const errors = {};

  function absorb(item, label) {
    if (!item.title || !item.link) return;

    // The feed answers the query loosely; keep only what is about clothes.
    if (!isFashionQuery(`${item.title} ${item.snippet || ''}`)) return;

    const key = dedupeKey(item);
    const existing = collected.get(key);
    if (existing) {
      // Same story reached by another query: proof it travelled, not a duplicate.
      existing.outletCount += 1;
      existing.matchedQueries.add(label);
      return;
    }
    collected.set(key, { ...item, outletCount: 1, matchedQueries: new Set([label]) });
  }

  // Google News is the only source: its editorial selection proved the most
  // relevant, and the browser resolver now reaches the publisher pages its
  // relay links hide, so choosing it no longer costs the photos.
  for (const query of queries) {
    try {
      for (const item of await searchNews(query, { geo, hl })) absorb(item, query);
    } catch (err) {
      errors[`news:${query}`] = err.message || String(err);
    }
  }

  const candidates = [...collected.values()]
    .sort((a, b) => Date.parse(b.publishedAt || 0) - Date.parse(a.publishedAt || 0))
    .slice(0, CANDIDATES_TO_ENRICH);

  const enriched = await mapWithConcurrency(candidates, ENRICH_CONCURRENCY, enrichArticle);

  const articles = enriched.map((article) => {
    const text = `${article.title} ${article.summary || ''}`;
    return {
      title: article.title,
      url: article.url,
      image: article.image,
      summary: article.summary,
      source: article.source || article.domain || null,
      domain: article.domain || null,
      publishedAt: article.publishedAt,
      garments: detectGarments(text),
      brands: detectBrands(text),
      occasions: detectOccasions(text),
      outletCount: article.outletCount,
      matchedQueries: [...article.matchedQueries],
    };
  });

  for (const article of articles) article.score = buzzScore(article);
  articles.sort((a, b) => b.score - a.score);

  return { articles: articles.slice(0, MAX_ARTICLES), errors };
}

module.exports = { fetchStarArticles, defaultArticleQueries, DEFAULT_GEO, DEFAULT_HL };
