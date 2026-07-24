const nass = require('./nassClient');
const aphis = require('./aphisClient');
const transform = require('./transform');
const { NASS_SERIES, REFRESH_INTERVAL_MS, SEASONAL_HISTORY_YEARS, TREND_HISTORY_YEARS } = require('./config');

let state = {
  lastUpdated: null,
  lastAttempt: null,
  nassConfigured: nass.isConfigured(),
  series: {},
  avianInfluenza: { monthly: [], error: 'Not yet fetched' },
};

function emptySeriesResult(def, error) {
  return {
    label: def.label,
    unit: def.unit,
    valueUnit: def.valueUnit,
    valueScale: def.valueScale,
    chart: def.chart,
    monthly: [],
    byYear: null,
    latest: null,
    yoy: null,
    error,
  };
}

async function fetchNassSeries(def) {
  try {
    const records = await nass.querySeries(def.params);
    const monthly = transform.toMonthlySeries(records);
    if (monthly.length === 0) {
      throw new Error('No usable monthly values returned (all suppressed or empty)');
    }
    const byYear = def.chart === 'seasonal' ? transform.toYearBuckets(monthly, SEASONAL_HISTORY_YEARS) : null;
    const trimmedMonthly = def.chart === 'trend' ? monthly.slice(-TREND_HISTORY_YEARS * 12) : monthly;
    return {
      label: def.label,
      unit: def.unit,
      valueUnit: def.valueUnit,
      valueScale: def.valueScale,
      chart: def.chart,
      monthly: trimmedMonthly,
      byYear,
      latest: transform.latestPoint(monthly),
      yoy: transform.yoyDelta(monthly),
      error: null,
    };
  } catch (err) {
    return emptySeriesResult(def, err.message);
  }
}

async function fetchAvianInfluenza() {
  try {
    const rows = await aphis.fetchHpaiDetections();
    const summary = transform.summarizeHpai(rows);
    return { monthly: summary.monthly.slice(-TREND_HISTORY_YEARS * 12), error: null };
  } catch (err) {
    return { monthly: [], error: err.message };
  }
}

async function refresh() {
  const nassConfigured = nass.isConfigured();

  const [seriesEntries, avianInfluenza] = await Promise.all([
    Promise.all(
      Object.entries(NASS_SERIES).map(async ([key, def]) => [
        key,
        nassConfigured ? await fetchNassSeries(def) : emptySeriesResult(def, 'NASS_API_KEY is not configured'),
      ])
    ),
    fetchAvianInfluenza(),
  ]);

  const series = {};
  for (const [key, value] of seriesEntries) series[key] = value;

  state = {
    lastUpdated: new Date().toISOString(),
    lastAttempt: new Date().toISOString(),
    nassConfigured,
    series,
    avianInfluenza,
  };
  return state;
}

function getState() {
  return state;
}

let timer = null;
function startAutoRefresh() {
  if (timer) return;
  timer = setInterval(() => {
    refresh().catch((err) => console.error('[usda cache] Auto-refresh failed:', err));
  }, REFRESH_INTERVAL_MS);
  if (typeof timer.unref === 'function') timer.unref();
}

module.exports = { refresh, getState, startAutoRefresh };
