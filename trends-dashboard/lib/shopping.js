// Real products, not a search page.
//
// Sending the reader to a Google Shopping query made the dashboard stop one
// step short of what it exists for: deciding whether a look is worth making
// content about means seeing the actual garment and its price, not a list of
// results to sift through afterwards.
//
// Serper's shopping endpoint returns Google Shopping's own results as JSON —
// title, price, merchant, thumbnail, product URL — for the same key already
// used for the article search.

const https = require('https');

const RESULTS_PER_QUERY = 4;

const isConfigured = () => Boolean(process.env.SERPER_API_KEY);

function postJson(payload, apiKey) {
  const body = JSON.stringify(payload);
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        host: 'google.serper.dev',
        path: '/shopping',
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

// "$89.00" / "£45" / "129,99 €" — kept as text for display, and parsed to a
// number so an affordable alternative can be checked rather than trusted.
function parsePrice(value) {
  if (!value) return null;
  const cleaned = String(value).replace(/[^\d.,]/g, '').replace(/,(\d{2})$/, '.$1').replace(/,/g, '');
  const amount = Number.parseFloat(cleaned);
  return Number.isFinite(amount) ? amount : null;
}

async function searchProducts(query, { limit = RESULTS_PER_QUERY } = {}) {
  const apiKey = process.env.SERPER_API_KEY;
  if (!apiKey) throw new Error("SERPER_API_KEY n'est pas renseigné — pas de recherche produits.");

  const { statusCode, json, raw } = await postJson({ q: query, gl: 'us', hl: 'en' }, apiKey);

  if (statusCode === 401 || statusCode === 403) throw new Error('Serper a refusé la clé.');
  if (statusCode === 429) throw new Error('Crédits Serper épuisés.');
  if (statusCode >= 400 || !json) {
    throw new Error(`Serper Shopping a répondu HTTP ${statusCode}${raw ? ` : ${raw.slice(0, 120)}` : ''}`);
  }

  return (json.shopping || [])
    .filter((item) => item.link && item.title)
    .slice(0, limit)
    .map((item) => ({
      title: item.title,
      price: item.price || null,
      amount: parsePrice(item.price),
      merchant: item.source || null,
      image: item.imageUrl || null,
      url: item.link,
      rating: item.rating ?? null,
    }));
}

module.exports = { searchProducts, parsePrice, isConfigured, RESULTS_PER_QUERY };
