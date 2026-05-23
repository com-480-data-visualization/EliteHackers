/**
 * Filter Indicator — injects a live filter-state chip row into every
 * .panel__header inside the dashboard. Subscribes to filterBus once;
 * updates all indicators on every state change.
 *
 * Only reads filterBus (never writes).
 */

import { getState, subscribe } from '../state/filterBus.js';

const TAXI_COLORS  = { yellow: '#f5c542', green: '#2ecc71', fhv: '#9b6ff5' };
const TAXI_LABELS  = { yellow: 'Yellow',  green: 'Green',   fhv: 'FHV'    };
const ALL_TYPES    = ['yellow', 'green', 'fhv'];
const MONTHS       = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// ── Formatting helpers ─────────────────────────────────────────────────────

function formatDateRange(dateRange) {
  if (!dateRange) return null; // null = default, don't highlight

  const d0   = new Date(dateRange[0]);
  const d1   = new Date(dateRange[1]);
  const y0   = d0.getFullYear();
  const y1   = d1.getFullYear();
  const m0   = d0.getMonth();
  const m1   = d1.getMonth();
  const days = (d1 - d0) / 86400000;

  // Full default range ≈ 10 years — suppress
  if (days > 3600) return null;

  if (y0 === y1) {
    if (m0 === 0 && m1 === 11) return String(y0);          // whole year
    if (m0 === m1) return `${MONTHS[m0]} ${y0}`;           // single month
    return `${MONTHS[m0]}–${MONTHS[m1]} ${y0}`;            // within year
  }
  if (days < 400) {
    return `${MONTHS[m0]} ${y0} – ${MONTHS[m1]} ${y1}`;   // cross-year, short
  }
  return `${y0}–${y1}`;                                    // multi-year
}

function formatBoroughs(selectedBoroughs) {
  if (!selectedBoroughs) return null;
  const arr = [...selectedBoroughs];
  if (arr.length === 0) return null;
  if (arr.length <= 3) return arr.join(', ');
  return arr.slice(0, 2).join(', ') + ` +${arr.length - 2}`;
}

// ── Build the indicator HTML ───────────────────────────────────────────────

function buildHtml(state) {
  const parts = [];

  // Taxi types — always show; dim if all-default to reduce visual noise
  const activeTypes = ALL_TYPES.filter(t => state.taxiTypes.has(t));
  const allActive   = activeTypes.length === ALL_TYPES.length;

  const dots = ALL_TYPES.map(t => {
    const active = state.taxiTypes.has(t);
    return `<span class="fi-dot${active ? ' fi-dot--active' : ''}"
                  style="${active ? `background:${TAXI_COLORS[t]}` : ''}"
                  title="${TAXI_LABELS[t]}"></span>`;
  }).join('');

  // Group taxi dots + optional label when filtered
  if (allActive) {
    parts.push(`<span class="fi-chips fi-chips--default">${dots}</span>`);
  } else {
    const labels = activeTypes.map(t =>
      `<span class="fi-label" style="color:${TAXI_COLORS[t]}">${TAXI_LABELS[t]}</span>`
    ).join('');
    parts.push(`<span class="fi-chips">${dots}${labels}</span>`);
  }

  // Date range
  const dateStr = formatDateRange(state.dateRange);
  if (dateStr) {
    parts.push(`<span class="fi-sep">·</span><span class="fi-chip fi-chip--date">${dateStr}</span>`);
  }

  // Boroughs
  const borStr = formatBoroughs(state.selectedBoroughs);
  if (borStr) {
    parts.push(`<span class="fi-sep">·</span><span class="fi-chip fi-chip--area">${borStr}</span>`);
  }

  return parts.join('');
}

// ── Init ───────────────────────────────────────────────────────────────────

export function init() {
  // Inject one indicator div into every panel header inside the dashboard
  const headers = document.querySelectorAll('#dashboard .panel .panel__header');
  const indicators = [];

  for (const header of headers) {
    const div = document.createElement('div');
    div.className = 'filter-indicator';
    header.appendChild(div);
    indicators.push(div);
  }

  if (!indicators.length) return;

  function render(state) {
    const html = buildHtml(state);
    for (const div of indicators) {
      div.innerHTML = html;
    }
  }

  render(getState());
  subscribe(render);
}
