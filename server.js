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
