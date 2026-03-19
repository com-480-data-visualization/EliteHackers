/**
 * EDA Viz 2 — Day-of-week distribution grouped bar chart.
 * Renders grouped bars per vehicle type for each weekday.
 * @module ChartDayOfWeek
 */
import * as d3 from 'd3';
import { VEHICLE_COLORS, VEHICLE_LABELS } from '../utils/colors.js';
import { formatNumber } from '../utils/format.js';
import { DAY_NAMES } from '../utils/format.js';

const MARGIN = { top: 40, right: 120, bottom: 40, left: 80 };
const WEEKEND_BG = 'rgba(0,0,0,0.04)';

/**
 * Initialise the day-of-week grouped bar chart.
 * @param {HTMLElement} containerEl - DOM element to render into.
 * @param {Object} data - Full data object from the loader.
 * @param {Array<Object>} data.tripsByDow - Rows with vehicle_type,
 *   day_of_week (0=Mon … 6=Sun), day_name, trip_count.
 */
export function init(containerEl, data) {
  const raw = data.tripsByDow;
  if (!raw || !raw.length) return;

  const vehicleTypes = [...new Set(raw.map(d => d.vehicle_type))];
  const days = d3.range(7);

  const wrapper = d3.select(containerEl).html('');

  wrapper
    .append('h3')
    .style('margin', '0 0 8px 0')
    .text('Trip distribution by day of week');

  const width = containerEl.getBoundingClientRect().width || 800;
  const height = 420;
  const innerW = width - MARGIN.left - MARGIN.right;
  const innerH = height - MARGIN.top - MARGIN.bottom;

  const svg = wrapper
    .append('svg')
    .attr('width', width)
    .attr('height', height)
    .style('display', 'block');

  const g = svg.append('g').attr('transform', `translate(${MARGIN.left},${MARGIN.top})`);

  const x0 = d3.scaleBand().domain(days).range([0, innerW]).paddingInner(0.2).paddingOuter(0.1);

  const x1 = d3.scaleBand().domain(vehicleTypes).range([0, x0.bandwidth()]).padding(0.08);

  const maxY = d3.max(raw, d => d.trip_count) || 0;
  const y = d3.scaleLinear().domain([0, maxY * 1.05]).nice().range([innerH, 0]);

  const weekendG = g.append('g').attr('class', 'weekend-bg');
  [5, 6].forEach(dayIdx => {
    weekendG
      .append('rect')
      .attr('x', x0(dayIdx) - x0.step() * x0.paddingInner() / 2)
      .attr('y', 0)
      .attr('width', x0.step())
      .attr('height', innerH)
      .attr('fill', WEEKEND_BG);
  });

  g.append('g')
    .attr('transform', `translate(0,${innerH})`)
    .call(d3.axisBottom(x0).tickFormat(i => DAY_NAMES[i]));

  g.append('g').call(d3.axisLeft(y).ticks(6).tickFormat(formatNumber));

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

  wrapper.style('position', 'relative');

  const byDay = d3.group(raw, d => d.day_of_week);

  days.forEach(dayIdx => {
    const dayRows = byDay.get(dayIdx) || [];
    const dayG = g.append('g').attr('transform', `translate(${x0(dayIdx)},0)`);

    dayG
      .selectAll('rect')
      .data(dayRows, d => d.vehicle_type)
      .enter()
      .append('rect')
      .attr('x', d => x1(d.vehicle_type))
      .attr('width', x1.bandwidth())
      .attr('y', innerH)
      .attr('height', 0)
      .attr('fill', d => VEHICLE_COLORS[d.vehicle_type])
      .attr('rx', 2)
      .on('mouseenter', function (event, d) {
        d3.select(this).attr('opacity', 0.8);
        tooltip
          .style('display', null)
          .html(
            `<strong>${d.day_name || DAY_NAMES[d.day_of_week]}</strong><br/>` +
              `<span style="color:${VEHICLE_COLORS[d.vehicle_type]}">●</span> ` +
              `${VEHICLE_LABELS[d.vehicle_type] || d.vehicle_type}: ${formatNumber(d.trip_count)}`
          );
      })
      .on('mousemove', function (event) {
        const [mx, my] = d3.pointer(event, containerEl);
        tooltip.style('left', `${mx + 14}px`).style('top', `${my - 10}px`);
      })
      .on('mouseleave', function () {
        d3.select(this).attr('opacity', 1);
        tooltip.style('display', 'none');
      })
      .transition()
      .duration(600)
      .delay((_, i) => i * 60)
      .attr('y', d => y(d.trip_count))
      .attr('height', d => innerH - y(d.trip_count));
  });

  const legendG = svg
    .append('g')
    .attr('transform', `translate(${MARGIN.left + innerW + 14},${MARGIN.top})`);

  vehicleTypes.forEach((vt, i) => {
    const row = legendG.append('g').attr('transform', `translate(0,${i * 20})`);
    row.append('rect').attr('width', 12).attr('height', 12).attr('rx', 2).attr('fill', VEHICLE_COLORS[vt]);
    row
      .append('text')
      .attr('x', 17)
      .attr('y', 10)
      .attr('font-size', '11px')
      .text(VEHICLE_LABELS[vt] || vt);
  });
}
