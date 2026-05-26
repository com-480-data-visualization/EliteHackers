/**
 * Dashboard page entry point — loads V1-V5 and the global controls.
 *
 * Functionally identical to the dashboard portion of the pre-split `main.js`:
 *   - same data fetches
 *   - same init order (controls, filter indicator, V5, V1, V2, V3, V4)
 *   - same filterBus contract
 *
 * Does NOT import Scrollama or any narrative module.
 */

import { init as initV1 } from './views/v1_stackedArea.js';
import { init as initV5 } from './views/v5_timeline.js';
import { init as initGlobalPatterns } from './views/v_globalPatterns.js';
import { init as initV3 } from './views/v3_choropleth.js';
import { init as initV4 } from './views/v4_scatter.js';
import { init as initTaxiToggle } from './controls/taxiTypeToggle.js';
import { init as initYearSlider } from './controls/yearSlider.js';
import { init as initBoroughToggle } from './controls/boroughToggle.js';
import { init as initReset } from './controls/resetButton.js';
import { init as initFilterIndicator } from './controls/filterIndicator.js';
import { renderNavLinks } from './nav.js';

console.info('[NYC Mobility] Dashboard initialising…');

async function loadData() {
  const [monthly, daily, events, globalPatterns, zonesVolume, tripSample, topoData] = await Promise.all([
    fetch('/data/monthly_volume.json').then(r => r.json()),
    fetch('/data/daily_volume.json').then(r => r.json()),
    fetch('/data/events.json').then(r => r.json()),
    fetch('/data/global_patterns.json').then(r => r.json()).catch(() => null),
    fetch('/data/zones_volume.json').then(r => r.json()).catch(() => []),
    fetch('/data/trip_sample.json').then(r => r.json()).catch(() => []),
    fetch('/data/taxi_zones.topojson').then(r => r.json()).catch(() => null),
  ]);
  return { monthly, daily, events, globalPatterns, zonesVolume, tripSample, topoData };
}

async function main() {
  renderNavLinks('dashboard', document.getElementById('nav-page-links'));

  const loading = document.getElementById('loading');

  try {
    const { monthly, daily, events, globalPatterns, zonesVolume, tripSample, topoData } = await loadData();

    loading.classList.add('hidden');

    initTaxiToggle(document.getElementById('taxi-type-toggle'));
    initYearSlider(document.getElementById('year-slider'));
    initBoroughToggle(document.getElementById('borough-toggle'), globalPatterns?.borough_list);
    initReset(document.getElementById('reset-btn'));

    initFilterIndicator();

    initV5(document.getElementById('v5-container'), { dailyData: daily, events });

    initV1(document.getElementById('v1-container'), { monthly, daily }, { primary: true });

    initGlobalPatterns(document.getElementById('v2-container'), globalPatterns);

    initV3(document.getElementById('v3-container'), { zonesVolume, topoData });

    initV4(document.getElementById('v4-container'), tripSample);

  } catch (err) {
    console.error('[NYC Mobility] Data load failed:', err);
    loading.innerHTML = `<p style="color:var(--color-disruption)">Failed to load data: ${err.message}</p>`;
  }
}

main();
