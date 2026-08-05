require('dotenv').config();

const path = require('path');
const express = require('express');
const AdmZip = require('adm-zip');
const cache = require('./lib/cache');

const app = express();
const PORT = process.env.PORT || 3000;

// Express 4 does not catch a rejected promise thrown by an async route
// handler — by default Node treats that as fatal and kills the whole
// process (which is what took the live site down: a bug in one diagnostic
// route crashed every visitor's request, not just that one). Log instead of
// crashing, so a bug in one route can never take the rest of the site down.
process.on('unhandledRejection', (err) => {
  console.error('[server] Unhandled rejection (request failed, server stayed up):', err);
});

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

// TEMPORARY diagnostic route — step 1: check file sizes only, without
// decompressing anything. A prior version decompressed and parsed every
// entry immediately and OOM'd Render's free-tier 512MB limit. Reading just
// the ZIP central directory (entry names + declared sizes) costs almost no
// memory, and tells us whether the real content needs a streaming approach.
app.get('/api/usda/debug-ers', async (req, res) => {
  const url = 'https://www.ers.usda.gov/media/5615/zip-file-contains-two-csv-files-one-with-export-data-and-one-with-import-data-files-include-monthly-and-annual-data-for-live-cattle-hogs-sheep-and-goats-as-well-as-beef-and-veal-pork-lamb-and-mutton-chicken-meat-turkey-meat-and-eggs.zip?v=40280';

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    const resp = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!resp.ok) {
      res.status(502).json({ error: `ERS zip download failed: HTTP ${resp.status}` });
      return;
    }
    const buffer = Buffer.from(await resp.arrayBuffer());
    const zip = new AdmZip(buffer);
    const entries = zip.getEntries();

    const entryInfo = entries.map((e) => ({
      name: e.entryName,
      isDirectory: e.isDirectory,
      compressedSizeMB: (e.header.compressedSize / 1e6).toFixed(2),
      uncompressedSizeMB: (e.header.size / 1e6).toFixed(2),
    }));

    res.json({ zipSizeMB: (buffer.length / 1e6).toFixed(2), entries: entryInfo });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
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
