#!/usr/bin/env node
/**
 * Run this once you have a NASS_API_KEY set (in .env or exported) to check
 * that each series in lib/config.js actually returns data, and to help find
 * the right field values for the experimental cage-free series if it
 * doesn't. Read-only — does not modify anything.
 *
 *   node scripts/verify-nass-series.js
 */
require('dotenv').config();

const { NASS_SERIES } = require('../lib/config');
const { querySeries, discoverParamValues, isConfigured } = require('../lib/nassClient');

async function checkSeries(key, def) {
  const thisYear = new Date().getFullYear();
  try {
    const records = await querySeries({ ...def.params, year__GE: thisYear - 3 });
    if (records.length === 0) {
      console.log(`[FAIL] ${key} (${def.label}) — request succeeded but returned 0 rows. Params may need adjusting.`);
      return;
    }
    const sample = records[records.length - 1];
    console.log(`[PASS] ${key} (${def.label}) — ${records.length} rows. Latest sample: ${sample.year}-${sample.period} = ${sample.Value}`);
  } catch (err) {
    console.log(`[FAIL] ${key} (${def.label}) — ${err.message}`);
  }
}

async function suggestCageFreeParams() {
  console.log('\nSearching Quick Stats for short_desc values mentioning "CAGE FREE" under CHICKENS/LAYERS...');
  try {
    const values = await discoverParamValues('short_desc', {
      sector_desc: 'ANIMALS & PRODUCTS',
      group_desc: 'POULTRY',
      commodity_desc: 'CHICKENS',
    });
    const matches = values.filter((v) => /cage.?free/i.test(v));
    if (matches.length === 0) {
      console.log('No CHICKENS short_desc values mention cage-free. Trying prodn_practice_desc instead...');
      const practices = await discoverParamValues('prodn_practice_desc', {
        sector_desc: 'ANIMALS & PRODUCTS',
        group_desc: 'POULTRY',
        commodity_desc: 'CHICKENS',
      });
      console.log('Available prodn_practice_desc values for CHICKENS:', practices.join(', '));
    } else {
      console.log('Matching short_desc values:');
      matches.forEach((m) => console.log(`  - ${m}`));
      console.log('\nUpdate lib/config.js NASS_SERIES.cageFreeShare.params to match one of these.');
    }
  } catch (err) {
    console.log(`Could not run discovery query: ${err.message}`);
  }
}

async function main() {
  if (!isConfigured()) {
    console.error('NASS_API_KEY is not set. Add it to .env or export it, then re-run this script.');
    console.error('Get a free key at https://quickstats.nass.usda.gov/api');
    process.exit(1);
  }

  console.log('Checking each configured NASS series against the live Quick Stats API...\n');
  for (const [key, def] of Object.entries(NASS_SERIES)) {
    // eslint-disable-next-line no-await-in-loop
    await checkSeries(key, def);
  }

  await suggestCageFreeParams();
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
