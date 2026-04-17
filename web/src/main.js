/**
 * Entry point — loads data, initialises all views and controls.
 * Architecture: filterBus at center; each view subscribes independently.
 */

import { init as initV1 } from './views/v1_stackedArea.js';
import { init as initV5 } from './views/v5_timeline.js';
import { init as initTaxiToggle } from './controls/taxiTypeToggle.js';
import { init as initYearSlider } from './controls/yearSlider.js';
import { init as initReset } from './controls/resetButton.js';
import { initScrollama } from './narrative/scrollama_setup.js';

console.info('[NYC Mobility] Dashboard initialising…');

async function loadData() {
  const [monthly, daily, events] = await Promise.all([
    fetch('/data/monthly_volume.json').then(r => r.json()),
    fetch('/data/daily_volume.json').then(r => r.json()),
    fetch('/data/events.json').then(r => r.json()),
  ]);
  return { monthly, daily, events };
}

async function main() {
  const loading = document.getElementById('loading');

  try {
    const { monthly, daily, events } = await loadData();

    // Hide loading
    loading.classList.add('hidden');

    // Init controls
    initTaxiToggle(document.getElementById('taxi-type-toggle'));
    initYearSlider(document.getElementById('year-slider'));
    initReset(document.getElementById('reset-btn'));

    // Dashboard V1 — primary instance; brush/clearBrush module exports target this one.
    initV1(document.getElementById('v1-container'), monthly, { primary: true });

    // Narrative V1 — non-primary; subscribes to filterBus for state-driven brushing
    // but does not steal the primary slot used by scrollama steps.
    initV1(document.getElementById('narrative-chart'), monthly, { primary: false });

    // Init V5
    initV5(document.getElementById('v5-container'), { dailyData: daily, events });

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
