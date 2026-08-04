const trendsClient = require('./trendsClient');
const { isFashionQuery } = require('./fashionVocabulary');

// The board tracks the US market: geo scopes results to searches made there,
// and en-US matches the language those searchers actually type, which is what
// the returned query strings are made of. Override per star via `geo`.
const DEFAULT_GEO = 'US';
const DEFAULT_HL = 'en-US';
const BETWEEN_CALLS_DELAY_MS = 4000;
const RETRY_DELAY_MS = 8000;
const THROTTLED_BACKOFF_MS = 12_000;

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
    if (err.statusCode === 429) {
      // Backing off and opening a fresh session is the only retry that can
      // succeed here; an immediate replay reuses the throttled one.
      await sleep(THROTTLED_BACKOFF_MS);
      await trendsClient.resetSession();
      return fn();
    }
    await sleep(RETRY_DELAY_MS);
    return fn();
  }
}

async function fetchWidgetForRange(keyword, widgetId, time, { geo, hl, category = 0 }) {
  const widgets = await withOneRetry(() =>
    trendsClient.explore({ keyword, geo, hl, time, category })
  );
  return withOneRetry(() => trendsClient.fetchWidget(widgetId, widgets, { hl }));
}


// Results from different seeds overlap heavily, and a seed's own wording comes
// back as its top result. Drop both, keeping each query once at its best score.
function mergeQueries(existing, incoming, seed) {
  const seedKey = seed.toLowerCase().trim();
  const byQuery = new Map(existing.map((item) => [item.query.toLowerCase().trim(), item]));

  for (const item of incoming) {
    const key = item.query.toLowerCase().trim();
    if (key === seedKey) continue;
    const current = byQuery.get(key);
    if (!current || (item.value ?? 0) > (current.value ?? 0)) {
      byQuery.set(key, { ...item, seed });
    }
  }

  return [...byQuery.values()].sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
}

async function fetchStarTrends(star, opts = {}) {
  const geo = star.geo ?? opts.geo ?? DEFAULT_GEO;
  const hl = star.hl ?? opts.hl ?? DEFAULT_HL;

  const result = {
    slug: star.slug,
    keyword: star.keyword,
    geo,
    fetchedAt: new Date().toISOString(),
    interestOverTime: [],
    relatedQueries: { top: [], rising: [] },
    fashionQueries: { top: [], rising: [] },
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

  // Searching the name alone mostly surfaces age, films and dating rumours, so
  // the fashion slice is filtered out of the broad results. Per-seed lookups
  // ("<name> outfit", "<name> style") used to run here too and were dropped:
  // those terms are too low-volume for Google to attach related searches to, so
  // they returned nothing while tripling the request count into a 429. A
  // category id, when one is configured, buys the same narrowing for one call.
  const fashion = { top: [], rising: [] };

  if (star.category) {
    await sleep(BETWEEN_CALLS_DELAY_MS);
    try {
      const data = await fetchWidgetForRange(star.keyword, 'RELATED_QUERIES', RELATED_QUERIES_RANGE, {
        geo,
        hl,
        category: star.category,
      });
      const categoryQueries = trendsClient.toRelatedQueries(data);
      fashion.top = categoryQueries.top;
      fashion.rising = categoryQueries.rising;
    } catch (err) {
      result.errors[`category:${star.category}`] = err.message || String(err);
    }
  }

  for (const bucket of ['top', 'rising']) {
    const filtered = result.relatedQueries[bucket].filter((item) => isFashionQuery(item.query));
    fashion[bucket] = mergeQueries(fashion[bucket], filtered, star.keyword);
  }

  result.fashionQueries = fashion;
  return result;
}

module.exports = {
  fetchStarTrends,
  TIMESERIES_RANGE,
  RELATED_QUERIES_RANGE,
  DEFAULT_GEO,
  DEFAULT_HL,
};
