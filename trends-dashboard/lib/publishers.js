// Who published it. Two judgements live here, and both used to be missing
// from every path except the browser scraper: what is not press at all, and
// what is press worth ranking highly.

// Not press: nothing here can be read as an article about a look. Social and
// video carry the outfit but no reporting; marketplaces sell clothes without
// writing about them; wikis and forums are neither.
const EXCLUDED_HOSTS = new RegExp(
  [
    // Réseaux sociaux et vidéo
    'youtube\\.com', 'youtu\\.be', 'facebook\\.com', 'instagram\\.com',
    'pinterest\\.', 'tiktok\\.com', 'reddit\\.com', 'x\\.com', 'twitter\\.com',
    'threads\\.net', 'tumblr\\.com', 'snapchat\\.com', 'linkedin\\.com',
    'vimeo\\.com', 'dailymotion\\.com', 'twitch\\.tv', 'flickr\\.com',
    // Encyclopédies, forums, Q&R
    'wikipedia\\.org', 'wikiwand\\.com', 'fandom\\.com', 'quora\\.com',
    'stackexchange\\.com', 'imdb\\.com',
    // Places de marché : elles vendent des vêtements, elles n'en parlent pas
    'amazon\\.', 'ebay\\.', 'etsy\\.com', 'poshmark\\.com', 'depop\\.com',
    'grailed\\.com', 'stockx\\.com', 'vinted\\.',
    // Agrégateurs et portails : reprises sans rédaction propre
    'news\\.google\\.', '(^|\\.)google\\.', 'msn\\.com', 'news\\.yahoo\\.',
    'flipboard\\.com', 'buzzfeed\\.com',
    // Paparazzi et banques d'images : la photo est sous licence, pas l'article
    'gettyimages\\.', 'shutterstock\\.com', 'alamy\\.com', 'backgrid\\.com',
  ].join('|')
);

// Outlets that actually cover fashion, so a piece from one of them outranks a
// blog that happens to use the same words. Not a whitelist — an unknown
// domain is kept, it simply gets no boost.
const PRESS_DOMAINS = new Set([
  // Mode
  'vogue.com', 'gq.com', 'esquire.com', 'harpersbazaar.com', 'elle.com',
  'wwd.com', 'hypebeast.com', 'highsnobiety.com', 'dazeddigital.com',
  'i-d.co', 'i-d.vice.com', 'lofficielusa.com', 'nssmag.com', 'papermag.com',
  'interviewmagazine.com', 'wmagazine.com', 'vman.com', 'ssense.com',
  'thecut.com', 'fashionista.com', 'whowhatwear.com', 'instyle.com',
  'menshealth.com', 'mrporter.com', 'complex.com', 'cosmopolitan.com',
  'marieclaire.com', 'glamour.com', 'refinery29.com', 'nylon.com',
  'anothermag.com', 'businessoffashion.com', 'footwearnews.com',
  'vanityfair.com', 'townandcountrymag.com', 'thefashionisto.com',
  // Divertissement et généralistes qui couvrent les tapis rouges
  'variety.com', 'hollywoodreporter.com', 'people.com', 'eonline.com',
  'usmagazine.com', 'billboard.com', 'rollingstone.com', 'papermag.com',
  'nytimes.com', 'washingtonpost.com', 'theguardian.com', 'independent.co.uk',
  'telegraph.co.uk', 'standard.co.uk', 'bbc.com', 'cnn.com',
]);

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

// True when the URL is something other than a press article.
function isExcluded(url) {
  const host = hostOf(url);
  return !host || EXCLUDED_HOSTS.test(host);
}

// The brand token of each known outlet, so regional editions count too:
// vogue.co.uk, elle.fr, esquire.com.au. Requiring the trailing dot is what
// keeps "elle" from matching michelle.com.
const PRESS_BRANDS = new Set([...PRESS_DOMAINS].map((domain) => domain.split('.')[0]));

// Editions whose domain does not start with the brand token.
const PRESS_ALIASES = new Set([
  'gq-magazine.co.uk', 'lofficiel.com', 'vogue.it', 'vogue.fr', 'vogue.es',
  'esquiremag.ph', 'gqindia.com', 'gqmiddleeast.com', 'elleman.vn',
]);

// True for outlets known to cover fashion; feeds the ranking, not the filter.
function isKnownPress(url) {
  const host = hostOf(url);
  if (!host) return false;
  if (PRESS_DOMAINS.has(host) || PRESS_ALIASES.has(host)) return true;
  // Match on the leading label only: vogue.co.uk yes, notvogue.com no.
  const brand = host.split('.')[0];
  return PRESS_BRANDS.has(brand);
}

module.exports = { isExcluded, isKnownPress, hostOf, EXCLUDED_HOSTS, PRESS_DOMAINS };
