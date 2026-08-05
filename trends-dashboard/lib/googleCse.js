// Google's own Custom Search JSON API. Scraping the results page works from a
// laptop but cannot be deployed: it needs a visible window to clear the
// challenges a headless browser attracts, and a datacenter IP attracts far
// more of them. This endpoint is the supported route — JSON, no browser, no
// captcha, 100 queries a day at no cost — and it returns the photo alongside
// the result, which removes the second reason the browser existed.

const https = require('https');

const ENDPOINT = 'https://www.googleapis.com/customsearch/v1';
const RESULTS_PER_QUERY = 10;

// Same windows as the scraper's, in the syntax this API expects.
const RECENCY = { day: 'd1', week: 'w1', month: 'm1', year: 'y1' };

function credentials() {
  return {
    key: process.env.GOOGLE_API_KEY || null,
    cx: process.env.GOOGLE_CSE_ID || null,
  };
}

const isConfigured = () => Boolean(credentials().key && credentials().cx);

function getJson(url) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const req = https.request(
      { host: target.hostname, path: target.pathname + target.search, method: 'GET' },
      (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          try {
            resolve({ statusCode: res.statusCode, json: JSON.parse(body) });
          } catch (err) {
            reject(new Error(`Réponse illisible de l'API Google : ${err.message}`));
          }
        });
      }
    );
    req.setTimeout(20_000, () => req.destroy(new Error('Délai dépassé')));
    req.on('error', reject);
    req.end();
  });
}

// Results carry a pagemap: the publisher's own OpenGraph tags, already parsed.
// Reading the photo here saves opening the page at all.
function imageFrom(item) {
  const map = item.pagemap || {};
  return (
    map.cse_image?.[0]?.src ||
    map.metatags?.[0]?.['og:image'] ||
    map.metatags?.[0]?.['twitter:image'] ||
    map.cse_thumbnail?.[0]?.src ||
    null
  );
}

function publishedFrom(item) {
  const tags = item.pagemap?.metatags?.[0] || {};
  const raw =
    tags['article:published_time'] ||
    tags['og:updated_time'] ||
    tags.date ||
    tags['publish-date'] ||
    item.pagemap?.newsarticle?.[0]?.datepublished;
  if (!raw) return null;
  const parsed = Date.parse(raw);
  return Number.isNaN(parsed) ? null : new Date(parsed).toUTCString();
}

function describeApiError(statusCode, json) {
  const reason = json?.error?.message || `HTTP ${statusCode}`;
  if (statusCode === 429 || /quota|rate limit/i.test(reason)) {
    return new Error(
      "Quota de l'API Google épuisé (100 requêtes/jour en gratuit). Réessaie demain, " +
        'ou active la facturation sur ton projet Google Cloud.'
    );
  }
  if (statusCode === 403) {
    return new Error(
      `Google a refusé la clé (${reason}). Vérifie que « Custom Search API » est activée ` +
        'sur le projet et que la clé n\'est pas restreinte à d\'autres API.'
    );
  }
  return new Error(`API Google Custom Search : ${reason}`);
}

async function searchWeb(query, { recency = 'month' } = {}) {
  const { key, cx } = credentials();
  if (!key || !cx) throw new Error('GOOGLE_API_KEY et GOOGLE_CSE_ID ne sont pas renseignés.');

  const params = new URLSearchParams({
    key,
    cx,
    q: query,
    num: String(RESULTS_PER_QUERY),
    gl: 'us',
    hl: 'en',
    // Newest first, so the recency filter is a floor rather than the ordering.
    sort: 'date',
  });
  const restrict = RECENCY[recency];
  if (restrict) params.set('dateRestrict', restrict);

  const { statusCode, json } = await getJson(`${ENDPOINT}?${params}`);
  if (statusCode >= 400) throw describeApiError(statusCode, json);

  return (json.items || []).map((item, index) => ({
    title: item.title,
    link: item.link,
    snippet: item.snippet || '',
    feedImage: imageFrom(item),
    publishedAt: publishedFrom(item),
    rank: index + 1,
  }));
}

module.exports = { searchWeb, isConfigured };
