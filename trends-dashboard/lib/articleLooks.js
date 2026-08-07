// Pulls the individual outfit photos out of an article page, with the caption
// that goes with each one. The card's og:image is the opening shot only; a
// piece on someone's style usually carries several looks, and the caption is
// where the publisher names the brand — which is exactly what has to appear
// under the photo.

const { decodeEntities, fetchUrl } = require('./articlePage');
const { fetchHtmlInBrowser, isAvailable } = require('./browserResolver');
const { detectBrands, detectGarments } = require('./fashionVocabulary');

const MAX_LOOKS = 8;
// Photo galleries sit well below the fold, so more of the page is read here
// than the metadata pass needs.
const MAX_HTML_BYTES = 500_000;
// Below this, it is a logo, an author portrait or a tracking pixel rather than
// a photograph of an outfit.
const MIN_DIMENSION = 200;

// Matched against the file name, not the whole URL. A CDN path can carry any
// of these words in a transform parameter or an encoded source URL — Substack
// serves article photos through /image/fetch/… with the original URL appended
// — and testing the entire string threw away real photos.
const JUNK_FILENAME =
  /(logo|sprite|avatar|placeholder|spacer|favicon|headshot|byline|1x1|pixel\b|blank|transparent|button|-icon|icon-)/i;

// Vector assets are interface furniture — buttons, logos, arrows. Press
// photography is never an SVG.
const VECTOR = /\.svg(\?|$)/i;

// A few paths are junk wherever they appear: these are widgets and trackers,
// never article photography.
const JUNK_PATH = /\/(ads?|advert|tracking|beacon|analytics|subscribe-widget|emoji)\//i;

function junkLooking(rawUrl) {
  let path = rawUrl;
  try {
    // Substack and friends percent-encode the original URL inside the CDN one.
    path = decodeURIComponent(new URL(rawUrl, 'https://x.invalid').pathname);
  } catch {
    /* fall back to testing the raw string */
  }
  const filename = path.split('/').filter(Boolean).pop() || '';
  return VECTOR.test(filename) || JUNK_FILENAME.test(filename) || JUNK_PATH.test(path);
}

function attr(tag, name) {
  const match =
    tag.match(new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, 'i')) ||
    tag.match(new RegExp(`\\b${name}\\s*=\\s*'([^']*)'`, 'i'));
  return match ? match[1].trim() : null;
}

// Publishers ship a srcset of the same photo at several widths; the largest is
// the one worth showing.
function largestFromSrcset(srcset) {
  const candidates = srcset
    .split(',')
    .map((part) => part.trim().split(/\s+/))
    .map(([url, size]) => ({ url, width: size ? parseInt(size, 10) || 0 : 0 }))
    .filter((entry) => entry.url);
  if (!candidates.length) return null;
  return candidates.sort((a, b) => b.width - a.width)[0].url;
}

function stripTags(html) {
  return decodeEntities(html.replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function absolute(url, baseUrl) {
  try {
    return new URL(url, baseUrl).toString();
  } catch {
    return null;
  }
}

// Lazy-loading publishers leave src as a placeholder and put the real file in
// a data- attribute, so those are checked before src.
function sourceFrom(tag) {
  const srcset = attr(tag, 'srcset') || attr(tag, 'data-srcset');
  if (srcset) {
    const best = largestFromSrcset(srcset);
    if (best) return best;
  }
  return (
    attr(tag, 'data-src') ||
    attr(tag, 'data-original') ||
    attr(tag, 'data-lazy-src') ||
    attr(tag, 'src')
  );
}

function tooSmall(tag) {
  const width = parseInt(attr(tag, 'width') || '', 10);
  const height = parseInt(attr(tag, 'height') || '', 10);
  if (Number.isFinite(width) && width > 0 && width < MIN_DIMENSION) return true;
  if (Number.isFinite(height) && height > 0 && height < MIN_DIMENSION) return true;
  return false;
}

// What goes under the photo in small type. The caption is the publisher's own
// words, so a brand named there is reliable; the vocabulary lookup turns it
// into the short label, and the caption itself is the fallback.
function describeLook({ caption, alt }) {
  const text = `${caption || ''} ${alt || ''}`.trim();
  const brands = detectBrands(text);
  const garments = detectGarments(text);

  const parts = [];
  if (brands.length) parts.push(brands.join(' · '));
  if (garments.length) parts.push(garments.slice(0, 2).join(' · '));

  return {
    brands,
    garments,
    // Prefer the identified piece; fall back to the caption trimmed to a line.
    label: parts.length ? parts.join(' — ') : caption ? caption.slice(0, 90) : null,
  };
}

function extractLooks(html, baseUrl, { max = MAX_LOOKS } = {}) {
  const looks = [];
  const seen = new Set();

  function add(imgTag, captionHtml) {
    if (looks.length >= max) return;
    if (tooSmall(imgTag)) return;

    const raw = sourceFrom(imgTag);
    if (!raw || raw.startsWith('data:')) return;
    if (junkLooking(raw)) return;

    const url = absolute(raw, baseUrl);
    if (!url || seen.has(url)) return;
    seen.add(url);

    const caption = captionHtml ? stripTags(captionHtml) : null;
    const alt = attr(imgTag, 'alt');
    looks.push({ image: url, caption: caption || null, ...describeLook({ caption, alt }) });
  }

  // Figures first: they are the ones that carry a caption naming the brand.
  const figures = html.matchAll(/<figure\b[^>]*>([\s\S]*?)<\/figure>/gi);
  for (const [, inner] of figures) {
    const img = inner.match(/<img\b[^>]*>/i);
    if (!img) continue;
    const caption = inner.match(/<figcaption\b[^>]*>([\s\S]*?)<\/figcaption>/i);
    add(img[0], caption ? caption[1] : null);
  }

  // Then any remaining images, for publishers that do not use <figure>.
  if (looks.length < max) {
    for (const [tag] of html.matchAll(/<img\b[^>]*>/gi)) add(tag, null);
  }

  return looks;
}

// Run only for the articles that made it onto the board, so the extra page
// read costs five requests rather than one per candidate. A publisher that
// refuses the request simply yields no strip; the card itself still stands.
// Returns { looks, reason }. The reason matters: an empty strip had three
// indistinguishable causes — the publisher refused the request, the page came
// back empty, or the markup held no usable photo — and all three showed up as
// a card with nothing under it and no way to tell which.
async function looksFor(article) {
  if (!article.url) return { looks: [], reason: 'article sans URL' };

  let html = null;
  let baseUrl = article.url;
  let plainFailure = null;

  try {
    const { statusCode, body, finalUrl } = await fetchUrl(article.url, {
      maxBytes: MAX_HTML_BYTES,
    });
    if (statusCode === 200 && body) {
      html = body;
      baseUrl = finalUrl || article.url;
    } else {
      plainFailure = `HTTP ${statusCode}`;
    }
  } catch (err) {
    plainFailure = err.message || String(err);
  }

  // Publishers that block plain requests are exactly the ones whose photos are
  // worth having, so the browser gets a turn before giving up.
  if (!html && isAvailable()) {
    try {
      const page = await fetchHtmlInBrowser(article.url);
      if (page?.html) {
        html = page.html;
        baseUrl = page.finalUrl || article.url;
      }
    } catch (err) {
      return { looks: [], reason: `${plainFailure}, navigateur : ${err.message}` };
    }
  }

  if (!html) {
    return {
      looks: [],
      reason: isAvailable()
        ? `page illisible (${plainFailure})`
        : `page illisible (${plainFailure}) — Playwright absent, aucun repli navigateur`,
    };
  }

  const looks = extractLooks(html, baseUrl);
  return {
    looks,
    reason: looks.length ? null : 'page lue, mais aucune photo exploitable trouvée',
  };
}

module.exports = { extractLooks, describeLook, looksFor, MAX_LOOKS };

