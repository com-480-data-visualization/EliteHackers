/**
 * V4 — Trip Anatomy Explorer.
 * Reads: filterBus.taxiTypes, filterBus.dateRange
 * Never writes to filterBus — axis selection is local to this view.
 *
 * Scatter plot of trip characteristics from ~10k sampled trips.
 * Color: by hour of day (d3.interpolateWarm).
 * Axis selection: X and Y axes are swappable between available metrics.
 *
 * Data: trip_sample.json [{date, type, pickup_hour, distance_miles,
 *                          total_amount, tip_pct, duration_min, passenger_count}]
 */

import * as d3 from 'd3';
import { getState, subscribe } from '../state/filterBus.js';

// Available axes
const AXES = {
  distance_miles: { label: 'Distance (miles)',   fmt: v => v.toFixed(1) },
  total_amount:   { label: 'Fare (USD)',          fmt: v => '$' + v.toFixed(2) },
  tip_pct:        { label: 'Tip (%)',             fmt: v => (v*100).toFixed(0) + '%' },
  duration_min:   { label: 'Duration (min)',      fmt: v => v.toFixed(0) },
};

const DEFAULT_X = 'distance_miles';
const DEFAULT_Y = 'total_amount';

const HOUR_COLOR = d3.scaleSequential().domain([0, 23]).interpolator(d3.interpolateWarm);

function linReg(pts, xKey, yKey) {
  const n = pts.length;
  if (n < 2) return null;
  let sx = 0, sy = 0, sxy = 0, sx2 = 0;
  for (const d of pts) {
    const x = +d[xKey], y = +d[yKey];
    sx += x; sy += y; sxy += x * y; sx2 += x * x;
  }
  const denom = n * sx2 - sx * sx;
  if (Math.abs(denom) < 1e-10) return null;
  const slope     = (n * sxy - sx * sy) / denom;
  const intercept = (sy - slope * sx) / n;
  const yMean = sy / n;
  let ssTot = 0, ssRes = 0;
  for (const d of pts) {
    const x = +d[xKey], y = +d[yKey];
    ssTot += (y - yMean) ** 2;
    ssRes += (y - (slope * x + intercept)) ** 2;
  }
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 1;
  return { slope, intercept, r2, r: Math.sign(slope) * Math.sqrt(Math.max(0, r2)) };
}

export function init(container, tripSample) {
  if (!tripSample?.length) {
    container.innerHTML = '<p class="gp-empty">Trip sample data not available.</p>';
    return;
  }

  // ── Derived from filterBus ────────────────────────────────────────────────
  const initial = getState();
  let activeTaxiTypes = new Set(initial.taxiTypes);
  let dateRange       = initial.dateRange;

  // ── Local state ───────────────────────────────────────────────────────────
  let xKey = DEFAULT_X;
  let yKey = DEFAULT_Y;

  // ── Scaffold ──────────────────────────────────────────────────────────────
  container.innerHTML = `
    <div class="v4-controls">
      <div class="v4-axis-group">
        <span class="controls-label">X axis</span>
        <select class="v4-select" id="v4-x-select">${axisOptions(DEFAULT_X)}</select>
      </div>
      <div class="v4-axis-group">
        <span class="controls-label">Y axis</span>
        <select class="v4-select" id="v4-y-select">${axisOptions(DEFAULT_Y)}</select>
      </div>
    </div>
    <div id="v4-chart"></div>
  `;

  function axisOptions(current) {
    return Object.entries(AXES)
      .map(([k, v]) => `<option value="${k}" ${k === current ? 'selected' : ''}>${v.label}</option>`)
      .join('');
  }

  container.querySelector('#v4-x-select').addEventListener('change', e => {
    xKey = e.target.value;
    render();
  });
  container.querySelector('#v4-y-select').addEventListener('change', e => {
    yKey = e.target.value;
    render();
  });

  // ── Filter samples ────────────────────────────────────────────────────────
  function filterSamples() {
    let d0 = null, d1 = null;
    if (dateRange) {
      d0 = new Date(dateRange[0]);
      d1 = new Date(dateRange[1]);
    }
    return tripSample.filter(r => {
      if (!activeTaxiTypes.has(r.type)) return false;
      if (d0) {
        const d = new Date(r.date);
        if (d < d0 || d > d1) return false;
      }
      return true;
    });
  }

  // ── Render ────────────────────────────────────────────────────────────────
  const tooltip = d3.select(container).append('div')
    .attr('class', 'tooltip v4-tooltip')
    .style('opacity', 0)
    .style('position', 'absolute')
    .style('pointer-events', 'none');

  function render() {
    const chartEl = container.querySelector('#v4-chart');
    chartEl.innerHTML = '';
    chartEl.appendChild(tooltip.node());

    const pts = filterSamples();

    if (!pts.length) {
      chartEl.innerHTML = '<p class="gp-empty">No trips match current filters.</p>';
      return;
    }

    const W = chartEl.getBoundingClientRect().width || 860;
    const M = { top: 16, right: 100, bottom: 48, left: 64 };
    const H = 380;
    const iw = W - M.left - M.right;
    const ih = H - M.top - M.bottom;

    const xVals = pts.map(d => +d[xKey]);
    const yVals = pts.map(d => +d[yKey]);

    // Cap outliers at 99th percentile for visual clarity
    const xMax = d3.quantile(xVals.slice().sort(d3.ascending), 0.99) * 1.05 || 1;
    const yMax = d3.quantile(yVals.slice().sort(d3.ascending), 0.99) * 1.05 || 1;

    const xScale = d3.scaleLinear().domain([0, xMax]).range([0, iw]).nice();
    const yScale = d3.scaleLinear().domain([0, yMax]).range([ih, 0]).nice();

    const svg = d3.select(chartEl).append('svg')
      .attr('width', W).attr('height', H);

    const clipId = 'v4-clip';
    svg.append('defs').append('clipPath').attr('id', clipId)
      .append('rect').attr('width', iw).attr('height', ih);

    const g = svg.append('g').attr('transform', `translate(${M.left},${M.top})`);

    // Grid
    g.append('g').selectAll('line')
      .data(yScale.ticks(5)).join('line')
      .attr('x1', 0).attr('x2', iw)
      .attr('y1', d => yScale(d)).attr('y2', d => yScale(d))
      .attr('stroke', '#2d3748').attr('stroke-dasharray', '2,4');

    const draw = pts;

    g.selectAll('circle')
      .data(draw)
      .join('circle')
        .attr('cx', d => xScale(+d[xKey]))
        .attr('cy', d => yScale(+d[yKey]))
        .attr('r', 3.5)
        .attr('fill', d => HOUR_COLOR(d.pickup_hour))
        .attr('opacity', 0.65)
        .on('mouseover', function(event, d) {
          d3.select(this).attr('r', 6).attr('opacity', 1);
          tooltip.style('opacity', 1)
            .html(`<span class="tooltip-title">${d.type.charAt(0).toUpperCase()+d.type.slice(1)} · ${d.date}</span>
                   <div class="tooltip-row">Hour: <strong>${d.pickup_hour}:00</strong></div>
                   <div class="tooltip-row">${AXES.distance_miles.label}: <strong>${AXES.distance_miles.fmt(+d.distance_miles)}</strong></div>
                   <div class="tooltip-row">${AXES.total_amount.label}: <strong>${AXES.total_amount.fmt(+d.total_amount)}</strong></div>
                   <div class="tooltip-row">${AXES.duration_min.label}: <strong>${AXES.duration_min.fmt(+d.duration_min)}</strong></div>
                   <div class="tooltip-row">${AXES.tip_pct.label}: <strong>${AXES.tip_pct.fmt(+d.tip_pct)}</strong></div>`);
          const r = container.getBoundingClientRect();
          tooltip.style('left', (event.clientX - r.left + 14) + 'px')
                 .style('top',  (event.clientY - r.top  - 44) + 'px');
        })
        .on('mousemove', function(event) {
          const r = container.getBoundingClientRect();
          tooltip.style('left', (event.clientX - r.left + 14) + 'px')
                 .style('top',  (event.clientY - r.top  - 44) + 'px');
        })
        .on('mouseout', function() {
          d3.select(this).attr('r', 3.5).attr('opacity', 0.65);
          tooltip.style('opacity', 0);
        });

    // Regression line (computed on all filtered pts for accuracy)
    const reg = linReg(pts, xKey, yKey);
    if (reg) {
      const [x0, x1] = xScale.domain();
      const ry0 = reg.slope * x0 + reg.intercept;
      const ry1 = reg.slope * x1 + reg.intercept;
      g.append('line')
        .attr('clip-path', `url(#${clipId})`)
        .attr('x1', xScale(x0)).attr('y1', yScale(ry0))
        .attr('x2', xScale(x1)).attr('y2', yScale(ry1))
        .attr('stroke', 'rgba(255,255,255,0.75)')
        .attr('stroke-width', 1.5)
        .attr('stroke-dasharray', '6,3')
        .attr('pointer-events', 'none');
      g.append('text')
        .attr('x', iw - 200).attr('y', 6)
        .attr('text-anchor', 'end')
        .attr('fill', 'rgba(255,255,255,0.8)')
        .attr('font-size', 28)
        .attr('font-weight', 600)
        .attr('font-family', 'var(--font-sans, system-ui)')
        .text(`R² = ${reg.r2.toFixed(2)}`);
    }

    // Axes
    g.append('g').attr('transform', `translate(0,${ih})`)
      .call(d3.axisBottom(xScale).ticks(6))
      .call(ax => ax.select('.domain').remove())
      .call(ax => ax.selectAll('text').attr('fill', '#586069').attr('font-size', 11)
                                     .attr('font-family', 'var(--font-sans, system-ui)'))
      .call(ax => ax.selectAll('.tick line').attr('stroke', '#2d3748'));

    g.append('g')
      .call(d3.axisLeft(yScale).ticks(5))
      .call(ax => ax.select('.domain').remove())
      .call(ax => ax.selectAll('text').attr('fill', '#586069').attr('font-size', 11)
                                     .attr('font-family', 'var(--font-sans, system-ui)'))
      .call(ax => ax.selectAll('.tick line').attr('stroke', '#2d3748'));

    // Axis labels
    g.append('text').attr('x', iw / 2).attr('y', ih + 38)
      .attr('text-anchor', 'middle').attr('fill', '#586069').attr('font-size', 11)
      .attr('font-family', 'var(--font-sans, system-ui)')
      .text(AXES[xKey]?.label);

    g.append('text').attr('transform', `rotate(-90)`)
      .attr('x', -ih / 2).attr('y', -50)
      .attr('text-anchor', 'middle').attr('fill', '#586069').attr('font-size', 11)
      .attr('font-family', 'var(--font-sans, system-ui)')
      .text(AXES[yKey]?.label);

    // Hour-of-day color legend (vertical gradient bar)
    const legH = 140;
    const legG  = g.append('g').attr('transform', `translate(${iw + 18}, ${(ih - legH) / 2})`);

    const defs  = svg.append('defs');
    const gradId = 'v4-hour-grad';
    const grad   = defs.append('linearGradient').attr('id', gradId)
      .attr('x1', 0).attr('y1', 0).attr('x2', 0).attr('y2', 1);  // vertical

    for (let h = 0; h <= 23; h++) {
      grad.append('stop')
        .attr('offset', `${(h / 23 * 100).toFixed(1)}%`)
        .attr('stop-color', HOUR_COLOR(h));
    }

    legG.append('rect').attr('width', 10).attr('height', legH).attr('rx', 3)
      .attr('fill', `url(#${gradId})`);
    legG.append('text').attr('x', 14).attr('y', 8)
      .attr('fill', '#586069').attr('font-size', 9)
      .attr('font-family', 'var(--font-sans, system-ui)').text('midnight');
    legG.append('text').attr('x', 14).attr('y', legH / 2 + 4)
      .attr('fill', '#586069').attr('font-size', 9)
      .attr('font-family', 'var(--font-sans, system-ui)').text('noon');
    legG.append('text').attr('x', 14).attr('y', legH - 2)
      .attr('fill', '#586069').attr('font-size', 9)
      .attr('font-family', 'var(--font-sans, system-ui)').text('11 pm');
    legG.append('text').attr('x', 14).attr('y', legH + 14)
      .attr('fill', '#586069').attr('font-size', 9)
      .attr('font-family', 'var(--font-sans, system-ui)').text('Hour of day');

  }

  // ── filterBus subscription ────────────────────────────────────────────────
  subscribe(s => {
    activeTaxiTypes = new Set(s.taxiTypes);
    dateRange       = s.dateRange;
    render();
  });

  let _debounce = null;
  new ResizeObserver(() => {
    clearTimeout(_debounce);
    _debounce = setTimeout(render, 60);
  }).observe(container);

  render();
}
