/**
 * EDA Viz 3 — Monthly trip volume stacked area chart with brush + zoom.
 * Renders a focus chart and a smaller context (overview) chart below it.
 * @module ChartMonthlyTrend
 */
import * as d3 from 'd3';
import { VEHICLE_COLORS, VEHICLE_LABELS } from '../utils/colors.js';
import { formatYearMonth, formatCompact } from '../utils/format.js';

const MARGIN = { top: 40, right: 120, bottom: 40, left: 80 };
const CTX_HEIGHT = 80;
const CTX_MARGIN = { top: 10, right: 120, bottom: 20, left: 80 };
const GAP = 24;
const COVID_START = '2020-03';
const COVID_END = '2020-06';

/**
 * Parse a "YYYY-MM" string into a Date (first day of that month).
 * @param {string} ym
 * @returns {Date}
 */
function parseYM(ym) {
  const [year, month] = ym.split('-').map(Number);
  return new Date(year, month - 1, 1);
}

/**
 * Initialise the monthly-trend stacked area chart with focus + context.
 * @param {HTMLElement} containerEl - DOM element to render into.
 * @param {Object} data - Full data object from the loader.
 * @param {Array<Object>} data.tripsByMonth - Rows with vehicle_type,
 *   year_month, trip_count.
 */
export function init(containerEl, data) {
  const raw = data.tripsByMonth;
  if (!raw || !raw.length) return;

  const vehicleTypes = [...new Set(raw.map(d => d.vehicle_type))];
  const allMonths = [...new Set(raw.map(d => d.year_month))].sort();

  const pivoted = allMonths.map(ym => {
    const row = { year_month: ym, date: parseYM(ym) };
    vehicleTypes.forEach(vt => {
      const match = raw.find(d => d.year_month === ym && d.vehicle_type === vt);
      row[vt] = match ? match.trip_count : 0;
    });
    return row;
  });

  const stack = d3.stack().keys(vehicleTypes).order(d3.stackOrderNone).offset(d3.stackOffsetNone);
  const series = stack(pivoted);

  const hasCovidRange =
    allMonths.some(m => m >= COVID_START) && allMonths.some(m => m <= COVID_END);

  const wrapper = d3.select(containerEl).html('');
  wrapper.style('position', 'relative');

  wrapper
    .append('h3')
    .style('margin', '0 0 8px 0')
    .text('Monthly trip volume trend');

  const width = containerEl.getBoundingClientRect().width || 800;
  const focusH = 360;
  const totalH = focusH + GAP + CTX_HEIGHT + CTX_MARGIN.top + CTX_MARGIN.bottom;
  const innerW = width - MARGIN.left - MARGIN.right;
  const innerFocusH = focusH - MARGIN.top - MARGIN.bottom;
  const innerCtxH = CTX_HEIGHT;

  const svg = wrapper
    .append('svg')
    .attr('width', width)
    .attr('height', totalH)
    .style('display', 'block');

  const defs = svg.append('defs');
  defs
    .append('clipPath')
    .attr('id', 'clip-focus')
    .append('rect')
    .attr('width', innerW)
    .attr('height', innerFocusH);

  const xDomain = d3.extent(pivoted, d => d.date);
  const xFocus = d3.scaleTime().domain(xDomain).range([0, innerW]);
  const xContext = d3.scaleTime().domain(xDomain).range([0, innerW]);

  const yMax =
    d3.max(series[series.length - 1], d => d[1]) || 0;
  const yFocus = d3.scaleLinear().domain([0, yMax * 1.05]).nice().range([innerFocusH, 0]);
  const yContext = d3.scaleLinear().domain(yFocus.domain()).range([innerCtxH, 0]);

  const area = d3
    .area()
    .x(d => xFocus(d.data.date))
    .y0(d => yFocus(d[0]))
    .y1(d => yFocus(d[1]))
    .curve(d3.curveMonotoneX);

  const areaCtx = d3
    .area()
    .x(d => xContext(d.data.date))
    .y0(d => yContext(d[0]))
    .y1(d => yContext(d[1]))
    .curve(d3.curveMonotoneX);

  const focus = svg
    .append('g')
    .attr('transform', `translate(${MARGIN.left},${MARGIN.top})`);

  const focusClip = focus.append('g').attr('clip-path', 'url(#clip-focus)');

  if (hasCovidRange) {
    const covidStart = parseYM(COVID_START);
    const covidEnd = parseYM(COVID_END);
    focusClip
      .append('rect')
      .attr('class', 'covid-band')
      .attr('x', xFocus(covidStart))
      .attr('width', xFocus(covidEnd) - xFocus(covidStart))
      .attr('y', 0)
      .attr('height', innerFocusH)
      .attr('fill', '#e0e0e0')
      .attr('opacity', 0.5);
    focusClip
      .append('text')
      .attr('class', 'covid-label')
      .attr('x', (xFocus(covidStart) + xFocus(covidEnd)) / 2)
      .attr('y', 16)
      .attr('text-anchor', 'middle')
      .attr('font-size', '11px')
      .attr('fill', '#666')
      .text('COVID-19 impact');
  }

  series.forEach(s => {
    focusClip
      .append('path')
      .datum(s)
      .attr('class', 'area-layer')
      .attr('fill', VEHICLE_COLORS[s.key])
      .attr('opacity', 0.75)
      .attr('d', area);
  });

  const xAxisFocus = focus
    .append('g')
    .attr('transform', `translate(0,${innerFocusH})`)
    .call(
      d3
        .axisBottom(xFocus)
        .ticks(d3.timeMonth.every(Math.max(1, Math.round(allMonths.length / 12))))
        .tickFormat(d3.timeFormat('%b %Y'))
    );

  const yAxisFocus = focus.append('g').call(
    d3.axisLeft(yFocus).ticks(6).tickFormat(formatCompact)
  );

  const tooltip = wrapper
    .append('div')
    .style('position', 'absolute')
    .style('pointer-events', 'none')
    .style('background', 'rgba(255,255,255,0.96)')
    .style('border', '1px solid #ccc')
    .style('border-radius', '4px')
    .style('padding', '8px 10px')
    .style('font-size', '12px')
    .style('box-shadow', '0 2px 6px rgba(0,0,0,.12)')
    .style('display', 'none')
    .style('z-index', '10');

  const bisect = d3.bisector(d => d.date).left;
  const hoverLine = focus
    .append('line')
    .attr('y1', 0)
    .attr('y2', innerFocusH)
    .attr('stroke', '#444')
    .attr('stroke-width', 0.8)
    .attr('stroke-dasharray', '3 2')
    .style('display', 'none');

  focus
    .append('rect')
    .attr('width', innerW)
    .attr('height', innerFocusH)
    .attr('fill', 'none')
    .attr('pointer-events', 'all')
    .on('mousemove', function (event) {
      const [mx] = d3.pointer(event, this);
      const dateAtMouse = xFocus.invert(mx);
      const idx = bisect(pivoted, dateAtMouse, 1);
      const d0 = pivoted[idx - 1];
      const d1 = pivoted[idx];
      const nearest =
        !d1 || dateAtMouse - d0.date < d1.date - dateAtMouse ? d0 : d1;

      hoverLine
        .attr('x1', xFocus(nearest.date))
        .attr('x2', xFocus(nearest.date))
        .style('display', null);

      const lines = vehicleTypes
        .map(vt => ({
          vt,
          count: nearest[vt],
        }))
        .sort((a, b) => b.count - a.count);

      tooltip
        .style('display', null)
        .style('left', `${MARGIN.left + xFocus(nearest.date) + 14}px`)
        .style('top', `${MARGIN.top + 10}px`)
        .html(
          `<strong>${formatYearMonth(nearest.year_month)}</strong><br/>` +
            lines
              .map(
                l =>
                  `<span style="color:${VEHICLE_COLORS[l.vt]};font-weight:600">●</span> ${VEHICLE_LABELS[l.vt] || l.vt}: ${formatCompact(l.count)}`
              )
              .join('<br/>')
        );
    })
    .on('mouseleave', () => {
      hoverLine.style('display', 'none');
      tooltip.style('display', 'none');
    });

  const ctxTop = focusH + GAP;
  const context = svg
    .append('g')
    .attr('transform', `translate(${CTX_MARGIN.left},${ctxTop + CTX_MARGIN.top})`);

  series.forEach(s => {
    context
      .append('path')
      .datum(s)
      .attr('fill', VEHICLE_COLORS[s.key])
      .attr('opacity', 0.55)
      .attr('d', areaCtx);
  });

  context
    .append('g')
    .attr('transform', `translate(0,${innerCtxH})`)
    .call(
      d3
        .axisBottom(xContext)
        .ticks(d3.timeMonth.every(Math.max(1, Math.round(allMonths.length / 8))))
        .tickFormat(d3.timeFormat('%b %y'))
    );

  const brush = d3
    .brushX()
    .extent([
      [0, 0],
      [innerW, innerCtxH],
    ])
    .on('brush end', brushed);

  const brushG = context.append('g').attr('class', 'brush').call(brush);

  function brushed(event) {
    const sel = event.selection;
    if (!sel) {
      xFocus.domain(xContext.domain());
    } else {
      xFocus.domain([xContext.invert(sel[0]), xContext.invert(sel[1])]);
    }

    focusClip.selectAll('.area-layer').attr('d', area);

    if (hasCovidRange) {
      const covidStart = parseYM(COVID_START);
      const covidEnd = parseYM(COVID_END);
      focusClip
        .select('.covid-band')
        .attr('x', xFocus(covidStart))
        .attr('width', Math.max(0, xFocus(covidEnd) - xFocus(covidStart)));
      focusClip
        .select('.covid-label')
        .attr('x', (xFocus(covidStart) + xFocus(covidEnd)) / 2);
    }

    xAxisFocus.call(
      d3
        .axisBottom(xFocus)
        .ticks(d3.timeMonth.every(Math.max(1, Math.round(allMonths.length / 12))))
        .tickFormat(d3.timeFormat('%b %Y'))
    );
  }

  const legendG = svg
    .append('g')
    .attr('transform', `translate(${MARGIN.left + innerW + 14},${MARGIN.top})`);

  vehicleTypes.forEach((vt, i) => {
    const row = legendG.append('g').attr('transform', `translate(0,${i * 20})`);
    row
      .append('rect')
      .attr('width', 12)
      .attr('height', 12)
      .attr('rx', 2)
      .attr('fill', VEHICLE_COLORS[vt])
      .attr('opacity', 0.75);
    row
      .append('text')
      .attr('x', 17)
      .attr('y', 10)
      .attr('font-size', '11px')
      .text(VEHICLE_LABELS[vt] || vt);
  });
}
