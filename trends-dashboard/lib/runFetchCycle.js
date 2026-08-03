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
      if (hasErrors) {
        console.warn(`[trends] ${star.slug} fetched with errors:`, entry.errors);
      } else {
        console.log(`[trends] ${star.slug} updated (${entry.interestOverTime.length} points)`);
      }
    } catch (err) {
      results.push({ slug: star.slug, ok: false, error: err.message || String(err) });
      console.error(`[trends] ${star.slug} failed:`, err.message || err);
    }
  }

  return results;
}

module.exports = { runFetchCycle };
