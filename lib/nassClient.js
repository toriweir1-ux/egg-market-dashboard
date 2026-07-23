const https = require('https');
const { NASS_API_KEY, NASS_BASE_URL } = require('./config');

function buildUrl(resource, params) {
  const url = new URL(`${NASS_BASE_URL}/${resource}/`);
  url.searchParams.set('key', NASS_API_KEY);
  url.searchParams.set('format', 'JSON');
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, v);
  }
  return url;
}

function getJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          if (res.statusCode >= 400) {
            reject(new Error(`NASS API ${res.statusCode}: ${data.slice(0, 300)}`));
            return;
          }
          try {
            resolve(JSON.parse(data));
          } catch (err) {
            reject(new Error(`NASS API returned invalid JSON: ${err.message}`));
          }
        });
      })
      .on('error', reject)
      .setTimeout(15000, function onTimeout() {
        this.destroy(new Error('NASS API request timed out'));
      });
  });
}

/** Fetch raw Quick Stats records for a "WHAT/WHERE/WHEN" parameter set. */
async function querySeries(params) {
  if (!NASS_API_KEY) throw new Error('NASS_API_KEY is not configured');
  const json = await getJson(buildUrl('api_GET', params));
  return json.data || [];
}

/**
 * Discover valid values for a Quick Stats parameter (e.g. list every
 * short_desc containing "CAGE FREE"), optionally narrowed by other filter
 * params. Used by scripts/verify-nass-series.js, not the live dashboard.
 */
async function discoverParamValues(param, filterParams = {}) {
  if (!NASS_API_KEY) throw new Error('NASS_API_KEY is not configured');
  const json = await getJson(buildUrl('get_param_values', { ...filterParams, param }));
  return json[param] || [];
}

module.exports = { querySeries, discoverParamValues, isConfigured: () => Boolean(NASS_API_KEY) };
