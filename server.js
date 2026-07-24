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

  const SD = 'CHICKENS, LAYERS - INVENTORY';

  // We know: {short_desc: SD} ALONE returns 413 "exceeds limit" (so the
  // short_desc value itself is valid and matches real rows). Adding BOTH
  // freq_desc=MONTHLY and agg_level_desc=NATIONAL together turns that into
  // a 400 "invalid query" — even though that exact freq/agg combo works
  // fine for the EGGS series. So: does this series even have MONTHLY /
  // NATIONAL rows at all? Ask NASS directly instead of guessing further.
  await tryDiscover('agg_level_desc_options_for_this_series', 'agg_level_desc', {
    commodity_desc: 'CHICKENS', class_desc: 'LAYERS', statisticcat_desc: 'INVENTORY',
  });
  await tryDiscover('freq_desc_options_for_this_series', 'freq_desc', {
    commodity_desc: 'CHICKENS', class_desc: 'LAYERS', statisticcat_desc: 'INVENTORY',
  });

  // Isolate freq_desc and agg_level_desc individually against short_desc.
  await tryQuery('H_shortDesc_plus_freq_only', { short_desc: SD, freq_desc: 'MONTHLY' });
  await tryQuery('I_shortDesc_plus_agg_only', { short_desc: SD, agg_level_desc: 'NATIONAL' });

  // Alternate way of asking for the national total, in case agg_level_desc
  // isn't the right filter for this series.
  await tryQuery('J_shortDesc_plus_state_alpha_US', { short_desc: SD, state_alpha: 'US' });

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
