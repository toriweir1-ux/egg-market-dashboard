require('dotenv').config();

const path = require('path');
const express = require('express');
const cache = require('./lib/cache');
const nass = require('./lib/nassClient');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/usda/state', (req, res) => {
  res.json(cache.getState());
});

// TEMPORARY diagnostic route — remove once NASS_SERIES in lib/config.js is
// confirmed correct. Runs several candidate queries against the live NASS
// API so field-value mismatches can be found without guesswork. Does not
// expose the API key itself.
app.get('/api/usda/debug', async (req, res) => {
  const results = {};
  const thisYear = new Date().getFullYear();

  async function tryQuery(name, params) {
    try {
      const records = await nass.querySeries(params);
      results[name] = { ok: true, count: records.length, sample: records[records.length - 1] || null };
    } catch (err) {
      results[name] = { ok: false, error: err.message };
    }
  }

  async function tryDiscover(name, param, filters) {
    try {
      const values = await nass.discoverParamValues(param, filters);
      results[name] = { ok: true, count: values.length, sample: values.slice(0, 40) };
    } catch (err) {
      results[name] = { ok: false, error: err.message };
    }
  }

  // CONFIRMED: "CHICKENS, LAYERS - INVENTORY" only exists as freq ANNUAL or
  // POINT IN TIME (quarterly snapshots) — never MONTHLY. That's the whole
  // bug. USDA's monthly "average number of layers during the month" figure
  // is very likely a different short_desc — test that one directly.
  const AVG_SD = 'CHICKENS, LAYERS - INVENTORY, AVG, MEASURED IN HEAD';

  await tryDiscover('freq_desc_options_for_avg_series', 'freq_desc', { short_desc: AVG_SD });
  await tryDiscover('agg_level_desc_options_for_avg_series', 'agg_level_desc', { short_desc: AVG_SD });

  await tryQuery('K_avgSeries_monthly_national', {
    short_desc: AVG_SD, freq_desc: 'MONTHLY', agg_level_desc: 'NATIONAL', year__GE: thisYear - 2,
  });

  res.json(results);
});

app.post('/api/usda/refresh', async (req, res) => {
  try {
    await cache.refresh();
    res.json(cache.getState());
  } catch (err) {
    console.error('[server] Manual refresh failed:', err);
    res.status(500).json({ error: 'Refresh failed. Please try again shortly.' });
  }
});

app.get('/health', (req, res) => {
  res.json({ ok: true, lastUpdated: cache.getState().lastUpdated });
});

app.listen(PORT, () => {
  console.log(`USDA Egg Market Dashboard listening on port ${PORT}`);
  cache
    .refresh()
    .then(() => console.log('[server] Initial cache populated.'))
    .catch((err) => console.error('[server] Initial cache refresh failed:', err));
  cache.startAutoRefresh();
});
