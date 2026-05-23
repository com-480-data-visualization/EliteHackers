/**
 * Entry point — loads data, initialises all views and controls.
 * Architecture: filterBus at center; each view subscribes independently.
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
import { initScrollama } from './narrative/scrollama_setup.js';

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
  const loading = document.getElementById('loading');

  try {
    const { monthly, daily, events, globalPatterns, zonesVolume, tripSample, topoData } = await loadData();

    // Hide loading
    loading.classList.add('hidden');

    // Init controls
    initTaxiToggle(document.getElementById('taxi-type-toggle'));
    initYearSlider(document.getElementById('year-slider'));
    initBoroughToggle(document.getElementById('borough-toggle'), globalPatterns?.borough_list);
    initReset(document.getElementById('reset-btn'));

    // Filter indicators — inject live filter-state chips into every panel header
    initFilterIndicator();

    // V5 — Timeline (first panel; primary interaction entry point)
    initV5(document.getElementById('v5-container'), { dailyData: daily, events });

    // V1 — Dashboard stacked area (primary instance for brush)
    initV1(document.getElementById('v1-container'), { monthly, daily }, { primary: true });

    // Narrative V1 — non-primary instance for scrollama
    initV1(document.getElementById('narrative-chart'), { monthly, daily }, { primary: false });

    // V2 — Weekly Pulse Heatmap
    initGlobalPatterns(document.getElementById('v2-container'), globalPatterns);

    // V3 — Zone Choropleth
    initV3(document.getElementById('v3-container'), { zonesVolume, topoData });

    // V4 — Trip Anatomy Scatter
    initV4(document.getElementById('v4-container'), tripSample);

    // Wire Scrollama narrative
    initScrollama();

    // Mode toggle
    const modeLabel = document.getElementById('mode-label');
    const narrativeSection = document.getElementById('narrative');
    document.getElementById('mode-toggle').addEventListener('click', () => {
      const isDash = narrativeSection.style.display === 'none';
      narrativeSection.style.display = isDash ? '' : 'none';
      modeLabel.textContent = isDash ? 'Dashboard' : 'Story';
      if (!isDash) {
        document.getElementById('dashboard').scrollIntoView({ behavior: 'smooth' });
      }
    });

  } catch (err) {
    console.error('[NYC Mobility] Data load failed:', err);
    loading.innerHTML = `<p style="color:var(--color-disruption)">Failed to load data: ${err.message}</p>`;
  }
}

main();
