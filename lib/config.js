const NASS_API_KEY = process.env.NASS_API_KEY || '';
const NASS_BASE_URL = 'https://quickstats.nass.usda.gov/api';

// USDA data updates on its own schedule (NASS Chickens & Eggs is monthly,
// APHIS HPAI detections are closer to daily/weekly) so there is no need to
// poll aggressively. Six hours keeps the page fresh without hammering either
// source.
const REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000;

// How many years of monthly history to keep for the seasonal comparison
// charts (Layer Flock, Egg Production).
const SEASONAL_HISTORY_YEARS = 10;

// How many years of monthly history to keep for continuous trend charts
// (Prices).
const TREND_HISTORY_YEARS = 8;

// USDA APHIS's HPAI Commercial & Backyard Flocks page only offers PDF/
// PowerPoint exports. The page embeds a public Tableau Server dashboard
// which briefly had a working ".csv" export trick for the detail-level
// data, but USDA restructured that dashboard and it now returns a small,
// unrelated summary crosstab instead — the trick is no longer reliable.
// Getting the real detail data back would require automating the
// dashboard's own "Download Data" flow with a real browser session, which
// is a meaningfully heavier (and still fragile — it could break on the next
// redesign too) piece of infrastructure than anything else in this app.
// Deliberately not pursuing that: this section links to APHIS's own live
// dashboard instead of faking a chart.
const APHIS_HPAI_DASHBOARD_URL =
  'https://www.aphis.usda.gov/livestock-poultry-disease/avian/avian-influenza/hpai-detections/commercial-backyard-flocks';

// NASS Quick Stats has no cage-free breakout at all (confirmed live: zero
// short_desc matches for "cage free" under CHICKENS or EGGS, and
// prodn_practice_desc for CHICKENS is only ALL PRODUCTION PRACTICES /
// ORGANIC / PRODUCTION CONTRACT). Cage-free housing data is only published
// in USDA's narrative reports, not as structured/queryable data, so that
// dashboard section links out instead of fetching anything.
const NASS_CHICKENS_AND_EGGS_REPORT_URL =
  'https://www.nass.usda.gov/Surveys/Guide_to_NASS_Surveys/Chickens_and_Eggs/index.php';

// NASS Quick Stats "WHAT" parameters for each series, confirmed against the
// live API (see git history on this file / the removed /api/usda/debug
// route for the diagnostic queries that verified these). Two hard-won
// gotchas:
//
// 1. "CHICKENS, LAYERS - INVENTORY" (the obvious short_desc) only exists at
//    freq_desc ANNUAL or POINT IN TIME — never MONTHLY. NASS rejects an
//    unsupported freq/agg_level combination with a generic 400 "bad
//    request - invalid query" rather than an empty result, which looks
//    identical to a genuinely malformed query. The actual monthly series is
//    "CHICKENS, LAYERS - INVENTORY, AVG, MEASURED IN HEAD" (the "average
//    number of layers during the month" figure NASS's monthly Chickens &
//    Eggs report is built from).
// 2. Once you're filtering by an exact short_desc, adding back the
//    commodity/class/statisticcat/unit fields it already encodes is
//    redundant and adds risk, not safety — keep these params minimal.
const NASS_SERIES = {
  layerFlock: {
    label: 'Table-Egg Layer Flock Size',
    unit: 'head',
    valueUnit: 'million hens',
    valueScale: 1e6,
    chart: 'seasonal',
    params: {
      source_desc: 'SURVEY',
      short_desc: 'CHICKENS, LAYERS - INVENTORY, AVG, MEASURED IN HEAD',
      freq_desc: 'MONTHLY',
      agg_level_desc: 'NATIONAL',
    },
  },
  eggProduction: {
    label: 'U.S. Egg Production',
    unit: 'dozen',
    valueUnit: 'million dozen',
    valueScale: 1e6,
    chart: 'seasonal',
    params: {
      source_desc: 'SURVEY',
      sector_desc: 'ANIMALS & PRODUCTS',
      group_desc: 'POULTRY',
      commodity_desc: 'EGGS',
      statisticcat_desc: 'PRODUCTION',
      unit_desc: 'DOZEN',
      freq_desc: 'MONTHLY',
      agg_level_desc: 'NATIONAL',
    },
  },
  eggPrice: {
    label: 'Egg Price Received by Farmers',
    unit: '$ / dozen',
    valueUnit: '$ / dozen',
    valueScale: 1,
    chart: 'trend',
    params: {
      source_desc: 'SURVEY',
      sector_desc: 'ANIMALS & PRODUCTS',
      group_desc: 'POULTRY',
      commodity_desc: 'EGGS',
      statisticcat_desc: 'PRICE RECEIVED',
      unit_desc: '$ / DOZEN',
      freq_desc: 'MONTHLY',
      agg_level_desc: 'NATIONAL',
    },
  },
};

module.exports = {
  NASS_API_KEY,
  NASS_BASE_URL,
  REFRESH_INTERVAL_MS,
  SEASONAL_HISTORY_YEARS,
  TREND_HISTORY_YEARS,
  APHIS_HPAI_DASHBOARD_URL,
  NASS_CHICKENS_AND_EGGS_REPORT_URL,
  NASS_SERIES,
};
