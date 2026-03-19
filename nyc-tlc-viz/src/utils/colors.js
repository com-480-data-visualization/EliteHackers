/**
 * Centralized color palette for all visualizations.
 * @module colors
 */

/** Vehicle type color mapping — consistent across all charts */
export const VEHICLE_COLORS = {
  yellow: '#f5c542',
  green: '#2ecc71',
  fhv: '#9b59b6',
  fhvhv: '#3498db',
};

/** Vehicle type display labels */
export const VEHICLE_LABELS = {
  yellow: 'Yellow Taxi',
  green: 'Green Taxi',
  fhv: 'For-Hire Vehicle',
  fhvhv: 'High Volume FHV',
};

/** Time-of-day bar colors (EDA Viz 4) */
export const TIME_COLORS = {
  night: '#1a237e',
  morning: '#f5a623',
  afternoon: '#00897b',
  evening: '#e8553d',
};

/**
 * Return the time-of-day category for a given hour.
 * @param {number} hour - 0–23
 * @returns {string}
 */
export function getTimeCategory(hour) {
  if (hour <= 5) return 'night';
  if (hour <= 11) return 'morning';
  if (hour <= 17) return 'afternoon';
  return 'evening';
}

/** Payment type colors */
export const PAYMENT_COLORS = {
  'Credit card': '#00897b',
  'Cash': '#f5a623',
  'No charge': '#90a4ae',
  'Dispute': '#78909c',
  'Unknown': '#b0bec5',
  'Voided trip': '#cfd8dc',
};

/** Sequential choropleth scale (7 steps: light yellow to dark red) */
export const CHOROPLETH_STOPS = [
  '#ffffcc', '#fed976', '#feb24c', '#fd8d3c', '#fc4e2a', '#e31a1c', '#b10026',
];

/** Borough OD heatmap scale */
export const HEATMAP_SCALE = ['#f7fbff', '#c6dbef', '#6baed6', '#2171b5', '#08306b'];
