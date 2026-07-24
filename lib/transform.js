const MONTH_INDEX = {
  JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5,
  JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11,
};

/** Parse a Quick Stats "Value" field, treating suppression codes like (D)/(NA)/(Z)/(S) as missing. */
function parseValue(raw) {
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  if (!trimmed || trimmed.startsWith('(')) return null;
  const num = Number(trimmed.replace(/,/g, ''));
  return Number.isFinite(num) ? num : null;
}

function monthIndexFromPeriod(period) {
  if (!period) return null;
  const key = String(period).trim().slice(0, 3).toUpperCase();
  return key in MONTH_INDEX ? MONTH_INDEX[key] : null;
}

/** Raw NASS Quick Stats records -> sorted monthly series: [{ year, month, date: 'YYYY-MM', value }]. */
function toMonthlySeries(records) {
  const rows = [];
  for (const rec of records) {
    const month = monthIndexFromPeriod(rec.period || rec.reference_period_desc);
    const year = Number(rec.year);
    const value = parseValue(rec.Value);
    if (month === null || !Number.isFinite(year) || value === null) continue;
    rows.push({ year, month, date: `${year}-${String(month + 1).padStart(2, '0')}`, value });
  }
  // NASS can carry more than one revision for the same period; keep the last one seen.
  const byDate = new Map();
  for (const row of rows) byDate.set(row.date, row);
  return Array.from(byDate.values()).sort((a, b) => (a.date < b.date ? -1 : 1));
}

/** Bucket a monthly series into { year: [12 values-or-null] } for seasonal overlay charts. */
function toYearBuckets(monthlySeries, maxYears) {
  const byYear = {};
  for (const { year, month, value } of monthlySeries) {
    if (!byYear[year]) byYear[year] = new Array(12).fill(null);
    byYear[year][month] = value;
  }
  const years = Object.keys(byYear).map(Number).sort((a, b) => a - b);
  const kept = maxYears ? years.slice(-maxYears) : years;
  const result = {};
  for (const y of kept) result[y] = byYear[y];
  return result;
}

function latestPoint(monthlySeries) {
  return monthlySeries.length ? monthlySeries[monthlySeries.length - 1] : null;
}

/** Year-over-year delta vs. the same month one year earlier. */
function yoyDelta(monthlySeries) {
  const latest = latestPoint(monthlySeries);
  if (!latest) return null;
  const prior = monthlySeries.find((r) => r.year === latest.year - 1 && r.month === latest.month);
  if (!prior || !prior.value) return null;
  return {
    absolute: latest.value - prior.value,
    percent: ((latest.value - prior.value) / prior.value) * 100,
  };
}

/**
 * USDA's public HPAI dashboard CSV export formats "Birds Affected" as
 * Tableau's own compact number format (e.g. "0.0M", "0.2M") — already
 * rounded to one decimal in millions by the export itself, not a raw count.
 * That means monthly totals summed from this column are approximate (each
 * detection is rounded to the nearest 100k before summing), not exact.
 */
function parseBirdsAffected(raw) {
  if (raw == null) return 0;
  const trimmed = String(raw).trim();
  const match = trimmed.match(/^(-?[\d.]+)\s*([KMB]?)$/i);
  if (!match) {
    const n = Number(trimmed.replace(/,/g, ''));
    return Number.isFinite(n) ? n : 0;
  }
  const num = parseFloat(match[1]);
  const mult = { K: 1e3, M: 1e6, B: 1e9 }[match[2].toUpperCase()] || 1;
  return num * mult;
}

/**
 * The CSV export has one row per confirmed detection, with a "Confirmed
 * Diagnosis" date column and a "Birds Affected" column. Bucket into monthly
 * detection counts and summed (approximate) birds affected.
 */
function summarizeHpai(rows) {
  const byMonth = new Map();
  for (const row of rows) {
    const dateStr = row['Confirmed Diagnosis'];
    if (!dateStr) continue;
    const parsedDate = new Date(dateStr);
    if (Number.isNaN(parsedDate.getTime())) continue;
    const key = `${parsedDate.getFullYear()}-${String(parsedDate.getMonth() + 1).padStart(2, '0')}`;
    const bucket = byMonth.get(key) || { date: key, detections: 0, birdsAffected: 0 };
    bucket.detections += 1;
    bucket.birdsAffected += parseBirdsAffected(row['Birds Affected']);
    byMonth.set(key, bucket);
  }
  const monthly = Array.from(byMonth.values()).sort((a, b) => (a.date < b.date ? -1 : 1));
  if (monthly.length === 0) {
    throw new Error('APHIS dashboard CSV had rows but none had a parseable "Confirmed Diagnosis" date');
  }
  return { monthly };
}

module.exports = {
  parseValue,
  monthIndexFromPeriod,
  toMonthlySeries,
  toYearBuckets,
  latestPoint,
  yoyDelta,
  parseBirdsAffected,
  summarizeHpai,
};
