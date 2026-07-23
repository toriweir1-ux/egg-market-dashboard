# USDA Egg Market Dashboard

A public, no-login dashboard with sidebar navigation and charts for:

- **Layer Flock** — table-egg layer flock size (10-year seasonal comparison)
  and cage-free layer inventory.
- **Production Figures** — monthly U.S. egg production (10-year seasonal
  comparison).
- **Prices** — monthly average egg price received by farmers.
- **Avian Influenza** — HPAI detections and estimated birds affected per
  month in commercial & backyard flocks.

It's modeled on the "seasonal comparison" style used by industry chartbooks
like Innovate Animal Ag's Egg Industry Executive Chartbook: prior years are
plotted in gray as context, the current year is highlighted in the accent
color.

All fetching happens server-side (avoids browser CORS issues and keeps API
keys off the client), results are cached in memory, and refreshed every 6
hours automatically. The frontend is a static page that polls the backend
and never calls USDA directly.

## Running locally

```bash
npm install
cp .env.example .env   # then fill in NASS_API_KEY (see below)
npm start
```

The dashboard is served at `http://localhost:3000` (or `$PORT` if set).

## Deploying

Deploy anywhere that can run a long-lived Node process (Render, Railway,
Fly.io, an internal VM, etc.) — it's a single stable, bookmarkable page with
no login. Set `PORT` if your host requires it, and set `NASS_API_KEY` (see
below) as an environment variable on the host.

## Setting up the required API key (free)

Layer flock, production, price, and cage-free charts are powered by the
**USDA NASS Quick Stats API**, which is free but requires a key:

1. Go to <https://quickstats.nass.usda.gov/api> and enter your email —
   the key is emailed to you within a minute or two, no approval needed.
2. Copy `.env.example` to `.env` and set `NASS_API_KEY=<your key>`.
3. Restart the server (`npm start`).

Until a key is set, those sections show a setup banner and per-chart
"data unavailable" states rather than fabricated numbers — the dashboard
never invents data to fill a chart.

The **Avian Influenza** section reads a CSV published by **USDA APHIS**
(no key required) and needs no setup, but APHIS has changed that file's URL
before. If that section shows "data unavailable," open the
[APHIS HPAI detections page](https://www.aphis.usda.gov/livestock-poultry-disease/avian/avian-influenza/hpai-detections/commercial-backyard-flocks),
copy the current "Download Data" CSV link, and set `APHIS_HPAI_CSV_URL` in
your `.env` to override the default.

## Verifying/correcting the NASS series definitions

The exact NASS Quick Stats field values (`short_desc`, `class_desc`,
`prodn_practice_desc`, etc.) for layer flock size, egg production, and price
received are well-established, long-running series and should work as
configured. The **cage-free layer inventory** series is marked
`experimental` in `lib/config.js` because NASS's cage-free housing breakout
is newer and its exact field combination hasn't been confirmed against a
live key. Once you have `NASS_API_KEY` set, run:

```bash
npm run verify:nass
```

This hits the live API for every configured series, reports which ones
return data, and — if the cage-free series comes back empty — searches
Quick Stats' own parameter list for the correct `short_desc` or
`prodn_practice_desc` value so you can update `lib/config.js`.

## How it works

- `lib/config.js` — NASS series definitions (the "what" of each Quick Stats
  query), refresh interval, and the APHIS CSV URL.
- `lib/nassClient.js` — thin wrapper around the NASS Quick Stats API
  (`api_GET` for data, `get_param_values` for discovery).
- `lib/aphisClient.js` — fetches and parses the APHIS HPAI CSV (no external
  dependency, minimal quoted-CSV parser).
- `lib/transform.js` — turns raw records into monthly series, buckets them
  by year for the seasonal charts, computes latest value + YoY delta, and
  summarizes HPAI rows into monthly detections/birds-affected counts
  (column names are detected by best-effort matching since APHIS doesn't
  publish a fixed schema).
- `lib/cache.js` — fetches everything in parallel, refreshes every 6 hours,
  and degrades gracefully per-series (a missing key or a failed source
  shows an "unavailable" state instead of taking down the page).
- `server.js` — Express app serving the static frontend plus:
  - `GET /api/usda/state` — current cached USDA data
  - `POST /api/usda/refresh` — forces an immediate re-fetch of all sources
  - `GET /health` — basic health check
- `public/` — the dashboard UI (vanilla HTML/CSS/JS, no build step):
  `charts.js` is a small hand-built SVG chart library (seasonal comparison
  line chart, trend line chart, bar chart, stat tiles, tooltips, and a
  table-view toggle on every chart for accessibility); `app.js` fetches
  `/api/usda/state` and renders each section.
- `scripts/verify-nass-series.js` — the discovery CLI described above.
