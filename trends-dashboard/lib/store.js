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

function saveLatest(slug, entry) {
  ensureDirs();
  const current = readLatest();
  current.updatedAt = new Date().toISOString();
  current.stars = current.stars || {};
  current.stars[slug] = entry;
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

module.exports = { loadStars, readLatest, saveLatest, appendHistory, readHistory };
