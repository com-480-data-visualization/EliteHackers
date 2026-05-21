/**
 * Global Patterns — hourly demand heatmap by day of week.
 *
 * Local controls: year range slider, borough multi-select, normalize toggle.
 * Also reads taxiTypes from filterBus.
 *
 * Data shape expected (global_patterns.json):
 *   heatmap_by_year    [{year, type, dow, hour, trips}, ...]
 *   heatmap_by_borough [{borough, type, dow, hour, trips}, ...]
 *   borough_list       [string, ...]
 */

import * as d3 from 'd3';
import { getState, subscribe } from '../state/filterBus.js';

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MIN_YEAR  = 2015;
const MAX_YEAR  = 2024;

// Borough color palette (distinct, readable on dark bg)
const BOROUGH_COLORS = {
  Manhattan:      '#4da6ff',
  Brooklyn:       '#f5c542',
  Queens:         '#2ecc71',
  Bronx:          '#e05252',
  'Staten Island':'#c084fc',
  EWR:            '#f5a623',
};

export function init(container, data) {
  if (!data || (!data.heatmap_by_year?.length && !data.heatmap_by_borough?.length)) {
    container.innerHTML = '<p class="gp-empty">No data available. Run the aggregation script first.</p>';
    return;
  }

  // ── Local state ─────────────────────────────────────────────────────────────
  let yearLo          = MIN_YEAR;
  let yearHi          = MAX_YEAR;
  let selectedBoroughs = new Set(['all']);  // 'all' = no borough filter
  let selectedDay     = null;              // null or dow index 0–6
  let normalize       = false;
  let activeTaxiTypes = new Set(getState().taxiTypes);

  // ── Scaffold HTML ────────────────────────────────────────────────────────────
  container.innerHTML = `
    <div class="gp-controls-bar">
      <div class="gp-ctrl-group">
        <span class="controls-label">Years</span>
        <div class="gp-year-slider">
          <span class="yr-label" id="gp-yr-lo">${MIN_YEAR}</span>
          <input type="range" id="gp-yr-lo-input" min="${MIN_YEAR}" max="${MAX_YEAR}"
                 value="${MIN_YEAR}" step="1">
          <span class="gp-yr-sep">–</span>
          <input type="range" id="gp-yr-hi-input" min="${MIN_YEAR}" max="${MAX_YEAR}"
                 value="${MAX_YEAR}" step="1">
          <span class="yr-label" id="gp-yr-hi">${MAX_YEAR}</span>
        </div>
      </div>
      <div class="gp-ctrl-group">
        <span class="controls-label">Area</span>
        <div class="gp-borough-btns" id="gp-borough-btns"></div>
      </div>
      <label class="gp-normalize-label">
        <input type="checkbox" id="gp-normalize"> Normalize columns
      </label>
    </div>

    <div class="gp-charts">
      <div id="gp-heatmap"></div>
      <div id="gp-detail" class="gp-detail gp-detail--hidden">
        <div class="gp-detail-header">
          <span id="gp-detail-title" class="gp-detail-title"></span>
          <button id="gp-detail-close" class="gp-detail-close" aria-label="Close">×</button>
        </div>
        <div id="gp-detail-chart"></div>
      </div>
    </div>
  `;

  // ── Borough buttons ──────────────────────────────────────────────────────────
  const boroughBtnsEl = container.querySelector('#gp-borough-btns');
  const boroughOptions = ['All', ...(data.borough_list || [])];

  boroughOptions.forEach(b => {
    const btn = document.createElement('button');
    btn.className = 'gp-borough-btn' + (b === 'All' ? ' active' : '');
    btn.dataset.borough = b;
    btn.textContent = b;
    // Small color dot for non-All boroughs
    if (b !== 'All' && BOROUGH_COLORS[b]) {
      btn.innerHTML = `<span class="gp-borough-dot" style="background:${BOROUGH_COLORS[b]}"></span>${b}`;
    }
    btn.addEventListener('click', () => {
      if (b === 'All') {
        selectedBoroughs = new Set(['all']);
      } else {
        selectedBoroughs.delete('all');
        if (selectedBoroughs.has(b)) {
          selectedBoroughs.delete(b);
          if (selectedBoroughs.size === 0) selectedBoroughs = new Set(['all']);
        } else {
          selectedBoroughs.add(b);
        }
      }
      syncBoroughBtns();
      update();
    });
    boroughBtnsEl.appendChild(btn);
  });

  function syncBoroughBtns() {
    boroughBtnsEl.querySelectorAll('.gp-borough-btn').forEach(btn => {
      const b = btn.dataset.borough;
      btn.classList.toggle('active', b === 'All' ? selectedBoroughs.has('all') : selectedBoroughs.has(b));
    });
  }

  // ── Year slider ──────────────────────────────────────────────────────────────
  const loInput  = container.querySelector('#gp-yr-lo-input');
  const hiInput  = container.querySelector('#gp-yr-hi-input');
  const loLabel  = container.querySelector('#gp-yr-lo');
  const hiLabel  = container.querySelector('#gp-yr-hi');

  let _debounce = null;
  function onYearInput() {
    clearTimeout(_debounce);
    _debounce = setTimeout(() => {
      let lo = parseInt(loInput.value, 10);
      let hi = parseInt(hiInput.value, 10);
      if (lo > hi) [lo, hi] = [hi, lo];
      yearLo = lo; yearHi = hi;
      loLabel.textContent = lo;
      hiLabel.textContent = hi;
      update();
    }, 80);
  }
  loInput.addEventListener('input', onYearInput);
  hiInput.addEventListener('input', onYearInput);

  // ── Normalize toggle ─────────────────────────────────────────────────────────
  container.querySelector('#gp-normalize').addEventListener('change', e => {
    normalize = e.target.checked;
    update();
  });

  // ── Detail panel close ───────────────────────────────────────────────────────
  container.querySelector('#gp-detail-close').addEventListener('click', () => {
    selectedDay = null;
    container.querySelector('#gp-detail').classList.add('gp-detail--hidden');
    renderHeatmap(computeGrid());
  });

  // ── filterBus: sync taxiTypes ────────────────────────────────────────────────
  subscribe(state => {
    activeTaxiTypes = new Set(state.taxiTypes);
    update();
  });

  // ── Data computation ─────────────────────────────────────────────────────────

  function computeGrid() {
    const byBorough = !selectedBoroughs.has('all');
    const grid = Array.from({ length: 7 }, () => new Array(24).fill(0));

    if (!byBorough) {
      // Sum trips across active types & selected year range; divide by distinct year count
      const years = new Set();
      data.heatmap_by_year.forEach(r => {
        if (r.year >= yearLo && r.year <= yearHi && activeTaxiTypes.has(r.type)) {
          years.add(r.year);
          grid[r.dow][r.hour] += r.trips;
        }
      });
      const divisor = years.size || 1;
      for (let d = 0; d < 7; d++)
        for (let h = 0; h < 24; h++)
          grid[d][h] /= divisor;
    } else {
      // Sum trips across selected boroughs & active types (all years)
      data.heatmap_by_borough.forEach(r => {
        if (selectedBoroughs.has(r.borough) && activeTaxiTypes.has(r.type)) {
          grid[r.dow][r.hour] += r.trips;
        }
      });
    }

    if (normalize) {
      // Normalize each hour-column independently so relative patterns are visible
      for (let h = 0; h < 24; h++) {
        const colMax = d3.max(DAY_NAMES.map((_, d) => grid[d][h])) || 1;
        for (let d = 0; d < 7; d++) grid[d][h] /= colMax;
      }
    }

    return grid;
  }

  function computeLines(dow) {
    const byBorough = !selectedBoroughs.has('all');

    if (!byBorough) {
      // One line per year for the selected day
      const yearMap = {};
      data.heatmap_by_year.forEach(r => {
        if (r.dow === dow && r.year >= yearLo && r.year <= yearHi && activeTaxiTypes.has(r.type)) {
          if (!yearMap[r.year]) yearMap[r.year] = new Array(24).fill(0);
          yearMap[r.year][r.hour] += r.trips;
        }
      });
      const years = Object.keys(yearMap).map(Number).sort();
      const mean  = new Array(24).fill(0);
      years.forEach(y => yearMap[y].forEach((v, h) => { mean[h] += v; }));
      const n = years.length || 1;
      mean.forEach((_, h) => { mean[h] /= n; });
      return { mode: 'years', byYear: yearMap, years, mean };
    } else {
      // One line per selected borough
      const boroughMap = {};
      data.heatmap_by_borough.forEach(r => {
        if (r.dow === dow && selectedBoroughs.has(r.borough) && activeTaxiTypes.has(r.type)) {
          if (!boroughMap[r.borough]) boroughMap[r.borough] = new Array(24).fill(0);
          boroughMap[r.borough][r.hour] += r.trips;
        }
      });
      return { mode: 'boroughs', byBorough: boroughMap };
    }
  }

  // ── Render: heatmap ──────────────────────────────────────────────────────────

  function renderHeatmap(grid) {
    const el = container.querySelector('#gp-heatmap');
    el.innerHTML = '';

    const margin = { top: 16, right: 20, bottom: 52, left: 56 };
    const totalW = el.getBoundingClientRect().width || 820;
    const innerW = totalW - margin.left - margin.right;
    const cellH  = 40;
    const innerH = 7 * cellH;

    const svg = d3.select(el).append('svg')
      .attr('width', totalW)
      .attr('height', innerH + margin.top + margin.bottom);

    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    const cellW   = innerW / 24;
    const allVals = grid.flat().filter(v => !normalize || v > 0);
    const maxVal  = d3.max(allVals) || 1;

    const colorScale = d3.scaleSequential()
      .domain([0, maxVal])
      .interpolator(d3.interpolateBlues);

    // Tooltip div (reuse or create)
    let tooltip = d3.select(el).select('.gp-tooltip');
    if (tooltip.empty()) {
      tooltip = d3.select(el).append('div').attr('class', 'tooltip gp-tooltip')
        .style('opacity', 0).style('position', 'absolute').style('pointer-events', 'none');
    }

    // Rows
    DAY_NAMES.forEach((dayName, dow) => {
      const isSelected = selectedDay === dow;
      const rowG = g.append('g')
        .attr('transform', `translate(0,${dow * cellH})`)
        .style('cursor', 'pointer')
        .on('click', () => {
          selectedDay = dow;
          renderHeatmap(grid);
          renderDetail(dow);
        });

      // Selection highlight band
      if (isSelected) {
        rowG.append('rect')
          .attr('x', -margin.left + 4)
          .attr('y', 1)
          .attr('width', innerW + margin.left - 4)
          .attr('height', cellH - 2)
          .attr('rx', 4)
          .attr('fill', 'rgba(77,166,255,0.09)')
          .attr('stroke', 'rgba(77,166,255,0.25)')
          .attr('stroke-width', 1);
      }

      // Row label
      rowG.append('text')
        .attr('x', -10)
        .attr('y', cellH / 2)
        .attr('text-anchor', 'end')
        .attr('dominant-baseline', 'middle')
        .attr('fill', isSelected ? '#4da6ff' : '#8b95a1')
        .attr('font-size', 12)
        .attr('font-weight', isSelected ? 600 : 400)
        .attr('font-family', 'var(--font-sans, system-ui)')
        .text(dayName);

      // Cells
      for (let hour = 0; hour < 24; hour++) {
        const val = grid[dow][hour];
        const cellG = rowG.append('g')
          .attr('transform', `translate(${hour * cellW},0)`)
          .on('mouseover', function (event) {
            tooltip.style('opacity', 1)
              .html(`<span class="tooltip-title">${dayName} · ${fmtHour(hour)}–${fmtHour(hour + 1)}</span>
                     <div class="tooltip-row">${normalize
                        ? `<span>${(val * 100).toFixed(1)}% of column max</span>`
                        : `<span>${fmtNumber(Math.round(val))} avg trips</span>`
                     }</div>`);
            const rect = el.getBoundingClientRect();
            const ex = event.clientX - rect.left;
            const ey = event.clientY - rect.top;
            tooltip.style('left', (ex + 12) + 'px').style('top', (ey - 36) + 'px');
          })
          .on('mousemove', function (event) {
            const rect = el.getBoundingClientRect();
            tooltip.style('left', (event.clientX - rect.left + 12) + 'px')
                   .style('top',  (event.clientY - rect.top  - 36) + 'px');
          })
          .on('mouseout', () => tooltip.style('opacity', 0));

        cellG.append('rect')
          .attr('width',  cellW - 1.5)
          .attr('height', cellH - 1.5)
          .attr('rx', 2)
          .attr('fill', val === 0 ? '#1c2333' : colorScale(val));
      }
    });

    // X axis — hour labels every 3h
    const xAxisG = g.append('g')
      .attr('transform', `translate(0,${innerH})`);

    for (let h = 0; h <= 23; h += 3) {
      xAxisG.append('text')
        .attr('x', (h + 0.5) * cellW)
        .attr('y', 18)
        .attr('text-anchor', 'middle')
        .attr('fill', '#586069')
        .attr('font-size', 11)
        .attr('font-family', 'var(--font-sans, system-ui)')
        .text(fmtHour(h));
    }

    // Color gradient legend
    const legendW = 100;
    const defs = svg.append('defs');
    const gradId = 'gp-heat-grad';
    const grad = defs.append('linearGradient').attr('id', gradId);
    grad.append('stop').attr('offset', '0%').attr('stop-color', colorScale(0));
    grad.append('stop').attr('offset', '100%').attr('stop-color', colorScale(maxVal));

    const legG = g.append('g')
      .attr('transform', `translate(0,${innerH + 32})`);

    legG.append('text')
      .attr('y', -3)
      .attr('fill', '#586069').attr('font-size', 10)
      .attr('font-family', 'var(--font-sans, system-ui)')
      .text('Low');

    legG.append('rect')
      .attr('x', 24).attr('width', legendW).attr('height', 6).attr('rx', 3)
      .attr('fill', `url(#${gradId})`);

    legG.append('text')
      .attr('x', 24 + legendW + 4).attr('y', -3)
      .attr('fill', '#586069').attr('font-size', 10)
      .attr('font-family', 'var(--font-sans, system-ui)')
      .text('High');

    legG.append('text')
      .attr('x', innerW)
      .attr('y', -3)
      .attr('text-anchor', 'end')
      .attr('fill', '#586069').attr('font-size', 10)
      .attr('font-family', 'var(--font-sans, system-ui)')
      .text('Click a row for hourly detail →');
  }

  // ── Render: detail line chart ────────────────────────────────────────────────

  function renderDetail(dow) {
    const detailEl  = container.querySelector('#gp-detail');
    const titleEl   = container.querySelector('#gp-detail-title');
    const chartEl   = container.querySelector('#gp-detail-chart');

    detailEl.classList.remove('gp-detail--hidden');

    const lines = computeLines(dow);
    const byBorough = !selectedBoroughs.has('all');

    let subtitle = '';
    if (!byBorough) {
      const yrs = lines.years;
      subtitle = yrs.length > 1
        ? ` · ${yrs[0]}–${yrs[yrs.length - 1]} (${yrs.length} yrs)`
        : yrs.length === 1 ? ` · ${yrs[0]}` : '';
    } else {
      subtitle = ' · ' + [...selectedBoroughs].join(', ');
    }
    titleEl.textContent = `Hourly demand — ${DAY_NAMES[dow]}${subtitle}`;

    chartEl.innerHTML = '';

    const margin = { top: 24, right: byBorough ? 72 : 16, bottom: 40, left: 64 };
    const totalW = chartEl.getBoundingClientRect().width || 760;
    const width  = totalW - margin.left - margin.right;
    const height = 180;

    const svg = d3.select(chartEl).append('svg')
      .attr('width', totalW)
      .attr('height', height + margin.top + margin.bottom);

    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    const xScale = d3.scaleLinear().domain([0, 23]).range([0, width]);

    // Gather all values for y domain
    let allVals = [];
    if (lines.mode === 'years') {
      lines.years.forEach(y => allVals.push(...lines.byYear[y]));
    } else {
      Object.values(lines.byBorough).forEach(arr => allVals.push(...arr));
    }
    const yMax = d3.max(allVals) || 1;
    const yScale = d3.scaleLinear().domain([0, yMax * 1.08]).range([height, 0]);

    // Grid lines
    g.append('g').selectAll('line')
      .data(yScale.ticks(4))
      .join('line')
      .attr('x1', 0).attr('x2', width)
      .attr('y1', d => yScale(d)).attr('y2', d => yScale(d))
      .attr('stroke', '#2d3748').attr('stroke-dasharray', '2,4');

    const lineGen = d3.line()
      .x((_, i) => xScale(i))
      .y(d => yScale(d))
      .curve(d3.curveCatmullRom.alpha(0.5));

    if (lines.mode === 'years') {
      // Faint per-year lines
      lines.years.forEach(y => {
        g.append('path')
          .datum(lines.byYear[y])
          .attr('fill', 'none')
          .attr('stroke', '#4da6ff')
          .attr('stroke-width', 1)
          .attr('stroke-opacity', Math.max(0.12, 0.6 / (lines.years.length || 1)))
          .attr('d', lineGen);
      });
      // Bold mean line
      g.append('path')
        .datum(lines.mean)
        .attr('fill', 'none')
        .attr('stroke', '#4da6ff')
        .attr('stroke-width', 2.5)
        .attr('d', lineGen);

      if (lines.years.length > 1) {
        g.append('text')
          .attr('x', 0).attr('y', -6)
          .attr('fill', '#586069').attr('font-size', 10)
          .attr('font-family', 'var(--font-sans, system-ui)')
          .text(`${lines.years.length} years · bold line = average`);
      }
    } else {
      // One line per borough
      const boroughs = Object.keys(lines.byBorough);
      boroughs.forEach(b => {
        const color = BOROUGH_COLORS[b] || '#4da6ff';
        g.append('path')
          .datum(lines.byBorough[b])
          .attr('fill', 'none')
          .attr('stroke', color)
          .attr('stroke-width', 2)
          .attr('d', lineGen);

        // End-of-line label
        const lastVal = lines.byBorough[b][23];
        g.append('text')
          .attr('x', width + 6)
          .attr('y', yScale(lastVal))
          .attr('dominant-baseline', 'middle')
          .attr('fill', color)
          .attr('font-size', 10)
          .attr('font-family', 'var(--font-sans, system-ui)')
          .text(b.length > 9 ? b.slice(0, 7) + '…' : b);
      });
    }

    // Axes
    g.append('g')
      .attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(xScale)
        .tickValues([0, 3, 6, 9, 12, 15, 18, 21, 23])
        .tickFormat(h => fmtHour(h)))
      .call(ax => ax.select('.domain').remove())
      .call(ax => ax.selectAll('text').attr('fill', '#586069').attr('font-size', 11)
                                     .attr('font-family', 'var(--font-sans, system-ui)'))
      .call(ax => ax.selectAll('.tick line').remove());

    g.append('g')
      .call(d3.axisLeft(yScale).ticks(4).tickFormat(v => fmtCompact(v)))
      .call(ax => ax.select('.domain').remove())
      .call(ax => ax.selectAll('text').attr('fill', '#586069').attr('font-size', 11)
                                     .attr('font-family', 'var(--font-sans, system-ui)'))
      .call(ax => ax.selectAll('.tick line').remove());

    // Crosshair tooltip
    const overlay = g.append('rect')
      .attr('width', width).attr('height', height)
      .attr('fill', 'none').attr('pointer-events', 'all')
      .style('cursor', 'crosshair');

    const crossLine = g.append('line')
      .attr('stroke', '#586069').attr('stroke-dasharray', '3,3')
      .attr('y1', 0).attr('y2', height).attr('opacity', 0);

    let detailTooltip = d3.select(chartEl).select('.gp-detail-tooltip');
    if (detailTooltip.empty()) {
      detailTooltip = d3.select(chartEl).append('div')
        .attr('class', 'tooltip gp-detail-tooltip')
        .style('opacity', 0).style('position', 'absolute').style('pointer-events', 'none');
    }

    overlay
      .on('mousemove', function (event) {
        const [mx] = d3.pointer(event, g.node());
        const h = Math.round(xScale.invert(mx));
        if (h < 0 || h > 23) return;
        crossLine.attr('x1', xScale(h)).attr('x2', xScale(h)).attr('opacity', 1);

        let html = `<span class="tooltip-title">${fmtHour(h)}–${fmtHour(h + 1)}</span>`;
        if (lines.mode === 'years') {
          html += `<div class="tooltip-row">Avg: <strong>${fmtNumber(Math.round(lines.mean[h]))}</strong> trips</div>`;
        } else {
          Object.entries(lines.byBorough).forEach(([b, arr]) => {
            const col = BOROUGH_COLORS[b] || '#4da6ff';
            html += `<div class="tooltip-row">
              <span class="tooltip-swatch" style="background:${col}"></span>
              ${b}: <strong>${fmtNumber(Math.round(arr[h]))}</strong>
            </div>`;
          });
        }
        const rect = chartEl.getBoundingClientRect();
        detailTooltip.style('opacity', 1).html(html)
          .style('left', (event.clientX - rect.left + 12) + 'px')
          .style('top',  (event.clientY - rect.top  - 40) + 'px');
      })
      .on('mouseleave', () => {
        crossLine.attr('opacity', 0);
        detailTooltip.style('opacity', 0);
      });
  }

  // ── Main update ──────────────────────────────────────────────────────────────

  function update() {
    const grid = computeGrid();
    renderHeatmap(grid);
    if (selectedDay !== null) renderDetail(selectedDay);
  }

  // ── ResizeObserver ───────────────────────────────────────────────────────────
  let _resizeDebounce = null;
  const ro = new ResizeObserver(() => {
    clearTimeout(_resizeDebounce);
    _resizeDebounce = setTimeout(update, 60);
  });
  ro.observe(container);

  // Initial render
  update();
}

// ── Formatting helpers ────────────────────────────────────────────────────────

function fmtHour(h) {
  if (h === 0 || h === 24) return '12am';
  if (h === 12) return '12pm';
  return h < 12 ? `${h}am` : `${h - 12}pm`;
}

function fmtNumber(n) {
  return n.toLocaleString();
}

function fmtCompact(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(0) + 'K';
  return String(Math.round(n));
}
