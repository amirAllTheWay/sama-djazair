// Reads an article page for the two things a card needs: the share photo and
// the editorial summary. Google search hands over publisher URLs directly, so
// there is no relay to unwrap — the page is simply fetched and parsed.

const https = require('https');
const { URL } = require('url');
const { resolveInBrowser, isAvailable } = require('./browserResolver');

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const REQUEST_TIMEOUT_MS = 12_000;
// Publishers put the social preview in the first few KB; whole article pages
// would cost far more than the tags are worth.
const MAX_HTML_BYTES = 200_000;

// Reported by the fetch cycle so a browser problem is named rather than
// looking like every publisher happened to block us.
let lastBrowserError = null;
const takeBrowserError = () => {
  const error = lastBrowserError;
  lastBrowserError = null;
  return error;
};

function fetchUrl(target, { redirectsLeft = 5, maxBytes = Infinity, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    let url;
    try {
      url = new URL(target);
    } catch {
      return reject(new Error(`URL invalide : ${target}`));
    }

    const req = https.request(
      {
        host: url.hostname,
        path: url.pathname + url.search,
        method: 'GET',
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          ...headers,
        },
      },
      (res) => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
          res.resume();
          if (redirectsLeft <= 0) return reject(new Error('Trop de redirections'));
          const next = new URL(res.headers.location, url).toString();
          return resolve(fetchUrl(next, { redirectsLeft: redirectsLeft - 1, maxBytes, headers }));
        }

        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          if (body.length >= maxBytes) {
            res.destroy();
            return;
          }
          body += chunk;
        });
        res.on('close', () => resolve({ statusCode: res.statusCode, body, finalUrl: url.toString() }));
      }
    );

    req.setTimeout(REQUEST_TIMEOUT_MS, () => req.destroy(new Error('Délai dépassé')));
    req.on('error', reject);
    req.end();
  });
}

function decodeEntities(text) {
  if (!text) return '';
  const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };
  return text
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&([a-z]+|#\d+);/gi, (whole, name) => named[name.toLowerCase()] ?? whole);
}

function metaContent(html, patterns) {
  for (const pattern of patterns) {
    // Attribute order varies by CMS, so match content= on either side of the key.
    const after = html.match(
      new RegExp(`<meta[^>]+(?:property|name)=["']${pattern}["'][^>]*content=["']([^"']+)["']`, 'i')
    );
    if (after) return decodeEntities(after[1]);
    const before = html.match(
      new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${pattern}["']`, 'i')
    );
    if (before) return decodeEntities(before[1]);
  }
  return null;
}

function applyMeta(enriched, { image, summary, source }) {
  enriched.image = image || enriched.image;
  enriched.summary = summary || enriched.summary;
  enriched.source = source || enriched.source;

  try {
    const parsed = new URL(enriched.url);
    enriched.domain = parsed.hostname.replace(/^www\./, '');
    // Publishers often give og:image as a site-relative path.
    if (enriched.image && !/^https?:/i.test(enriched.image)) {
      enriched.image = new URL(enriched.image, parsed.origin).toString();
    }
  } catch {
    /* leave domain unset rather than fail the article */
  }
  return enriched;
}

async function enrichArticle(article) {
  const enriched = {
    ...article,
    image: article.feedImage || null,
    summary: article.snippet || null,
    url: article.link,
  };

  // The Custom Search API returns the publisher's own og:image in its pagemap,
  // so a result that arrived with one needs no page visit at all.
  if (enriched.image) {
    try {
      enriched.domain = new URL(enriched.url).hostname.replace(/^www\./, '');
    } catch {
      /* leave domain unset rather than fail the article */
    }
    return enriched;
  }

  // A plain request is cheap and works for most publishers; the browser is
  // held back for the ones that answer 403 to anything that is not one.
  try {
    const { statusCode, body, finalUrl } = await fetchUrl(article.link, { maxBytes: MAX_HTML_BYTES });
    if (statusCode === 200 && body) {
      enriched.url = finalUrl;
      return applyMeta(enriched, {
        image: metaContent(body, ['og:image', 'twitter:image', 'twitter:image:src']),
        summary: metaContent(body, ['og:description', 'twitter:description', 'description']),
        source: metaContent(body, ['og:site_name']),
      });
    }
  } catch {
    /* fall through to the browser */
  }

  if (!isAvailable()) return enriched;

  try {
    const page = await resolveInBrowser(article.link);
    if (page) {
      enriched.url = page.url;
      return applyMeta(enriched, page);
    }
  } catch (err) {
    lastBrowserError = err.message || String(err);
  }

  return enriched;
}

module.exports = { enrichArticle, fetchUrl, decodeEntities, takeBrowserError };
