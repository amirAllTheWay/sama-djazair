const trendsClient = require('./trendsClient');
const { isFashionQuery } = require('./fashionVocabulary');

// The board tracks the US market: geo scopes results to searches made there,
// and en-US matches the language those searchers actually type, which is what
// the returned query strings are made of. Override per star via `geo`.
const DEFAULT_GEO = 'US';
const DEFAULT_HL = 'en-US';
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

async function fetchWidgetForRange(keyword, widgetId, time, { geo, hl, category = 0 }) {
  const widgets = await withOneRetry(() =>
    trendsClient.explore({ keyword, geo, hl, time, category })
  );
  return withOneRetry(() => trendsClient.fetchWidget(widgetId, widgets, { hl }));
}

function defaultFashionSeeds(keyword) {
  return [`${keyword} outfit`, `${keyword} style`];
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

  // Searching the name alone mostly surfaces age, films and dating rumours.
  // Three things narrow it to what people ask about the clothes: a category
  // filter (by far the most effective when the right id is known — see
  // `npm run find-category`), the fashion slice of the broad results, and
  // dedicated lookups on outfit/style terms.
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

  const seeds = star.fashionSeeds || defaultFashionSeeds(star.keyword);
  for (const seed of seeds) {
    await sleep(BETWEEN_CALLS_DELAY_MS);
    try {
      const data = await fetchWidgetForRange(seed, 'RELATED_QUERIES', RELATED_QUERIES_RANGE, {
        geo,
        hl,
      });
      const seedQueries = trendsClient.toRelatedQueries(data);
      for (const bucket of ['top', 'rising']) {
        fashion[bucket] = mergeQueries(fashion[bucket], seedQueries[bucket], seed);
      }
    } catch (err) {
      // One sparse seed shouldn't sink the section — record it and move on.
      result.errors[`fashion:${seed}`] = err.message || String(err);
    }
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
