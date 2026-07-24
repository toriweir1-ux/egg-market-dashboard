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
// (Prices, Avian Influenza).
const TREND_HISTORY_YEARS = 8;

// USDA APHIS publishes HPAI detections in commercial & backyard flocks as a
// downloadable CSV linked from:
//   https://www.aphis.usda.gov/livestock-poultry-disease/avian/avian-influenza/hpai-detections/commercial-backyard-flocks
// APHIS has renamed this file's URL before and does not offer a stable API,
// so this default is a best-effort guess. If the Avian Influenza section
// shows "unavailable", open the page above, copy the current "Download
// Data" CSV link, and set APHIS_HPAI_CSV_URL in your .env to override it.
const APHIS_HPAI_CSV_URL =
  process.env.APHIS_HPAI_CSV_URL ||
  'https://www.aphis.usda.gov/sites/default/files/hpai-flock-detections.csv';

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
  cageFreeShare: {
    label: 'Cage-Free Table-Egg Layer Inventory',
    unit: 'head',
    valueUnit: 'million hens',
    valueScale: 1e6,
    chart: 'trend',
    experimental: true,
    params: {
      source_desc: 'SURVEY',
      sector_desc: 'ANIMALS & PRODUCTS',
      group_desc: 'POULTRY',
      commodity_desc: 'CHICKENS',
      class_desc: 'LAYERS',
      prodn_practice_desc: 'CAGE FREE',
      statisticcat_desc: 'INVENTORY',
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
  APHIS_HPAI_CSV_URL,
  NASS_SERIES,
};
