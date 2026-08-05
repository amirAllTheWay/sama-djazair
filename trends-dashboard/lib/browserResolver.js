// Google captchas a browser that looks automated. Three things make the
// difference, and all three are on by default here: a profile that persists
// between runs so cookies build up like a real user's, the machine's actual
// Chrome rather than Playwright's bundled build, and a visible window —
// headless is the single strongest detection signal.

const path = require('path');

const NAV_TIMEOUT_MS = Number(process.env.BROWSER_TIMEOUT_MS || 25_000);
const IDLE_SHUTDOWN_MS = 60_000;
const PROFILE_DIR = path.join(__dirname, '..', 'data', 'browser-profile');

const HEADLESS = process.env.BROWSER_HEADLESS === 'true';

let playwrightModule;
let contextPromise = null;
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

// A persistent context is a browser and a profile at once: the cookies Google
// sets on the first visit are still there on the next run, which is most of
// what separates a returning visitor from a script.
async function getContext() {
  const playwright = loadPlaywright();
  if (!playwright) return null;

  if (!contextPromise) {
    const options = {
      headless: HEADLESS,
      viewport: { width: 1280, height: 900 },
      locale: 'en-US',
      timezoneId: 'America/New_York',
      args: ['--disable-blink-features=AutomationControlled'],
    };

    if (process.env.CHROMIUM_PATH) {
      options.executablePath = process.env.CHROMIUM_PATH;
    } else {
      // Real Chrome carries the branding and components a stock Chromium
      // build lacks, and is markedly less likely to be challenged.
      options.channel = 'chrome';
    }

    contextPromise = playwright.chromium
      .launchPersistentContext(PROFILE_DIR, options)
      .catch(async (err) => {
        // No system Chrome: fall back to whatever Playwright installed.
        if (options.channel) {
          delete options.channel;
          try {
            return await playwright.chromium.launchPersistentContext(PROFILE_DIR, options);
          } catch (retryErr) {
            contextPromise = null;
            throw describeLaunchFailure(retryErr);
          }
        }
        contextPromise = null;
        throw describeLaunchFailure(err);
      });
  }
  return contextPromise;
}

function describeLaunchFailure(err) {
  return new Error(
    `Chromium n'a pas pu démarrer (${err.message.split('\n')[0]}). ` +
      'Lance « npx playwright install chromium », ou renseigne CHROMIUM_PATH dans .env.'
  );
}

function scheduleIdleShutdown() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => void closeBrowser(), IDLE_SHUTDOWN_MS);
  idleTimer.unref?.();
}

async function closeBrowser() {
  clearTimeout(idleTimer);
  const pending = contextPromise;
  contextPromise = null;
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

// The profile is shared, so pages are opened and closed within it rather than
// spinning up a fresh context each time, which would discard
// the cookies that keep Google satisfied.
async function withPage(task) {
  const context = await getContext();
  if (!context) return null;

  scheduleIdleShutdown();
  const page = await context.newPage();
  try {
    // Images and fonts are never read; skipping them cuts page time a lot.
    await page.route('**/*', (route) =>
      ['image', 'media', 'font'].includes(route.request().resourceType())
        ? route.abort()
        : route.continue()
    );
    return await task(page);
  } finally {
    await page.close().catch(() => {});
  }
}

async function resolveInBrowser(url) {
  return withPage(async (page) => {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS });

    const html = await page.content();
    return {
      url: page.url(),
      image: metaFrom(html, ['og:image', 'twitter:image', 'twitter:image:src']),
      summary: metaFrom(html, ['og:description', 'twitter:description', 'description']),
      source: metaFrom(html, ['og:site_name']),
    };
  });
}

module.exports = { resolveInBrowser, withPage, closeBrowser, isAvailable, PROFILE_DIR };
