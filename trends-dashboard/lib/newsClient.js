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

function parseRssItems(xml) {
  const items = xml.match(/<item>[\s\S]*?<\/item>/gi) || [];
  return items.map((item) => ({
    title: tagContent(item, 'title'),
    link: tagContent(item, 'link'),
    publishedAt: tagContent(item, 'pubDate'),
    source: tagContent(item, 'source') || null,
    snippet: stripTags(tagContent(item, 'description')).slice(0, 400),
  }));
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

// Google News links are redirect stubs; following them yields the publisher's
// page, whose OpenGraph tags carry the photo and the editor-written summary.
async function enrichArticle(article) {
  const enriched = { ...article, image: null, summary: article.snippet || null, url: article.link };

  try {
    const { statusCode, body, finalUrl } = await fetchUrl(article.link, { maxBytes: MAX_HTML_BYTES });
    if (statusCode !== 200 || !body) return enriched;

    enriched.url = finalUrl;
    enriched.image = metaContent(body, ['og:image', 'twitter:image', 'twitter:image:src']);
    enriched.summary =
      metaContent(body, ['og:description', 'twitter:description', 'description']) || enriched.summary;
    enriched.source = metaContent(body, ['og:site_name']) || enriched.source;

    try {
      enriched.domain = new URL(finalUrl).hostname.replace(/^www\./, '');
    } catch {
      /* finalUrl already validated upstream; leave domain unset */
    }
  } catch {
    // A publisher blocking us costs the photo, not the article — keep the RSS data.
  }

  return enriched;
}

module.exports = { searchNews, enrichArticle, fetchUrl, stripTags, decodeEntities };
