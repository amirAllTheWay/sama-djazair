const googleTrends = require('google-trends-api');

const DEFAULT_GEO = '';
const DEFAULT_HL = 'fr';
const WINDOW_DAYS = 7;
const BETWEEN_CALLS_DELAY_MS = 1500;
const RETRY_DELAY_MS = 2500;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function assertNotHtml(raw) {
  if (typeof raw === 'string' && raw.trim().startsWith('<')) {
    throw new Error(
      'Google Trends a renvoyé une page HTML au lieu de données (probable limite de requêtes ou blocage temporaire) — réessaie dans quelques minutes.'
    );
  }
}

function parseInterestOverTime(rawJson) {
  assertNotHtml(rawJson);
  const parsed = JSON.parse(rawJson);
  const timeline = parsed?.default?.timelineData || [];
  return timeline.map((point) => ({
    time: Number(point.time) * 1000,
    formattedTime: point.formattedTime,
    value: Array.isArray(point.value) ? point.value[0] : point.value,
  }));
}

function parseRelatedQueries(rawJson) {
  assertNotHtml(rawJson);
  const parsed = JSON.parse(rawJson);
  const rankedLists = parsed?.default?.rankedList || [];
  const toEntries = (list) =>
    (list?.rankedKeyword || []).map((item) => ({
      query: item.query,
      value: item.value,
      formattedValue: item.formattedValue ?? String(item.value),
    }));
  return {
    top: toEntries(rankedLists[0]),
    rising: toEntries(rankedLists[1]),
  };
}

async function withOneRetry(fn) {
  try {
    return await fn();
  } catch (err) {
    await sleep(RETRY_DELAY_MS);
    return fn();
  }
}

async function fetchStarTrends(star, opts = {}) {
  const geo = opts.geo ?? DEFAULT_GEO;
  const hl = opts.hl ?? DEFAULT_HL;
  const startTime = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const result = {
    slug: star.slug,
    keyword: star.keyword,
    fetchedAt: new Date().toISOString(),
    interestOverTime: [],
    relatedQueries: { top: [], rising: [] },
    errors: {},
  };

  try {
    result.interestOverTime = await withOneRetry(async () => {
      const raw = await googleTrends.interestOverTime({ keyword: star.keyword, startTime, geo, hl });
      return parseInterestOverTime(raw);
    });
  } catch (err) {
    result.errors.interestOverTime = err.message || String(err);
  }

  await sleep(BETWEEN_CALLS_DELAY_MS);

  try {
    result.relatedQueries = await withOneRetry(async () => {
      const raw = await googleTrends.relatedQueries({ keyword: star.keyword, geo, hl });
      return parseRelatedQueries(raw);
    });
  } catch (err) {
    result.errors.relatedQueries = err.message || String(err);
  }

  return result;
}

module.exports = { fetchStarTrends };
