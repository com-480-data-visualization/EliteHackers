/**
 * V5 — Annotated Event Timeline.
 * Reads: state.dateRange, state.taxiTypes
 * Writes: filterBus.update({ dateRange }) on event marker click
 */

import * as d3 from 'd3';
import { update, subscribe, getState } from '../state/filterBus.js';

const CATEGORY_COLORS = {
  disruption: '#e05252',
  recovery: '#52b788',
  weather: '#4da6ff',
  policy: '#f5a623',
  holiday: '#c084fc',
};

const TYPES = ['yellow', 'green', 'fhv'];

// App-wide valid range. daily_volume.json contains stray dates outside 2015–2024
// (parser leftovers from raw TLC files); clamp here so V5 doesn't span 2001–2098.
const APP_RANGE = [new Date('2015-01-01'), new Date('2024-12-31')];

let _container, _dailyData, _events;

export function init(container, { dailyData, events }) {
  _container = container;
  _dailyData = dailyData;
  _events = events;
  _render(getState());
  subscribe(_render);
}

function _render(state) {
  const el = d3.select(_container);
  el.selectAll('*').remove();

  const rect = _container.getBoundingClientRect();
  const W = Math.max(rect.width || 900, 600);
  const H = 280;
  const M = { top: 32, right: 24, bottom: 48, left: 68 };
  const iw = W - M.left - M.right;
  const ih = H - M.top - M.bottom;

  const parse = d3.timeParse('%Y-%m-%d');

  // Aggregate daily data: sum across active types
  const activeTypes = TYPES.filter(t => state.taxiTypes.has(t));
  const byDate = d3.rollup(
    _dailyData.filter(d => activeTypes.includes(d.type)),
    vs => d3.sum(vs, v => +v.trips),
    d => d.date
  );

  let daily = Array.from(byDate, ([dateStr, trips]) => ({
    date: parse(dateStr),
    trips,
  })).filter(d => d.date && d.date >= APP_RANGE[0] && d.date <= APP_RANGE[1])
    .sort((a, b) => a.date - b.date);

  // Determine x-domain: user's brushed range (clamped) or the full app range.
  let xDomain = APP_RANGE;
  if (state.dateRange) {
    const d0 = new Date(Math.max(+APP_RANGE[0], +new Date(state.dateRange[0])));
    const d1 = new Date(Math.min(+APP_RANGE[1], +new Date(state.dateRange[1])));
    if (d1 > d0) {
      xDomain = [d0, d1];
      daily = daily.filter(d => d.date >= d0 && d.date <= d1);
    }
  }

  if (!daily.length) return;

  const xScale = d3.scaleTime()
    .domain(xDomain)
    .range([0, iw]);

  const yMax = d3.max(daily, d => d.trips) || 1;
  const yScale = d3.scaleLinear().domain([0, yMax * 1.1]).range([ih, 0]).nice();

  const svg = d3.select(_container).append('svg').attr('width', W).attr('height', H);
  const g = svg.append('g').attr('transform', `translate(${M.left},${M.top})`);

  // Gridlines
  g.append('g').attr('class', 'gridlines')
    .call(d3.axisLeft(yScale).tickSize(-iw).tickFormat(''))
    .select('.domain').remove();
  g.selectAll('.gridlines line').attr('class', 'gridline');

  // Line
  const line = d3.line()
    .x(d => xScale(d.date))
    .y(d => yScale(d.trips))
    .curve(d3.curveMonotoneX);

  g.append('path').datum(daily)
    .attr('fill', 'none')
    .attr('stroke', 'var(--accent)')
    .attr('stroke-width', 1.5)
    .attr('d', line);

  // Area fill
  const area = d3.area()
    .x(d => xScale(d.date))
    .y0(ih).y1(d => yScale(d.trips))
    .curve(d3.curveMonotoneX);

  g.append('path').datum(daily)
    .attr('fill', 'var(--accent)')
    .attr('fill-opacity', 0.08)
    .attr('d', area);

  // Axes
  g.append('g').attr('class', 'axis axis--x')
    .attr('transform', `translate(0,${ih})`)
    .call(d3.axisBottom(xScale).ticks(d3.timeYear.every(1)).tickFormat(d3.timeFormat('%Y')))
    .call(ax => ax.select('.domain').remove())
    .selectAll('text').attr('font-size', 11);

  g.append('g').attr('class', 'axis axis--y')
    .call(d3.axisLeft(yScale)
      .tickFormat(d => d >= 1e6 ? `${(d / 1e6).toFixed(1)}M` : d >= 1e3 ? `${(d / 1e3).toFixed(0)}k` : d))
    .call(ax => ax.select('.domain').remove());

  // Event markers
  const visibleEvents = _events.filter(ev => {
    const d = parse(ev.date);
    return d >= xDomain[0] && d <= xDomain[1];
  });

  const tooltip = d3.select(_container).append('div').attr('class', 'tooltip')
    .style('opacity', 0).style('position', 'absolute');

  visibleEvents.forEach(ev => {
    const evDate = parse(ev.date);
    const cx = xScale(evDate);
    const color = CATEGORY_COLORS[ev.category] || '#888';

    const mg = g.append('g').attr('class', 'event-marker')
      .attr('transform', `translate(${cx}, 0)`);

    mg.append('line')
      .attr('y1', 0).attr('y2', ih)
      .attr('stroke', color)
      .attr('stroke-opacity', 0.5)
      .attr('stroke-dasharray', '3,3')
      .attr('stroke-width', 1.5);

    mg.append('circle').attr('cy', -8).attr('r', 5)
      .attr('fill', color).attr('stroke', 'none');

    mg.on('mouseover', function(event) {
      tooltip.style('opacity', 1)
        .html(`<div class="tooltip-title" style="color:${color}">${ev.label}</div>
               <div style="color:var(--text-secondary);font-size:0.78rem">${ev.date}</div>
               <div style="margin-top:6px;max-width:220px;white-space:normal">${ev.description}</div>`)
        .style('left', `${event.offsetX + 12}px`)
        .style('top', `${event.offsetY - 30}px`);
    }).on('mouseout', () => tooltip.style('opacity', 0))
      .on('click', () => {
        const d0 = evDate;
        const d1 = ev.end_date
          ? parse(ev.end_date)
          : new Date(evDate.getTime() + 30 * 24 * 60 * 60 * 1000);
        update({ dateRange: [d0, d1] });
      });
  });

  // Category legend
  const categories = [...new Set(visibleEvents.map(e => e.category))];
  const legendG = g.append('g').attr('transform', `translate(0, ${ih + 32})`);
  categories.forEach((cat, i) => {
    const item = legendG.append('g').attr('transform', `translate(${i * 120}, 0)`);
    item.append('circle').attr('cx', 5).attr('cy', 5).attr('r', 5)
      .attr('fill', CATEGORY_COLORS[cat] || '#888');
    item.append('text').attr('x', 14).attr('y', 9)
      .attr('fill', 'var(--text-muted)').attr('font-size', 10)
      .text(cat.charAt(0).toUpperCase() + cat.slice(1));
  });
}
