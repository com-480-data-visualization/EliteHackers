/**
 * EDA Viz 8 — Borough origin-destination heatmap (matrix).
 * D3.js grid heatmap showing trip counts between borough pairs.
 * @module ChartBoroughOD
 */
import * as d3 from 'd3';
import { HEATMAP_SCALE, VEHICLE_LABELS } from '../utils/colors.js';
import { formatCompact, formatNumber, formatPct } from '../utils/format.js';

const BOROUGHS = ['Manhattan', 'Brooklyn', 'Queens', 'Bronx', 'Staten Island', 'EWR'];
const MARGIN = { top: 90, right: 20, bottom: 20, left: 110 };
const TOOLTIP_BG = 'rgba(30,30,30,0.92)';

/**
 * Initialize the borough O-D heatmap.
 * @param {HTMLElement} containerEl - DOM element to render into.
 * @param {Object} data - Loaded dataset; expects `data.boroughOD`.
 */
export function init(containerEl, data) {
  const rows = data.boroughOD || [];
  containerEl.innerHTML = '';
  containerEl.style.position = 'relative';

  const vehicleTypes = [...new Set(rows.map((r) => r.vehicle_type))].filter(Boolean);
  let activeVehicle = vehicleTypes[0] || 'yellow';

  const controls = document.createElement('div');
  controls.style.cssText = 'margin-bottom:10px;display:flex;align-items:center;gap:8px;';
  containerEl.appendChild(controls);

  const label = document.createElement('label');
  label.textContent = 'Vehicle type: ';
  label.style.cssText = 'font-size:13px;font-weight:500;';
  controls.appendChild(label);

  const select = document.createElement('select');
  select.style.cssText =
    'padding:5px 10px;border:1px solid #ccc;border-radius:4px;font-size:13px;background:#fff;';
  for (const vt of vehicleTypes) {
    const opt = document.createElement('option');
    opt.value = vt;
    opt.textContent = VEHICLE_LABELS[vt] || vt;
    select.appendChild(opt);
  }
  controls.appendChild(select);

  const chartDiv = document.createElement('div');
  containerEl.appendChild(chartDiv);

  const tooltip = document.createElement('div');
  tooltip.style.cssText =
    `position:absolute;pointer-events:none;opacity:0;transition:opacity 0.15s;` +
    `background:${TOOLTIP_BG};color:#fff;padding:8px 12px;border-radius:6px;` +
    `font-size:13px;line-height:1.5;z-index:10;white-space:nowrap;`;
  containerEl.appendChild(tooltip);

  select.addEventListener('change', () => {
    activeVehicle = select.value;
    render();
  });

  render();

  const ro = new ResizeObserver(() => render());
  ro.observe(containerEl);

  function getFilteredData() {
    return rows.filter((r) => r.vehicle_type === activeVehicle);
  }

  function buildMatrix(filtered) {
    const matrix = {};
    let total = 0;
    for (const b1 of BOROUGHS) {
      matrix[b1] = {};
      for (const b2 of BOROUGHS) {
        matrix[b1][b2] = 0;
      }
    }
    for (const r of filtered) {
      if (matrix[r.PU_borough] && matrix[r.PU_borough][r.DO_borough] !== undefined) {
        matrix[r.PU_borough][r.DO_borough] += r.trip_count;
      }
      total += r.trip_count;
    }
    return { matrix, total };
  }

  function render() {
    chartDiv.innerHTML = '';
    const filtered = getFilteredData();
    const { matrix, total } = buildMatrix(filtered);

    const containerWidth = containerEl.clientWidth;
    const cellSizeTarget = Math.max(
      40,
      Math.min(70, (containerWidth - MARGIN.left - MARGIN.right) / BOROUGHS.length)
    );
    const gridSize = cellSizeTarget;
    const width = MARGIN.left + gridSize * BOROUGHS.length + MARGIN.right;
    const height = MARGIN.top + gridSize * BOROUGHS.length + MARGIN.bottom;

    let maxVal = 0;
    for (const b1 of BOROUGHS) {
      for (const b2 of BOROUGHS) {
        if (matrix[b1][b2] > maxVal) maxVal = matrix[b1][b2];
      }
    }

    const colorScale = d3.scaleLinear()
      .domain(HEATMAP_SCALE.map((_, i) => (i / (HEATMAP_SCALE.length - 1)) * maxVal))
      .range(HEATMAP_SCALE)
      .interpolate(d3.interpolateRgb)
      .clamp(true);

    const svg = d3.select(chartDiv)
      .append('svg')
      .attr('width', width)
      .attr('height', height);

    const g = svg.append('g').attr('transform', `translate(${MARGIN.left},${MARGIN.top})`);

    svg.append('text')
      .attr('x', MARGIN.left + (gridSize * BOROUGHS.length) / 2)
      .attr('y', 16)
      .attr('text-anchor', 'middle')
      .attr('font-size', '11px')
      .attr('fill', '#888')
      .text('Destination Borough →');

    svg.append('text')
      .attr('transform', `translate(14,${MARGIN.top + (gridSize * BOROUGHS.length) / 2}) rotate(-90)`)
      .attr('text-anchor', 'middle')
      .attr('font-size', '11px')
      .attr('fill', '#888')
      .text('← Origin Borough');

    g.selectAll('.col-label')
      .data(BOROUGHS)
      .join('text')
      .attr('x', (_, i) => i * gridSize + gridSize / 2)
      .attr('y', -8)
      .attr('text-anchor', 'middle')
      .attr('font-size', '12px')
      .attr('fill', '#333')
      .text((d) => d);

    g.selectAll('.row-label')
      .data(BOROUGHS)
      .join('text')
      .attr('x', -10)
      .attr('y', (_, i) => i * gridSize + gridSize / 2)
      .attr('dy', '0.35em')
      .attr('text-anchor', 'end')
      .attr('font-size', '12px')
      .attr('fill', '#333')
      .text((d) => d);

    const cells = [];
    for (let ri = 0; ri < BOROUGHS.length; ri++) {
      for (let ci = 0; ci < BOROUGHS.length; ci++) {
        const origin = BOROUGHS[ri];
        const dest = BOROUGHS[ci];
        cells.push({ origin, dest, ri, ci, value: matrix[origin][dest] });
      }
    }

    const cellGroups = g.selectAll('.cell')
      .data(cells)
      .join('g')
      .attr('class', 'cell')
      .attr('transform', (d) => `translate(${d.ci * gridSize},${d.ri * gridSize})`);

    cellGroups.append('rect')
      .attr('width', gridSize - 2)
      .attr('height', gridSize - 2)
      .attr('rx', 3)
      .attr('fill', (d) => (d.value === 0 ? '#f5f5f5' : colorScale(d.value)))
      .attr('stroke', (d) => (d.origin === d.dest ? '#555' : '#fff'))
      .attr('stroke-width', (d) => (d.origin === d.dest ? 1.5 : 0.5))
      .attr('stroke-dasharray', (d) => (d.origin === d.dest ? '4,3' : 'none'));

    cellGroups.append('text')
      .attr('x', (gridSize - 2) / 2)
      .attr('y', (gridSize - 2) / 2)
      .attr('dy', '0.35em')
      .attr('text-anchor', 'middle')
      .attr('font-size', gridSize < 55 ? '10px' : '12px')
      .attr('fill', (d) => {
        if (d.value === 0) return '#bbb';
        const luminance = d3.hsl(colorScale(d.value)).l;
        return luminance < 0.55 ? '#fff' : '#333';
      })
      .text((d) => (d.value === 0 ? '—' : formatCompact(d.value)));

    cellGroups
      .on('mouseenter', function (event, d) {
        d3.select(this).select('rect').attr('stroke', '#333').attr('stroke-width', 2);
        const pct = total > 0 ? (d.value / total) * 100 : 0;
        tooltip.innerHTML =
          `<strong>${d.origin} → ${d.dest}</strong><br>` +
          `Trips: ${formatNumber(d.value)}<br>` +
          `Share: ${formatPct(pct)}`;
        tooltip.style.opacity = '1';
        positionTooltip(event);
      })
      .on('mousemove', (event) => positionTooltip(event))
      .on('mouseleave', function (event, d) {
        const isDiag = d.origin === d.dest;
        d3.select(this).select('rect')
          .attr('stroke', isDiag ? '#555' : '#fff')
          .attr('stroke-width', isDiag ? 1.5 : 0.5);
        tooltip.style.opacity = '0';
      });
  }

  function positionTooltip(event) {
    const rect = containerEl.getBoundingClientRect();
    let x = event.clientX - rect.left + 14;
    let y = event.clientY - rect.top + 14;
    const tw = tooltip.offsetWidth;
    const th = tooltip.offsetHeight;
    if (x + tw > rect.width) x = x - tw - 28;
    if (y + th > rect.height) y = y - th - 28;
    tooltip.style.left = x + 'px';
    tooltip.style.top = y + 'px';
  }
}
