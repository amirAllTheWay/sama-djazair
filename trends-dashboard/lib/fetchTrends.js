const trendsClient = require('./trendsClient');

const DEFAULT_GEO = '';
const DEFAULT_HL = 'fr';
const WINDOW_DAYS = 7;
const BETWEEN_CALLS_DELAY_MS = 2000;
const RETRY_DELAY_MS = 8000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Google Trends' own explore/widget syntax: hour/day windows use "now",
// month/year windows use "today" — mixing them up gets a flat HTTP 400.
function timeRangeForDays(days) {
  return `now ${days}-d`;
}

async function withOneRetry(fn) {
  try {
    return await fn();
  } catch (err) {
    // A 429 means Google is already rate-limiting this IP — hammering it
    // again immediately just makes it worse. Let the caller's cooldown
    // (the refresh button's 30s guard) be the retry mechanism instead.
    if (err.statusCode === 429) throw err;
    await sleep(RETRY_DELAY_MS);
    return fn();
  }
}

async function fetchStarTrends(star, opts = {}) {
  const geo = opts.geo ?? DEFAULT_GEO;
  const hl = opts.hl ?? DEFAULT_HL;

  const result = {
    slug: star.slug,
    keyword: star.keyword,
    fetchedAt: new Date().toISOString(),
    interestOverTime: [],
    relatedQueries: { top: [], rising: [] },
    errors: {},
  };

  let widgets = [];
  try {
    widgets = await withOneRetry(() =>
      trendsClient.explore({ keyword: star.keyword, geo, hl, time: timeRangeForDays(WINDOW_DAYS) })
    );
  } catch (err) {
    const message = err.message || String(err);
    result.errors.interestOverTime = message;
    result.errors.relatedQueries = message;
    return result;
  }

  try {
    const data = await withOneRetry(() => trendsClient.fetchWidget('TIMESERIES', widgets, { hl }));
    result.interestOverTime = trendsClient.toInterestOverTime(data);
  } catch (err) {
    result.errors.interestOverTime = err.message || String(err);
  }

  await sleep(BETWEEN_CALLS_DELAY_MS);

  try {
    const data = await withOneRetry(() => trendsClient.fetchWidget('RELATED_QUERIES', widgets, { hl }));
    result.relatedQueries = trendsClient.toRelatedQueries(data);
  } catch (err) {
    result.errors.relatedQueries = err.message || String(err);
  }

  return result;
}

module.exports = { fetchStarTrends };
