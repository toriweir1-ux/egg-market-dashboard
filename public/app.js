(function () {
  const {
    buildCard, buildInfoCard, buildTable, buildEmptyState,
    renderSeasonalChart, renderTrendChart, renderBarChart, renderStatTile, MONTHS,
  } = window.UsdaCharts;

  const NASS_KEY_SIGNUP_URL = 'https://quickstats.nass.usda.gov/api';
  const NASS_SOURCE_URL = 'https://quickstats.nass.usda.gov/';
  const NASS_SOURCE_LABEL = 'USDA NASS Quick Stats';
  const APHIS_DASHBOARD_URL = 'https://www.aphis.usda.gov/livestock-poultry-disease/avian/avian-influenza/hpai-detections/commercial-backyard-flocks';
  const APHIS_SOURCE_LABEL = 'USDA APHIS — HPAI Commercial & Backyard Flock Detections';
  const NASS_CHICKENS_AND_EGGS_REPORT_URL = 'https://www.nass.usda.gov/Surveys/Guide_to_NASS_Surveys/Chickens_and_Eggs/index.php';

  let state = null;

  // ---- formatting helpers -----------------------------------------------------
  function formatCompact(value, unitSuffix) {
    if (value == null || Number.isNaN(value)) return '—';
    const abs = Math.abs(value);
    let out;
    if (abs >= 1e6) out = (value / 1e6).toFixed(1) + 'M';
    else if (abs >= 1e3) out = (value / 1e3).toFixed(1) + 'K';
    else out = value.toFixed(0);
    return unitSuffix ? `${out} ${unitSuffix}` : out;
  }
  function formatCurrency(value) {
    if (value == null || Number.isNaN(value)) return '—';
    return `$${value.toFixed(2)}`;
  }
  function formatMonthLabel(dateStr) {
    const [y, m] = dateStr.split('-').map(Number);
    return `${MONTHS[m - 1]} ${y}`;
  }
  function formatShortMonth(dateStr) {
    const [y, m] = dateStr.split('-').map(Number);
    return `${MONTHS[m - 1]} '${String(y).slice(2)}`;
  }
  function yoyText(yoy) {
    if (!yoy) return null;
    const sign = yoy.percent >= 0 ? '+' : '';
    return `${sign}${yoy.percent.toFixed(1)}% YoY`;
  }
  function yoyDirection(yoy) {
    if (!yoy) return null;
    return yoy.percent >= 0 ? 'up' : 'down';
  }

  // ---- data loading -------------------------------------------------------------
  async function loadState() {
    try {
      const res = await fetch('/api/usda/state');
      state = await res.json();
      render();
    } catch (err) {
      console.error('[usda] Failed to load state:', err);
    }
  }

  async function refresh() {
    const btn = document.getElementById('usda-refresh-btn');
    btn.disabled = true;
    try {
      const res = await fetch('/api/usda/refresh', { method: 'POST' });
      state = await res.json();
      render();
    } catch (err) {
      console.error('[usda] Refresh failed:', err);
    } finally {
      btn.disabled = false;
    }
  }

  function updateLastUpdated() {
    const el = document.getElementById('usda-last-updated');
    if (!state || !state.lastUpdated) {
      el.textContent = 'Not yet updated';
      return;
    }
    el.textContent = `Updated ${new Date(state.lastUpdated).toLocaleString()}`;
  }

  function renderConfigBanner() {
    const banner = document.getElementById('usda-config-banner');
    banner.innerHTML = '';
    if (!state) {
      banner.hidden = true;
      return;
    }
    const items = [];

    if (!state.nassConfigured) {
      const p = document.createElement('p');
      p.style.margin = '4px 0';
      p.append('Layer flock, production, and price charts need a free NASS Quick Stats API key. ');
      const a = document.createElement('a');
      a.href = NASS_KEY_SIGNUP_URL;
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = 'Get a key';
      p.append(a, ', then set ');
      const code = document.createElement('code');
      code.textContent = 'NASS_API_KEY';
      p.append(code, ' in your environment and restart the server.');
      items.push(p);
    }

    if (items.length === 0) {
      banner.hidden = true;
      return;
    }
    items.forEach((p) => banner.appendChild(p));
    banner.hidden = false;
  }

  // ---- card builders --------------------------------------------------------------
  function buildSeasonalCard({ title, subtitle, series, formatValue, valueColumnLabel }) {
    const { card, chartMount, tableMount } = buildCard({
      title,
      subtitle,
      sourceLabel: series && !series.error ? NASS_SOURCE_LABEL : null,
      sourceHref: NASS_SOURCE_URL,
    });
    if (!series || series.error || !series.byYear) {
      chartMount.appendChild(buildEmptyState({
        title: 'Data unavailable',
        message: (series && series.error) || 'No data returned yet.',
        actionLabel: !state.nassConfigured ? 'Get a free NASS API key' : null,
        actionHref: !state.nassConfigured ? NASS_KEY_SIGNUP_URL : null,
      }));
      return card;
    }
    const years = Object.keys(series.byYear).map(Number).sort((a, b) => a - b);
    const currentYear = years[years.length - 1];
    renderSeasonalChart(chartMount, { byYear: series.byYear, currentYear, formatValue, ariaLabel: title });
    const headers = ['Year', ...MONTHS];
    const rows = years.map((y) => [String(y), ...series.byYear[y].map((v) => (v == null ? '—' : formatValue(v)))]);
    buildTable(tableMount, headers, rows);
    return card;
  }

  function buildTrendCard({ title, subtitle, series, formatValue, valueColumnLabel }) {
    const { card, chartMount, tableMount } = buildCard({
      title,
      subtitle,
      sourceLabel: series && !series.error ? NASS_SOURCE_LABEL : null,
      sourceHref: NASS_SOURCE_URL,
    });
    if (!series || series.error || !series.monthly || series.monthly.length === 0) {
      chartMount.appendChild(buildEmptyState({
        title: 'Data unavailable',
        message: (series && series.error) || 'No data returned yet.',
        actionLabel: !state.nassConfigured ? 'Get a free NASS API key' : null,
        actionHref: !state.nassConfigured ? NASS_KEY_SIGNUP_URL : null,
      }));
      return card;
    }
    renderTrendChart(chartMount, { points: series.monthly, formatValue, formatDate: formatShortMonth, ariaLabel: title });
    const headers = ['Month', valueColumnLabel || 'Value'];
    const rows = series.monthly.map((p) => [formatMonthLabel(p.date), p.value == null ? '—' : formatValue(p.value)]);
    buildTable(tableMount, headers, rows);
    return card;
  }

  function buildBarCard({ title, subtitle, points, formatValue, valueColumnLabel }) {
    const { card, chartMount, tableMount } = buildCard({
      title, subtitle, sourceLabel: APHIS_SOURCE_LABEL, sourceHref: APHIS_DASHBOARD_URL,
    });
    if (!points || points.length === 0) {
      chartMount.appendChild(buildEmptyState({
        title: 'Data unavailable',
        message: 'No data returned yet.',
        actionLabel: "View APHIS's HPAI dashboard",
        actionHref: APHIS_DASHBOARD_URL,
      }));
      return card;
    }
    renderBarChart(chartMount, { points, formatValue, formatDate: formatShortMonth, colorClass: 'bar-accent', ariaLabel: title });
    const headers = ['Month', valueColumnLabel || 'Value'];
    const rows = points.map((p) => [formatMonthLabel(p.date), p.value == null ? '—' : formatValue(p.value)]);
    buildTable(tableMount, headers, rows);
    return card;
  }

  // ---- section renderers --------------------------------------------------------
  function renderOverview() {
    const container = document.getElementById('overview-stats');
    container.innerHTML = '';
    if (!state) return;
    const s = state.series;

    const layer = s.layerFlock;
    renderStatTile(container, {
      label: 'Table-Egg Layer Flock',
      value: layer && layer.latest ? formatCompact(layer.latest.value, 'hens') : null,
      deltaText: layer && yoyText(layer.yoy),
      deltaDirection: layer && yoyDirection(layer.yoy),
      unavailable: !layer || !!layer.error || !layer.latest,
    });

    const prod = s.eggProduction;
    renderStatTile(container, {
      label: 'Monthly Egg Production',
      value: prod && prod.latest ? formatCompact(prod.latest.value, 'dozen') : null,
      deltaText: prod && yoyText(prod.yoy),
      deltaDirection: prod && yoyDirection(prod.yoy),
      unavailable: !prod || !!prod.error || !prod.latest,
    });

    const price = s.eggPrice;
    renderStatTile(container, {
      label: 'Price Received by Farmers',
      value: price && price.latest ? `${formatCurrency(price.latest.value)} / dozen` : null,
      deltaText: price && yoyText(price.yoy),
      deltaDirection: price && yoyDirection(price.yoy),
      unavailable: !price || !!price.error || !price.latest,
    });

    const avian = state.avianInfluenza;
    const last12 = avian && !avian.error ? avian.monthly.slice(-12) : [];
    const birdsAffected12mo = last12.reduce((sum, m) => sum + (m.birdsAffected || 0), 0);
    renderStatTile(container, {
      label: 'Birds Affected by HPAI (trailing 12 mo., approx.)',
      value: last12.length ? formatCompact(birdsAffected12mo, 'birds') : null,
      unavailable: !avian || !!avian.error || last12.length === 0,
    });
  }

  function renderLayerFlockSection() {
    const container = document.getElementById('layer-flock-charts');
    container.innerHTML = '';
    container.appendChild(buildSeasonalCard({
      title: 'Table-Egg Layer Flock Size',
      subtitle: 'Historical comparison of table-egg layers on hand, by month',
      series: state.series.layerFlock,
      formatValue: (v) => formatCompact(v),
      valueColumnLabel: 'Layers on hand',
    }));

    container.appendChild(buildInfoCard({
      title: 'Cage-Free Table-Egg Layer Inventory',
      subtitle: 'Cage-free housing composition',
      message: "USDA NASS Quick Stats does not publish a cage-free breakout — it's only reported in the narrative tables of the monthly Chickens & Eggs report, not as structured/queryable data.",
      actionLabel: 'View the Chickens & Eggs report',
      actionHref: NASS_CHICKENS_AND_EGGS_REPORT_URL,
    }));
  }

  function renderProductionSection() {
    const container = document.getElementById('production-charts');
    container.innerHTML = '';
    container.appendChild(buildSeasonalCard({
      title: 'U.S. Egg Production',
      subtitle: 'Historical comparison of monthly egg production',
      series: state.series.eggProduction,
      formatValue: (v) => formatCompact(v),
      valueColumnLabel: 'Dozens produced',
    }));
  }

  function renderPricesSection() {
    const container = document.getElementById('prices-charts');
    container.innerHTML = '';
    container.appendChild(buildTrendCard({
      title: 'Egg Price Received by Farmers',
      subtitle: 'Monthly average price received, dollars per dozen',
      series: state.series.eggPrice,
      formatValue: formatCurrency,
      valueColumnLabel: 'Price ($/dozen)',
    }));
  }

  function renderAvianInfluenzaSection() {
    const container = document.getElementById('avian-influenza-charts');
    container.innerHTML = '';
    const avian = state.avianInfluenza;
    const monthly = avian && !avian.error ? avian.monthly : [];

    container.appendChild(buildBarCard({
      title: 'HPAI Detections in Commercial & Backyard Flocks',
      subtitle: 'Confirmed detections per month',
      points: monthly.map((m) => ({ date: m.date, value: m.detections })),
      formatValue: (v) => formatCompact(v),
      valueColumnLabel: 'Detections',
    }));

    container.appendChild(buildBarCard({
      title: 'Birds Affected by HPAI',
      subtitle: 'Estimated birds affected per month (approximate — USDA’s export rounds each detection to the nearest 100K)',
      points: monthly.map((m) => ({ date: m.date, value: m.birdsAffected })),
      formatValue: (v) => formatCompact(v, 'birds'),
      valueColumnLabel: 'Birds affected (approx.)',
    }));
  }

  function render() {
    updateLastUpdated();
    renderConfigBanner();
    renderOverview();
    renderLayerFlockSection();
    renderProductionSection();
    renderPricesSection();
    renderAvianInfluenzaSection();
  }

  function setupNav() {
    const buttons = Array.from(document.querySelectorAll('.nav-item'));
    const sections = Array.from(document.querySelectorAll('.usda-section'));
    buttons.forEach((btn) => {
      btn.addEventListener('click', () => {
        buttons.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        const target = btn.dataset.section;
        sections.forEach((s) => {
          s.hidden = s.dataset.section !== target;
        });
      });
    });
    if (buttons[0]) buttons[0].classList.add('active');
  }

  document.addEventListener('DOMContentLoaded', () => {
    setupNav();
    document.getElementById('usda-refresh-btn').addEventListener('click', refresh);
    loadState();
  });
})();
