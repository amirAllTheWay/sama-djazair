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

function fetchUrl(target, { redirectsLeft = 5, maxBytes = Infinity, headers = {}, method = 'GET' } = {}) {
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
        method,
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
          return resolve(
            fetchUrl(next, { redirectsLeft: redirectsLeft - 1, maxBytes, headers, method })
          );
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

// fetchUrl decodes as utf8, which destroys binary. Photos need their bytes
// intact to be handed to a vision model.
function fetchBinary(target, { redirectsLeft = 5, maxBytes = 5_000_000 } = {}) {
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
        headers: { 'User-Agent': USER_AGENT, Accept: 'image/*,*/*;q=0.8' },
      },
      (res) => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
          res.resume();
          if (redirectsLeft <= 0) return reject(new Error('Trop de redirections'));
          const next = new URL(res.headers.location, url).toString();
          return resolve(fetchBinary(next, { redirectsLeft: redirectsLeft - 1, maxBytes }));
        }

        const chunks = [];
        let size = 0;
        let aborted = false;
        res.on('data', (chunk) => {
          size += chunk.length;
          if (size > maxBytes) {
            aborted = true;
            res.destroy();
            return;
          }
          chunks.push(chunk);
        });
        res.on('close', () =>
          resolve({
            statusCode: res.statusCode,
            buffer: aborted ? null : Buffer.concat(chunks),
            contentType: res.headers['content-type'] || '',
            tooLarge: aborted,
          })
        );
      }
    );

    req.setTimeout(REQUEST_TIMEOUT_MS, () => req.destroy(new Error('Délai dépassé')));
    req.on('error', reject);
    req.end();
  });
}

// Accents and typographic punctuation are what publishers actually emit in
// captions and summaries, so the table has to cover more than the five XML
// entities. Anything unrecognised is left as written rather than mangled.
const NAMED_ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  // Ponctuation typographique
  rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', hellip: '…',
  ndash: '–', mdash: '—', laquo: '«', raquo: '»', middot: '·',
  bull: '•', deg: '°', euro: '€', pound: '£', trade: '™',
  copy: '©', reg: '®', times: '×', frac12: '½', prime: '′',
  // Lettres accentuées
  eacute: 'é', egrave: 'è', ecirc: 'ê', euml: 'ë',
  agrave: 'à', acirc: 'â', auml: 'ä', aring: 'å', aelig: 'æ',
  ugrave: 'ù', ucirc: 'û', uuml: 'ü',
  icirc: 'î', iuml: 'ï', ocirc: 'ô', ouml: 'ö', oslash: 'ø', oelig: 'œ',
  ccedil: 'ç', ntilde: 'ñ', szlig: 'ß',
  Eacute: 'É', Egrave: 'È', Ecirc: 'Ê', Agrave: 'À', Acirc: 'Â',
  Ccedil: 'Ç', Ouml: 'Ö', Uuml: 'Ü', Auml: 'Ä',
};

function decodeEntities(text) {
  if (!text) return '';
  return text
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&([a-z][a-z0-9]*);/gi, (whole, name) => {
      // Case matters for the accented ones: &Eacute; is not &eacute;.
      return NAMED_ENTITIES[name] ?? NAMED_ENTITIES[name.toLowerCase()] ?? whole;
    });
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

// Whether the link actually leads somewhere. Only a 404/410 is treated as
// dead: publishers routinely answer 403 or 429 to anything that is not a
// browser, and those pages open perfectly well when clicked. A network error
// is inconclusive too, so it counts as alive rather than dropping a good
// article on a transient failure.
async function isDeadLink(target) {
  try {
    const { statusCode } = await fetchUrl(target, { maxBytes: 1, method: 'HEAD' });
    return statusCode === 404 || statusCode === 410;
  } catch {
    return false;
  }
}

async function enrichArticle(article) {
  const enriched = {
    ...article,
    image: article.feedImage || null,
    summary: article.snippet || null,
    url: article.link,
  };

  // A result that arrived with its own photo needs no page visit for the
  // card's sake — but the link still has to be checked, or a dead URL sails
  // straight through precisely on the articles that rank highest.
  if (enriched.image) {
    try {
      enriched.domain = new URL(enriched.url).hostname.replace(/^www\./, '');
    } catch {
      /* leave domain unset rather than fail the article */
    }
    enriched.dead = await isDeadLink(enriched.url);
    return enriched;
  }

  // A plain request is cheap and works for most publishers; the browser is
  // held back for the ones that answer 403 to anything that is not one.
  try {
    const { statusCode, body, finalUrl } = await fetchUrl(article.link, { maxBytes: MAX_HTML_BYTES });
    if (statusCode === 404 || statusCode === 410) {
      // Gone for good: the browser would only confirm it, slowly.
      enriched.dead = true;
      return enriched;
    }
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

module.exports = {
  enrichArticle,
  fetchUrl,
  fetchBinary,
  isDeadLink,
  decodeEntities,
  takeBrowserError,
};
