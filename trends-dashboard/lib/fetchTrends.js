const trendsClient = require('./trendsClient');

const DEFAULT_GEO = '';
const DEFAULT_HL = 'fr';
const BETWEEN_CALLS_DELAY_MS = 2000;
const RETRY_DELAY_MS = 8000;

// Google Trends' range syntax: hour/day windows use "now N-d", month/year
// windows use "today N-m" — mixing the two gets a flat HTTP 400.
//
// The two widgets need different windows. A 7-day window resolves hourly,
// which is what makes the sparkline useful, but Google computes related
// queries over long periods and returns empty lists for a window that short.
// So each widget gets its own explore call at the range it actually works at.
const TIMESERIES_RANGE = 'now 7-d';
const RELATED_QUERIES_RANGE = 'today 12-m';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

async function fetchWidgetForRange(keyword, widgetId, time, { geo, hl }) {
  const widgets = await withOneRetry(() => trendsClient.explore({ keyword, geo, hl, time }));
  return withOneRetry(() => trendsClient.fetchWidget(widgetId, widgets, { hl }));
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

  try {
    const data = await fetchWidgetForRange(star.keyword, 'TIMESERIES', TIMESERIES_RANGE, { geo, hl });
    result.interestOverTime = trendsClient.toInterestOverTime(data);
  } catch (err) {
    result.errors.interestOverTime = err.message || String(err);
  }

  await sleep(BETWEEN_CALLS_DELAY_MS);

  try {
    const data = await fetchWidgetForRange(star.keyword, 'RELATED_QUERIES', RELATED_QUERIES_RANGE, {
      geo,
      hl,
    });
    result.relatedQueries = trendsClient.toRelatedQueries(data);
  } catch (err) {
    result.errors.relatedQueries = err.message || String(err);
  }

  return result;
}

module.exports = { fetchStarTrends, TIMESERIES_RANGE, RELATED_QUERIES_RANGE };
