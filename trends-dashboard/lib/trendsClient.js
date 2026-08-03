const https = require('https');
const querystring = require('querystring');

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// Skips Google's cookie-consent interstitial, which otherwise returns an
// HTML page instead of JSON for requests with no prior session.
const CONSENT_COOKIE = 'CONSENT=YES+';

const WIDGET_PATHS = {
  TIMESERIES: '/trends/api/widgetdata/multiline',
  RELATED_QUERIES: '/trends/api/widgetdata/relatedsearches',
};

function requestOnce(host, path) {
  const options = {
    host,
    path,
    method: 'GET',
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'application/json, text/plain, */*',
      'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
      Cookie: CONSENT_COOKIE,
    },
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

async function get(path, qs, redirectsLeft = 3) {
  const query = qs ? querystring.stringify(qs) : '';
  const fullPath = query ? `${path}?${query}` : path;
  const res = await requestOnce('trends.google.com', fullPath);

  if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && redirectsLeft > 0) {
    const location = new URL(res.headers.location, 'https://trends.google.com');
    return get(location.pathname + location.search, null, redirectsLeft - 1);
  }

  return res;
}

function httpError(statusCode, stepName) {
  const err = new Error(`Google Trends a répondu HTTP ${statusCode} à l'étape "${stepName}".`);
  err.statusCode = statusCode;
  return err;
}

function stripJsonPrefix(body) {
  const start = body.indexOf('{');
  if (start === -1) return body;
  return body.slice(start);
}

function parseJsonResponse(body, stepName) {
  const trimmed = body.trim();
  if (trimmed.startsWith('<')) {
    throw new Error(
      `Google Trends a renvoyé une page HTML au lieu de données à l'étape "${stepName}" (probable blocage anti-bot) — réessaie dans quelques minutes.`
    );
  }
  try {
    return JSON.parse(stripJsonPrefix(body));
  } catch (err) {
    throw new Error(`Réponse Google Trends illisible à l'étape "${stepName}": ${err.message}`);
  }
}

// One "explore" call returns tokens for every widget (timeseries, related
// queries, etc.) for a given keyword + time range — mirrors what a single
// visit to the Trends explore page does, instead of one explore per widget.
async function explore({ keyword, geo, hl, time }) {
  const req = JSON.stringify({
    comparisonItem: [{ keyword, geo, time }],
    category: 0,
    property: '',
  });

  const { statusCode, body } = await get('/trends/api/explore', { hl, tz: 0, req });
  if (statusCode !== 200) throw httpError(statusCode, 'explore');
  const parsed = parseJsonResponse(body, 'explore');
  return parsed.widgets || [];
}

async function fetchWidget(widgetId, widgets, { hl }) {
  const widget = widgets.find((w) => (w.id || '').indexOf(widgetId) > -1);
  if (!widget) {
    throw new Error(`Widget "${widgetId}" absent de la réponse Google Trends (mot-clé sans assez de données ?).`);
  }

  const path = WIDGET_PATHS[widgetId];
  const req = JSON.stringify(widget.request);
  const { statusCode, body } = await get(path, { hl, tz: 0, req, token: widget.token });
  if (statusCode !== 200) throw httpError(statusCode, widgetId);
  return parseJsonResponse(body, widgetId);
}

function toInterestOverTime(data) {
  const timeline = data?.default?.timelineData || [];
  return timeline.map((point) => ({
    time: Number(point.time) * 1000,
    formattedTime: point.formattedTime,
    value: Array.isArray(point.value) ? point.value[0] : point.value,
  }));
}

function toRelatedQueries(data) {
  const rankedLists = data?.default?.rankedList || [];
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

module.exports = {
  explore,
  fetchWidget,
  toInterestOverTime,
  toRelatedQueries,
  // Exposed for the diagnostics endpoint, which needs the untouched
  // status/headers/body rather than a parsed result or a thrown error.
  rawGet: get,
  buildExploreQuery: ({ keyword, geo, hl, time }) => ({
    hl,
    tz: 0,
    req: JSON.stringify({ comparisonItem: [{ keyword, geo, time }], category: 0, property: '' }),
  }),
};
