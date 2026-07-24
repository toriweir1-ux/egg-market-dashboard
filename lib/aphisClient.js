const { APHIS_HPAI_CSV_URL } = require('./config');

/** Minimal CSV parser: handles quoted fields with embedded commas, no embedded newlines. */
function parseCsv(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim().split('\n');
  if (lines.length === 0) return [];

  const splitLine = (line) => {
    const cells = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        cells.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    cells.push(current.trim());
    return cells;
  };

  const headers = splitLine(lines[0]).map((h) => h.replace(/^"|"$/g, ''));
  return lines.slice(1).map((line) => {
    const cells = splitLine(line);
    const row = {};
    headers.forEach((h, i) => (row[h] = (cells[i] || '').replace(/^"|"$/g, '')));
    return row;
  });
}

/**
 * Fetch USDA's public HPAI detections dashboard data. APHIS doesn't publish
 * a documented API for this, but the Tableau Server dashboard embedded on
 * their HPAI Commercial & Backyard Flocks page exposes its underlying data
 * through Tableau's own ".csv" export suffix (confirmed working directly
 * against the live URL — no auth needed since the view is public).
 */
async function fetchHpaiDetections() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await fetch(APHIS_HPAI_CSV_URL, { signal: controller.signal });
    if (!res.ok) throw new Error(`APHIS dashboard CSV export failed: HTTP ${res.status}`);
    const text = await res.text();
    const rows = parseCsv(text);
    if (rows.length === 0) throw new Error('APHIS dashboard CSV export returned no rows');
    return rows;
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = { fetchHpaiDetections, parseCsv };
