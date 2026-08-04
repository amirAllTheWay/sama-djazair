const https = require('https');
const { URL } = require('url');

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const REQUEST_TIMEOUT_MS = 12_000;
// Publishers put the social preview in the first few KB; pulling whole article
// pages for a dozen results would cost far more than the tags are worth.
const MAX_HTML_BYTES = 200_000;

function fetchUrl(target, { redirectsLeft = 5, maxBytes = Infinity } = {}) {
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
        },
      },
      (res) => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
          res.resume();
          if (redirectsLeft <= 0) return reject(new Error('Trop de redirections'));
          const next = new URL(res.headers.location, url).toString();
          return resolve(fetchUrl(next, { redirectsLeft: redirectsLeft - 1, maxBytes }));
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

// Publisher feeds carry the photo inline, under whichever of these tags their
// CMS emits. Reading it here avoids a request and survives sites that block us.
function feedImage(item) {
  const patterns = [
    /<media:content[^>]+url=["']([^"']+)["']/i,
    /<media:thumbnail[^>]+url=["']([^"']+)["']/i,
    /<enclosure[^>]+url=["']([^"']+)["'][^>]*type=["']image/i,
    /<enclosure[^>]+type=["']image[^>]*url=["']([^"']+)["']/i,
    /<image[^>]*>\s*<url>([^<]+)<\/url>/i,
    /<img[^>]+src=["']([^"']+)["']/i,
  ];
  // Some feeds ship the photo as an <img> inside an entity-escaped
  // description, so the raw item has to be decoded before it can be matched.
  for (const haystack of [item, decodeEntities(item)]) {
    for (const pattern of patterns) {
      const match = haystack.match(pattern);
      if (match) return decodeEntities(match[1]);
    }
  }
  return null;
}

function parseRssItems(xml) {
  const items = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || [];
  return items.map((item) => ({
    title: tagContent(item, 'title'),
    link: tagContent(item, 'link'),
    publishedAt: tagContent(item, 'pubDate') || tagContent(item, 'dc:date'),
    source: tagContent(item, 'source') || null,
    snippet: stripTags(tagContent(item, 'description')).slice(0, 400),
    feedImage: feedImage(item),
  }));
}

// Fashion and menswear titles that cover red carpet and street style, chosen
// because their feeds carry both the real article URL and an inline image —
// neither of which Google News relay links reliably give up any more.
const PUBLISHER_FEEDS = [
  { name: 'GQ', url: 'https://www.gq.com/feed/rss' },
  { name: 'Vogue', url: 'https://www.vogue.com/feed/rss' },
  { name: 'Who What Wear', url: 'https://www.whowhatwear.com/rss' },
  { name: "Harper's Bazaar", url: 'https://www.harpersbazaar.com/rss/all.xml/' },
  { name: 'Elle', url: 'https://www.elle.com/rss/all.xml/' },
  { name: 'Esquire', url: 'https://www.esquire.com/rss/all.xml/' },
  { name: 'Hypebeast', url: 'https://hypebeast.com/feed' },
  { name: 'WWD', url: 'https://wwd.com/feed/' },
  { name: 'Footwear News', url: 'https://footwearnews.com/feed/' },
];

// Scans publisher feeds for a name instead of asking Google for it. Slower to
// discover new outlets, but every hit arrives complete.
async function searchPublisherFeeds(name, { limit = 20 } = {}) {
  const needle = name.toLowerCase();
  const found = [];
  const errors = {};

  const results = await Promise.all(
    PUBLISHER_FEEDS.map(async (feed) => {
      try {
        const { statusCode, body } = await fetchUrl(feed.url, { maxBytes: 900_000 });
        if (statusCode !== 200 || !body) return [];
        return parseRssItems(body)
          .filter((item) => `${item.title} ${item.snippet}`.toLowerCase().includes(needle))
          .map((item) => ({ ...item, source: item.source || feed.name }));
      } catch (err) {
        errors[`feed:${feed.name}`] = err.message || String(err);
        return [];
      }
    })
  );

  for (const items of results) found.push(...items);
  found.sort((a, b) => Date.parse(b.publishedAt || 0) - Date.parse(a.publishedAt || 0));
  return { items: found.slice(0, limit), errors };
}

// Bing's news feed links straight to the publisher. Google News now hides its
// destinations behind opaque relay ids that carry no URL to decode and serve a
// JavaScript interstitial, so nothing downstream can reach the article page —
// which is where the photo lives.
async function searchBingNews(query, { limit = 20 } = {}) {
  const params = new URLSearchParams({ q: query, format: 'RSS', setmkt: 'en-US', setlang: 'en' });
  const { statusCode, body } = await fetchUrl(
    `https://www.bing.com/news/search?${params.toString()}`,
    { maxBytes: 900_000 }
  );
  if (statusCode !== 200) throw new Error(`Bing News a répondu HTTP ${statusCode}.`);
  return parseRssItems(body)
    .filter((item) => item.link && !isRelay(item.link))
    .slice(0, limit);
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
async function resolvePublisherUrl(link) {
  if (!isRelay(link)) return { url: link, html: null };

  const decoded = decodeRelayPath(link);
  if (decoded) return { url: decoded, html: null };

  // 3. Last resort: load the interstitial and read the destination out of it.
  const { body, finalUrl } = await fetchUrl(link, { maxBytes: MAX_HTML_BYTES });
  if (finalUrl && !isRelay(finalUrl)) return { url: finalUrl, html: body };

  const extracted = body ? extractFromInterstitial(body) : null;
  return extracted ? { url: extracted, html: null } : { url: link, html: null };
}

async function enrichArticle(article) {
  const enriched = {
    ...article,
    image: article.feedImage || null,
    summary: article.snippet || null,
    url: article.link,
  };

  try {
    const resolved = await resolvePublisherUrl(article.link);
    enriched.url = resolved.url;

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
  searchNews,
  searchBingNews,
  searchPublisherFeeds,
  PUBLISHER_FEEDS,
  enrichArticle,
  fetchUrl,
  stripTags,
  decodeEntities,
  decodeRelayPath,
  extractFromInterstitial,
};
