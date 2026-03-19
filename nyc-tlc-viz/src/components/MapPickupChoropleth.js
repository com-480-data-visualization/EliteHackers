/**
 * EDA Viz 7 — Pickup/Dropoff demand choropleth map.
 * Pure D3.js SVG map of NYC taxi zones colored by trip count.
 * @module MapPickupChoropleth
 */
import * as d3 from 'd3';
import { CHOROPLETH_STOPS } from '../utils/colors.js';
import { formatNumber, formatCompact } from '../utils/format.js';

const GEOJSON_LOCAL = '../../nyc-tlc-pipeline/data/raw/taxi_zones.geojson';
const GEOJSON_REMOTE =
  'https://data.cityofnewyork.us/api/geospatial/d3c1-ddgc?method=export&type=GeoJSON';
const ZERO_COLOR = '#e0e0e0';
const TOOLTIP_BG = 'rgba(30,30,30,0.92)';
const LEGEND_WIDTH = 18;
const LEGEND_HEIGHT = 180;

/**
 * Attempt to fetch GeoJSON from a URL; returns null on failure.
 * @param {string} url
 * @returns {Promise<Object|null>}
 */
async function tryFetch(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Build a lookup map from zone trip count data.
 * @param {Array<Object>} rows
 * @returns {Map<number, Object>}
 */
function buildLookup(rows) {
  const map = new Map();
  for (const r of rows) {
    map.set(r.LocationID, r);
  }
  return map;
}

/**
 * Initialize the pickup/dropoff choropleth map.
 * @param {HTMLElement} containerEl - DOM element to render into.
 * @param {Object} data - Loaded dataset; expects `data.zoneTripCounts`.
 */
export function init(containerEl, data) {
  const rows = data.zoneTripCounts || [];
  const lookup = buildLookup(rows);

  containerEl.innerHTML = '';
  containerEl.style.position = 'relative';

  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'display:flex;gap:12px;align-items:flex-start;';
  containerEl.appendChild(wrapper);

  const mapContainer = document.createElement('div');
  mapContainer.style.cssText = 'flex:1;min-width:0;';
  wrapper.appendChild(mapContainer);

  const sidebar = document.createElement('div');
  sidebar.style.cssText = 'flex:0 0 120px;padding-top:40px;';
  wrapper.appendChild(sidebar);

  const controls = document.createElement('div');
  controls.style.cssText = 'margin-bottom:8px;display:flex;gap:8px;';
  mapContainer.appendChild(controls);

  let activeMetric = 'pickup_count';

  const btnPickup = document.createElement('button');
  btnPickup.textContent = 'Pickup count';
  btnPickup.style.cssText = btnStyle(true);
  controls.appendChild(btnPickup);

  const btnDropoff = document.createElement('button');
  btnDropoff.textContent = 'Dropoff count';
  btnDropoff.style.cssText = btnStyle(false);
  controls.appendChild(btnDropoff);

  const svgContainer = document.createElement('div');
  mapContainer.appendChild(svgContainer);

  const tooltip = document.createElement('div');
  tooltip.style.cssText =
    `position:absolute;pointer-events:none;opacity:0;transition:opacity 0.15s;` +
    `background:${TOOLTIP_BG};color:#fff;padding:8px 12px;border-radius:6px;` +
    `font-size:13px;line-height:1.5;z-index:10;white-space:nowrap;`;
  containerEl.appendChild(tooltip);

  btnPickup.addEventListener('click', () => switchMetric('pickup_count'));
  btnDropoff.addEventListener('click', () => switchMetric('dropoff_count'));

  function switchMetric(metric) {
    activeMetric = metric;
    btnPickup.style.cssText = btnStyle(metric === 'pickup_count');
    btnDropoff.style.cssText = btnStyle(metric === 'dropoff_count');
    updateFills();
    renderLegend();
  }

  let geojson = null;
  let svg = null;
  let paths = null;
  let colorScale = null;

  (async () => {
    geojson = await tryFetch(GEOJSON_LOCAL);
    if (!geojson) geojson = await tryFetch(GEOJSON_REMOTE);

    if (!geojson) {
      svgContainer.innerHTML =
        '<p style="color:#999;padding:40px;text-align:center;">' +
        'Taxi zone GeoJSON not available. Run the pipeline to generate it, ' +
        'or ensure an internet connection for the fallback URL.</p>';
      return;
    }

    render();

    const ro = new ResizeObserver(() => {
      render();
    });
    ro.observe(mapContainer);
  })();

  function getMaxVal() {
    let max = 0;
    for (const r of rows) {
      const v = r[activeMetric] || 0;
      if (v > max) max = v;
    }
    return max;
  }

  function buildColorScale() {
    const maxVal = getMaxVal();
    const domain = CHOROPLETH_STOPS.map((_, i) =>
      (i / (CHOROPLETH_STOPS.length - 1)) * maxVal
    );
    colorScale = d3.scaleLinear()
      .domain(domain)
      .range(CHOROPLETH_STOPS)
      .interpolate(d3.interpolateRgb)
      .clamp(true);
  }

  function render() {
    svgContainer.innerHTML = '';
    const width = mapContainer.clientWidth;
    const height = Math.max(400, width * 0.75);

    svg = d3.select(svgContainer)
      .append('svg')
      .attr('width', width)
      .attr('height', height)
      .attr('viewBox', `0 0 ${width} ${height}`);

    const projection = d3.geoMercator().fitSize([width, height], geojson);
    const pathGen = d3.geoPath().projection(projection);

    buildColorScale();

    paths = svg.selectAll('path')
      .data(geojson.features)
      .join('path')
      .attr('d', pathGen)
      .attr('stroke', '#fff')
      .attr('stroke-width', 0.5)
      .on('mouseenter', function (event, d) {
        d3.select(this).attr('stroke', '#333').attr('stroke-width', 1.5);
        showTooltip(event, d);
      })
      .on('mousemove', (event) => {
        positionTooltip(event);
      })
      .on('mouseleave', function () {
        d3.select(this).attr('stroke', '#fff').attr('stroke-width', 0.5);
        tooltip.style.opacity = '0';
      });

    updateFills();
    renderLegend();
  }

  function updateFills() {
    if (!paths) return;
    buildColorScale();
    paths.attr('fill', (d) => {
      const id = d.properties.LocationID || d.properties.OBJECTID || d.properties.location_id;
      const row = lookup.get(+id);
      if (!row) return ZERO_COLOR;
      const val = row[activeMetric] || 0;
      return val === 0 ? ZERO_COLOR : colorScale(val);
    });
  }

  function showTooltip(event, d) {
    const props = d.properties;
    const id = props.LocationID || props.OBJECTID || props.location_id;
    const row = lookup.get(+id);
    const zone = row ? row.zone : (props.zone || props.Zone || 'Unknown');
    const borough = row ? row.borough : (props.borough || props.Borough || '');
    const pu = row ? formatNumber(row.pickup_count) : '0';
    const doff = row ? formatNumber(row.dropoff_count) : '0';

    tooltip.innerHTML =
      `<strong>${zone}</strong><br>` +
      `${borough}<br>` +
      `Pickups: ${pu}<br>` +
      `Dropoffs: ${doff}`;
    tooltip.style.opacity = '1';
    positionTooltip(event);
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

  function renderLegend() {
    sidebar.innerHTML = '';
    const maxVal = getMaxVal();
    if (maxVal === 0) return;

    const title = document.createElement('div');
    title.textContent = activeMetric === 'pickup_count' ? 'Pickups' : 'Dropoffs';
    title.style.cssText = 'font-weight:600;font-size:13px;margin-bottom:8px;';
    sidebar.appendChild(title);

    const canvas = document.createElement('canvas');
    canvas.width = LEGEND_WIDTH;
    canvas.height = LEGEND_HEIGHT;
    canvas.style.cssText = `border-radius:3px;display:block;margin-bottom:4px;`;
    sidebar.appendChild(canvas);

    const ctx = canvas.getContext('2d');
    for (let py = 0; py < LEGEND_HEIGHT; py++) {
      const val = maxVal * (1 - py / LEGEND_HEIGHT);
      ctx.fillStyle = colorScale(val);
      ctx.fillRect(0, py, LEGEND_WIDTH, 1);
    }

    const steps = 5;
    for (let i = 0; i <= steps; i++) {
      const val = maxVal * (1 - i / steps);
      const label = document.createElement('div');
      label.textContent = formatCompact(Math.round(val));
      label.style.cssText =
        `font-size:11px;color:#666;position:relative;` +
        `margin-top:${i === 0 ? 0 : -2}px;`;
      sidebar.appendChild(label);
      if (i < steps) {
        const spacer = document.createElement('div');
        spacer.style.height = (LEGEND_HEIGHT / steps - 14) + 'px';
        sidebar.appendChild(spacer);
      }
    }

    const zeroLabel = document.createElement('div');
    zeroLabel.style.cssText = 'display:flex;align-items:center;gap:6px;margin-top:10px;font-size:11px;color:#666;';
    const swatch = document.createElement('span');
    swatch.style.cssText = `display:inline-block;width:14px;height:14px;background:${ZERO_COLOR};border-radius:2px;`;
    zeroLabel.appendChild(swatch);
    zeroLabel.appendChild(document.createTextNode('No data'));
    sidebar.appendChild(zeroLabel);
  }
}

/**
 * Generate CSS for toggle buttons.
 * @param {boolean} active
 * @returns {string}
 */
function btnStyle(active) {
  return (
    `padding:6px 14px;border:1px solid ${active ? '#3498db' : '#ccc'};` +
    `border-radius:4px;cursor:pointer;font-size:13px;` +
    `background:${active ? '#3498db' : '#fff'};color:${active ? '#fff' : '#333'};` +
    `transition:all 0.15s;`
  );
}
