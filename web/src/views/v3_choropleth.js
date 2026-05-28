/**
 * V3 — NYC Zone Choropleth.
 * Reads: filterBus.taxiTypes, filterBus.dateRange, filterBus.selectedBoroughs
 * Never writes to filterBus — all interactions (click stats panel) are local.
 *
 * Data: zones_volume.json [{location_id, type, year, month, trips}]
 *       taxi_zones.topojson (passed from main.js)
 */

import * as d3 from 'd3';
import * as topojson from 'topojson-client';
import { getState, subscribe } from '../state/filterBus.js';

function dateRangeToMonthBounds(dateRange) {
  if (!dateRange) return null;
  const d0 = new Date(dateRange[0]);
  const d1 = new Date(dateRange[1]);
  return {
    loYM: d0.getFullYear() * 12 + d0.getMonth(),
    hiYM: d1.getFullYear() * 12 + d1.getMonth(),
  };
}

function fmtNumber(n) { return n >= 1e6 ? (n/1e6).toFixed(1)+'M' : n >= 1e3 ? (n/1e3).toFixed(0)+'k' : String(Math.round(n)); }

export function init(container, { zonesVolume, topoData }) {
  if (!zonesVolume?.length || !topoData) {
    container.innerHTML = '<p class="gp-empty">Zone data not available.</p>';
    return;
  }

  const features = topojson.feature(topoData, topoData.objects.zones);

  // Build lookup: locationId → zone properties (zone name, borough)
  const zoneProps = new Map();
  for (const f of features.features) {
    const p = f.properties;
    zoneProps.set(p.LocationID, { zone: p.zone || '', borough: p.borough || '' });
  }

  const initial = getState();
  let activeTaxiTypes = new Set(initial.taxiTypes);
  let dateRange       = initial.dateRange;
  let activeBoroughs  = initial.selectedBoroughs;

  let selectedZoneId = null;

  container.innerHTML = `
    <div class="v3-wrap">
      <div class="v3-map" id="v3-map"></div>
      <div class="v3-panel v3-panel--hidden" id="v3-panel">
        <button class="v3-panel-close" id="v3-panel-close">×</button>
        <div id="v3-panel-body"></div>
      </div>
    </div>
  `;

  const tooltip = d3.select(container).append('div')
    .attr('class', 'tooltip v3-tooltip')
    .style('opacity', 0)
    .style('position', 'absolute')
    .style('pointer-events', 'none');

  container.querySelector('#v3-panel-close').addEventListener('click', () => {
    selectedZoneId = null;
    container.querySelector('#v3-panel').classList.add('v3-panel--hidden');
    render();
  });

  function computeZoneTotals() {
    const bounds = dateRangeToMonthBounds(dateRange);
    const totals = new Map();
    for (const r of zonesVolume) {
      if (!activeTaxiTypes.has(r.type)) continue;
      const ym = r.year * 12 + (r.month - 1);
      if (bounds && (ym < bounds.loYM || ym > bounds.hiYM)) continue;
      totals.set(r.location_id, (totals.get(r.location_id) || 0) + r.trips);
    }
    return totals;
  }

  function computeZoneStats(lid) {
    const bounds = dateRangeToMonthBounds(dateRange);
    const byType = {};
    let peakMonth = null, peakVal = 0;
    const byMonthTotal = new Array(12).fill(0);
    for (const r of zonesVolume) {
      if (r.location_id !== lid) continue;
      if (!activeTaxiTypes.has(r.type)) continue;
      const ym = r.year * 12 + (r.month - 1);
      if (bounds && (ym < bounds.loYM || ym > bounds.hiYM)) continue;
      byType[r.type] = (byType[r.type] || 0) + r.trips;
      byMonthTotal[r.month - 1] += r.trips;
    }
    const peakMonthIdx = byMonthTotal.indexOf(Math.max(...byMonthTotal));
    const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return { byType, peakMonth: MONTH_NAMES[peakMonthIdx] };
  }

  function renderTiles(svg, projection, W, H) {
    const tau   = 2 * Math.PI;
    const z     = Math.round(Math.log2(projection.scale() * tau / 256));
    const n     = Math.pow(2, z);
    const subs  = ['a', 'b', 'c', 'd'];
    let   ti    = 0;

    const nw = projection.invert([0, 0]);
    const se = projection.invert([W, H]);
    if (!nw || !se) return;

    const lng2tx  = (lng)       => Math.floor((lng + 180) / 360 * n);
    const lat2ty  = (lat)       => {
      const r = lat * Math.PI / 180;
      return Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n);
    };
    const tx2lng  = (tx)        => tx / n * 360 - 180;
    const ty2lat  = (ty)        => Math.atan(Math.sinh(Math.PI * (1 - 2 * ty / n))) * 180 / Math.PI;

    const x0 = lng2tx(nw[0]) - 1;
    const y0 = lat2ty(nw[1]) - 1;
    const x1 = lng2tx(se[0]) + 1;
    const y1 = lat2ty(se[1]) + 1;

    const tileG = svg.append('g').attr('pointer-events', 'none').attr('class', 'v3-tiles');

    for (let ix = x0; ix <= x1; ix++) {
      for (let iy = y0; iy <= y1; iy++) {
        const [px0, py0] = projection([tx2lng(ix),     ty2lat(iy)    ]);
        const [px1, py1] = projection([tx2lng(ix + 1), ty2lat(iy + 1)]);
        const tw = px1 - px0;
        const th = py1 - py0;
        if (px0 + tw < 0 || px0 > W || py0 + th < 0 || py0 > H) continue;
        tileG.append('image')
          .attr('href', `https://${subs[ti++ % 4]}.basemaps.cartocdn.com/dark_all/${z}/${ix}/${iy}.png`)
          .attr('x', px0).attr('y', py0)
          .attr('width', tw + 0.5).attr('height', th + 0.5);
      }
    }
  }

  function render() {
    const mapEl = container.querySelector('#v3-map');
    mapEl.innerHTML = '';
    mapEl.appendChild(tooltip.node());

    const W = mapEl.getBoundingClientRect().width || 860;
    const H = Math.max(360, Math.round(W * 0.52));

    const projection = d3.geoMercator().fitSize([W, H], features);
    const pathGen    = d3.geoPath().projection(projection);

    const totals   = computeZoneTotals();
    const maxTrips = d3.max([...totals.values()]) || 1;

    const colorScale = d3.scaleSequential()
      .domain([0, maxTrips])
      .interpolator(d3.interpolateYlOrRd);

    // Borough dimming: if selectedBoroughs active, dim non-selected boroughs
    function zoneOpacity(lid) {
      if (!activeBoroughs) return 1;
      const p = zoneProps.get(lid);
      return (p && activeBoroughs.has(p.borough)) ? 1 : 0.2;
    }

    const svg = d3.select(mapEl).append('svg')
      .attr('width', W).attr('height', H);

    renderTiles(svg, projection, W, H);

    svg.selectAll('path')
      .data(features.features)
      .join('path')
        .attr('d', pathGen)
        .attr('fill', d => {
          const lid = d.properties.LocationID;
          const t   = totals.get(lid) || 0;
          return t === 0 ? 'rgba(18,24,38,0.72)' : colorScale(t);
        })
        .attr('stroke', '#0d1117')
        .attr('stroke-width', 0.4)
        .attr('opacity', d => zoneOpacity(d.properties.LocationID))
        .classed('v3-zone--selected', d => d.properties.LocationID === selectedZoneId)
        .style('cursor', 'pointer')
        .on('mouseover', function(event, d) {
          const lid   = d.properties.LocationID;
          const props = zoneProps.get(lid) || {};
          const trips = totals.get(lid) || 0;
          d3.select(this).attr('stroke', '#e2e8f0').attr('stroke-width', 1.5);
          tooltip.style('opacity', 1)
            .html(`<span class="tooltip-title">${props.zone || 'Zone '+lid}</span>
                   <div class="tooltip-row" style="color:var(--text-muted);font-size:0.78rem">${props.borough}</div>
                   <div class="tooltip-row">${fmtNumber(Math.round(trips))} pickups</div>
                   <div style="color:var(--text-muted);font-size:0.75rem;margin-top:4px">Click for zone details</div>`);
          const r = container.getBoundingClientRect();
          tooltip.style('left', (event.clientX - r.left + 14) + 'px')
                 .style('top',  (event.clientY - r.top  - 44) + 'px');
        })
        .on('mousemove', function(event) {
          const r = container.getBoundingClientRect();
          tooltip.style('left', (event.clientX - r.left + 14) + 'px')
                 .style('top',  (event.clientY - r.top  - 44) + 'px');
        })
        .on('mouseout', function(event, d) {
          d3.select(this)
            .attr('stroke', '#0d1117')
            .attr('stroke-width', d.properties.LocationID === selectedZoneId ? 1.2 : 0.4);
          tooltip.style('opacity', 0);
        })
        .on('click', function(event, d) {
          const lid = d.properties.LocationID;
          selectedZoneId = lid;
          render();
          showPanel(lid, totals);
        });

    // Highlight selected zone border
    if (selectedZoneId != null) {
      svg.selectAll('path')
        .filter(d => d.properties.LocationID === selectedZoneId)
        .attr('stroke', '#e2e8f0').attr('stroke-width', 1.5);
    }

    // Borough labels — one per borough, centered on merged geometry
    const BOROUGH_NAMES = ['Manhattan', 'Brooklyn', 'Queens', 'Bronx', 'Staten Island', 'EWR'];
    const labelG = svg.append('g').attr('pointer-events', 'none');

    for (const name of BOROUGH_NAMES) {
      const geoms = topoData.objects.zones.geometries.filter(g => g.properties.borough === name);
      if (!geoms.length) continue;
      const merged = topojson.merge(topoData, geoms);
      const [cx, cy] = pathGen.centroid(merged);
      if (!isFinite(cx) || !isFinite(cy)) continue;

      labelG.append('text')
        .attr('x', cx).attr('y', cy)
        .attr('text-anchor', 'middle').attr('dy', '0.35em')
        .attr('font-size', 14).attr('font-weight', 800)
        .attr('font-family', 'var(--font-sans, system-ui)')
        .attr('fill', 'rgba(255,255,255,0.85)')
        .attr('stroke', 'rgba(0,0,0,0.6)').attr('stroke-width', 3)
        .attr('stroke-linejoin', 'round')
        .style('paint-order', 'stroke fill')
        .attr('letter-spacing', '0.06em')
        .text(name.toUpperCase());
    }

    // Color legend
    const legendW = 130;
    const defs    = svg.append('defs');
    const gradId  = 'v3-grad';
    const grad    = defs.append('linearGradient').attr('id', gradId);
    grad.append('stop').attr('offset',   '0%').attr('stop-color', colorScale(0));
    grad.append('stop').attr('offset', '100%').attr('stop-color', colorScale(maxTrips));

    const legG = svg.append('g').attr('transform', `translate(14,${H - 26})`);
    legG.append('text').attr('y', -3).attr('fill', '#586069').attr('font-size', 10)
      .attr('font-family', 'var(--font-sans, system-ui)').text('Low');
    legG.append('rect').attr('x', 24).attr('width', legendW).attr('height', 6).attr('rx', 3)
      .attr('fill', `url(#${gradId})`);
    legG.append('text').attr('x', 24 + legendW + 4).attr('y', -3)
      .attr('fill', '#586069').attr('font-size', 10)
      .attr('font-family', 'var(--font-sans, system-ui)').text('High pickups');
  }

  const TAXI_COLORS = { yellow: '#f5c542', green: '#2ecc71', fhv: '#9b6ff5' };
  const TAXI_LABELS = { yellow: 'Yellow', green: 'Green', fhv: 'FHV' };

  function showPanel(lid, totals) {
    const panelEl = container.querySelector('#v3-panel');
    const bodyEl  = container.querySelector('#v3-panel-body');
    panelEl.classList.remove('v3-panel--hidden');

    const props = zoneProps.get(lid) || {};
    const total = totals.get(lid) || 0;
    const stats = computeZoneStats(lid);

    const typeRows = Object.entries(stats.byType)
      .sort((a,b) => b[1]-a[1])
      .map(([t, trips]) => `
        <div class="v3-stat-row">
          <span class="v3-stat-dot" style="background:${TAXI_COLORS[t]}"></span>
          <span class="v3-stat-label">${TAXI_LABELS[t]||t}</span>
          <span class="v3-stat-value">${fmtNumber(Math.round(trips))}</span>
        </div>`).join('');

    bodyEl.innerHTML = `
      <div class="v3-panel-title">${props.zone || 'Zone '+lid}</div>
      <div class="v3-panel-borough">${props.borough}</div>
      <div class="v3-panel-section">
        <div class="v3-stat-header">Total pickups</div>
        <div class="v3-stat-total">${fmtNumber(Math.round(total))}</div>
      </div>
      <div class="v3-panel-section">
        <div class="v3-stat-header">By taxi type</div>
        ${typeRows || '<p class="gp-empty" style="padding:8px 0">No data</p>'}
      </div>
      <div class="v3-panel-section">
        <div class="v3-stat-header">Peak month</div>
        <div class="v3-stat-value">${stats.peakMonth}</div>
      </div>
    `;
  }

  subscribe(s => {
    activeTaxiTypes = new Set(s.taxiTypes);
    dateRange       = s.dateRange;
    activeBoroughs  = s.selectedBoroughs;
    render();
    // Update panel if open
    if (selectedZoneId != null) {
      showPanel(selectedZoneId, computeZoneTotals());
    }
  });

  let _debounce = null;
  new ResizeObserver(() => {
    clearTimeout(_debounce);
    _debounce = setTimeout(render, 60);
  }).observe(container);

  render();
}
