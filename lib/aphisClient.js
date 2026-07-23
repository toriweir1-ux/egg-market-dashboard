const https = require('https');
const { APHIS_HPAI_CSV_URL } = require('./config');

function fetchText(url, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirectsLeft > 0) {
          res.resume();
          fetchText(new URL(res.headers.location, url), redirectsLeft - 1).then(resolve, reject);
          return;
        }
        if (res.statusCode >= 400) {
          reject(new Error(`APHIS CSV request failed: HTTP ${res.statusCode}`));
          return;
        }
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => resolve(data));
      })
      .on('error', reject)
      .setTimeout(15000, function onTimeout() {
        this.destroy(new Error('APHIS CSV request timed out'));
      });
  });
}

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

/** Fetch and parse the APHIS HPAI commercial/backyard flock detections CSV. */
async function fetchHpaiDetections() {
  const csv = await fetchText(APHIS_HPAI_CSV_URL);
  const rows = parseCsv(csv);
  if (rows.length === 0) throw new Error('APHIS CSV returned no rows');
  return rows;
}

module.exports = { fetchHpaiDetections, parseCsv };
