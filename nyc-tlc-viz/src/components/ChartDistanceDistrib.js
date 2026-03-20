/**
 * EDA Viz 5 — Trip distance distribution (horizontal grouped bar chart).
 * Grouped by vehicle type with toggleable linear / log x-axis.
 * @module ChartDistanceDistrib
 */
import * as d3 from 'd3';
import { VEHICLE_COLORS, VEHICLE_LABELS } from '../utils/colors.js';
import { formatNumber, formatPct } from '../utils/format.js';

const MARGIN = { top: 40, right: 90, bottom: 50, left: 100 };
const BUCKET_ORDER = ['0-1 mi', '1-2 mi', '2-5 mi', '5-10 mi', '10-20 mi', '20+ mi'];
// `fhv` is the aggregated For-Hire Vehicle category present in the default pipeline dataset.
// `fhvhv` (high-volume FHV) may be excluded upstream due to size.
const VEHICLE_TYPES = ['yellow', 'green', 'fhv'];

/**
 * Initialize the trip-distance distribution chart inside the given container.
 * @param {HTMLElement} containerEl - DOM element to render into.
 * @param {Object} data - Full data object from loader; expects `data.distanceDistrib`.
 */
export function init(containerEl, data) {
  const rows = data.distanceDistrib;
  if (!rows || rows.length === 0) {
    containerEl.textContent = 'No distance distribution data available.';
    return;
  }

  let useLog = true;

  const wrapper = document.createElement('div');
  wrapper.style.position = 'relative';
  containerEl.appendChild(wrapper);

  const controls = document.createElement('div');
  controls.style.cssText = 'margin-bottom:12px;display:flex;align-items:center;gap:12px;';

  const toggleBtn = document.createElement('button');
  toggleBtn.style.cssText =
    'padding:6px 14px;border-radius:4px;border:1px solid #ccc;cursor:pointer;' +
    'font-size:13px;background:#f5f5f5;transition:background 0.2s;';
  toggleBtn.textContent = 'Switch to Linear';
  toggleBtn.addEventListener('mouseenter', () => { toggleBtn.style.background = '#e0e0e0'; });
  toggleBtn.addEventListener('mouseleave', () => { toggleBtn.style.background = '#f5f5f5'; });
  controls.appendChild(toggleBtn);
  wrapper.appendChild(controls);

  const svgContainer = document.createElement('div');
  wrapper.appendChild(svgContainer);

  const tooltip = document.createElement('div');
  tooltip.style.cssText =
    'position:absolute;pointer-events:none;background:rgba(0,0,0,0.85);color:#fff;' +
    'padding:8px 12px;border-radius:6px;font-size:13px;line-height:1.5;opacity:0;' +
    'transition:opacity 0.15s;white-space:nowrap;z-index:10;';
  wrapper.appendChild(tooltip);

  const vehicleTypesInData = [...new Set(rows.map(d => d.vehicle_type))].filter(v => VEHICLE_TYPES.includes(v));
  const totalByVehicle = {};
  vehicleTypesInData.forEach(v => {
    totalByVehicle[v] = d3.sum(rows.filter(d => d.vehicle_type === v), d => d.trip_count);
  });

  // Legend should reflect what's actually present in the export data.
  // This avoids showing FHV when there are no bars for it.
  const legendContainer = document.createElement('div');
  legendContainer.style.cssText = 'display:flex;gap:12px;margin-left:auto;';
  vehicleTypesInData.forEach(v => {
    const item = document.createElement('span');
    item.style.cssText = 'display:flex;align-items:center;gap:4px;font-size:12px;';
    const swatch = document.createElement('span');
    swatch.style.cssText = `width:12px;height:12px;border-radius:2px;background:${VEHICLE_COLORS[v]};display:inline-block;`;
    item.appendChild(swatch);
    item.appendChild(document.createTextNode(VEHICLE_LABELS[v] || v));
    legendContainer.appendChild(item);
  });
  controls.appendChild(legendContainer);

  function render() {
    svgContainer.innerHTML = '';
    const width = containerEl.clientWidth || 700;
    const barGroupHeight = vehicleTypesInData.length * 16 + 8;
    const height = MARGIN.top + MARGIN.bottom + BUCKET_ORDER.length * (barGroupHeight + 20);
    const innerW = width - MARGIN.left - MARGIN.right;
    const innerH = height - MARGIN.top - MARGIN.bottom;

    const svg = d3.select(svgContainer)
      .append('svg')
      .attr('width', width)
      .attr('height', height);

    const g = svg.append('g')
      .attr('transform', `translate(${MARGIN.left},${MARGIN.top})`);

    const y0 = d3.scaleBand()
      .domain(BUCKET_ORDER)
      .range([0, innerH])
      .paddingInner(0.25)
      .paddingOuter(0.1);

    const y1 = d3.scaleBand()
      .domain(vehicleTypesInData)
      .range([0, y0.bandwidth()])
      .padding(0.1);

    const maxCount = d3.max(rows, d => d.trip_count) || 1;
    const xScale = useLog
      ? d3.scaleLog().domain([1, maxCount * 1.2]).range([0, innerW]).clamp(true)
      : d3.scaleLinear().domain([0, maxCount * 1.1]).nice().range([0, innerW]);

    g.append('g')
      .attr('transform', `translate(0,${innerH})`)
      .call(
        d3.axisBottom(xScale)
          .ticks(6, useLog ? '~s' : 's')
          .tickFormat(d => formatNumber(d))
      )
      .selectAll('text')
      .style('font-size', '11px');

    g.append('g')
      .call(d3.axisLeft(y0))
      .selectAll('text')
      .style('font-size', '12px');

    svg.append('text')
      .attr('x', width / 2)
      .attr('y', height - 6)
      .attr('text-anchor', 'middle')
      .style('font-size', '12px')
      .style('fill', '#666')
      .text(useLog ? 'Trip count (log scale)' : 'Trip count');

    BUCKET_ORDER.forEach(bucket => {
      const bucketG = g.append('g')
        .attr('transform', `translate(0,${y0(bucket)})`);

      vehicleTypesInData.forEach(v => {
        const row = rows.find(d => d.vehicle_type === v && d.distance_bucket === bucket);
        const count = row ? row.trip_count : 0;
        const pct = totalByVehicle[v] > 0 ? (count / totalByVehicle[v]) * 100 : 0;
        const barW = count > 0 ? Math.max(xScale(useLog ? Math.max(count, 1) : count), 1) : 0;

        bucketG.append('rect')
          .attr('x', 0)
          .attr('y', y1(v))
          .attr('height', y1.bandwidth())
          .attr('width', 0)
          .attr('fill', VEHICLE_COLORS[v])
          .attr('rx', 2)
          .on('mouseenter', (event) => {
            tooltip.innerHTML =
              `<strong>${bucket}</strong><br>` +
              `${VEHICLE_LABELS[v]}<br>` +
              `Trips: ${formatNumber(count)}<br>` +
              `Share: ${formatPct(pct)}`;
            tooltip.style.opacity = '1';
          })
          .on('mousemove', (event) => moveTooltip(event))
          .on('mouseleave', () => { tooltip.style.opacity = '0'; })
          .transition()
          .duration(600)
          .delay(BUCKET_ORDER.indexOf(bucket) * 60)
          .attr('width', barW);

        if (count > 0) {
          bucketG.append('text')
            .attr('x', barW + 6)
            .attr('y', y1(v) + y1.bandwidth() / 2)
            .attr('dy', '0.35em')
            .style('font-size', '10px')
            .style('fill', '#666')
            .style('opacity', 0)
            .text(formatPct(pct))
            .transition()
            .delay(600 + BUCKET_ORDER.indexOf(bucket) * 60)
            .duration(200)
            .style('opacity', 1);
        }
      });
    });
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

  toggleBtn.addEventListener('click', () => {
    useLog = !useLog;
    toggleBtn.textContent = useLog ? 'Switch to Linear' : 'Switch to Log';
    render();
  });

  render();

  let resizeTimer;
  new ResizeObserver(() => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(render, 150);
  }).observe(containerEl);
}
