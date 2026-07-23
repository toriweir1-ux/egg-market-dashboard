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

function findHeader(headers, candidates) {
  const lower = headers.map((h) => h.toLowerCase());
  for (const candidate of candidates) {
    const idx = lower.findIndex((h) => h.includes(candidate));
    if (idx !== -1) return headers[idx];
  }
  return null;
}

/**
 * APHIS's HPAI CSV column names aren't confirmed against a live download, so
 * this looks for the most likely header names rather than assuming exact
 * ones. Throws a descriptive error (surfaced as an "unavailable" state on
 * the dashboard) if no date column can be found at all.
 */
function summarizeHpai(rows) {
  if (!rows || rows.length === 0) throw new Error('No HPAI rows to summarize');
  const headers = Object.keys(rows[0]);
  const dateHeader = findHeader(headers, [
    'outbreak date', 'confirmed date', 'confirmation date', 'date detected', 'date',
  ]);
  const birdsHeader = findHeader(headers, [
    'birds affected', 'flock size', 'number of birds', 'avian population', 'birds',
  ]);
  const typeHeader = findHeader(headers, ['flock type', 'production type', 'commercial', 'type']);
  if (!dateHeader) {
    throw new Error(`Could not find a date column in the APHIS CSV (columns found: ${headers.join(', ')})`);
  }

  const byMonth = new Map();
  for (const row of rows) {
    const parsedDate = new Date(row[dateHeader]);
    if (Number.isNaN(parsedDate.getTime())) continue;
    const key = `${parsedDate.getFullYear()}-${String(parsedDate.getMonth() + 1).padStart(2, '0')}`;
    const bucket = byMonth.get(key) || { date: key, detections: 0, birdsAffected: 0 };
    bucket.detections += 1;
    if (birdsHeader) {
      const n = Number(String(row[birdsHeader]).replace(/[^0-9.-]/g, ''));
      if (Number.isFinite(n)) bucket.birdsAffected += n;
    }
    byMonth.set(key, bucket);
  }

  const monthly = Array.from(byMonth.values()).sort((a, b) => (a.date < b.date ? -1 : 1));
  if (monthly.length === 0) throw new Error('APHIS CSV had rows but none had a parseable date');
  return { monthly, birdsHeaderFound: Boolean(birdsHeader), typeHeaderFound: Boolean(typeHeader) };
}

module.exports = {
  parseValue,
  monthIndexFromPeriod,
  toMonthlySeries,
  toYearBuckets,
  latestPoint,
  yoyDelta,
  summarizeHpai,
};
