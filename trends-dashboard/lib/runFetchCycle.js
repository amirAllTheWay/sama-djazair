const { fetchStarTrends } = require('./fetchTrends');
const { loadStars, saveLatest, appendHistory } = require('./store');

async function runFetchCycle() {
  const stars = loadStars();
  const results = [];

  for (const star of stars) {
    try {
      const entry = await fetchStarTrends(star);
      saveLatest(star.slug, { ...entry, name: star.name, epithet: star.epithet });
      appendHistory(star.slug, entry);
      const hasErrors = Object.keys(entry.errors).length > 0;
      results.push({ slug: star.slug, ok: !hasErrors });

      const timeseries = entry.interestOverTime.length
        ? `${entry.interestOverTime.length} points`
        : 'aucune donnée';
      const related = entry.relatedQueries.top.length + entry.relatedQueries.rising.length;
      console.log(
        `[trends] ${star.slug} — courbe: ${timeseries} | recherches associées: ${related || 'aucune'}`
      );

      for (const [step, message] of Object.entries(entry.errors)) {
        console.warn(`[trends]   ✗ ${step}: ${message}`);
      }
      if (!hasErrors) console.log(`[trends]   ✓ collecte complète`);
    } catch (err) {
      results.push({ slug: star.slug, ok: false, error: err.message || String(err) });
      console.error(`[trends] ${star.slug} failed:`, err.message || err);
    }
  }

  return results;
}

module.exports = { runFetchCycle };
