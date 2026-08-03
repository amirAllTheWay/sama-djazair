const googleTrends = require('google-trends-api');

const DEFAULT_GEO = '';
const DEFAULT_HL = 'fr';
const WINDOW_DAYS = 7;

function parseInterestOverTime(rawJson) {
  const parsed = JSON.parse(rawJson);
  const timeline = parsed?.default?.timelineData || [];
  return timeline.map((point) => ({
    time: Number(point.time) * 1000,
    formattedTime: point.formattedTime,
    value: Array.isArray(point.value) ? point.value[0] : point.value,
  }));
}

function parseRelatedQueries(rawJson) {
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
    const raw = await googleTrends.interestOverTime({
      keyword: star.keyword,
      startTime,
      geo,
      hl,
    });
    result.interestOverTime = parseInterestOverTime(raw);
  } catch (err) {
    result.errors.interestOverTime = err.message || String(err);
  }

  try {
    const raw = await googleTrends.relatedQueries({
      keyword: star.keyword,
      geo,
      hl,
    });
    result.relatedQueries = parseRelatedQueries(raw);
  } catch (err) {
    result.errors.relatedQueries = err.message || String(err);
  }

  return result;
}

module.exports = { fetchStarTrends };
