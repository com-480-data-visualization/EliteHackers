/** Year-range dual slider — synced to filterBus.dateRange. */

import { update, subscribe } from '../state/filterBus.js';

const MIN_YEAR = 2015;
const MAX_YEAR = 2024;

export function init(container) {
  container.innerHTML = `
    <span class="yr-label" id="yr-lo-label">${MIN_YEAR}</span>
    <input type="range" id="yr-lo" min="${MIN_YEAR}" max="${MAX_YEAR}" value="${MIN_YEAR}" step="1">
    <span>–</span>
    <input type="range" id="yr-hi" min="${MIN_YEAR}" max="${MAX_YEAR}" value="${MAX_YEAR}" step="1">
    <span class="yr-label" id="yr-hi-label">${MAX_YEAR}</span>
  `;

  const loInput = container.querySelector('#yr-lo');
  const hiInput = container.querySelector('#yr-hi');
  const loLabel = container.querySelector('#yr-lo-label');
  const hiLabel = container.querySelector('#yr-hi-label');

  // Guard: prevents input handler from re-emitting when we update DOM from the bus
  let _updatingFromBus = false;
  let _debounceTimer = null;

  function apply() {
    if (_updatingFromBus) return;
    clearTimeout(_debounceTimer);
    _debounceTimer = setTimeout(() => {
      let lo = parseInt(loInput.value, 10);
      let hi = parseInt(hiInput.value, 10);
      if (lo > hi) [lo, hi] = [hi, lo];
      loLabel.textContent = lo;
      hiLabel.textContent = hi;
      if (lo === MIN_YEAR && hi === MAX_YEAR) {
        update({ dateRange: null });
      } else {
        update({ dateRange: [new Date(lo, 0, 1), new Date(hi, 11, 31, 23, 59, 59)] });
      }
    }, 100);
  }

  loInput.addEventListener('input', apply);
  hiInput.addEventListener('input', apply);

  // Reflect filterBus state (e.g. brush from V1 changes dateRange)
  subscribe(state => {
    _updatingFromBus = true;
    if (!state.dateRange) {
      loInput.value = MIN_YEAR; hiInput.value = MAX_YEAR;
      loLabel.textContent = MIN_YEAR; hiLabel.textContent = MAX_YEAR;
    } else {
      const y0 = new Date(state.dateRange[0]).getFullYear();
      const y1 = new Date(state.dateRange[1]).getFullYear();
      loInput.value = y0; hiInput.value = y1;
      loLabel.textContent = y0; hiLabel.textContent = y1;
    }
    _updatingFromBus = false;
  });
}
