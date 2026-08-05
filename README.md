# USDA Egg Market Dashboard

A public, no-login dashboard with sidebar navigation and charts for:

- **Layer Flock** — table-egg layer flock size (10-year seasonal comparison),
  live from USDA NASS.
- **Production Figures** — monthly U.S. egg production (10-year seasonal
  comparison), live from USDA NASS.
- **Prices** — monthly average egg price received by farmers, live from
  USDA NASS.
- **Cage-Free Layer Inventory** and **Avian Influenza** — USDA doesn't
  publish either as stable, structured data (see below), so these sections
  link out to USDA's own report/dashboard instead of faking a live chart.

It's modeled on the "seasonal comparison" style used by industry chartbooks
like Innovate Animal Ag's Egg Industry Executive Chartbook: prior years are
plotted in gray as context, the current year is highlighted in the accent
color.

All fetching happens server-side (avoids browser CORS issues and keeps the
API key off the client), results are cached in memory, and refreshed every 6
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

Layer flock, production, and price charts are powered by the **USDA NASS
Quick Stats API**, which is free but requires a key:

1. Go to <https://quickstats.nass.usda.gov/api> and enter your email —
   the key is emailed to you within a minute or two, no approval needed.
2. Copy `.env.example` to `.env` and set `NASS_API_KEY=<your key>`.
3. Restart the server (`npm start`).

Until a key is set, those sections show a setup banner and per-chart
"data unavailable" states rather than fabricated numbers — the dashboard
never invents data to fill a chart.

## Known data gaps (not bugs)

Two sections are deliberately link-out cards instead of live charts:

- **Cage-free layer inventory** — confirmed directly against the live NASS
  Quick Stats API: there is no cage-free breakout under either `CHICKENS` or
  `EGGS` (zero matching `short_desc` values, and `prodn_practice_desc` for
  chickens is only `ALL PRODUCTION PRACTICES` / `ORGANIC` / `PRODUCTION
  CONTRACT`). It's only published in the narrative tables of USDA's monthly
  Chickens & Eggs report (PDF), not as queryable data.
- **Avian influenza (HPAI) detections** — USDA APHIS's [HPAI Commercial &
  Backyard Flocks page](https://www.aphis.usda.gov/livestock-poultry-disease/avian/avian-influenza/hpai-detections/commercial-backyard-flocks)
  only offers PDF/PowerPoint. The page embeds a public Tableau dashboard
  that briefly had a working `.csv` export trick for the detail-level data,
  but USDA restructured that dashboard and the trick now returns an
  unrelated small summary table instead — confirmed by checking the live
  dashboard directly, which now only offers a per-sheet "Download Crosstab"
  flow that requires an interactive browser session, not a plain URL fetch.
  Automating that reliably would mean running a full headless browser on
  the server — a meaningfully heavier and still-fragile approach (it could
  break again on the next redesign) — so this was deliberately deprioritized
  in favor of the sources below, which are genuinely stable.

If either of these ever gets a real structured export, swap the
corresponding `buildInfoCard(...)` call in `public/app.js` for a real
`buildSeasonalCard`/`buildTrendCard`, following the pattern already used for
layer flock size.

## In progress: additional data sources

Expanding beyond the original four series, following the same "confirm the
real source before building" approach:

- **Cage-free vs. caged, shell egg inventory by segment** — both are real,
  structured reports on **USDA AMS's Market News API** (a separate system
  from NASS Quick Stats, requiring its own free key via
  [mymarketnews.ams.usda.gov](https://mymarketnews.ams.usda.gov/) — register
  a USDA eAuth account, then reveal the API key from account settings).
  Confirmed report: *"Monthly USDA Cage-Free Shell Egg Report"* (slug
  `PYMCAGEFREE`). Not yet built — blocked on eAuth account access issues.
- **Egg imports/exports** — **USDA ERS's Livestock and Meat International
  Trade Data** publishes this as a plain downloadable ZIP of CSV files, no
  API key or login required — the most stable of any source used here. This
  is what Innovate Animal Ag's own chartbook cites for its trade charts. Not
  yet built — need the exact download URL from
  <https://www.ers.usda.gov/data-products/livestock-and-meat-international-trade-data/>.
- **Flock age** — likely not available as real USDA data; what exists
  (Egg Industry Center's flock-age-composition analysis) is third-party
  modeling, not a USDA-published series. Deprioritized.

## Verifying the NASS series definitions still work

NASS occasionally reshapes its Quick Stats field values. Once you have
`NASS_API_KEY` set, run:

```bash
npm run verify:nass
```

This hits the live API for every configured series (layer flock, egg
production, egg price) and reports which ones still return data.

Note on the layer flock series specifically: the obvious `short_desc`
(`"CHICKENS, LAYERS - INVENTORY"`) only exists at `freq_desc` `ANNUAL` or
`POINT IN TIME` (quarterly snapshots) — never `MONTHLY`. NASS rejects that
combination with a generic `400 bad request - invalid query` rather than an
empty result, which looks identical to a genuinely malformed query. The
correct monthly series is `"CHICKENS, LAYERS - INVENTORY, AVG, MEASURED IN
HEAD"` (USDA's "average number of layers during the month" figure) — that's
what `lib/config.js` actually queries. Worth knowing if you ever add another
NASS series and hit the same error: check `freq_desc`/`agg_level_desc`
options for that exact `short_desc` via `discoverParamValues` before
assuming the query itself is malformed.

## How it works

- `lib/config.js` — NASS series definitions and the refresh interval.
- `lib/nassClient.js` — thin wrapper around the NASS Quick Stats API
  (`api_GET` for data, `get_param_values` for discovery).
- `lib/transform.js` — turns raw records into monthly series, buckets them
  by year for the seasonal charts, and computes latest value + YoY delta.
- `lib/cache.js` — fetches every series in parallel, refreshes every 6
  hours, and degrades gracefully per-series (a missing key or a failed
  query shows an "unavailable" state instead of taking down the page).
- `server.js` — Express app serving the static frontend plus:
  - `GET /api/usda/state` — current cached USDA data
  - `POST /api/usda/refresh` — forces an immediate re-fetch of all sources
  - `GET /health` — basic health check
- `public/` — the dashboard UI (vanilla HTML/CSS/JS, no build step):
  `charts.js` is a small hand-built SVG chart library (seasonal comparison
  line chart, trend line chart, bar chart, ranked horizontal bar chart, stat
  tiles, tooltips, a table-view toggle on every chart for accessibility, and
  an info-card for sections with no live source); `app.js` fetches
  `/api/usda/state` and renders each section.
- `scripts/verify-nass-series.js` — the verification CLI described above.
