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

  // Layer flock series is now confirmed and fixed in lib/config.js. Last
  // remaining question: does NASS Quick Stats publish cage-free data at
  // all? Search broadly (not filtered to class_desc=LAYERS, in case it's
  // filed under a different class) rather than guessing a specific combo.
  try {
    const allChickenShortDesc = await nass.discoverParamValues('short_desc', { commodity_desc: 'CHICKENS' });
    const cageFreeMatches = allChickenShortDesc.filter((v) => /cage.?free/i.test(v));
    results.cageFree_shortDesc_matches = { count: cageFreeMatches.length, matches: cageFreeMatches };
  } catch (err) {
    results.cageFree_shortDesc_matches_error = err.message;
  }

  try {
    const practices = await nass.discoverParamValues('prodn_practice_desc', { commodity_desc: 'CHICKENS' });
    results.cageFree_prodn_practice_options = practices;
  } catch (err) {
    results.cageFree_prodn_practice_options_error = err.message;
  }

  try {
    const eggShortDesc = await nass.discoverParamValues('short_desc', { commodity_desc: 'EGGS' });
    const cageFreeEggMatches = eggShortDesc.filter((v) => /cage.?free/i.test(v));
    results.cageFree_eggs_shortDesc_matches = { count: cageFreeEggMatches.length, matches: cageFreeEggMatches };
  } catch (err) {
    results.cageFree_eggs_shortDesc_matches_error = err.message;
  }

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
