require('dotenv').config();

const path = require('path');
const express = require('express');
const cache = require('./lib/cache');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/usda/state', (req, res) => {
  res.json(cache.getState());
});

// TEMPORARY diagnostic route — checks which FAS Open Data API (ESR, PSD, or
// GATS) actually covers eggs/egg products, and which auth header FAS
// expects, before committing to a real client. Remove once confirmed.
app.get('/api/usda/debug-fas', async (req, res) => {
  const key = process.env.FAS_API_KEY || '';
  if (!key) {
    res.status(400).json({ error: 'FAS_API_KEY is not set on this server yet.' });
    return;
  }

  const candidates = [
    { name: 'esr_commodities', url: 'https://apps.fas.usda.gov/OpenData/api/esr/commodities' },
    { name: 'psd_commodities', url: 'https://apps.fas.usda.gov/OpenData/api/psd/commodities' },
    { name: 'gats_commodities', url: 'https://apps.fas.usda.gov/OpenData/api/gats/commodities' },
  ];

  const results = {};
  for (const { name, url } of candidates) {
    for (const authStyle of ['header-API_KEY', 'header-Authorization']) {
      const label = `${name}__${authStyle}`;
      try {
        const headers = authStyle === 'header-API_KEY'
          ? { API_KEY: key }
          : { Authorization: `Bearer ${key}` };
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        // eslint-disable-next-line no-await-in-loop
        const resp = await fetch(url, { headers, signal: controller.signal });
        clearTimeout(timeout);
        // eslint-disable-next-line no-await-in-loop
        const text = await resp.text();
        let parsed = null;
        let eggMatches = null;
        try {
          parsed = JSON.parse(text);
          if (Array.isArray(parsed)) {
            eggMatches = parsed.filter((item) => JSON.stringify(item).toLowerCase().includes('egg'));
          }
        } catch (e) {
          // not JSON; leave parsed null
        }
        results[label] = {
          status: resp.status,
          bodyLength: text.length,
          bodyPreview: text.slice(0, 300),
          arrayLength: Array.isArray(parsed) ? parsed.length : null,
          eggMatches,
        };
      } catch (err) {
        results[label] = { error: err.message };
      }
    }
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
