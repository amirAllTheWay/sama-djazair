// Serper returns Google's own results as JSON for a single API key — no Cloud
// project, no per-API enablement, no key restrictions. It exists as an
// alternative to Custom Search because that setup has several independent ways
// to fail silently, each fixed in a different console.
//
// 2500 searches free on signup, then paid. Same deployable properties as the
// Custom Search API: server-side, headless, never challenged.

const https = require('https');

const ENDPOINT = 'https://google.serper.dev/search';
// The queries are variations on one name and return overlapping stories, so a
// page of ten leaves too few distinct articles once filtering has run. Serper
// bills per search, not per result, so a wider page is free.
const RESULTS_PER_QUERY = 20;

// Serper passes tbs straight through to Google, so the windows match the ones
// the browser scraper used.
const RECENCY = { day: 'qdr:d', week: 'qdr:w', month: 'qdr:m', year: 'qdr:y' };

const isConfigured = () => Boolean(process.env.SERPER_API_KEY);

function postJson(payload, apiKey) {
  const body = JSON.stringify(payload);
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        host: 'google.serper.dev',
        path: '/search',
        method: 'POST',
        headers: {
          'X-API-KEY': apiKey,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            resolve({ statusCode: res.statusCode, json: JSON.parse(data) });
          } catch {
            resolve({ statusCode: res.statusCode, json: null, raw: data });
          }
        });
      }
    );
    req.setTimeout(20_000, () => req.destroy(new Error('Délai dépassé')));
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// Serper gives dates as Google prints them: "3 days ago", or "Jan 14, 2026".
function parseDate(value) {
  if (!value) return null;
  const relative = value.match(/(\d+)\s*(minute|hour|day|week|month|year)/i);
  if (relative) {
    const unitMs = {
      minute: 60_000,
      hour: 3_600_000,
      day: 86_400_000,
      week: 604_800_000,
      month: 2_592_000_000,
      year: 31_536_000_000,
    }[relative[2].toLowerCase()];
    return new Date(Date.now() - Number(relative[1]) * unitMs).toUTCString();
  }
  const absolute = Date.parse(value);
  return Number.isNaN(absolute) ? null : new Date(absolute).toUTCString();
}

async function searchWeb(query, { recency = 'month' } = {}) {
  const apiKey = process.env.SERPER_API_KEY;
  if (!apiKey) throw new Error("SERPER_API_KEY n'est pas renseigné.");

  const payload = { q: query, gl: 'us', hl: 'en', num: RESULTS_PER_QUERY };
  const tbs = RECENCY[recency];
  if (tbs) payload.tbs = tbs;

  const { statusCode, json, raw } = await postJson(payload, apiKey);

  if (statusCode === 403 || statusCode === 401) {
    throw new Error('Serper a refusé la clé — vérifie SERPER_API_KEY sur serper.dev.');
  }
  if (statusCode === 429) {
    throw new Error('Crédits Serper épuisés — vois ton solde sur serper.dev.');
  }
  if (statusCode >= 400 || !json) {
    throw new Error(`Serper a répondu HTTP ${statusCode}${raw ? ` : ${raw.slice(0, 120)}` : ''}`);
  }

  return (json.organic || []).map((item, index) => ({
    title: item.title,
    link: item.link,
    snippet: item.snippet || '',
    feedImage: item.imageUrl || null,
    publishedAt: parseDate(item.date),
    rank: item.position ?? index + 1,
  }));
}

module.exports = { searchWeb, isConfigured };
