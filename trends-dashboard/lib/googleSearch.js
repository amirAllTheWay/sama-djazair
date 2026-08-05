// Google News RSS only indexes registered news outlets, and its selection is
// narrow: fashion blogs, trend pieces and style analyses never appear there.
// Typing the query into Google proper reaches all of it — which is what a
// person does by hand — and returns publisher URLs directly, with none of the
// relay indirection the news feed forces.

const { withPage } = require('./browserResolver');

const RESULTS_PER_QUERY = 12;

// Aggregators, video and social hosts: they rank well for a celebrity name but
// never carry the written coverage the board is built on.
const JUNK_HOSTS =
  /(^|\/\/|\.)((www\.)?google\.|youtube\.com|facebook\.com|instagram\.com|pinterest\.|tiktok\.com|reddit\.com|x\.com|twitter\.com)/;

// Google's own recency filter, so "what is being written now" is a search
// parameter rather than something to sort out afterwards.
const RECENCY = { day: 'qdr:d', week: 'qdr:w', month: 'qdr:m', year: 'qdr:y' };

function buildUrl(query, recency) {
  const params = new URLSearchParams({
    q: query,
    num: String(RESULTS_PER_QUERY + 8),
    hl: 'en',
    gl: 'us',
  });
  const filter = RECENCY[recency];
  if (filter) params.set('tbs', filter);
  return `https://www.google.com/search?${params.toString()}`;
}

// A fresh browser profile gets the consent interstitial, and nothing is
// readable until it is dismissed.
async function dismissConsent(page) {
  const buttons = [
    'button:has-text("Accept all")',
    'button:has-text("Tout accepter")',
    'button#L2AGLb',
    'form[action*="consent"] button',
  ];
  for (const selector of buttons) {
    const button = page.locator(selector).first();
    if (await button.count().catch(() => 0)) {
      await button.click({ timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(500);
      return true;
    }
  }
  return false;
}


async function searchWeb(query, { recency = 'month' } = {}) {
  return withPage(async (page) => {
    await page.goto(buildUrl(query, recency), { waitUntil: 'domcontentloaded', timeout: 25_000 });

    if (/consent\.google|sorry\/index/.test(page.url())) {
      await dismissConsent(page);
      await page.goto(buildUrl(query, recency), { waitUntil: 'domcontentloaded', timeout: 25_000 });
    } else {
      await dismissConsent(page);
    }

    if (/sorry\/index/.test(page.url())) {
      throw new Error('Google a présenté un captcha — réessaie dans quelques minutes.');
    }

    await page.waitForSelector('#search a h3, #rso a h3', { timeout: 10_000 }).catch(() => {});

    // Read the organic results: each is a link wrapping a heading, with the
    // description in a sibling block. Class names change often, so the shape
    // of the markup is matched rather than any particular class.
    // The junk pattern is inlined because this callback runs in the page, with
    // no access to this module's scope.
    return page.evaluate(
      ({ max, junkPattern }) => {
        const junk = new RegExp(junkPattern);
        const seen = new Set();
        const out = [];

        for (const heading of document.querySelectorAll('#search h3, #rso h3')) {
          const anchor = heading.closest('a[href]');
          if (!anchor) continue;

          const href = anchor.href;
          if (!/^https?:\/\//.test(href) || junk.test(href) || seen.has(href)) continue;
          seen.add(href);

          const block = anchor.closest('div[data-hveid], div.g') || anchor.parentElement;
          const title = heading.innerText.trim();
          let snippet = '';
          let published = '';

          if (block) {
            const lines = (block.innerText || '')
              .split('\n')
              .map((line) => line.trim())
              .filter((line) => line && line !== title);

            // Google prefixes the description with a relative date when the
            // page carries one. The separator it uses varies by locale and
            // rendering, so the date is matched on its own shape and stripped.
            const datePattern = /^(\d+\s*(?:minute|hour|day|week|month|year)s?\s+ago)\b/i;
            for (const line of lines) {
              const match = line.match(datePattern);
              if (match) {
                published = match[1];
                // Whatever separator follows — em dash, hyphen, colon — drop it
                // rather than assume a fixed width, which varies by locale.
                snippet = line.slice(match[0].length).replace(/^[\s\p{Pd}:·|–—-]+/u, '').trim();
                break;
              }
            }
            if (!snippet) snippet = lines.sort((a, b) => b.length - a.length)[0] || '';
          }

          // Position is the one engagement signal available: Google ranks on
          // authority, links and click behaviour, none of which has a public
          // API of its own.
          out.push({ title, link: href, snippet, published, rank: out.length + 1 });
          if (out.length >= max) break;
        }

        return out;
      },
      { max: RESULTS_PER_QUERY, junkPattern: JUNK_HOSTS.source }
    );
  });
}

// "3 days ago" is all Google gives; turning it into a date lets these results
// be ranked and displayed beside anything carrying a real timestamp.
function parseRelativeDate(text) {
  if (!text) return null;
  const match = text.match(/(\d+)\s*(minute|hour|day|week|month|year)/i);
  if (!match) return null;

  const amount = Number(match[1]);
  const unitMs = {
    minute: 60_000,
    hour: 3_600_000,
    day: 86_400_000,
    week: 604_800_000,
    month: 2_592_000_000,
    year: 31_536_000_000,
  }[match[2].toLowerCase()];

  return new Date(Date.now() - amount * unitMs).toUTCString();
}

module.exports = { searchWeb, parseRelativeDate };
