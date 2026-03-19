/**
 * EDA Viz 4 — Average fare by hour of day (bar + line combo chart).
 * Dual y-axes: bars for average fare (USD), line for average tip percentage (%).
 * @module ChartFareByHour
 */
import * as d3 from 'd3';
import { VEHICLE_LABELS, TIME_COLORS, getTimeCategory } from '../utils/colors.js';
import { formatUSD, formatPct, formatHour } from '../utils/format.js';

const MARGIN = { top: 40, right: 60, bottom: 50, left: 60 };
const VEHICLE_OPTIONS = ['yellow', 'green', 'fhvhv'];

/**
 * Initialize the fare-by-hour combo chart inside the given container.
 * @param {HTMLElement} containerEl - DOM element to render into.
 * @param {Object} data - Full data object from loader; expects `data.fareByHour`.
 */
export function init(containerEl, data) {
  const rows = data.fareByHour;
  if (!rows || rows.length === 0) {
    containerEl.textContent = 'No fare-by-hour data available.';
    return;
  }

  let activeVehicle = VEHICLE_OPTIONS[0];

  const wrapper = document.createElement('div');
  wrapper.style.position = 'relative';
  containerEl.appendChild(wrapper);

  const controls = document.createElement('div');
  controls.style.cssText = 'margin-bottom:12px;display:flex;align-items:center;gap:8px;';
  const label = document.createElement('label');
  label.textContent = 'Vehicle type: ';
  label.style.fontWeight = '600';
  const select = document.createElement('select');
  select.style.cssText = 'padding:4px 8px;border-radius:4px;border:1px solid #ccc;font-size:14px;';
  VEHICLE_OPTIONS.forEach(v => {
    const opt = document.createElement('option');
    opt.value = v;
    opt.textContent = VEHICLE_LABELS[v];
    select.appendChild(opt);
  });
  label.appendChild(select);
  controls.appendChild(label);
  wrapper.appendChild(controls);

  const svgContainer = document.createElement('div');
  wrapper.appendChild(svgContainer);

  const tooltip = document.createElement('div');
  tooltip.style.cssText =
    'position:absolute;pointer-events:none;background:rgba(0,0,0,0.85);color:#fff;' +
    'padding:8px 12px;border-radius:6px;font-size:13px;line-height:1.5;opacity:0;' +
    'transition:opacity 0.15s;white-space:nowrap;z-index:10;';
  wrapper.appendChild(tooltip);

  function filterData(vehicle) {
    return rows
      .filter(d => d.vehicle_type === vehicle)
      .sort((a, b) => a.hour - b.hour);
  }

  function render() {
    svgContainer.innerHTML = '';
    const width = containerEl.clientWidth || 700;
    const height = 400;
    const innerW = width - MARGIN.left - MARGIN.right;
    const innerH = height - MARGIN.top - MARGIN.bottom;
    const filtered = filterData(activeVehicle);
    if (filtered.length === 0) return;

    const svg = d3.select(svgContainer)
      .append('svg')
      .attr('width', width)
      .attr('height', height);

    const g = svg.append('g')
      .attr('transform', `translate(${MARGIN.left},${MARGIN.top})`);

    const xScale = d3.scaleBand()
      .domain(filtered.map(d => d.hour))
      .range([0, innerW])
      .padding(0.2);

    const maxFare = d3.max(filtered, d => d.avg_fare) || 1;
    const yLeft = d3.scaleLinear()
      .domain([0, maxFare * 1.15])
      .nice()
      .range([innerH, 0]);

    const maxTip = d3.max(filtered, d => d.avg_tip_pct) || 1;
    const yRight = d3.scaleLinear()
      .domain([0, maxTip * 1.3])
      .nice()
      .range([innerH, 0]);

    g.append('g')
      .attr('transform', `translate(0,${innerH})`)
      .call(
        d3.axisBottom(xScale)
          .tickFormat(d => formatHour(d))
      )
      .selectAll('text')
      .style('font-size', '11px');

    g.append('g')
      .call(d3.axisLeft(yLeft).ticks(6).tickFormat(d => formatUSD(d)))
      .selectAll('text')
      .style('font-size', '11px');

    g.append('g')
      .attr('transform', `translate(${innerW},0)`)
      .call(d3.axisRight(yRight).ticks(6).tickFormat(d => formatPct(d)))
      .selectAll('text')
      .style('font-size', '11px');

    svg.append('text')
      .attr('x', MARGIN.left - 40)
      .attr('y', MARGIN.top - 12)
      .style('font-size', '12px')
      .style('fill', '#666')
      .text('Avg Fare (USD)');

    svg.append('text')
      .attr('x', width - MARGIN.right - 30)
      .attr('y', MARGIN.top - 12)
      .style('font-size', '12px')
      .style('fill', '#666')
      .text('Tip %');

    g.selectAll('.fare-bar')
      .data(filtered)
      .join('rect')
      .attr('class', 'fare-bar')
      .attr('x', d => xScale(d.hour))
      .attr('width', xScale.bandwidth())
      .attr('y', innerH)
      .attr('height', 0)
      .attr('fill', d => TIME_COLORS[getTimeCategory(d.hour)])
      .attr('rx', 2)
      .on('mouseenter', (event, d) => showTooltip(event, d))
      .on('mousemove', (event) => moveTooltip(event))
      .on('mouseleave', hideTooltip)
      .transition()
      .duration(600)
      .delay((_, i) => i * 20)
      .attr('y', d => yLeft(d.avg_fare))
      .attr('height', d => innerH - yLeft(d.avg_fare));

    const line = d3.line()
      .x(d => xScale(d.hour) + xScale.bandwidth() / 2)
      .y(d => yRight(d.avg_tip_pct))
      .curve(d3.curveMonotoneX);

    const path = g.append('path')
      .datum(filtered)
      .attr('fill', 'none')
      .attr('stroke', '#e74c3c')
      .attr('stroke-width', 2.5)
      .attr('d', line);

    const totalLen = path.node().getTotalLength();
    path
      .attr('stroke-dasharray', `${totalLen} ${totalLen}`)
      .attr('stroke-dashoffset', totalLen)
      .transition()
      .duration(800)
      .attr('stroke-dashoffset', 0);

    g.selectAll('.tip-dot')
      .data(filtered)
      .join('circle')
      .attr('class', 'tip-dot')
      .attr('cx', d => xScale(d.hour) + xScale.bandwidth() / 2)
      .attr('cy', d => yRight(d.avg_tip_pct))
      .attr('r', 4)
      .attr('fill', '#e74c3c')
      .attr('stroke', '#fff')
      .attr('stroke-width', 1.5)
      .style('opacity', 0)
      .on('mouseenter', (event, d) => showTooltip(event, d))
      .on('mousemove', (event) => moveTooltip(event))
      .on('mouseleave', hideTooltip)
      .transition()
      .delay(800)
      .style('opacity', 1);

    const legendData = [
      { label: 'Night (0–5am)', color: TIME_COLORS.night },
      { label: 'Morning (6–11am)', color: TIME_COLORS.morning },
      { label: 'Afternoon (12–5pm)', color: TIME_COLORS.afternoon },
      { label: 'Evening (6–11pm)', color: TIME_COLORS.evening },
      { label: 'Tip %', color: '#e74c3c', isLine: true },
    ];

    const legend = g.append('g')
      .attr('transform', `translate(${innerW - 180}, -25)`);

    legendData.forEach((item, i) => {
      const lg = legend.append('g')
        .attr('transform', `translate(${i < 2 ? 0 : 110}, ${(i % 2 === 0 ? 0 : 14) + (i >= 4 ? 14 : 0)})`);
      if (item.isLine) {
        lg.append('line')
          .attr('x1', 0).attr('x2', 16).attr('y1', 5).attr('y2', 5)
          .attr('stroke', item.color).attr('stroke-width', 2.5);
        lg.append('circle')
          .attr('cx', 8).attr('cy', 5).attr('r', 3).attr('fill', item.color);
      } else {
        lg.append('rect')
          .attr('width', 12).attr('height', 10).attr('y', 0).attr('rx', 2)
          .attr('fill', item.color);
      }
      lg.append('text')
        .attr('x', 18).attr('y', 9)
        .style('font-size', '10px').style('fill', '#666')
        .text(item.label);
    });
  }

  function showTooltip(event, d) {
    tooltip.innerHTML =
      `<strong>${formatHour(d.hour)}</strong><br>` +
      `Avg fare: ${formatUSD(d.avg_fare)}<br>` +
      `Median fare: ${formatUSD(d.median_fare)}<br>` +
      `Avg tip: ${formatPct(d.avg_tip_pct)}`;
    tooltip.style.opacity = '1';
    moveTooltip(event);
  }

  function moveTooltip(event) {
    const rect = wrapper.getBoundingClientRect();
    let x = event.clientX - rect.left + 12;
    let y = event.clientY - rect.top - 10;
    const tw = tooltip.offsetWidth;
    if (x + tw > rect.width) x = x - tw - 24;
    tooltip.style.left = x + 'px';
    tooltip.style.top = y + 'px';
  }

  function hideTooltip() {
    tooltip.style.opacity = '0';
  }

  select.addEventListener('change', () => {
    activeVehicle = select.value;
    render();
  });

  render();

  let resizeTimer;
  new ResizeObserver(() => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(render, 150);
  }).observe(containerEl);
}
