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

// NASS Quick Stats "WHAT" parameters for each series. These target the
// long-running National Chickens & Eggs / Agricultural Prices survey items.
// Verified against NASS documentation and public Quick Stats/Chart usage;
// run `node scripts/verify-nass-series.js` once you have a live
// NASS_API_KEY to confirm each still returns data and adjust if NASS has
// changed a label. `cageFreeShare` is marked experimental because NASS's
// cage-free housing breakout is newer and its exact field combination is
// unconfirmed against a live key.
const NASS_SERIES = {
  layerFlock: {
    label: 'Table-Egg Layer Flock Size',
    unit: 'head',
    valueUnit: 'million hens',
    valueScale: 1e6,
    chart: 'seasonal',
    params: {
      source_desc: 'SURVEY',
      sector_desc: 'ANIMALS & PRODUCTS',
      group_desc: 'POULTRY',
      commodity_desc: 'CHICKENS',
      class_desc: 'LAYERS',
      statisticcat_desc: 'INVENTORY',
      unit_desc: 'HEAD',
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
