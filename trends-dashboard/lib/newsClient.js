const https = require('https');
const { URL } = require('url');
const { resolveInBrowser, isAvailable } = require('./browserResolver');

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const REQUEST_TIMEOUT_MS = 12_000;
// Publishers put the social preview in the first few KB; pulling whole article
// pages for a dozen results would cost far more than the tags are worth.
const MAX_HTML_BYTES = 200_000;

function fetchUrl(target, { redirectsLeft = 5, maxBytes = Infinity, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    let url;
    try {
      url = new URL(target);
    } catch (err) {
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

function stripTags(html) {
  return decodeEntities(String(html || '').replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function tagContent(xml, tag) {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
  if (!match) return '';
  return decodeEntities(match[1].replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '')).trim();
}

function isRelay(url) {
  return /(^|\/\/)news\.google\.com/.test(url);
}

function parseRssItems(xml) {
  const items = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || [];
  return items.map((item) => ({
    title: tagContent(item, 'title'),
    link: tagContent(item, 'link'),
    publishedAt: tagContent(item, 'pubDate') || tagContent(item, 'dc:date'),
    source: tagContent(item, 'source') || null,
    snippet: stripTags(tagContent(item, 'description')).slice(0, 400),
  }));
}

// Turns a headline into the publisher's own URL. Google News relay ids cannot
// be decoded, but the headline they carry is enough to find the article
// elsewhere — and a real URL is what makes og:image reachable.
async function resolveByHeadline(title) {
  const cleaned = title.replace(/\s+-\s+[^-]{2,40}$/, '').trim();
  const params = new URLSearchParams({ q: cleaned });

  const { statusCode, body } = await fetchUrl(
    `https://html.duckduckgo.com/html/?${params.toString()}`,
    { maxBytes: 400_000 }
  );
  if (statusCode !== 200 || !body) return null;

  // Results are wrapped in a redirect carrying the destination in `uddg`.
  const matches = body.matchAll(/uddg=([^"&]+)/g);
  for (const match of matches) {
    try {
      const url = decodeURIComponent(match[1]);
      if (/^https?:\/\//.test(url) && !/duckduckgo|google\.com|bing\.com/.test(url)) return url;
    } catch {
      /* skip an undecodable result rather than abandon the search */
    }
  }
  return null;
}

async function searchNews(query, { geo = 'US', hl = 'en-US', limit = 20 } = {}) {
  const params = new URLSearchParams({
    q: query,
    hl,
    gl: geo,
    ceid: `${geo}:${hl.split('-')[0]}`,
  });
  const { statusCode, body } = await fetchUrl(
    `https://news.google.com/rss/search?${params.toString()}`
  );
  if (statusCode !== 200) {
    throw new Error(`Google News a répondu HTTP ${statusCode}.`);
  }
  return parseRssItems(body).slice(0, limit);
}

// Google News links are relay stubs. They used to answer with a 302 to the
// publisher; now they serve an HTML page that redirects with JavaScript, so
// following the link lands on Google's own markup — no publisher photo, no
// publisher summary. Three ways out, cheapest first.

// 1. The real URL is encoded in the path. Decoding the base64 gives a protobuf
//    blob whose only readable http(s) run is the article address.
function decodeRelayPath(link) {
  const match = link.match(/\/articles\/([A-Za-z0-9_-]{16,})/);
  if (!match) return null;
  try {
    const decoded = Buffer.from(match[1], 'base64').toString('latin1');
    const url = decoded.match(/https?:\/\/[^\s\x00-\x1f"'<>]+/);
    if (!url) return null;
    const candidate = url[0];
    return candidate.includes('news.google.com') ? null : candidate;
  } catch {
    return null;
  }
}

// 2. Failing that, the interstitial itself names the destination.
function extractFromInterstitial(html) {
  const patterns = [
    /data-n-au="([^"]+)"/,
    /<c-wiz[^>]+data-p="[^"]*?(https?:\/\/[^\s"\\]+)/,
    /url=(https?:\/\/[^"'&<>]+)/,
    /<a[^>]+href="(https?:\/\/(?!(?:news|www|accounts|policies|support)\.google\.com)[^"]+)"/,
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) {
      const candidate = decodeEntities(match[1]);
      if (!candidate.includes('google.com')) return candidate;
    }
  }
  return null;
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

// Resolve a relay link to the publisher's page, whose OpenGraph tags carry the
// photo and the editor-written summary.
async function resolvePublisherUrl(link, title) {
  if (!isRelay(link)) return { url: link, html: null };

  const decoded = decodeRelayPath(link);
  if (decoded) return { url: decoded, html: null };

  const { body, finalUrl } = await fetchUrl(link, { maxBytes: MAX_HTML_BYTES });
  if (finalUrl && !isRelay(finalUrl)) return { url: finalUrl, html: body };

  const extracted = body ? extractFromInterstitial(body) : null;
  if (extracted) return { url: extracted, html: null };

  // 4. Nothing static gives the destination up, because the relay page computes
  //    it in JavaScript. A real browser runs that script — and, being a real
  //    browser, also gets past publishers that refuse plain HTTP clients.
  if (isAvailable()) {
    try {
      const resolved = await resolveInBrowser(link);
      if (resolved) return { url: resolved.url, html: null, fromBrowser: resolved };
    } catch (err) {
      lastBrowserError = err.message || String(err);
    }
  }

  // 5. Last resort: find the article by its headline elsewhere.
  if (title) {
    try {
      const found = await resolveByHeadline(title);
      if (found) return { url: found, html: null };
    } catch {
      /* the article still shows, just without its photo */
    }
  }

  return { url: link, html: null };
}

// Surfaced in the fetch log so a missing browser is reported as such rather
// than looking like every publisher happened to block us.
let lastBrowserError = null;
const takeBrowserError = () => {
  const error = lastBrowserError;
  lastBrowserError = null;
  return error;
};

async function enrichArticle(article) {
  const enriched = { ...article, image: null, summary: article.snippet || null, url: article.link };

  try {
    const resolved = await resolvePublisherUrl(article.link, article.title);
    enriched.url = resolved.url;

    // The browser already loaded the page; re-fetching it would only invite
    // the 403 the browser just avoided.
    if (resolved.fromBrowser) {
      const page = resolved.fromBrowser;
      enriched.image = enriched.image || page.image;
      enriched.summary = page.summary || enriched.summary;
      enriched.source = page.source || enriched.source;
      try {
        const parsed = new URL(enriched.url);
        enriched.domain = parsed.hostname.replace(/^www\./, '');
        if (enriched.image && !/^https?:/i.test(enriched.image)) {
          enriched.image = new URL(enriched.image, parsed.origin).toString();
        }
      } catch {
        /* leave domain unset rather than fail the article */
      }
      return enriched;
    }

    let html = resolved.html;
    if (!html) {
      const page = await fetchUrl(resolved.url, { maxBytes: MAX_HTML_BYTES });
      if (page.statusCode === 200) {
        html = page.body;
        enriched.url = page.finalUrl;
      }
    }
    if (!html) return enriched;

    enriched.image =
      enriched.image || metaContent(html, ['og:image', 'twitter:image', 'twitter:image:src']);
    enriched.summary =
      metaContent(html, ['og:description', 'twitter:description', 'description']) || enriched.summary;
    enriched.source = metaContent(html, ['og:site_name']) || enriched.source;

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
  } catch {
    // A publisher blocking us costs the photo, not the article — keep the RSS data.
  }

  return enriched;
}

module.exports = {
  takeBrowserError,
  searchNews,
  resolveByHeadline,
  enrichArticle,
  fetchUrl,
  stripTags,
  decodeEntities,
  decodeRelayPath,
  extractFromInterstitial,
};
