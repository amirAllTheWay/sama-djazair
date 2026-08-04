const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const LATEST_PATH = path.join(DATA_DIR, 'latest.json');

function ensureDirs() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadStars() {
  const configPath = path.join(__dirname, '..', 'config', 'stars.json');
  return JSON.parse(fs.readFileSync(configPath, 'utf8'));
}

function readLatest() {
  if (!fs.existsSync(LATEST_PATH)) return { updatedAt: null, stars: {} };
  return JSON.parse(fs.readFileSync(LATEST_PATH, 'utf8'));
}

// A failed refresh used to overwrite good articles with an empty array, so one
// unreachable feed blanked a working column. The previous set is kept instead,
// carrying the time it was actually collected so stale cards are visibly stale.
function mergeWithPrevious(previous, entry) {
  const merged = { ...entry };

  if (entry.articles.length) {
    merged.articlesAt = entry.fetchedAt;
  } else if (previous?.articles?.length) {
    merged.articles = previous.articles;
    merged.articlesAt = previous.articlesAt ?? previous.fetchedAt;
    merged.stale = true;
  }

  return merged;
}

function saveLatest(slug, entry) {
  ensureDirs();
  const current = readLatest();
  current.updatedAt = new Date().toISOString();
  current.stars = current.stars || {};
  current.stars[slug] = mergeWithPrevious(current.stars[slug], entry);
  fs.writeFileSync(LATEST_PATH, JSON.stringify(current, null, 2));
}

module.exports = { loadStars, readLatest, saveLatest, mergeWithPrevious };
