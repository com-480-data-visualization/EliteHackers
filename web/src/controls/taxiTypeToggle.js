/** Taxi-type checkbox toggle — updates filterBus.taxiTypes. */

import { update, subscribe, getState } from '../state/filterBus.js';

const TYPES = [
  { key: 'yellow', label: 'Yellow', color: '#f5c542' },
  { key: 'green',  label: 'Green',  color: '#2ecc71' },
  { key: 'fhv',    label: 'FHV',    color: '#9b6ff5' },
];

export function init(container) {
  const state = getState();

  TYPES.forEach(({ key, label, color }) => {
    const btn = document.createElement('button');
    btn.className = 'toggle-btn ' + key + (state.taxiTypes.has(key) ? ' active' : '');
    btn.dataset.type = key;
    btn.innerHTML = `<span class="swatch" style="background:${color}"></span>${label}`;
    btn.addEventListener('click', () => {
      const s = getState();
      const next = new Set(s.taxiTypes);
      if (next.has(key)) {
        if (next.size > 1) next.delete(key);
      } else {
        next.add(key);
      }
      update({ taxiTypes: next });
    });
    container.appendChild(btn);
  });

  subscribe(state => {
    TYPES.forEach(({ key }) => {
      const btn = container.querySelector(`[data-type="${key}"]`);
      if (btn) btn.classList.toggle('active', state.taxiTypes.has(key));
    });
  });
}
