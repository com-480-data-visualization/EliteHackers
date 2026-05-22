/** Borough area toggle — writes filterBus.selectedBoroughs. */

import { update, subscribe, getState } from '../state/filterBus.js';

const BOROUGH_COLORS = {
  Manhattan:      '#4da6ff',
  Brooklyn:       '#f5c542',
  Queens:         '#2ecc71',
  Bronx:          '#e05252',
  'Staten Island':'#c084fc',
  EWR:            '#f5a623',
};

export function init(container, boroughList) {
  if (!boroughList?.length) return;

  // null sentinel represents "All areas" button
  const options = [null, ...boroughList];

  options.forEach(b => {
    const isAll = b === null;
    const color  = BOROUGH_COLORS[b];
    const btn = document.createElement('button');
    btn.className = 'toggle-btn borough-btn';
    btn.dataset.borough = isAll ? '__all__' : b;

    if (isAll) {
      btn.textContent = 'All areas';
    } else {
      btn.innerHTML = `<span class="swatch" style="background:${color}"></span>${b}`;
    }

    btn.addEventListener('click', () => {
      const cur = getState().selectedBoroughs;
      if (isAll) {
        update({ selectedBoroughs: null });
      } else {
        const next = cur ? new Set(cur) : new Set();
        if (next.has(b)) {
          next.delete(b);
          update({ selectedBoroughs: next.size === 0 ? null : next });
        } else {
          next.add(b);
          update({ selectedBoroughs: next });
        }
      }
    });

    container.appendChild(btn);
  });

  function sync(state) {
    const sel = state.selectedBoroughs;
    container.querySelectorAll('.borough-btn').forEach(btn => {
      const b      = btn.dataset.borough;
      const isAll  = b === '__all__';
      const active = isAll ? sel === null : (sel?.has(b) ?? false);
      btn.classList.toggle('active', active);
      if (!isAll) {
        const col = BOROUGH_COLORS[b];
        btn.style.background   = active ? col  : '';
        btn.style.borderColor  = active ? 'transparent' : '';
        btn.style.color        = active ? '#0f1117' : '';
      }
    });
  }

  sync(getState());
  subscribe(sync);
}
