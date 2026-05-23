/**
 * V2 — Global Patterns: hourly demand heatmap (day of week × hour).
 *
 * Reads from filterBus: dateRange, taxiTypes, selectedBoroughs.
 * Never writes to filterBus — all interactions are local to this view.
 *
 * Local controls (internal only): normalize toggle, row click → detail chart.
 */

import * as d3 from 'd3';
import { getState, subscribe } from '../state/filterBus.js';

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MIN_YEAR  = 2015;
const MAX_YEAR  = 2024;

const TAXI_COLORS  = { yellow: '#f5c542', green: '#2ecc71', fhv: '#9b6ff5' };
const TAXI_LABELS  = { yellow: 'Yellow', green: 'Green', fhv: 'FHV' };

function yearRangeFromDateRange(dateRange) {
  if (!dateRange) return [MIN_YEAR, MAX_YEAR];
  return [
    new Date(dateRange[0]).getFullYear(),
    new Date(dateRange[1]).getFullYear(),
  ];
}

export function init(container, data) {
  if (!data || (!data.heatmap_by_year?.length && !data.heatmap_by_borough?.length)) {
    container.innerHTML = '<p class="gp-empty">No data available. Run the aggregation script first.</p>';
    return;
  }

  // ── Local state (view-internal only) ────────────────────────────────────────
  let selectedDay = null;   // null or dow index 0–6
  let normalize   = false;

  // ── Derived from filterBus (read-only) ──────────────────────────────────────
  const initial = getState();
  let [yearLo, yearHi]  = yearRangeFromDateRange(initial.dateRange);
  let activeTaxiTypes   = new Set(initial.taxiTypes);
  let activeBoroughs    = initial.selectedBoroughs; // null = all; Set<string> = specific

  // ── Scaffold ─────────────────────────────────────────────────────────────────
  container.innerHTML = `
    <div class="gp-local-bar">
      <label class="gp-normalize-label">
        <input type="checkbox" id="gp-normalize"> Normalize columns
      </label>
    </div>
    <div id="gp-heatmap"></div>
    <div id="gp-detail" class="gp-detail gp-detail--hidden">
      <div class="gp-detail-header">
        <span id="gp-detail-title" class="gp-detail-title"></span>
        <button id="gp-detail-close" class="gp-detail-close" aria-label="Close">×</button>
      </div>
      <div id="gp-detail-chart"></div>
    </div>
  `;

  container.querySelector('#gp-normalize').addEventListener('change', e => {
    normalize = e.target.checked;
    update();
  });

  container.querySelector('#gp-detail-close').addEventListener('click', () => {
    selectedDay = null;
    container.querySelector('#gp-detail').classList.add('gp-detail--hidden');
    renderHeatmap(computeGrid());
  });

  // ── filterBus subscription (read-only) ──────────────────────────────────────
  subscribe(state => {
    [yearLo, yearHi] = yearRangeFromDateRange(state.dateRange);
    activeTaxiTypes  = new Set(state.taxiTypes);
    activeBoroughs   = state.selectedBoroughs;
    update();
  });

  // ── Data computation ─────────────────────────────────────────────────────────

  function computeGrid() {
    const byBorough = activeBoroughs !== null;
    const grid = Array.from({ length: 7 }, () => new Array(24).fill(0));

    if (!byBorough) {
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
      data.heatmap_by_borough.forEach(r => {
        if (activeBoroughs.has(r.borough) && activeTaxiTypes.has(r.type)) {
          grid[r.dow][r.hour] += r.trips;
        }
      });
    }

    if (normalize) {
      for (let h = 0; h < 24; h++) {
        const colMax = d3.max(DAY_NAMES.map((_, d) => grid[d][h])) || 1;
        for (let d = 0; d < 7; d++) grid[d][h] /= colMax;
      }
    }

    return grid;
  }

  function computeLines(dow) {
    // Always produce one line per active taxi type.
    // Year mode: average over selected year range.
    // Borough mode: sum over selected boroughs.
    const byBorough = activeBoroughs !== null;
    const typeMap   = {};   // type → [24 values]
    const yearSets  = {};   // type → Set of years (for averaging)

    if (!byBorough) {
      data.heatmap_by_year.forEach(r => {
        if (r.dow === dow && r.year >= yearLo && r.year <= yearHi && activeTaxiTypes.has(r.type)) {
          if (!typeMap[r.type])  typeMap[r.type]  = new Array(24).fill(0);
          if (!yearSets[r.type]) yearSets[r.type] = new Set();
          typeMap[r.type][r.hour] += r.trips;
          yearSets[r.type].add(r.year);
        }
      });
      // Divide each type by its own year count (FHV starts 2019, others start 2015)
      Object.entries(typeMap).forEach(([t, arr]) => {
        const n = yearSets[t].size || 1;
        arr.forEach((_, h) => { arr[h] /= n; });
      });
    } else {
      data.heatmap_by_borough.forEach(r => {
        if (r.dow === dow && activeBoroughs.has(r.borough) && activeTaxiTypes.has(r.type)) {
          if (!typeMap[r.type]) typeMap[r.type] = new Array(24).fill(0);
          typeMap[r.type][r.hour] += r.trips;
        }
      });
    }

    return { byType: typeMap };
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

    let tooltip = d3.select(el).select('.gp-tooltip');
    if (tooltip.empty()) {
      tooltip = d3.select(el).append('div').attr('class', 'tooltip gp-tooltip')
        .style('opacity', 0).style('position', 'absolute').style('pointer-events', 'none');
    }

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

      if (isSelected) {
        rowG.append('rect')
          .attr('x', -margin.left + 4).attr('y', 1)
          .attr('width', innerW + margin.left - 4).attr('height', cellH - 2)
          .attr('rx', 4)
          .attr('fill', 'rgba(77,166,255,0.09)')
          .attr('stroke', 'rgba(77,166,255,0.25)').attr('stroke-width', 1);
      }

      rowG.append('text')
        .attr('x', -10).attr('y', cellH / 2)
        .attr('text-anchor', 'end').attr('dominant-baseline', 'middle')
        .attr('fill', isSelected ? '#4da6ff' : '#8b95a1')
        .attr('font-size', 12).attr('font-weight', isSelected ? 600 : 400)
        .attr('font-family', 'var(--font-sans, system-ui)')
        .text(dayName);

      for (let hour = 0; hour < 24; hour++) {
        const val = grid[dow][hour];
        rowG.append('g')
          .attr('transform', `translate(${hour * cellW},0)`)
          .on('mouseover', function (event) {
            tooltip.style('opacity', 1)
              .html(`<span class="tooltip-title">${dayName} · ${fmtHour(hour)}–${fmtHour(hour + 1)}</span>
                     <div class="tooltip-row">${normalize
                       ? `${(val * 100).toFixed(1)}% of column max`
                       : `${fmtNumber(Math.round(val))} avg trips`}</div>`);
            const r = el.getBoundingClientRect();
            tooltip.style('left', (event.clientX - r.left + 12) + 'px')
                   .style('top',  (event.clientY - r.top  - 36) + 'px');
          })
          .on('mousemove', function (event) {
            const r = el.getBoundingClientRect();
            tooltip.style('left', (event.clientX - r.left + 12) + 'px')
                   .style('top',  (event.clientY - r.top  - 36) + 'px');
          })
          .on('mouseout', () => tooltip.style('opacity', 0))
          .append('rect')
          .attr('width', cellW - 1.5).attr('height', cellH - 1.5).attr('rx', 2)
          .attr('fill', val === 0 ? '#1c2333' : colorScale(val));
      }
    });

    // X axis
    const xAxisG = g.append('g').attr('transform', `translate(0,${innerH})`);
    for (let h = 0; h <= 23; h += 3) {
      xAxisG.append('text')
        .attr('x', (h + 0.5) * cellW).attr('y', 18)
        .attr('text-anchor', 'middle').attr('fill', '#586069').attr('font-size', 11)
        .attr('font-family', 'var(--font-sans, system-ui)')
        .text(fmtHour(h));
    }

    // Color legend
    const legendW = 100;
    const defs    = svg.append('defs');
    const gradId  = 'gp-heat-grad';
    const grad    = defs.append('linearGradient').attr('id', gradId);
    grad.append('stop').attr('offset', '0%').attr('stop-color', colorScale(0));
    grad.append('stop').attr('offset', '100%').attr('stop-color', colorScale(maxVal));

    const legG = g.append('g').attr('transform', `translate(0,${innerH + 32})`);
    legG.append('text').attr('y', -3).attr('fill', '#586069').attr('font-size', 10)
      .attr('font-family', 'var(--font-sans, system-ui)').text('Low');
    legG.append('rect').attr('x', 24).attr('width', legendW).attr('height', 6).attr('rx', 3)
      .attr('fill', `url(#${gradId})`);
    legG.append('text').attr('x', 24 + legendW + 4).attr('y', -3)
      .attr('fill', '#586069').attr('font-size', 10)
      .attr('font-family', 'var(--font-sans, system-ui)').text('High');
    legG.append('text').attr('x', innerW).attr('y', -3).attr('text-anchor', 'end')
      .attr('fill', '#586069').attr('font-size', 10)
      .attr('font-family', 'var(--font-sans, system-ui)').text('Click a row for hourly detail →');
  }

  // ── Render: detail line chart ────────────────────────────────────────────────

  function renderDetail(dow) {
    const detailEl = container.querySelector('#gp-detail');
    const titleEl  = container.querySelector('#gp-detail-title');
    const chartEl  = container.querySelector('#gp-detail-chart');

    detailEl.classList.remove('gp-detail--hidden');

    const lines = computeLines(dow);

    // Build subtitle from filter context (borough or year range)
    let subtitle = '';
    if (activeBoroughs !== null) {
      subtitle = ' · ' + [...activeBoroughs].join(', ');
    } else {
      subtitle = yearLo === yearHi ? ` · ${yearLo}` : ` · ${yearLo}–${yearHi}`;
    }
    titleEl.textContent = `Hourly demand — ${DAY_NAMES[dow]}${subtitle}`;

    chartEl.innerHTML = '';

    const margin = { top: 24, right: 64, bottom: 40, left: 64 };
    const totalW = chartEl.getBoundingClientRect().width || 760;
    const width  = totalW - margin.left - margin.right;
    const height = 180;

    const svg = d3.select(chartEl).append('svg')
      .attr('width', totalW)
      .attr('height', height + margin.top + margin.bottom);

    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    const xScale = d3.scaleLinear().domain([0, 23]).range([0, width]);

    const allVals = Object.values(lines.byType).flatMap(arr => arr);
    const yMax    = d3.max(allVals) || 1;
    const yScale  = d3.scaleLinear().domain([0, yMax * 1.08]).range([height, 0]);

    // Grid lines
    g.append('g').selectAll('line')
      .data(yScale.ticks(4)).join('line')
      .attr('x1', 0).attr('x2', width)
      .attr('y1', d => yScale(d)).attr('y2', d => yScale(d))
      .attr('stroke', '#2d3748').attr('stroke-dasharray', '2,4');

    const lineGen = d3.line()
      .x((_, i) => xScale(i)).y(d => yScale(d))
      .curve(d3.curveCatmullRom.alpha(0.5));

    // One line per active taxi type
    Object.entries(lines.byType).forEach(([t, arr]) => {
      const color = TAXI_COLORS[t] || '#4da6ff';
      g.append('path').datum(arr)
        .attr('fill', 'none').attr('stroke', color).attr('stroke-width', 2.5)
        .attr('d', lineGen);
      g.append('text')
        .attr('x', width + 6).attr('y', yScale(arr[23]))
        .attr('dominant-baseline', 'middle').attr('fill', color).attr('font-size', 10)
        .attr('font-family', 'var(--font-sans, system-ui)')
        .text(TAXI_LABELS[t] || t);
    });

    g.append('g').attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(xScale).tickValues([0,3,6,9,12,15,18,21,23]).tickFormat(h => fmtHour(h)))
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

    // Crosshair
    const crossLine = g.append('line')
      .attr('stroke', '#586069').attr('stroke-dasharray', '3,3')
      .attr('y1', 0).attr('y2', height).attr('opacity', 0);

    let tip = d3.select(chartEl).select('.gp-detail-tooltip');
    if (tip.empty()) {
      tip = d3.select(chartEl).append('div').attr('class', 'tooltip gp-detail-tooltip')
        .style('opacity', 0).style('position', 'absolute').style('pointer-events', 'none');
    }

    g.append('rect')
      .attr('width', width).attr('height', height)
      .attr('fill', 'none').attr('pointer-events', 'all').style('cursor', 'crosshair')
      .on('mousemove', function (event) {
        const h = Math.round(xScale.invert(d3.pointer(event, g.node())[0]));
        if (h < 0 || h > 23) return;
        crossLine.attr('x1', xScale(h)).attr('x2', xScale(h)).attr('opacity', 1);
        let html = `<span class="tooltip-title">${fmtHour(h)}–${fmtHour(h + 1)}</span>`;
        Object.entries(lines.byType).forEach(([t, arr]) => {
          const col = TAXI_COLORS[t] || '#4da6ff';
          html += `<div class="tooltip-row"><span class="tooltip-swatch" style="background:${col}"></span>${TAXI_LABELS[t]}: <strong>${fmtNumber(Math.round(arr[h]))}</strong></div>`;
        });
        const r = chartEl.getBoundingClientRect();
        tip.style('opacity', 1).html(html)
          .style('left', (event.clientX - r.left + 12) + 'px')
          .style('top',  (event.clientY - r.top  - 40) + 'px');
      })
      .on('mouseleave', () => { crossLine.attr('opacity', 0); tip.style('opacity', 0); });
  }

  // ── Main update ──────────────────────────────────────────────────────────────

  function update() {
    const grid = computeGrid();
    renderHeatmap(grid);
    if (selectedDay !== null) renderDetail(selectedDay);
  }

  let _resizeDebounce = null;
  const ro = new ResizeObserver(() => {
    clearTimeout(_resizeDebounce);
    _resizeDebounce = setTimeout(update, 60);
  });
  ro.observe(container);

  update();
}

function fmtHour(h) {
  if (h === 0 || h === 24) return '12am';
  if (h === 12) return '12pm';
  return h < 12 ? `${h}am` : `${h - 12}pm`;
}

function fmtNumber(n) { return n.toLocaleString(); }

function fmtCompact(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(0) + 'K';
  return String(Math.round(n));
}
