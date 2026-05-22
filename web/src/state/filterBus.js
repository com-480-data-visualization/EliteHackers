/** Global filter state — single source of truth for all dashboard views. */

const state = {
  dateRange: null,
  taxiTypes: new Set(['yellow', 'green', 'fhv']),
  selectedBoroughs: null,   // null = all; Set<string> = specific boroughs
  selectedZone: null,
  selectedCell: null,
  scatterBrush: null,
};

const subscribers = new Set();

export function getState() {
  return {
    ...state,
    taxiTypes: new Set(state.taxiTypes),
    selectedBoroughs: state.selectedBoroughs ? new Set(state.selectedBoroughs) : null,
  };
}

export function subscribe(fn) {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

export function update(partial) {
  Object.assign(state, partial);
  if (Array.isArray(partial.taxiTypes)) state.taxiTypes = new Set(partial.taxiTypes);
  const snap = getState();
  subscribers.forEach(fn => fn(snap));
}

export function reset() {
  update({
    dateRange: null,
    taxiTypes: new Set(['yellow', 'green', 'fhv']),
    selectedBoroughs: null,
    selectedZone: null,
    selectedCell: null,
    scatterBrush: null,
  });
}
