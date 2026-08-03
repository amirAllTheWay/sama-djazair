const https = require('https');
const querystring = require('querystring');

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const WIDGET_PATHS = {
  TIMESERIES: '/trends/api/widgetdata/multiline',
  RELATED_QUERIES: '/trends/api/widgetdata/relatedsearches',
};

// Same value a browser sends: minutes to add to local time to reach UTC
// (60 for UTC+1). Google echoes it back in the returned timestamps.
const TIMEZONE_OFFSET = new Date().getTimezoneOffset();

// Cookies Google hands out (NID above all). Hitting the API with no session
// at all is what a script does, not a browser — Google answers 429 to it even
// on a first request from a clean residential IP.
const cookieJar = new Map([['CONSENT', 'YES+']]);

function cookieHeader() {
  return [...cookieJar].map(([name, value]) => `${name}=${value}`).join('; ');
}

function storeCookies(headers) {
  const raw = headers['set-cookie'];
  if (!raw) return false;
  let stored = false;
  for (const entry of raw) {
    const [pair] = entry.split(';');
    const index = pair.indexOf('=');
    if (index === -1) continue;
    const name = pair.slice(0, index).trim();
    const value = pair.slice(index + 1).trim();
    if (!name || cookieJar.get(name) === value) continue;
    cookieJar.set(name, value);
    stored = true;
  }
  return stored;
}

function requestOnce(host, path, accept) {
  const options = {
    host,
    path,
    method: 'GET',
    headers: {
      'User-Agent': USER_AGENT,
      Accept: accept,
      'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
      Referer: 'https://trends.google.com/trends/explore',
      Cookie: cookieHeader(),
    },
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        storeCookies(res.headers);
        resolve({ statusCode: res.statusCode, headers: res.headers, body });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

// Load the Trends page itself once, the way a browser would, so Google issues
// the session cookies its API endpoints expect. Runs at most once per process.
let warmedUp = null;
function warmUp() {
  if (!warmedUp) {
    warmedUp = requestOnce(
      'trends.google.com',
      '/trends/explore',
      'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
    ).catch(() => null);
  }
  return warmedUp;
}

async function get(path, qs, redirectsLeft = 3, retryOn429 = true) {
  await warmUp();

  const query = qs ? querystring.stringify(qs) : '';
  const fullPath = query ? `${path}?${query}` : path;
  const res = await requestOnce('trends.google.com', fullPath, 'application/json, text/plain, */*');

  if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && redirectsLeft > 0) {
    const location = new URL(res.headers.location, 'https://trends.google.com');
    return get(location.pathname + location.search, null, redirectsLeft - 1, retryOn429);
  }

  // Google ships a fresh cookie alongside its 429; replaying the request with
  // it is what the browser does, and it generally succeeds.
  if (res.statusCode === 429 && retryOn429 && res.headers['set-cookie']) {
    return get(path, qs, redirectsLeft, false);
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
async function explore({ keyword, geo, hl, time, category = 0 }) {
  const req = JSON.stringify({
    comparisonItem: [{ keyword, geo, time }],
    category,
    property: '',
  });

  const { statusCode, body } = await get('/trends/api/explore', { hl, tz: TIMEZONE_OFFSET, req });
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
  const { statusCode, body } = await get(path, { hl, tz: TIMEZONE_OFFSET, req, token: widget.token });
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
  // Names only — cookie values are session credentials and stay out of logs.
  cookieNames: () => [...cookieJar.keys()],
  warmUp,
  // Exposed for the diagnostics endpoint, which needs the untouched
  // status/headers/body rather than a parsed result or a thrown error.
  rawGet: get,
  buildExploreQuery: ({ keyword, geo, hl, time, category = 0 }) => ({
    hl,
    tz: 0,
    req: JSON.stringify({ comparisonItem: [{ keyword, geo, time }], category, property: '' }),
  }),
};
