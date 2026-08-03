const path = require('path');
const express = require('express');

const { runFetchCycle } = require('./lib/runFetchCycle');
const { readLatest, readHistory, loadStars } = require('./lib/store');

const PORT = process.env.PORT || 3000;
const REFRESH_COOLDOWN_MS = Number(process.env.REFRESH_COOLDOWN_MS || 30_000);

let lastRefreshAt = 0;
let refreshInFlight = null;

const app = express();
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/trends', (req, res) => {
  res.json(readLatest());
});

app.get('/api/trends/:slug/history', (req, res) => {
  res.json(readHistory(req.params.slug));
});

app.get('/api/stars', (req, res) => {
  res.json(loadStars());
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
      message: `Merci d'attendre encore ${Math.ceil(waitMs / 1000)}s avant de relancer (évite de se faire bloquer par Google Trends).`,
    });
  }

  lastRefreshAt = Date.now();
  refreshInFlight = runFetchCycle()
    .catch((err) => {
      console.error('[trends] refresh failed:', err);
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
  console.log('[trends] no automatic polling — waiting for a manual refresh from the dashboard');
});
