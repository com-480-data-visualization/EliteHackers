/**
 * EDA Viz 7 — Pickup/Dropoff demand choropleth map.
 * Interactive Mapbox GL JS map of NYC taxi zones colored by trip count.
 * @module MapPickupChoropleth
 */
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { CHOROPLETH_STOPS } from '../utils/colors.js';
import { formatNumber, formatCompact } from '../utils/format.js';

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN;

// Served by the custom Vite middleware (vite.config.js → serve-pipeline-data)
const GEOJSON_LOCAL = '/nyc-tlc-pipeline/data/raw/taxi_zones.geojson';
// NYC Open Data official export — CORS-enabled fallback when pipeline data is absent
const GEOJSON_REMOTE =
  'https://data.cityofnewyork.us/api/geospatial/d3c1-ddgc?method=export&type=GeoJSON';
const ZERO_COLOR = '#e0e0e0';
const SOURCE_ID = 'taxi-zones';
const FILL_LAYER = 'taxi-zones-fill';
const LINE_LAYER = 'taxi-zones-line';

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
 * Inject per-zone trip counts into GeoJSON feature properties.
 * @param {Object} geojson
 * @param {Map<number, Object>} lookup
 * @param {string} metric - 'pickup_count' | 'dropoff_count'
 * @returns {Object} mutated geojson
 */
function annotateGeoJSON(geojson, lookup, metric) {
  for (const feat of geojson.features) {
    const props = feat.properties;
    const id = props.LocationID || props.OBJECTID || props.location_id;
    const row = lookup.get(+id);
    props._count = row ? (row[metric] || 0) : 0;
    props._zone = row ? row.zone : (props.zone || props.Zone || 'Unknown');
    props._borough = row ? row.borough : (props.borough || props.Borough || '');
    props._pickup = row ? row.pickup_count : 0;
    props._dropoff = row ? row.dropoff_count : 0;
  }
  return geojson;
}

/**
 * Build a Mapbox GL `interpolate` expression for the fill color.
 * @param {number} maxVal
 * @returns {Array}
 */
function buildColorExpression(maxVal) {
  if (maxVal === 0) return ZERO_COLOR;
  const stops = CHOROPLETH_STOPS.flatMap((color, i) => [
    (i / (CHOROPLETH_STOPS.length - 1)) * maxVal,
    color,
  ]);
  return [
    'case',
    ['==', ['get', '_count'], 0],
    ZERO_COLOR,
    ['interpolate', ['linear'], ['get', '_count'], ...stops],
  ];
}

/**
 * Initialize the pickup/dropoff choropleth map.
 * @param {HTMLElement} containerEl - DOM element to render into.
 * @param {Object} data - Loaded dataset; expects `data.zoneTripCounts`.
 */
export async function init(containerEl, data) {
  const rows = data.zoneTripCounts || [];
  const lookup = buildLookup(rows);

  containerEl.innerHTML = '';
  containerEl.style.position = 'relative';

  // Controls bar
  const controls = document.createElement('div');
  controls.style.cssText = 'margin-bottom:8px;display:flex;gap:8px;';
  containerEl.appendChild(controls);

  let activeMetric = 'pickup_count';

  const btnPickup = document.createElement('button');
  btnPickup.textContent = 'Pickup count';
  btnPickup.style.cssText = btnStyle(true);
  controls.appendChild(btnPickup);

  const btnDropoff = document.createElement('button');
  btnDropoff.textContent = 'Dropoff count';
  btnDropoff.style.cssText = btnStyle(false);
  controls.appendChild(btnDropoff);

  // Map wrapper
  const mapWrapper = document.createElement('div');
  mapWrapper.style.cssText = 'width:100%;height:520px;border-radius:8px;overflow:hidden;';
  containerEl.appendChild(mapWrapper);

  // Fetch GeoJSON
  let geojson = await tryFetch(GEOJSON_LOCAL);
  if (!geojson) geojson = await tryFetch(GEOJSON_REMOTE);

  if (!geojson) {
    mapWrapper.innerHTML =
      '<p style="color:#999;padding:40px;text-align:center;">' +
      'Taxi zone GeoJSON not available. Run the pipeline to generate it, ' +
      'or ensure an internet connection for the fallback URL.</p>';
    return;
  }

  // Compute max values for both metrics upfront
  let maxPickup = 0;
  let maxDropoff = 0;
  for (const r of rows) {
    if ((r.pickup_count || 0) > maxPickup) maxPickup = r.pickup_count || 0;
    if ((r.dropoff_count || 0) > maxDropoff) maxDropoff = r.dropoff_count || 0;
  }

  annotateGeoJSON(geojson, lookup, activeMetric);

  // Initialise Mapbox GL map
  const map = new mapboxgl.Map({
    container: mapWrapper,
    style: 'mapbox://styles/mapbox/light-v11',
    center: [-74.006, 40.7128],
    zoom: 9.5,
    minZoom: 8,
    maxZoom: 14,
  });

  map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');

  // Tooltip
  const tooltip = new mapboxgl.Popup({
    closeButton: false,
    closeOnClick: false,
    className: 'tlc-tooltip',
  });

  map.on('load', () => {
    map.addSource(SOURCE_ID, {
      type: 'geojson',
      data: geojson,
    });

    map.addLayer({
      id: FILL_LAYER,
      type: 'fill',
      source: SOURCE_ID,
      paint: {
        'fill-color': buildColorExpression(activeMetric === 'pickup_count' ? maxPickup : maxDropoff),
        'fill-opacity': 0.82,
      },
    });

    map.addLayer({
      id: LINE_LAYER,
      type: 'line',
      source: SOURCE_ID,
      paint: {
        'line-color': '#ffffff',
        'line-width': 0.6,
      },
    });

    // Hover highlight
    map.on('mousemove', FILL_LAYER, (e) => {
      map.getCanvas().style.cursor = 'pointer';
      const props = e.features[0].properties;
      const pu = formatNumber(props._pickup || 0);
      const doff = formatNumber(props._dropoff || 0);
      tooltip
        .setLngLat(e.lngLat)
        .setHTML(
          `<strong>${props._zone || 'Unknown'}</strong><br>` +
          `${props._borough || ''}<br>` +
          `Pickups: ${pu}<br>` +
          `Dropoffs: ${doff}`
        )
        .addTo(map);
    });

    map.on('mouseleave', FILL_LAYER, () => {
      map.getCanvas().style.cursor = '';
      tooltip.remove();
    });
  });

  // Metric toggle
  function switchMetric(metric) {
    activeMetric = metric;
    btnPickup.style.cssText = btnStyle(metric === 'pickup_count');
    btnDropoff.style.cssText = btnStyle(metric === 'dropoff_count');

    const maxVal = metric === 'pickup_count' ? maxPickup : maxDropoff;

    // Re-annotate so tooltip values reflect current metric's _count for the legend
    for (const feat of geojson.features) {
      feat.properties._count = metric === 'pickup_count'
        ? (feat.properties._pickup || 0)
        : (feat.properties._dropoff || 0);
    }

    if (map.getSource(SOURCE_ID)) {
      map.getSource(SOURCE_ID).setData(geojson);
      map.setPaintProperty(FILL_LAYER, 'fill-color', buildColorExpression(maxVal));
    }

    renderLegend(maxVal, metric);
  }

  btnPickup.addEventListener('click', () => switchMetric('pickup_count'));
  btnDropoff.addEventListener('click', () => switchMetric('dropoff_count'));

  // Legend (canvas gradient + labels)
  const legend = document.createElement('div');
  legend.style.cssText =
    'position:absolute;bottom:32px;right:12px;background:rgba(255,255,255,0.92);' +
    'border-radius:6px;padding:10px 12px;box-shadow:0 1px 6px rgba(0,0,0,0.15);' +
    'font-size:12px;min-width:110px;z-index:1;';
  containerEl.appendChild(legend);

  function renderLegend(maxVal, metric) {
    legend.innerHTML = '';

    const title = document.createElement('div');
    title.textContent = metric === 'pickup_count' ? 'Pickups' : 'Dropoffs';
    title.style.cssText = 'font-weight:600;margin-bottom:6px;font-size:13px;';
    legend.appendChild(title);

    const LEGEND_H = 160;
    const canvas = document.createElement('canvas');
    canvas.width = 16;
    canvas.height = LEGEND_H;
    canvas.style.cssText = 'border-radius:3px;display:block;margin-bottom:4px;';
    legend.appendChild(canvas);

    if (maxVal > 0) {
      const ctx = canvas.getContext('2d');
      const grad = ctx.createLinearGradient(0, 0, 0, LEGEND_H);
      CHOROPLETH_STOPS.forEach((color, i) => {
        grad.addColorStop(1 - i / (CHOROPLETH_STOPS.length - 1), color);
      });
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 16, LEGEND_H);
    }

    const steps = 5;
    for (let i = 0; i <= steps; i++) {
      const val = maxVal * (1 - i / steps);
      const row = document.createElement('div');
      row.textContent = formatCompact(Math.round(val));
      row.style.cssText =
        `font-size:11px;color:#555;margin-top:${i === 0 ? 0 : (LEGEND_H / steps - 14)}px;`;
      legend.appendChild(row);
    }

    const zeroRow = document.createElement('div');
    zeroRow.style.cssText = 'display:flex;align-items:center;gap:5px;margin-top:8px;font-size:11px;color:#555;';
    const swatch = document.createElement('span');
    swatch.style.cssText = `display:inline-block;width:14px;height:14px;background:${ZERO_COLOR};border-radius:2px;flex-shrink:0;`;
    zeroRow.appendChild(swatch);
    zeroRow.appendChild(document.createTextNode('No data'));
    legend.appendChild(zeroRow);
  }

  map.on('load', () => renderLegend(maxPickup, 'pickup_count'));
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
