/**
 * EDA Viz 1 — Hourly trip demand multi-line chart.
 * Renders one line per vehicle type showing trip counts across 24 hours.
 * @module ChartHourlyDemand
 */
import * as d3 from 'd3';
import { VEHICLE_COLORS, VEHICLE_LABELS } from '../utils/colors.js';
import { formatHour, formatNumber } from '../utils/format.js';

const MARGIN = { top: 40, right: 120, bottom: 40, left: 80 };
const PEAK_HOURS = [
  { hour: 7, label: 'Morning peak' },
  { hour: 18, label: 'Evening peak' },
];

/**
 * Initialise the hourly-demand multi-line chart.
 * @param {HTMLElement} containerEl - DOM element to render into.
 * @param {Object} data - Full data object from the loader.
 * @param {Array<Object>} data.tripsByHour - Rows with vehicle_type, hour,
 *   trip_count, avg_fare, avg_duration_min.
 */
export function init(containerEl, data) {
  const raw = data.tripsByHour;
  if (!raw || !raw.length) return;

  const vehicleTypes = [...new Set(raw.map(d => d.vehicle_type))];
  const byVehicle = d3.group(raw, d => d.vehicle_type);

  const hours = d3.range(0, 24);
  const minHour = d3.min(raw, d => d.hour);
  const maxHour = d3.max(raw, d => d.hour);

  const activeTypes = new Set(vehicleTypes);

  const wrapper = d3.select(containerEl).html('');

  const titleBlock = wrapper.append('div').attr('class', 'chart-header');
  titleBlock.append('h3').style('margin', '0 0 2px 0').text('Trip demand by hour of day');
  titleBlock
    .append('p')
    .style('margin', '0 0 8px 0')
    .style('font-size', '13px')
    .style('color', '#666')
    .text(`Hours ${formatHour(minHour)}–${formatHour(maxHour)}, all available dates`);

  const controls = wrapper.append('div').style('margin-bottom', '6px');
  vehicleTypes.forEach(vt => {
    const lbl = controls
      .append('label')
      .style('margin-right', '14px')
      .style('cursor', 'pointer')
      .style('font-size', '13px');
    lbl
      .append('input')
      .attr('type', 'checkbox')
      .attr('checked', true)
      .style('accent-color', VEHICLE_COLORS[vt])
      .on('change', function () {
        if (this.checked) activeTypes.add(vt);
        else activeTypes.delete(vt);
        render();
      });
    lbl.append('span').text(' ' + (VEHICLE_LABELS[vt] || vt));
  });

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

  const x = d3.scaleLinear().domain([0, 23]).range([0, innerW]);
  const y = d3.scaleLinear().range([innerH, 0]);

  const xAxisG = g
    .append('g')
    .attr('transform', `translate(0,${innerH})`);

  const yAxisG = g.append('g');

  const line = d3
    .line()
    .x(d => x(d.hour))
    .y(d => y(d.trip_count))
    .curve(d3.curveMonotoneX);

  const peakG = g.append('g').attr('class', 'peaks');
  PEAK_HOURS.forEach(p => {
    peakG
      .append('line')
      .attr('x1', x(p.hour))
      .attr('x2', x(p.hour))
      .attr('y1', 0)
      .attr('y2', innerH)
      .attr('stroke', '#999')
      .attr('stroke-dasharray', '4 3')
      .attr('stroke-width', 1);
    peakG
      .append('text')
      .attr('x', x(p.hour) + 4)
      .attr('y', -6)
      .attr('fill', '#999')
      .attr('font-size', '11px')
      .text(p.label);
  });

  const linesG = g.append('g').attr('class', 'lines');

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

  const crosshair = g
    .append('line')
    .attr('y1', 0)
    .attr('y2', innerH)
    .attr('stroke', '#444')
    .attr('stroke-width', 0.8)
    .attr('stroke-dasharray', '3 2')
    .style('display', 'none');

  const overlay = g
    .append('rect')
    .attr('width', innerW)
    .attr('height', innerH)
    .attr('fill', 'none')
    .attr('pointer-events', 'all');

  overlay
    .on('mousemove', function (event) {
      const [mx] = d3.pointer(event, this);
      const hour = Math.round(x.invert(mx));
      const clampedHour = Math.max(0, Math.min(23, hour));
      crosshair
        .attr('x1', x(clampedHour))
        .attr('x2', x(clampedHour))
        .style('display', null);

      const entries = vehicleTypes
        .filter(vt => activeTypes.has(vt))
        .map(vt => {
          const pts = byVehicle.get(vt) || [];
          const pt = pts.find(d => d.hour === clampedHour);
          return { vt, count: pt ? pt.trip_count : 0 };
        })
        .sort((a, b) => b.count - a.count);

      tooltip
        .style('display', null)
        .style('left', `${MARGIN.left + x(clampedHour) + 12}px`)
        .style('top', `${MARGIN.top + 10}px`)
        .html(
          `<strong>${formatHour(clampedHour)}</strong><br/>` +
            entries
              .map(
                e =>
                  `<span style="color:${VEHICLE_COLORS[e.vt]};font-weight:600">●</span> ${VEHICLE_LABELS[e.vt] || e.vt}: ${formatNumber(e.count)}`
              )
              .join('<br/>')
        );
    })
    .on('mouseleave', () => {
      crosshair.style('display', 'none');
      tooltip.style('display', 'none');
    });

  const legendG = svg
    .append('g')
    .attr('transform', `translate(${MARGIN.left + innerW + 14},${MARGIN.top})`);

  vehicleTypes.forEach((vt, i) => {
    const row = legendG.append('g').attr('transform', `translate(0,${i * 20})`);
    row
      .append('rect')
      .attr('width', 14)
      .attr('height', 3)
      .attr('y', 5)
      .attr('fill', VEHICLE_COLORS[vt]);
    row
      .append('text')
      .attr('x', 18)
      .attr('y', 10)
      .attr('font-size', '11px')
      .text(VEHICLE_LABELS[vt] || vt);
  });

  function render() {
    const visible = vehicleTypes.filter(vt => activeTypes.has(vt));
    const visibleData = raw.filter(d => activeTypes.has(d.vehicle_type));
    const maxY = d3.max(visibleData, d => d.trip_count) || 0;
    y.domain([0, maxY * 1.05]).nice();

    xAxisG.call(
      d3
        .axisBottom(x)
        .tickValues([0, 3, 6, 9, 12, 15, 18, 21])
        .tickFormat(formatHour)
    );
    yAxisG.call(d3.axisLeft(y).ticks(6).tickFormat(formatNumber));

    const paths = linesG.selectAll('path.line').data(visible, d => d);
    paths.exit().remove();
    paths
      .enter()
      .append('path')
      .attr('class', 'line')
      .attr('fill', 'none')
      .attr('stroke-width', 2.2)
      .merge(paths)
      .attr('stroke', vt => VEHICLE_COLORS[vt])
      .transition()
      .duration(400)
      .attr('d', vt => {
        const pts = (byVehicle.get(vt) || []).slice().sort((a, b) => a.hour - b.hour);
        return line(pts);
      });
  }

  render();
}
