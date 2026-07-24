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

  await tryQuery('layerFlock_multiField', {
    source_desc: 'SURVEY',
    sector_desc: 'ANIMALS & PRODUCTS',
    group_desc: 'POULTRY',
    commodity_desc: 'CHICKENS',
    class_desc: 'LAYERS',
    statisticcat_desc: 'INVENTORY',
    unit_desc: 'HEAD',
    freq_desc: 'MONTHLY',
    agg_level_desc: 'NATIONAL',
    year__GE: thisYear - 1,
  });

  await tryQuery('layerFlock_shortDesc', {
    short_desc: 'CHICKENS, LAYERS - INVENTORY',
    freq_desc: 'MONTHLY',
    agg_level_desc: 'NATIONAL',
    year__GE: thisYear - 1,
  });

  await tryQuery('eggProduction_multiField', {
    source_desc: 'SURVEY',
    sector_desc: 'ANIMALS & PRODUCTS',
    group_desc: 'POULTRY',
    commodity_desc: 'EGGS',
    statisticcat_desc: 'PRODUCTION',
    unit_desc: 'DOZEN',
    freq_desc: 'MONTHLY',
    agg_level_desc: 'NATIONAL',
    year__GE: thisYear - 1,
  });

  await tryQuery('eggPrice_multiField', {
    source_desc: 'SURVEY',
    sector_desc: 'ANIMALS & PRODUCTS',
    group_desc: 'POULTRY',
    commodity_desc: 'EGGS',
    statisticcat_desc: 'PRICE RECEIVED',
    unit_desc: '$ / DOZEN',
    freq_desc: 'MONTHLY',
    agg_level_desc: 'NATIONAL',
    year__GE: thisYear - 1,
  });

  await tryDiscover('valid_classDesc_for_chickens', 'class_desc', { commodity_desc: 'CHICKENS' });
  await tryDiscover('valid_shortDesc_for_chickens_layers', 'short_desc', { commodity_desc: 'CHICKENS', class_desc: 'LAYERS' });
  await tryDiscover('valid_sectorDesc', 'sector_desc', {});

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
