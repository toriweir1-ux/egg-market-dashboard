require('dotenv').config();

const path = require('path');
const readline = require('readline');
const express = require('express');
const unzipper = require('unzipper');
const cache = require('./lib/cache');

function splitCsvLine(line) {
  const cells = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') inQuotes = !inQuotes;
    else if (ch === ',' && !inQuotes) {
      cells.push(current.trim());
      current = '';
    } else current += ch;
  }
  cells.push(current.trim());
  return cells;
}

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

// TEMPORARY diagnostic route — step 2. The exports CSV is 186MB
// uncompressed (confirmed by step 1), far too large to decompress fully
// into memory on a 512MB instance. This streams the decompression
// (unzipper gives a per-entry readable stream; adm-zip could not) and
// reads it line by line via readline, so memory use stays bounded to one
// line + a handful of matched sample rows, never the whole file.
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
    const directory = await unzipper.Open.buffer(buffer);

    const exportsEntry = directory.files.find((f) => /exports/i.test(f.path));
    if (!exportsEntry) {
      res.status(404).json({ error: 'No exports CSV found in zip', entryNames: directory.files.map((f) => f.path) });
      return;
    }

    const rl = readline.createInterface({ input: exportsEntry.stream() });
    let headers = null;
    let commodityColIdx = -1;
    let totalRows = 0;
    let eggRowCount = 0;
    const eggSamples = [];

    for await (const line of rl) {
      if (!line) continue;
      if (!headers) {
        headers = splitCsvLine(line);
        commodityColIdx = headers.findIndex((h) => /commodity/i.test(h));
        continue;
      }
      totalRows += 1;
      if (commodityColIdx === -1) continue;
      const cells = splitCsvLine(line);
      if (cells[commodityColIdx] && /egg/i.test(cells[commodityColIdx])) {
        eggRowCount += 1;
        if (eggSamples.length < 5) {
          eggSamples.push(headers.reduce((obj, h, idx) => ({ ...obj, [h]: cells[idx] }), {}));
        }
      }
    }

    res.json({
      entry: exportsEntry.path,
      headers,
      commodityColumn: commodityColIdx !== -1 ? headers[commodityColIdx] : null,
      totalRows,
      eggRowCount,
      eggSamples,
    });
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
