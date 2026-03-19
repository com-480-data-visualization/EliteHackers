/**
 * EDA Viz 6 — Payment method breakdown (donut chart + summary table).
 * Animated arc entrance with vehicle type selector.
 * @module ChartPaymentSplit
 */
import * as d3 from 'd3';
import { VEHICLE_LABELS, PAYMENT_COLORS } from '../utils/colors.js';
import { formatNumber, formatPct, formatCompact } from '../utils/format.js';

const VEHICLE_OPTIONS = ['yellow', 'green', 'fhvhv'];

/**
 * Initialize the payment-split donut chart and table inside the given container.
 * @param {HTMLElement} containerEl - DOM element to render into.
 * @param {Object} data - Full data object from loader; expects `data.paymentShare`.
 */
export function init(containerEl, data) {
  const rows = data.paymentShare;
  if (!rows || rows.length === 0) {
    containerEl.textContent = 'No payment share data available.';
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

  const chartRow = document.createElement('div');
  chartRow.style.cssText = 'display:flex;flex-wrap:wrap;align-items:flex-start;gap:24px;';
  wrapper.appendChild(chartRow);

  const svgContainer = document.createElement('div');
  svgContainer.style.flexShrink = '0';
  chartRow.appendChild(svgContainer);

  const tableContainer = document.createElement('div');
  tableContainer.style.cssText = 'flex:1;min-width:220px;';
  chartRow.appendChild(tableContainer);

  const tooltip = document.createElement('div');
  tooltip.style.cssText =
    'position:absolute;pointer-events:none;background:rgba(0,0,0,0.85);color:#fff;' +
    'padding:8px 12px;border-radius:6px;font-size:13px;line-height:1.5;opacity:0;' +
    'transition:opacity 0.15s;white-space:nowrap;z-index:10;';
  wrapper.appendChild(tooltip);

  function getColor(paymentLabel) {
    return PAYMENT_COLORS[paymentLabel] || '#b0bec5';
  }

  function filterData(vehicle) {
    return rows
      .filter(d => d.vehicle_type === vehicle)
      .sort((a, b) => b.share_pct - a.share_pct);
  }

  function render() {
    svgContainer.innerHTML = '';
    tableContainer.innerHTML = '';

    const filtered = filterData(activeVehicle);
    if (filtered.length === 0) return;

    const totalTrips = d3.sum(filtered, d => d.trip_count);
    const size = Math.min(containerEl.clientWidth * 0.45, 340);
    const radius = size / 2;
    const innerRadius = radius * 0.55;

    const svg = d3.select(svgContainer)
      .append('svg')
      .attr('width', size)
      .attr('height', size);

    const g = svg.append('g')
      .attr('transform', `translate(${radius},${radius})`);

    const pie = d3.pie()
      .value(d => d.trip_count)
      .sort(null)
      .padAngle(0.015);

    const arc = d3.arc()
      .innerRadius(innerRadius)
      .outerRadius(radius - 4);

    const arcHover = d3.arc()
      .innerRadius(innerRadius)
      .outerRadius(radius);

    const arcs = pie(filtered);

    const arcZero = d3.arc()
      .innerRadius(innerRadius)
      .outerRadius(innerRadius);

    g.selectAll('.slice')
      .data(arcs)
      .join('path')
      .attr('class', 'slice')
      .attr('fill', d => getColor(d.data.payment_label))
      .attr('stroke', '#fff')
      .attr('stroke-width', 1.5)
      .attr('d', arcZero)
      .on('mouseenter', function (event, d) {
        d3.select(this)
          .transition().duration(150)
          .attr('d', arcHover);
        tooltip.innerHTML =
          `<strong>${d.data.payment_label}</strong><br>` +
          `Trips: ${formatNumber(d.data.trip_count)}<br>` +
          `Share: ${formatPct(d.data.share_pct)}`;
        tooltip.style.opacity = '1';
      })
      .on('mousemove', (event) => moveTooltip(event))
      .on('mouseleave', function () {
        d3.select(this)
          .transition().duration(150)
          .attr('d', arc);
        tooltip.style.opacity = '0';
      })
      .transition()
      .duration(700)
      .attrTween('d', function (d) {
        const interpolate = d3.interpolate({ startAngle: d.startAngle, endAngle: d.startAngle }, d);
        return t => arc(interpolate(t));
      });

    g.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '-0.2em')
      .style('font-size', '22px')
      .style('font-weight', '700')
      .style('fill', 'currentColor')
      .text(formatCompact(totalTrips));

    g.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '1.2em')
      .style('font-size', '12px')
      .style('fill', '#888')
      .text('total trips');

    buildTable(filtered);
  }

  function buildTable(filtered) {
    const table = document.createElement('table');
    table.style.cssText =
      'width:100%;border-collapse:collapse;font-size:13px;margin-top:8px;';

    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    ['Payment Method', 'Trips', 'Share'].forEach(txt => {
      const th = document.createElement('th');
      th.textContent = txt;
      th.style.cssText =
        'text-align:left;padding:6px 8px;border-bottom:2px solid #ddd;font-weight:600;font-size:12px;';
      if (txt === 'Trips' || txt === 'Share') th.style.textAlign = 'right';
      headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    filtered.forEach(d => {
      const tr = document.createElement('tr');
      tr.style.cssText = 'transition:background 0.15s;';
      tr.addEventListener('mouseenter', () => { tr.style.background = '#f5f5f5'; });
      tr.addEventListener('mouseleave', () => { tr.style.background = ''; });

      const tdLabel = document.createElement('td');
      tdLabel.style.cssText = 'padding:5px 8px;border-bottom:1px solid #eee;';
      const swatch = document.createElement('span');
      swatch.style.cssText =
        `display:inline-block;width:10px;height:10px;border-radius:2px;` +
        `background:${getColor(d.payment_label)};margin-right:6px;vertical-align:middle;`;
      tdLabel.appendChild(swatch);
      tdLabel.appendChild(document.createTextNode(d.payment_label));

      const tdCount = document.createElement('td');
      tdCount.textContent = formatNumber(d.trip_count);
      tdCount.style.cssText = 'padding:5px 8px;border-bottom:1px solid #eee;text-align:right;';

      const tdPct = document.createElement('td');
      tdPct.textContent = formatPct(d.share_pct);
      tdPct.style.cssText = 'padding:5px 8px;border-bottom:1px solid #eee;text-align:right;font-weight:600;';

      tr.appendChild(tdLabel);
      tr.appendChild(tdCount);
      tr.appendChild(tdPct);
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    tableContainer.appendChild(table);
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
