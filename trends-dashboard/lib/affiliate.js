const { fetchUrl } = require('./articlePage');

// Both platforms are queried for the same piece and the better answer wins:
// ShopMy is creator-and-fashion oriented, impact.com carries the wider merchant
// catalogue, and which one covers a given garment is not knowable in advance.
const PROVIDERS = ['shopmy', 'impact'];

function credentials() {
  return {
    shopmy: process.env.SHOPMY_API_KEY || null,
    impactSid: process.env.IMPACT_ACCOUNT_SID || null,
    impactToken: process.env.IMPACT_AUTH_TOKEN || null,
  };
}

function configuredProviders() {
  const creds = credentials();
  return PROVIDERS.filter((name) =>
    name === 'shopmy' ? Boolean(creds.shopmy) : Boolean(creds.impactSid && creds.impactToken)
  );
}

function postJson(url, { headers = {}, body }) {
  const https = require('https');
  const target = new URL(url);
  const payload = JSON.stringify(body);

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        host: target.hostname,
        path: target.pathname + target.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
          ...headers,
        },
      },
      (res) => {
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => resolve({ statusCode: res.statusCode, body: data }));
      }
    );
    req.setTimeout(15_000, () => req.destroy(new Error('Délai dépassé')));
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

// ShopMy turns a merchant URL into a creator link ("pin").
async function shopmyLink(query, merchantUrl) {
  const key = credentials().shopmy;
  if (!key) return null;

  const res = await postJson('https://api.shopmy.us/api/Pins', {
    headers: { 'x-apikey': key },
    body: { title: query, link: merchantUrl },
  });
  if (res.statusCode >= 400) {
    throw new Error(`ShopMy a répondu HTTP ${res.statusCode}`);
  }

  const parsed = JSON.parse(res.body);
  const url = parsed?.pin?.short_url || parsed?.short_url || parsed?.url;
  return url ? { url, provider: 'ShopMy' } : null;
}

// impact.com wraps a landing page in a tracking link for a program the
// publisher has already been approved on.
async function impactLink(merchantUrl) {
  const { impactSid, impactToken } = credentials();
  if (!impactSid || !impactToken) return null;

  const auth = Buffer.from(`${impactSid}:${impactToken}`).toString('base64');
  const programId = process.env.IMPACT_PROGRAM_ID;
  if (!programId) return null;

  const params = new URLSearchParams({ Type: 'Regular', DeepLink: merchantUrl });
  const { statusCode, body } = await fetchUrl(
    `https://api.impact.com/Mediapartners/${impactSid}/Programs/${programId}/TrackingLinks?${params}`,
    { headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' } }
  );
  if (statusCode >= 400) throw new Error(`impact.com a répondu HTTP ${statusCode}`);

  const parsed = JSON.parse(body);
  const url = parsed?.TrackingURL || parsed?.TrackingLinks?.[0]?.TrackingURL;
  return url ? { url, provider: 'impact.com' } : null;
}

// Where a shopper would land without any affiliation. Kept as the fallback so
// a draft is never blocked by a missing credential, and marked as such.
function plainSearchUrl(query) {
  return `https://www.google.com/search?tbm=shop&q=${encodeURIComponent(query)}`;
}

async function linkForQuery(query) {
  const merchantUrl = plainSearchUrl(query);
  const attempts = [];

  for (const provider of configuredProviders()) {
    try {
      const link =
        provider === 'shopmy' ? await shopmyLink(query, merchantUrl) : await impactLink(merchantUrl);
      if (link) return { query, ...link, affiliate: true };
    } catch (err) {
      attempts.push(`${provider}: ${err.message}`);
    }
  }

  return {
    query,
    url: merchantUrl,
    provider: configuredProviders().length ? 'aucun (échec)' : 'aucun (non configuré)',
    affiliate: false,
    errors: attempts.length ? attempts : undefined,
  };
}

// Garments make better shopping queries than brands alone — "Bottega Veneta
// leather tie" converts where "Bottega Veneta" just lands on a homepage.
function shoppingQueries({ garments = [], brands = [] }) {
  const queries = [];
  for (const garment of garments.slice(0, 4)) {
    queries.push(brands.length ? `${brands[0]} ${garment}` : garment);
  }
  if (!queries.length && brands.length) queries.push(brands[0]);
  return queries;
}

async function affiliateLinksFor(article) {
  const queries = shoppingQueries(article);
  const links = [];
  for (const query of queries) links.push(await linkForQuery(query));
  return links;
}

module.exports = { affiliateLinksFor, linkForQuery, shoppingQueries, configuredProviders };
