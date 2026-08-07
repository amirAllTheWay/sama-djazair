const { enrichArticle } = require('./articlePage');
const { looksFor } = require('./articleLooks');
const { parseRelativeDate } = require('./googleSearch');
const { activeSource, describeSetup } = require('./searchSource');
const { isExcluded, isKnownPress } = require('./publishers');
const {
  detectBrands,
  detectOccasions,
  detectGarments,
  isFashionQuery,
} = require('./fashionVocabulary');

// Twice as many candidates are enriched as are kept, so the cards shown are
// the best of a real field. Each one costs a browser navigation, which is what
// bounds the pool.
const MAX_ARTICLES = 5;
const CANDIDATES_TO_ENRICH = 16;
const ENRICH_CONCURRENCY = 4;
const RECENT_WINDOW_DAYS = 45;

// Enough survivors to still fill five cards after dead links and pages that
// yield no photo are dropped.
const POOL_TARGET = 12;

// Widened in order until the pool is deep enough; `null` drops the date filter
// altogether.
const RECENCY_LADDER = ['day', 'week', 'month', 'year', null];

// Searches run against the US market, matching the audience being tracked.
const DEFAULT_GEO = 'US';
const DEFAULT_HL = 'en-US';

// Aimed at what is being written about the style rather than at appearances
// alone: "fashion trend" and "best looks" surface analysis pieces that "wore"
// and "red carpet" never reach.
function defaultArticleQueries(keyword) {
  return [
    `${keyword} outfit`,
    `${keyword} style`,
    `${keyword} fashion trend`,
    `${keyword} best looks`,
  ];
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

// Google's ranking already folds in authority, inbound links and click
// behaviour — the closest thing to an engagement signal that is actually
// obtainable, since no public API reports shares any more. A story appearing
// high for several different queries is stronger still. Recency matters
// because a month-old look is not what a video should be built on, and a photo
// weighs heavily: without one the card cannot answer the question it exists for.
function relevanceScore(article) {
  const age = ageInDays(article.publishedAt);
  const recency = age === null ? 0.35 : Math.max(0, 1 - age / RECENT_WINDOW_DAYS);
  const position = Math.max(0, 1 - (article.bestRank - 1) / 12);
  const breadth = Math.min((article.matchedQueries.length - 1) / 2, 1);
  const illustrated = article.image ? 0.35 : 0;
  // A named fashion outlet beats an unknown domain repeating the same words.
  const press = isKnownPress(article.url) ? 0.25 : 0;
  return position * 0.4 + recency * 0.3 + breadth * 0.15 + illustrated + press;
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
  let excluded = 0;

  function absorb(item, label) {
    if (!item.title || !item.link) return;

    // Applied here rather than per-source: every backend converges on this
    // function, so the rule holds whichever one is configured.
    if (isExcluded(item.link)) {
      excluded += 1;
      return;
    }

    // Google answers the query loosely; keep only what is about clothes.
    if (!isFashionQuery(`${item.title} ${item.snippet || ''}`)) return;

    const key = dedupeKey(item);
    const existing = collected.get(key);
    if (existing) {
      // Found again by another query: broader relevance, and the better of the
      // two positions is the one worth keeping.
      existing.matchedQueries.add(label);
      existing.bestRank = Math.min(existing.bestRank, item.rank ?? 99);
      existing.feedImage = existing.feedImage || item.feedImage;
      return;
    }
    collected.set(key, { ...item, bestRank: item.rank ?? 99, matchedQueries: new Set([label]) });
  }

  const source = activeSource();
  if (!source) return { articles: [], errors: { source: describeSetup() } };

  async function runQueries(recency) {
    for (const query of queries) {
      try {
        const results = (await source.searchWeb(query, { recency })) || [];
        for (const item of results) {
          absorb(
            {
              ...item,
              // The browser scraper only knows "3 days ago"; the APIs return a date.
              publishedAt: item.publishedAt ?? parseRelativeDate(item.published),
              source: null,
            },
            query
          );
        }
      } catch (err) {
        errors[`${source.id}:${query}`] = err.message || String(err);
      }
    }
  }

  // The four queries are variations on one name, so Google returns largely the
  // same stories: forty raw results collapse to a dozen. Add the press and
  // fashion filters and a one-month window, and the pool can fall below the
  // five cards the dashboard has room for. Widening the window is what refills
  // it — an older piece shown is better than an empty column, and recency
  // still governs the ranking, so fresh articles keep their place at the top.
  // An unrecognised `recency` would otherwise slice from -1 and start with no
  // date filter at all — the widest window rather than the intended one.
  const start = RECENCY_LADDER.indexOf(star.recency || 'month');
  const ladder = RECENCY_LADDER.slice(start === -1 ? RECENCY_LADDER.indexOf('month') : start);
  const windowsUsed = [];

  for (const recency of ladder) {
    windowsUsed.push(recency ?? 'sans limite');
    await runQueries(recency);
    if (collected.size >= POOL_TARGET) break;
  }

  // Enrich by Google's own ordering: the pages it ranks highest are the ones
  // worth spending a browser navigation on.
  const candidates = [...collected.values()]
    .sort((a, b) => a.bestRank - b.bestRank)
    .slice(0, CANDIDATES_TO_ENRICH);

  const enriched = await mapWithConcurrency(candidates, ENRICH_CONCURRENCY, enrichArticle);

  // A card whose link 404s is worse than no card: it looks usable until it is
  // clicked. Enriching twice as many as are kept leaves room to drop these.
  const alive = enriched.filter((article) => !article.dead);
  const dead = enriched.length - alive.length;

  const articles = alive.map((article) => {
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
      bestRank: article.bestRank,
      matchedQueries: [...article.matchedQueries],
    };
  });

  for (const article of articles) article.score = relevanceScore(article);
  articles.sort((a, b) => b.score - a.score);

  // Only the articles that made the board get their photo strip read.
  const shown = articles.slice(0, MAX_ARTICLES);
  const strips = await mapWithConcurrency(shown, ENRICH_CONCURRENCY, looksFor);
  shown.forEach((article, index) => {
    article.looks = strips[index];
  });

  return {
    articles: shown,
    errors,
    excluded,
    dead,
    windows: windowsUsed,
  };
}

module.exports = { fetchStarArticles, defaultArticleQueries, DEFAULT_GEO, DEFAULT_HL };
