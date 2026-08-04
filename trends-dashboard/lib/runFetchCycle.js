const { fetchStarArticles, DEFAULT_GEO, DEFAULT_HL } = require('./fetchArticles');
const { loadStars, saveLatest } = require('./store');

async function runFetchCycle() {
  const stars = loadStars();
  const results = [];

  for (const star of stars) {
    const entry = {
      slug: star.slug,
      name: star.name,
      epithet: star.epithet,
      fetchedAt: new Date().toISOString(),
      articles: [],
      errors: {},
    };

    try {
      const news = await fetchStarArticles(star, {
        geo: star.geo ?? DEFAULT_GEO,
        hl: star.hl ?? DEFAULT_HL,
      });
      entry.articles = news.articles;
      Object.assign(entry.errors, news.errors);
    } catch (err) {
      entry.errors.articles = err.message || String(err);
    }

    saveLatest(star.slug, entry);

    const hasErrors = Object.keys(entry.errors).length > 0;
    results.push({ slug: star.slug, ok: !hasErrors && entry.articles.length > 0 });

    const illustrated = entry.articles.filter((a) => a.image).length;
    console.log(
      `[articles] ${star.slug} — ${entry.articles.length} article(s), ${illustrated} avec photo`
    );
    for (const article of entry.articles) {
      const look = article.garments.length ? article.garments.join(' · ') : 'look non identifié';
      console.log(`[articles]   ${article.image ? '📷' : '——'} ${article.source || '?'} — ${look}`);
      if (!article.image) console.log(`[articles]      (pas de photo) ${article.url}`);
    }
    for (const [step, message] of Object.entries(entry.errors)) {
      console.warn(`[articles]   ✗ ${step}: ${message}`);
    }
  }

  return results;
}

module.exports = { runFetchCycle };
