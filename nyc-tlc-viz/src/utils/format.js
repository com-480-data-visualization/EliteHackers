/**
 * Number and date formatting utilities.
 * @module format
 */

/**
 * Format a number with comma separators.
 * @param {number} n
 * @returns {string}
 */
export function formatNumber(n) {
  if (n == null || isNaN(n)) return '—';
  return n.toLocaleString('en-US');
}

/**
 * Format large numbers with M/K suffixes.
 * @param {number} n
 * @returns {string}
 */
export function formatCompact(n) {
  if (n == null || isNaN(n)) return '—';
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (Math.abs(n) >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return n.toLocaleString('en-US');
}

/**
 * Format a number as USD.
 * @param {number} n
 * @returns {string}
 */
export function formatUSD(n) {
  if (n == null || isNaN(n)) return '—';
  return '$' + n.toFixed(2);
}

/**
 * Format a percentage value.
 * @param {number} n
 * @returns {string}
 */
export function formatPct(n) {
  if (n == null || isNaN(n)) return '—';
  return n.toFixed(1) + '%';
}

/**
 * Format an hour number (0–23) as a readable time label.
 * @param {number} h - Hour of day (0–23)
 * @returns {string}
 */
export function formatHour(h) {
  if (h === 0 || h === 24) return '12am';
  if (h === 12) return '12pm';
  if (h < 12) return h + 'am';
  return (h - 12) + 'pm';
}

/**
 * Format a year-month string like "2023-01" as "Jan 2023".
 * @param {string} ym
 * @returns {string}
 */
export function formatYearMonth(ym) {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const parts = ym.split('-');
  if (parts.length !== 2) return ym;
  const monthIdx = parseInt(parts[1], 10) - 1;
  return months[monthIdx] + ' ' + parts[0];
}

/** Day-of-week names */
export const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
