/* Small hand-built SVG chart library for the USDA dashboard. No dependencies,
 * no build step — plain DOM/SVG, following the house dataviz rules:
 * fixed mark specs, a legend for 2+ series, direct end-labels used sparingly,
 * a hover crosshair + tooltip on every line/bar chart, and a table-view
 * toggle so every value is reachable without the chart at all. */
(function (global) {
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function el(tag, attrs, ns) {
    const node = ns ? document.createElementNS(ns, tag) : document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v === undefined || v === null) continue;
        node.setAttribute(k, v);
      }
    }
    return node;
  }
  function svgEl(tag, attrs) {
    return el(tag, attrs, SVG_NS);
  }

  function niceTicks(min, max, count) {
    if (min === max) {
      min -= 1;
      max += 1;
    }
    const range = max - min;
    const rawStep = range / count;
    const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
    const residual = rawStep / mag;
    let step;
    if (residual > 5) step = 10 * mag;
    else if (residual > 2) step = 5 * mag;
    else if (residual > 1) step = 2 * mag;
    else step = mag;
    const niceMin = Math.floor(min / step) * step;
    const ticks = [];
    for (let v = niceMin; v <= max + step * 0.001; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
    return ticks;
  }

  // ---- shared tooltip singleton -------------------------------------------------
  let tooltipEl = null;
  function getTooltip() {
    if (!tooltipEl) {
      tooltipEl = document.createElement('div');
      tooltipEl.className = 'chart-tooltip';
      tooltipEl.hidden = true;
      document.body.appendChild(tooltipEl);
    }
    return tooltipEl;
  }
  function showTooltip(clientX, clientY, title, rows) {
    const tip = getTooltip();
    tip.innerHTML = '';
    const heading = document.createElement('div');
    heading.className = 'chart-tooltip-title';
    heading.textContent = title;
    tip.appendChild(heading);
    rows.forEach(({ label, value, colorClass }) => {
      const row = document.createElement('div');
      row.className = 'chart-tooltip-row';
      const key = document.createElement('span');
      key.className = 'chart-tooltip-key ' + (colorClass || '');
      const val = document.createElement('span');
      val.className = 'chart-tooltip-value';
      val.textContent = value;
      const name = document.createElement('span');
      name.className = 'chart-tooltip-label';
      name.textContent = label;
      row.append(key, val, name);
      tip.appendChild(row);
    });
    tip.hidden = false;
    const pad = 14;
    let left = clientX + pad;
    let top = clientY + pad;
    const rect = tip.getBoundingClientRect();
    if (left + rect.width > window.innerWidth - 8) left = clientX - rect.width - pad;
    if (top + rect.height > window.innerHeight - 8) top = clientY - rect.height - pad;
    tip.style.left = `${Math.max(8, left)}px`;
    tip.style.top = `${Math.max(8, top)}px`;
  }
  function hideTooltip() {
    if (tooltipEl) tooltipEl.hidden = true;
  }

  // ---- card scaffold (title, mount, table toggle, caption) -----------------------
  function buildCard({ title, subtitle, sourceLabel, sourceHref }) {
    const card = document.createElement('figure');
    card.className = 'chart-card';

    const head = document.createElement('div');
    head.className = 'chart-card-head';
    const h3 = document.createElement('h3');
    h3.textContent = title;
    head.appendChild(h3);
    if (subtitle) {
      const sub = document.createElement('p');
      sub.className = 'chart-subtitle';
      sub.textContent = subtitle;
      head.appendChild(sub);
    }
    card.appendChild(head);

    const toggleRow = document.createElement('div');
    toggleRow.className = 'chart-toggle-row';
    const toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.className = 'table-toggle-btn';
    toggleBtn.textContent = 'View data table';
    toggleRow.appendChild(toggleBtn);
    card.appendChild(toggleRow);

    const chartMount = document.createElement('div');
    chartMount.className = 'chart-mount';
    const tableMount = document.createElement('div');
    tableMount.className = 'chart-table-mount';
    tableMount.hidden = true;
    card.append(chartMount, tableMount);

    toggleBtn.addEventListener('click', () => {
      const showingTable = !tableMount.hidden;
      tableMount.hidden = showingTable;
      chartMount.hidden = !showingTable;
      toggleBtn.textContent = showingTable ? 'View data table' : 'View chart';
    });

    if (sourceLabel) {
      const caption = document.createElement('figcaption');
      caption.className = 'chart-caption';
      if (sourceHref) {
        caption.append(document.createTextNode('Source: '));
        const a = document.createElement('a');
        a.href = sourceHref;
        a.target = '_blank';
        a.rel = 'noopener';
        a.textContent = sourceLabel;
        caption.appendChild(a);
      } else {
        caption.textContent = `Source: ${sourceLabel}`;
      }
      card.appendChild(caption);
    }

    return { card, chartMount, tableMount };
  }

  function buildTable(tableMount, headers, rows) {
    tableMount.innerHTML = '';
    const table = document.createElement('table');
    table.className = 'chart-data-table';
    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    headers.forEach((h) => {
      const th = document.createElement('th');
      th.textContent = h;
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    const tbody = document.createElement('tbody');
    rows.forEach((cells) => {
      const tr = document.createElement('tr');
      cells.forEach((c) => {
        const td = document.createElement('td');
        td.textContent = c;
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.append(thead, tbody);
    tableMount.appendChild(table);
  }

  function buildEmptyState({ title, message, actionLabel, actionHref }) {
    const wrap = document.createElement('div');
    wrap.className = 'empty-state';
    const h = document.createElement('p');
    h.className = 'empty-state-title';
    h.textContent = title;
    const m = document.createElement('p');
    m.className = 'empty-state-message';
    m.textContent = message;
    wrap.append(h, m);
    if (actionLabel && actionHref) {
      const a = document.createElement('a');
      a.href = actionHref;
      a.target = '_blank';
      a.rel = 'noopener';
      a.className = 'empty-state-action';
      a.textContent = actionLabel;
      wrap.appendChild(a);
    }
    return wrap;
  }

  function legendItem(colorClass, label) {
    const item = document.createElement('span');
    item.className = 'legend-item';
    const swatch = document.createElement('span');
    swatch.className = 'legend-swatch ' + colorClass;
    const text = document.createElement('span');
    text.textContent = label;
    item.append(swatch, text);
    return item;
  }

  // ---- seasonal (year-over-year emphasis) line chart -----------------------------
  function renderSeasonalChart(mount, { byYear, currentYear, formatValue, ariaLabel }) {
    mount.innerHTML = '';
    const years = Object.keys(byYear).map(Number).sort((a, b) => a - b);
    const contextYears = years.filter((y) => y !== currentYear);

    let yMin = Infinity;
    let yMax = -Infinity;
    years.forEach((y) => byYear[y].forEach((v) => {
      if (v != null) {
        if (v < yMin) yMin = v;
        if (v > yMax) yMax = v;
      }
    }));
    if (!Number.isFinite(yMin)) {
      mount.appendChild(buildEmptyState({ title: 'No data points', message: 'This series returned no usable values.' }));
      return;
    }
    const pad = (yMax - yMin) * 0.1 || Math.abs(yMax) * 0.1 || 1;
    yMin -= pad;
    yMax += pad;

    const width = 640;
    const height = 300;
    const margin = { top: 16, right: 44, bottom: 28, left: 60 };
    const innerW = width - margin.left - margin.right;
    const innerH = height - margin.top - margin.bottom;
    const xFor = (i) => margin.left + (i / 11) * innerW;
    const yFor = (v) => margin.top + innerH - ((v - yMin) / (yMax - yMin)) * innerH;

    const svg = svgEl('svg', {
      viewBox: `0 0 ${width} ${height}`,
      width: '100%',
      height: 'auto',
      role: 'img',
      'aria-label': ariaLabel || 'Seasonal comparison chart',
      class: 'usda-chart',
    });

    const yTicks = niceTicks(yMin, yMax, 5);
    yTicks.forEach((t) => {
      const ty = yFor(t);
      svg.appendChild(svgEl('line', { x1: margin.left, x2: width - margin.right, y1: ty, y2: ty, class: 'grid-line' }));
      const label = svgEl('text', { x: margin.left - 8, y: ty + 4, class: 'axis-label', 'text-anchor': 'end' });
      label.textContent = formatValue(t);
      svg.appendChild(label);
    });
    MONTHS.forEach((m, i) => {
      const label = svgEl('text', { x: xFor(i), y: height - margin.bottom + 18, class: 'axis-label', 'text-anchor': 'middle' });
      label.textContent = m;
      svg.appendChild(label);
    });

    function pathFor(values) {
      let d = '';
      values.forEach((v, i) => {
        if (v == null) return;
        d += (d ? 'L' : 'M') + xFor(i).toFixed(2) + ' ' + yFor(v).toFixed(2) + ' ';
      });
      return d.trim();
    }

    contextYears.forEach((yr) => {
      const d = pathFor(byYear[yr]);
      if (d) svg.appendChild(svgEl('path', { d, class: 'line-context', fill: 'none' }));
    });

    let lastPoint = null;
    if (byYear[currentYear]) {
      const d = pathFor(byYear[currentYear]);
      if (d) svg.appendChild(svgEl('path', { d, class: 'line-accent', fill: 'none' }));
      byYear[currentYear].forEach((v, i) => {
        if (v != null) lastPoint = { i, v };
      });
      if (lastPoint) {
        svg.appendChild(svgEl('circle', { cx: xFor(lastPoint.i), cy: yFor(lastPoint.v), r: 5, class: 'end-dot-accent' }));
        const lbl = svgEl('text', {
          x: Math.min(xFor(lastPoint.i) + 8, width - margin.right - 2),
          y: yFor(lastPoint.v) - 10,
          class: 'end-label',
          'text-anchor': lastPoint.i === 11 ? 'end' : 'start',
        });
        lbl.textContent = formatValue(lastPoint.v);
        svg.appendChild(lbl);
      }
    }

    // hover: crosshair + one tooltip summarizing current year vs. prior-year range
    const crosshair = svgEl('line', { x1: 0, x2: 0, y1: margin.top, y2: height - margin.bottom, class: 'crosshair', visibility: 'hidden' });
    svg.appendChild(crosshair);
    const hitRect = svgEl('rect', {
      x: margin.left, y: margin.top, width: innerW, height: innerH, fill: 'transparent',
    });
    hitRect.style.cursor = 'crosshair';
    svg.appendChild(hitRect);

    hitRect.addEventListener('pointermove', (evt) => {
      const rect = svg.getBoundingClientRect();
      const scaleX = width / rect.width;
      const localX = (evt.clientX - rect.left) * scaleX;
      let idx = Math.round(((localX - margin.left) / innerW) * 11);
      idx = Math.max(0, Math.min(11, idx));
      crosshair.setAttribute('x1', xFor(idx));
      crosshair.setAttribute('x2', xFor(idx));
      crosshair.setAttribute('visibility', 'visible');

      const rows = [];
      const currentVal = byYear[currentYear] ? byYear[currentYear][idx] : null;
      if (currentVal != null) rows.push({ label: String(currentYear), value: formatValue(currentVal), colorClass: 'key-accent' });
      const contextVals = contextYears.map((yr) => byYear[yr][idx]).filter((v) => v != null);
      if (contextVals.length) {
        const lo = Math.min(...contextVals);
        const hi = Math.max(...contextVals);
        const rangeLabel = contextYears.length > 1 ? `${contextYears[0]}–${contextYears[contextYears.length - 1]}` : String(contextYears[0]);
        rows.push({
          label: rangeLabel,
          value: lo === hi ? formatValue(lo) : `${formatValue(lo)} – ${formatValue(hi)}`,
          colorClass: 'key-context',
        });
      }
      if (rows.length) showTooltip(evt.clientX, evt.clientY, MONTHS[idx], rows);
    });
    hitRect.addEventListener('pointerleave', () => {
      crosshair.setAttribute('visibility', 'hidden');
      hideTooltip();
    });

    const legend = document.createElement('div');
    legend.className = 'chart-legend';
    if (contextYears.length) {
      const label = contextYears.length > 1 ? `${contextYears[0]}–${contextYears[contextYears.length - 1]} (prior years)` : `${contextYears[0]}`;
      legend.appendChild(legendItem('legend-context', label));
    }
    legend.appendChild(legendItem('legend-accent', String(currentYear)));
    mount.append(legend, svg);
  }

  // ---- single-series continuous trend line chart ---------------------------------
  function renderTrendChart(mount, { points, formatValue, formatDate, ariaLabel }) {
    mount.innerHTML = '';
    const clean = points.filter((p) => p.value != null);
    if (clean.length === 0) {
      mount.appendChild(buildEmptyState({ title: 'No data points', message: 'This series returned no usable values.' }));
      return;
    }
    let yMin = Math.min(...clean.map((p) => p.value));
    let yMax = Math.max(...clean.map((p) => p.value));
    const pad = (yMax - yMin) * 0.1 || Math.abs(yMax) * 0.1 || 1;
    yMin -= pad;
    yMax += pad;

    const width = 640;
    const height = 260;
    const margin = { top: 16, right: 16, bottom: 28, left: 60 };
    const innerW = width - margin.left - margin.right;
    const innerH = height - margin.top - margin.bottom;
    const n = points.length;
    const xFor = (i) => margin.left + (n <= 1 ? 0 : (i / (n - 1)) * innerW);
    const yFor = (v) => margin.top + innerH - ((v - yMin) / (yMax - yMin)) * innerH;

    const svg = svgEl('svg', {
      viewBox: `0 0 ${width} ${height}`, width: '100%', height: 'auto', role: 'img',
      'aria-label': ariaLabel || 'Trend chart', class: 'usda-chart',
    });

    niceTicks(yMin, yMax, 5).forEach((t) => {
      const ty = yFor(t);
      svg.appendChild(svgEl('line', { x1: margin.left, x2: width - margin.right, y1: ty, y2: ty, class: 'grid-line' }));
      const label = svgEl('text', { x: margin.left - 8, y: ty + 4, class: 'axis-label', 'text-anchor': 'end' });
      label.textContent = formatValue(t);
      svg.appendChild(label);
    });

    const tickEvery = Math.max(1, Math.floor(n / 6));
    points.forEach((p, i) => {
      if (i % tickEvery !== 0 && i !== n - 1) return;
      const label = svgEl('text', { x: xFor(i), y: height - margin.bottom + 18, class: 'axis-label', 'text-anchor': 'middle' });
      label.textContent = formatDate(p.date);
      svg.appendChild(label);
    });

    let d = '';
    points.forEach((p, i) => {
      if (p.value == null) return;
      d += (d ? 'L' : 'M') + xFor(i).toFixed(2) + ' ' + yFor(p.value).toFixed(2) + ' ';
    });
    svg.appendChild(svgEl('path', { d: d.trim(), class: 'line-accent', fill: 'none' }));

    const lastIdx = points.map((p) => p.value != null).lastIndexOf(true);
    if (lastIdx !== -1) {
      const p = points[lastIdx];
      svg.appendChild(svgEl('circle', { cx: xFor(lastIdx), cy: yFor(p.value), r: 5, class: 'end-dot-accent' }));
      const lbl = svgEl('text', { x: xFor(lastIdx) - 8, y: yFor(p.value) - 10, class: 'end-label', 'text-anchor': 'end' });
      lbl.textContent = formatValue(p.value);
      svg.appendChild(lbl);
    }

    const crosshair = svgEl('line', { x1: 0, x2: 0, y1: margin.top, y2: height - margin.bottom, class: 'crosshair', visibility: 'hidden' });
    svg.appendChild(crosshair);
    const hitRect = svgEl('rect', { x: margin.left, y: margin.top, width: innerW, height: innerH, fill: 'transparent' });
    hitRect.style.cursor = 'crosshair';
    svg.appendChild(hitRect);
    hitRect.addEventListener('pointermove', (evt) => {
      const rect = svg.getBoundingClientRect();
      const scaleX = width / rect.width;
      const localX = (evt.clientX - rect.left) * scaleX;
      let idx = n <= 1 ? 0 : Math.round(((localX - margin.left) / innerW) * (n - 1));
      idx = Math.max(0, Math.min(n - 1, idx));
      crosshair.setAttribute('x1', xFor(idx));
      crosshair.setAttribute('x2', xFor(idx));
      crosshair.setAttribute('visibility', 'visible');
      const p = points[idx];
      if (p.value != null) {
        showTooltip(evt.clientX, evt.clientY, formatDate(p.date), [{ label: 'Value', value: formatValue(p.value), colorClass: 'key-accent' }]);
      } else {
        hideTooltip();
      }
    });
    hitRect.addEventListener('pointerleave', () => {
      crosshair.setAttribute('visibility', 'hidden');
      hideTooltip();
    });

    mount.appendChild(svg);
  }

  // ---- monthly magnitude bar chart -------------------------------------------------
  function renderBarChart(mount, { points, formatValue, formatDate, colorClass, ariaLabel }) {
    mount.innerHTML = '';
    const clean = points.filter((p) => p.value != null);
    if (clean.length === 0) {
      mount.appendChild(buildEmptyState({ title: 'No data points', message: 'This series returned no usable values.' }));
      return;
    }
    const yMax = Math.max(...clean.map((p) => p.value), 0) * 1.15 || 1;
    const width = 640;
    const height = 260;
    const margin = { top: 16, right: 16, bottom: 28, left: 60 };
    const innerW = width - margin.left - margin.right;
    const innerH = height - margin.top - margin.bottom;
    const n = points.length;
    const bandWidth = innerW / n;
    const barWidth = Math.min(24, bandWidth * 0.6);
    const xFor = (i) => margin.left + bandWidth * i + bandWidth / 2;
    const yFor = (v) => margin.top + innerH - (v / yMax) * innerH;

    const svg = svgEl('svg', {
      viewBox: `0 0 ${width} ${height}`, width: '100%', height: 'auto', role: 'img',
      'aria-label': ariaLabel || 'Bar chart', class: 'usda-chart',
    });

    niceTicks(0, yMax, 4).forEach((t) => {
      const ty = yFor(t);
      svg.appendChild(svgEl('line', { x1: margin.left, x2: width - margin.right, y1: ty, y2: ty, class: 'grid-line' }));
      const label = svgEl('text', { x: margin.left - 8, y: ty + 4, class: 'axis-label', 'text-anchor': 'end' });
      label.textContent = formatValue(t);
      svg.appendChild(label);
    });

    const tickEvery = Math.max(1, Math.floor(n / 6));
    const barsG = svgEl('g');
    points.forEach((p, i) => {
      if (i % tickEvery === 0 || i === n - 1) {
        const label = svgEl('text', { x: xFor(i), y: height - margin.bottom + 18, class: 'axis-label', 'text-anchor': 'middle' });
        label.textContent = formatDate(p.date);
        svg.appendChild(label);
      }
      if (p.value == null) return;
      const barHeight = Math.max(0, margin.top + innerH - yFor(p.value));
      const rect = svgEl('rect', {
        x: xFor(i) - barWidth / 2,
        y: yFor(p.value),
        width: barWidth,
        height: barHeight,
        rx: 4,
        class: 'bar ' + (colorClass || 'bar-accent'),
      });
      const hit = svgEl('rect', {
        x: xFor(i) - bandWidth / 2, y: margin.top, width: bandWidth, height: innerH, fill: 'transparent',
      });
      hit.addEventListener('pointermove', (evt) => {
        rect.classList.add('bar-hover');
        showTooltip(evt.clientX, evt.clientY, formatDate(p.date), [{ label: 'Value', value: formatValue(p.value), colorClass: 'key-accent' }]);
      });
      hit.addEventListener('pointerleave', () => {
        rect.classList.remove('bar-hover');
        hideTooltip();
      });
      barsG.append(rect, hit);
    });
    svg.appendChild(barsG);

    const lastIdx = points.map((p) => p.value != null).lastIndexOf(true);
    if (lastIdx !== -1) {
      const p = points[lastIdx];
      const lbl = svgEl('text', { x: xFor(lastIdx), y: yFor(p.value) - 8, class: 'end-label', 'text-anchor': 'middle' });
      lbl.textContent = formatValue(p.value);
      svg.appendChild(lbl);
    }

    mount.appendChild(svg);
  }

  // ---- KPI stat tile ---------------------------------------------------------------
  function renderStatTile(container, { label, value, deltaText, deltaDirection, unavailable }) {
    const tile = document.createElement('div');
    tile.className = 'stat-tile';
    const labelEl = document.createElement('div');
    labelEl.className = 'stat-tile-label';
    labelEl.textContent = label;
    tile.appendChild(labelEl);
    if (unavailable) {
      const val = document.createElement('div');
      val.className = 'stat-tile-value stat-tile-unavailable';
      val.textContent = 'Unavailable';
      tile.appendChild(val);
    } else {
      const val = document.createElement('div');
      val.className = 'stat-tile-value';
      val.textContent = value;
      tile.appendChild(val);
      if (deltaText) {
        const delta = document.createElement('div');
        delta.className = 'stat-tile-delta ' + (deltaDirection === 'up' ? 'delta-up' : deltaDirection === 'down' ? 'delta-down' : '');
        delta.textContent = deltaText;
        tile.appendChild(delta);
      }
    }
    container.appendChild(tile);
    return tile;
  }

  global.UsdaCharts = {
    buildCard,
    buildTable,
    buildEmptyState,
    renderSeasonalChart,
    renderTrendChart,
    renderBarChart,
    renderStatTile,
    MONTHS,
  };
})(window);
