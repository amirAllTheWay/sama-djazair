const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const HISTORY_DIR = path.join(DATA_DIR, 'history');
const LATEST_PATH = path.join(DATA_DIR, 'latest.json');

function ensureDirs() {
  fs.mkdirSync(HISTORY_DIR, { recursive: true });
}

function loadStars() {
  const configPath = path.join(__dirname, '..', 'config', 'stars.json');
  return JSON.parse(fs.readFileSync(configPath, 'utf8'));
}

function readLatest() {
  if (!fs.existsSync(LATEST_PATH)) return { updatedAt: null, stars: {} };
  return JSON.parse(fs.readFileSync(LATEST_PATH, 'utf8'));
}

// Sections that a failed fetch leaves empty, and the timestamp field recording
// when each was last filled for real.
const PRESERVED_SECTIONS = [
  { key: 'interestOverTime', stampedAt: 'interestOverTimeAt', isEmpty: (v) => !v?.length },
  {
    key: 'relatedQueries',
    stampedAt: 'relatedQueriesAt',
    isEmpty: (v) => !v?.top?.length && !v?.rising?.length,
  },
  {
    key: 'fashionQueries',
    stampedAt: 'fashionQueriesAt',
    isEmpty: (v) => !v?.top?.length && !v?.rising?.length,
  },
  { key: 'articles', stampedAt: 'articlesAt', isEmpty: (v) => !v?.length },
];

// A rate-limited refresh used to overwrite good data with empty arrays, so one
// 429 blanked a working column. Each section now survives its own failure and
// carries the time it was actually collected, so stale data is visibly stale
// rather than silently passed off as current.
function mergeWithPrevious(previous, entry) {
  if (!previous) {
    const merged = { ...entry };
    for (const { key, stampedAt, isEmpty } of PRESERVED_SECTIONS) {
      if (!isEmpty(entry[key])) merged[stampedAt] = entry.fetchedAt;
    }
    return merged;
  }

  const merged = { ...entry };
  for (const { key, stampedAt, isEmpty } of PRESERVED_SECTIONS) {
    if (isEmpty(entry[key]) && !isEmpty(previous[key])) {
      merged[key] = previous[key];
      merged[stampedAt] = previous[stampedAt] ?? previous.fetchedAt;
      merged.stale = true;
    } else if (!isEmpty(entry[key])) {
      merged[stampedAt] = entry.fetchedAt;
    }
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

function appendHistory(slug, entry) {
  ensureDirs();
  const historyPath = path.join(HISTORY_DIR, `${slug}.jsonl`);
  const line = JSON.stringify({
    fetchedAt: entry.fetchedAt,
    latestValue: entry.interestOverTime.length
      ? entry.interestOverTime[entry.interestOverTime.length - 1].value
      : null,
    topRising: entry.relatedQueries.rising[0]?.query ?? null,
  });
  fs.appendFileSync(historyPath, line + '\n');
}

function readHistory(slug, limit = 168) {
  const historyPath = path.join(HISTORY_DIR, `${slug}.jsonl`);
  if (!fs.existsSync(historyPath)) return [];
  const lines = fs.readFileSync(historyPath, 'utf8').trim().split('\n').filter(Boolean);
  return lines.slice(-limit).map((line) => JSON.parse(line));
}

module.exports = { loadStars, readLatest, saveLatest, appendHistory, readHistory, mergeWithPrevious };
