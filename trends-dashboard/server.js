const path = require('path');
const express = require('express');

const { runFetchCycle } = require('./lib/runFetchCycle');
const { readLatest, loadStars } = require('./lib/store');
const { generateDraft } = require('./lib/generateDraft');
const { identifyPiece } = require('./lib/identifyPiece');

const PORT = process.env.PORT || 3000;
const REFRESH_COOLDOWN_MS = Number(process.env.REFRESH_COOLDOWN_MS || 30_000);

// Changes on every boot, so a page can tell it is talking to a restarted
// server and reload itself rather than sit on stale markup.
const BOOT_ID = String(Date.now());

let lastRefreshAt = 0;
let refreshInFlight = null;

const app = express();
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/version', (req, res) => {
  res.json({ bootId: BOOT_ID });
});

app.get('/api/articles', (req, res) => {
  res.json(readLatest());
});

app.get('/api/stars', (req, res) => {
  res.json(loadStars());
});

app.use(express.json({ limit: '256kb' }));

// Drafts an article from one of the cards. The article is looked up server-side
// from the stored collection rather than taken from the request body, so the
// draft can only ever be built from coverage the board actually found.
app.post('/api/draft', async (req, res) => {
  const { slug, url } = req.body || {};
  if (!slug || !url) {
    return res.status(400).json({ ok: false, message: 'slug et url sont requis.' });
  }

  const article = readLatest().stars?.[slug]?.articles?.find((item) => item.url === url);
  if (!article) {
    return res.status(404).json({ ok: false, message: 'Article introuvable dans la dernière collecte.' });
  }

  try {
    res.json({ ok: true, article: { title: article.title, url: article.url }, ...(await generateDraft(article)) });
  } catch (err) {
    res.status(500).json({ ok: false, message: err.message || String(err) });
  }
});

// Identifies the garment in one photo of one article. Like /api/draft, both
// the article and the photo are resolved server-side from the stored
// collection, so the model can only ever be pointed at coverage the board
// actually found.
app.post('/api/identify', async (req, res) => {
  const { slug, url, image } = req.body || {};
  if (!slug || !url || !image) {
    return res.status(400).json({ ok: false, message: 'slug, url et image sont requis.' });
  }

  const article = readLatest().stars?.[slug]?.articles?.find((item) => item.url === url);
  if (!article) {
    return res.status(404).json({ ok: false, message: 'Article introuvable dans la dernière collecte.' });
  }

  const look = article.looks?.find((entry) => entry.image === image);
  if (!look) {
    return res.status(404).json({ ok: false, message: 'Photo introuvable dans cet article.' });
  }

  try {
    res.json({ ok: true, ...(await identifyPiece({ article, look })) });
  } catch (err) {
    res.status(500).json({ ok: false, message: err.message || String(err) });
  }
});

app.post('/api/refresh', async (req, res) => {
  if (refreshInFlight) {
    return res.status(202).json({ ok: false, pending: true, message: 'Une actualisation est déjà en cours.' });
  }

  const sinceLast = Date.now() - lastRefreshAt;
  if (sinceLast < REFRESH_COOLDOWN_MS) {
    const waitMs = REFRESH_COOLDOWN_MS - sinceLast;
    return res.status(429).json({
      ok: false,
      message: `Merci d'attendre encore ${Math.ceil(waitMs / 1000)}s avant de relancer.`,
    });
  }

  lastRefreshAt = Date.now();
  refreshInFlight = runFetchCycle()
    .catch((err) => {
      console.error('[articles] refresh failed:', err);
      throw err;
    })
    .finally(() => {
      refreshInFlight = null;
    });

  try {
    const results = await refreshInFlight;
    res.json({ ok: true, results, latest: readLatest() });
  } catch (err) {
    res.status(500).json({ ok: false, message: err.message || String(err) });
  }
});

app.listen(PORT, () => {
  console.log(`[server] listening on port ${PORT}`);
  console.log('[articles] no automatic polling — waiting for a manual refresh from the dashboard');
});
