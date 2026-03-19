/**
 * Main entry point — loads data and initializes all visualizations.
 * @module main
 */
import './styles/main.css';
import { loadAll } from './data/loader.js';
import { VEHICLE_LABELS } from './utils/colors.js';
import { formatCompact, formatYearMonth } from './utils/format.js';

import { init as initHourly } from './components/ChartHourlyDemand.js';
import { init as initDow } from './components/ChartDayOfWeek.js';
import { init as initMonthly } from './components/ChartMonthlyTrend.js';
import { init as initFare } from './components/ChartFareByHour.js';
import { init as initDistance } from './components/ChartDistanceDistrib.js';
import { init as initPayment } from './components/ChartPaymentSplit.js';
import { init as initMap } from './components/MapPickupChoropleth.js';
import { init as initBorough } from './components/ChartBoroughOD.js';
import { init as initSpeed } from './components/ChartSpeedByHour.js';

async function main() {
  const loadingEl = document.getElementById('loading-indicator');
  const bannerEl = document.getElementById('data-banner');
  const badgeEl = document.getElementById('nav-badge');

  let data;
  try {
    data = await loadAll();
  } catch (e) {
    console.error('Failed to load data:', e);
    if (loadingEl) loadingEl.textContent = 'Failed to load data. Run the pipeline first.';
    return;
  }

  if (loadingEl) loadingEl.style.display = 'none';

  const totalTrips = computeTotalTrips(data);
  const dateRange = computeDateRange(data);
  const vehicleTypes = computeVehicleTypes(data);

  document.getElementById('banner-trips').textContent = formatCompact(totalTrips);
  document.getElementById('banner-dates').textContent = dateRange;
  document.getElementById('banner-types').textContent = vehicleTypes.map(v => VEHICLE_LABELS[v] || v).join(', ');
  bannerEl.classList.add('visible');

  if (badgeEl) {
    badgeEl.textContent = dateRange;
    badgeEl.style.display = '';
  }

  const vizConfigs = [
    { id: 'chart-hourly', init: initHourly },
    { id: 'chart-dow', init: initDow },
    { id: 'chart-monthly', init: initMonthly },
    { id: 'chart-fare', init: initFare },
    { id: 'chart-distance', init: initDistance },
    { id: 'chart-payment', init: initPayment },
    { id: 'chart-map', init: initMap },
    { id: 'chart-borough', init: initBorough },
    { id: 'chart-speed', init: initSpeed },
  ];

  for (const { id, init } of vizConfigs) {
    const el = document.getElementById(id);
    if (!el) continue;
    try {
      await init(el, data);
    } catch (e) {
      console.error(`Failed to init ${id}:`, e);
      el.innerHTML = `<p style="color:var(--text-muted);padding:40px;">Chart failed to render. ${e.message}</p>`;
    }
  }
}

function computeTotalTrips(data) {
  if (!data.tripsByMonth || !data.tripsByMonth.length) return 0;
  return data.tripsByMonth
    .filter(d => isValidYM(d.year_month))
    .reduce((sum, d) => sum + (d.trip_count || 0), 0);
}

function isValidYM(ym) {
  if (!ym || typeof ym !== 'string') return false;
  const parts = ym.split('-');
  if (parts.length !== 2) return false;
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  return !isNaN(year) && !isNaN(month)
    && year >= 2009 && year <= 2030
    && month >= 1 && month <= 12;
}

function computeDateRange(data) {
  if (!data.tripsByMonth || !data.tripsByMonth.length) return '—';
  const months = data.tripsByMonth
    .map(d => d.year_month)
    .filter(isValidYM)
    .sort();
  if (months.length === 0) return '—';
  return formatYearMonth(months[0]) + ' – ' + formatYearMonth(months[months.length - 1]);
}

function computeVehicleTypes(data) {
  if (!data.tripsByMonth || !data.tripsByMonth.length) return [];
  return [...new Set(
    data.tripsByMonth
      .filter(d => isValidYM(d.year_month))
      .map(d => d.vehicle_type)
  )].filter(Boolean).sort();
}

main();
