const path = require('path');
const express = require('express');
const cron = require('node-cron');

const { runFetchCycle } = require('./lib/runFetchCycle');
const { readLatest, readHistory, loadStars } = require('./lib/store');

const PORT = process.env.PORT || 3000;
const CRON_SCHEDULE = process.env.TRENDS_CRON || '0 * * * *'; // top of every hour

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

app.listen(PORT, () => {
  console.log(`[server] listening on port ${PORT}`);

  runFetchCycle().catch((err) => console.error('[trends] initial fetch failed:', err));

  cron.schedule(CRON_SCHEDULE, () => {
    console.log('[trends] running scheduled fetch cycle');
    runFetchCycle().catch((err) => console.error('[trends] scheduled fetch failed:', err));
  });

  console.log(`[trends] hourly fetch scheduled with cron pattern "${CRON_SCHEDULE}"`);
});
