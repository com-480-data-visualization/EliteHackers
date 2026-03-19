/**
 * EDA Viz 9 — Average trip speed by hour (area + line chart).
 * D3.js line chart with shaded bands between avg and median speed.
 * @module ChartSpeedByHour
 */
import * as d3 from 'd3';
import { VEHICLE_COLORS, VEHICLE_LABELS } from '../utils/colors.js';
import { formatHour } from '../utils/format.js';

const VEHICLE_KEYS = ['yellow', 'green', 'fhvhv'];
const MARGIN = { top: 30, right: 30, bottom: 46, left: 52 };
const CONGESTED_SPEED = 15;
const TOOLTIP_BG = 'rgba(30,30,30,0.92)';

/**
 * Initialize the speed-by-hour area + line chart.
 * @param {HTMLElement} containerEl - DOM element to render into.
 * @param {Object} data - Loaded dataset; expects `data.speedByHour`.
 */
export function init(containerEl, data) {
  const rows = data.speedByHour || [];
  containerEl.innerHTML = '';
  containerEl.style.position = 'relative';

  const visible = {};
  for (const vt of VEHICLE_KEYS) visible[vt] = true;

  const controls = document.createElement('div');
  controls.style.cssText = 'margin-bottom:8px;display:flex;flex-wrap:wrap;gap:12px;';
  containerEl.appendChild(controls);

  const checkboxes = {};
  for (const vt of VEHICLE_KEYS) {
    const lbl = document.createElement('label');
    lbl.style.cssText =
      'display:flex;align-items:center;gap:5px;font-size:13px;cursor:pointer;user-select:none;';

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = true;
    cb.style.accentColor = VEHICLE_COLORS[vt];
    checkboxes[vt] = cb;

    const swatch = document.createElement('span');
    swatch.style.cssText =
      `display:inline-block;width:12px;height:12px;border-radius:2px;background:${VEHICLE_COLORS[vt]};`;

    lbl.appendChild(cb);
    lbl.appendChild(swatch);
    lbl.appendChild(document.createTextNode(VEHICLE_LABELS[vt] || vt));
    controls.appendChild(lbl);

    cb.addEventListener('change', () => {
      visible[vt] = cb.checked;
      render();
    });
  }

  const chartDiv = document.createElement('div');
  containerEl.appendChild(chartDiv);

  const tooltip = document.createElement('div');
  tooltip.style.cssText =
    `position:absolute;pointer-events:none;opacity:0;transition:opacity 0.15s;` +
    `background:${TOOLTIP_BG};color:#fff;padding:8px 12px;border-radius:6px;` +
    `font-size:13px;line-height:1.6;z-index:10;white-space:nowrap;`;
  containerEl.appendChild(tooltip);

  render();

  const ro = new ResizeObserver(() => render());
  ro.observe(containerEl);

  function getSeriesData() {
    const byVehicle = {};
    for (const vt of VEHICLE_KEYS) byVehicle[vt] = [];
    for (const r of rows) {
      if (byVehicle[r.vehicle_type]) {
        byVehicle[r.vehicle_type].push(r);
      }
    }
    for (const vt of VEHICLE_KEYS) {
      byVehicle[vt].sort((a, b) => a.hour - b.hour);
    }
    return byVehicle;
  }

  function render() {
    chartDiv.innerHTML = '';

    const containerWidth = containerEl.clientWidth;
    const width = Math.max(400, containerWidth);
    const height = Math.max(300, Math.min(450, width * 0.5));
    const innerW = width - MARGIN.left - MARGIN.right;
    const innerH = height - MARGIN.top - MARGIN.bottom;

    const series = getSeriesData();

    let yMax = 0;
    for (const vt of VEHICLE_KEYS) {
      if (!visible[vt]) continue;
      for (const d of series[vt]) {
        if (d.avg_speed_mph > yMax) yMax = d.avg_speed_mph;
        if (d.median_speed_mph > yMax) yMax = d.median_speed_mph;
      }
    }
    yMax = Math.max(yMax * 1.1, CONGESTED_SPEED * 1.5);

    const xScale = d3.scaleLinear().domain([0, 23]).range([0, innerW]);
    const yScale = d3.scaleLinear().domain([0, yMax]).range([innerH, 0]).nice();

    const svg = d3.select(chartDiv)
      .append('svg')
      .attr('width', width)
      .attr('height', height);

    const g = svg.append('g').attr('transform', `translate(${MARGIN.left},${MARGIN.top})`);

    const xAxis = d3.axisBottom(xScale)
      .ticks(24)
      .tickFormat((d) => formatHour(d));
    const yAxis = d3.axisLeft(yScale).ticks(6).tickFormat((d) => d + ' mph');

    g.append('g')
      .attr('transform', `translate(0,${innerH})`)
      .call(xAxis)
      .selectAll('text')
      .attr('font-size', '11px');

    g.append('g')
      .call(yAxis)
      .selectAll('text')
      .attr('font-size', '11px');

    g.append('text')
      .attr('x', innerW / 2)
      .attr('y', innerH + 38)
      .attr('text-anchor', 'middle')
      .attr('font-size', '12px')
      .attr('fill', '#666')
      .text('Hour of Day');

    g.append('text')
      .attr('transform', `translate(-38,${innerH / 2}) rotate(-90)`)
      .attr('text-anchor', 'middle')
      .attr('font-size', '12px')
      .attr('fill', '#666')
      .text('Speed (mph)');

    g.append('line')
      .attr('x1', 0)
      .attr('x2', innerW)
      .attr('y1', yScale(CONGESTED_SPEED))
      .attr('y2', yScale(CONGESTED_SPEED))
      .attr('stroke', '#e74c3c')
      .attr('stroke-width', 1.2)
      .attr('stroke-dasharray', '6,4')
      .attr('opacity', 0.7);

    g.append('text')
      .attr('x', innerW - 4)
      .attr('y', yScale(CONGESTED_SPEED) - 6)
      .attr('text-anchor', 'end')
      .attr('font-size', '11px')
      .attr('fill', '#e74c3c')
      .text('Typical congested speed (15 mph)');

    const areaGen = (avgKey, medKey) =>
      d3.area()
        .x((d) => xScale(d.hour))
        .y0((d) => yScale(d[medKey]))
        .y1((d) => yScale(d[avgKey]))
        .curve(d3.curveMonotoneX);

    const lineGen = (key) =>
      d3.line()
        .x((d) => xScale(d.hour))
        .y((d) => yScale(d[key]))
        .curve(d3.curveMonotoneX);

    for (const vt of VEHICLE_KEYS) {
      if (!visible[vt] || series[vt].length === 0) continue;
      const color = VEHICLE_COLORS[vt];

      g.append('path')
        .datum(series[vt])
        .attr('d', areaGen('avg_speed_mph', 'median_speed_mph'))
        .attr('fill', color)
        .attr('opacity', 0.15);

      g.append('path')
        .datum(series[vt])
        .attr('d', lineGen('avg_speed_mph'))
        .attr('fill', 'none')
        .attr('stroke', color)
        .attr('stroke-width', 2);

      g.append('path')
        .datum(series[vt])
        .attr('d', lineGen('median_speed_mph'))
        .attr('fill', 'none')
        .attr('stroke', color)
        .attr('stroke-width', 1.5)
        .attr('stroke-dasharray', '4,3');
    }

    const crosshairLine = g.append('line')
      .attr('y1', 0)
      .attr('y2', innerH)
      .attr('stroke', '#999')
      .attr('stroke-width', 0.8)
      .attr('stroke-dasharray', '3,3')
      .style('display', 'none');

    const crosshairDots = g.append('g').style('display', 'none');
    for (const vt of VEHICLE_KEYS) {
      crosshairDots.append('circle')
        .attr('r', 4.5)
        .attr('fill', VEHICLE_COLORS[vt])
        .attr('stroke', '#fff')
        .attr('stroke-width', 1.5)
        .attr('data-vt', vt);
    }

    const overlay = g.append('rect')
      .attr('width', innerW)
      .attr('height', innerH)
      .attr('fill', 'none')
      .attr('pointer-events', 'all');

    overlay
      .on('mouseenter', () => {
        crosshairLine.style('display', null);
        crosshairDots.style('display', null);
        tooltip.style.opacity = '1';
      })
      .on('mousemove', function (event) {
        const [mx] = d3.pointer(event);
        const hour = Math.round(xScale.invert(mx));
        const clampedHour = Math.max(0, Math.min(23, hour));
        const xPos = xScale(clampedHour);

        crosshairLine.attr('x1', xPos).attr('x2', xPos);

        let tooltipHtml = `<strong>${formatHour(clampedHour)}</strong>`;

        for (const vt of VEHICLE_KEYS) {
          const dot = crosshairDots.select(`[data-vt="${vt}"]`);
          if (!visible[vt] || series[vt].length === 0) {
            dot.style('display', 'none');
            continue;
          }
          const pt = series[vt].find((d) => d.hour === clampedHour);
          if (!pt) {
            dot.style('display', 'none');
            continue;
          }
          dot.style('display', null)
            .attr('cx', xPos)
            .attr('cy', yScale(pt.avg_speed_mph));

          tooltipHtml +=
            `<br><span style="color:${VEHICLE_COLORS[vt]}">■</span> ` +
            `${VEHICLE_LABELS[vt]}: ${pt.avg_speed_mph.toFixed(1)} mph avg, ` +
            `${pt.median_speed_mph.toFixed(1)} mph median`;
        }

        tooltip.innerHTML = tooltipHtml;
        tooltip.style.opacity = '1';

        const containerRect = containerEl.getBoundingClientRect();
        let tx = event.clientX - containerRect.left + 16;
        let ty = event.clientY - containerRect.top - 10;
        const tw = tooltip.offsetWidth;
        const th = tooltip.offsetHeight;
        if (tx + tw > containerRect.width) tx = tx - tw - 32;
        if (ty + th > containerRect.height) ty = ty - th - 20;
        tooltip.style.left = tx + 'px';
        tooltip.style.top = ty + 'px';
      })
      .on('mouseleave', () => {
        crosshairLine.style('display', 'none');
        crosshairDots.style('display', 'none');
        tooltip.style.opacity = '0';
      });

    const legendG = g.append('g')
      .attr('transform', `translate(${innerW - 160}, 0)`);

    legendG.append('line')
      .attr('x1', 0).attr('x2', 20)
      .attr('y1', 0).attr('y2', 0)
      .attr('stroke', '#888').attr('stroke-width', 2);
    legendG.append('text')
      .attr('x', 24).attr('y', 0).attr('dy', '0.35em')
      .attr('font-size', '11px').attr('fill', '#666')
      .text('Avg speed');

    legendG.append('line')
      .attr('x1', 0).attr('x2', 20)
      .attr('y1', 16).attr('y2', 16)
      .attr('stroke', '#888').attr('stroke-width', 1.5)
      .attr('stroke-dasharray', '4,3');
    legendG.append('text')
      .attr('x', 24).attr('y', 16).attr('dy', '0.35em')
      .attr('font-size', '11px').attr('fill', '#666')
      .text('Median speed');

    legendG.append('rect')
      .attr('x', 0).attr('y', 30)
      .attr('width', 20).attr('height', 10)
      .attr('fill', '#888').attr('opacity', 0.15);
    legendG.append('text')
      .attr('x', 24).attr('y', 35).attr('dy', '0.35em')
      .attr('font-size', '11px').attr('fill', '#666')
      .text('Avg–median spread');
  }
}
