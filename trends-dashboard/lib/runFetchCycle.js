const { fetchStarTrends, DEFAULT_GEO, DEFAULT_HL } = require('./fetchTrends');
const { fetchStarArticles } = require('./fetchArticles');
const { loadStars, saveLatest, appendHistory } = require('./store');

async function runFetchCycle() {
  const stars = loadStars();
  const results = [];

  for (const star of stars) {
    try {
      const entry = await fetchStarTrends(star);

      // Press coverage is a separate source from Trends and fails separately:
      // Google News being unreachable must not cost us the search data.
      let articles = [];
      try {
        const news = await fetchStarArticles(star, {
          geo: star.geo ?? DEFAULT_GEO,
          hl: star.hl ?? DEFAULT_HL,
        });
        articles = news.articles;
        Object.assign(entry.errors, news.errors);
      } catch (err) {
        entry.errors.articles = err.message || String(err);
      }
      entry.articles = articles;

      saveLatest(star.slug, { ...entry, name: star.name, epithet: star.epithet });
      appendHistory(star.slug, entry);

      const hasErrors = Object.keys(entry.errors).length > 0;
      results.push({ slug: star.slug, ok: !hasErrors });

      const timeseries = entry.interestOverTime.length
        ? `${entry.interestOverTime.length} points`
        : 'aucune donnée';
      const fashion = entry.fashionQueries.top.length + entry.fashionQueries.rising.length;
      const illustrated = articles.filter((a) => a.image).length;
      console.log(
        `[trends] ${star.slug} — courbe: ${timeseries} | recherches mode: ${fashion || 'aucune'} | articles: ${articles.length} (${illustrated} avec photo)`
      );

      for (const [step, message] of Object.entries(entry.errors)) {
        console.warn(`[trends]   ✗ ${step}: ${message}`);
      }
      if (!hasErrors) console.log('[trends]   ✓ collecte complète');
    } catch (err) {
      results.push({ slug: star.slug, ok: false, error: err.message || String(err) });
      console.error(`[trends] ${star.slug} failed:`, err.message || err);
    }
  }

  return results;
}

module.exports = { runFetchCycle };
