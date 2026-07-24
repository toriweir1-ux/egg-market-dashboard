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

// TEMPORARY diagnostic route — tests whether USDA's public Tableau
// dashboard (behind the APHIS HPAI page) exposes a plain data export URL,
// the way some public Tableau Server views do via a ".csv" suffix. Remove
// once we know one way or the other.
app.get('/api/usda/debug-aphis', async (req, res) => {
  const candidates = [
    'https://publicdashboards.dl.usda.gov/t/MRP_PUB/views/VS_Avian_HPAIConfirmedDetections2022/HPAI2022ConfirmedDetections',
    'https://publicdashboards.dl.usda.gov/t/MRP_PUB/views/VS_Avian_HPAIConfirmedDetections2022/HPAI2022ConfirmedDetections.csv',
    'https://publicdashboards.dl.usda.gov/views/VS_Avian_HPAIConfirmedDetections2022/HPAI2022ConfirmedDetections.csv',
    'https://publicdashboards.dl.usda.gov/t/MRP_PUB/views/VS_Avian_HPAIConfirmedDetections2022/HPAI2022ConfirmedDetections.csv?:showVizHome=no',
  ];

  const results = [];
  for (const url of candidates) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      // eslint-disable-next-line no-await-in-loop
      const resp = await fetch(url, { signal: controller.signal, redirect: 'follow' });
      clearTimeout(timeout);
      // eslint-disable-next-line no-await-in-loop
      const text = await resp.text();
      results.push({
        url,
        status: resp.status,
        contentType: resp.headers.get('content-type'),
        bodyLength: text.length,
        bodyPreview: text.slice(0, 400),
      });
    } catch (err) {
      results.push({ url, error: err.message });
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
