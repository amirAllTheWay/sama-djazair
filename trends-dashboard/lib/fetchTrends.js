const trendsClient = require('./trendsClient');

const DEFAULT_GEO = '';
const DEFAULT_HL = 'fr';
const WINDOW_DAYS = 7;
const BETWEEN_CALLS_DELAY_MS = 3000;
const RETRY_DELAYS_MS = [3000, 8000];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetries(fn) {
  let lastErr;
  const attempts = RETRY_DELAYS_MS.length + 1;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt < RETRY_DELAYS_MS.length) {
        await sleep(RETRY_DELAYS_MS[attempt]);
      }
    }
  }
  throw lastErr;
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
    result.interestOverTime = await withRetries(() =>
      trendsClient.interestOverTime({ keyword: star.keyword, geo, hl, windowDays: WINDOW_DAYS })
    );
  } catch (err) {
    result.errors.interestOverTime = err.message || String(err);
  }

  await sleep(BETWEEN_CALLS_DELAY_MS);

  try {
    result.relatedQueries = await withRetries(() =>
      trendsClient.relatedQueries({ keyword: star.keyword, geo, hl })
    );
  } catch (err) {
    result.errors.relatedQueries = err.message || String(err);
  }

  return result;
}

module.exports = { fetchStarTrends };
