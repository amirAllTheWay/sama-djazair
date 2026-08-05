// Google News relay links resolve only by executing their page's JavaScript,
// and several publishers answer 403 to anything that is not a browser. Driving
// a real one solves both, at the cost of a heavyweight optional dependency —
// so everything here degrades to "unavailable" rather than throwing when
// Playwright is not installed.

const NAV_TIMEOUT_MS = Number(process.env.BROWSER_TIMEOUT_MS || 20_000);
const IDLE_SHUTDOWN_MS = 30_000;

let playwrightModule;
let browserPromise = null;
let idleTimer = null;

function loadPlaywright() {
  if (playwrightModule !== undefined) return playwrightModule;
  try {
    playwrightModule = require('playwright');
  } catch {
    playwrightModule = null;
  }
  return playwrightModule;
}

function isAvailable() {
  return Boolean(loadPlaywright());
}

async function getBrowser() {
  const playwright = loadPlaywright();
  if (!playwright) return null;

  if (!browserPromise) {
    // CHROMIUM_PATH points at a Chrome or Chromium already on the machine,
    // which saves downloading Playwright's own ~300 MB copy.
    const launchOptions = {
      headless: true,
      args: ['--disable-blink-features=AutomationControlled'],
    };
    if (process.env.CHROMIUM_PATH) launchOptions.executablePath = process.env.CHROMIUM_PATH;

    browserPromise = playwright.chromium.launch(launchOptions).catch((err) => {
      browserPromise = null;
      throw new Error(
        `Chromium n'a pas pu démarrer (${err.message.split('\n')[0]}). ` +
          'Lance « npx playwright install chromium », ou renseigne CHROMIUM_PATH dans .env.'
      );
    });
  }
  return browserPromise;
}

// Launching costs a second or two, so the instance is shared across a fetch
// cycle and only torn down once nothing has needed it for a while.
function scheduleIdleShutdown() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => void closeBrowser(), IDLE_SHUTDOWN_MS);
  idleTimer.unref?.();
}

async function closeBrowser() {
  clearTimeout(idleTimer);
  const pending = browserPromise;
  browserPromise = null;
  if (!pending) return;
  try {
    (await pending).close();
  } catch {
    /* already gone */
  }
}

function metaFrom(html, keys) {
  for (const key of keys) {
    const match =
      html.match(
        new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]*content=["']([^"']+)["']`, 'i')
      ) ||
      html.match(
        new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${key}["']`, 'i')
      );
    if (match) return match[1];
  }
  return null;
}

// Opens the link, lets the redirect run, and reads the article page it lands
// on. Returns null when the browser is unavailable so callers can fall back.
// Every browser task wants the same setup — own context, no images or fonts,
// guaranteed teardown — so it lives here once.
async function withPage(task) {
  const browser = await getBrowser();
  if (!browser) return null;

  scheduleIdleShutdown();
  const context = await browser.newContext({
    locale: 'en-US',
    viewport: { width: 1280, height: 900 },
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  });

  try {
    const page = await context.newPage();
    // Images and fonts are never read; skipping them cuts page time a lot.
    await page.route('**/*', (route) =>
      ['image', 'media', 'font'].includes(route.request().resourceType())
        ? route.abort()
        : route.continue()
    );
    return await task(page);
  } finally {
    await context.close().catch(() => {});
  }
}

async function resolveInBrowser(url) {
  return withPage(async (page) => {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS });

    // The relay page redirects via script; wait for the URL to leave Google.
    if (/news\.google\.com/.test(page.url())) {
      await page
        .waitForURL((current) => !/news\.google\.com/.test(current.toString()), {
          timeout: NAV_TIMEOUT_MS,
        })
        .catch(() => {});
    }

    const finalUrl = page.url();
    if (/news\.google\.com/.test(finalUrl)) return null;

    const html = await page.content();
    return {
      url: finalUrl,
      image: metaFrom(html, ['og:image', 'twitter:image', 'twitter:image:src']),
      summary: metaFrom(html, ['og:description', 'twitter:description', 'description']),
      source: metaFrom(html, ['og:site_name']),
    };
  });
}

module.exports = { resolveInBrowser, withPage, closeBrowser, isAvailable };
