/**
 * Narrative data transforms.
 *
 * Input: the raw `daily_volume.json` array — one row per (date, taxi-type).
 *
 * Output:
 *   • `daily`      — one row per calendar day in [2015-01-01, 2024-12-31],
 *                    with per-type counts and a `total` (sum of active types).
 *   • `byYear`     — Map<year, Array<row>> with `dayKey` ("MM-DD"), useful for
 *                    aligning all ten years on a shared Jan-1..Dec-31 axis.
 *                    Feb 29 is kept (sparkline thumbnails use raw daily data)
 *                    but consumers that need leap-year-safe alignment use
 *                    `byYearAligned` below.
 *   • `byYearAligned` — same as `byYear` but Feb 29 dropped, so series are
 *                    directly comparable on the (month, day) axis.
 *   • `byYearSmoothed` — `byYearAligned` with a 7-day CENTERED rolling mean
 *                    applied to `total`. Used by the overlay view; raw daily
 *                    sawtooth obscures the holiday dips at overlay scale.
 */

import * as d3 from 'd3';

const TYPES = ['yellow', 'green', 'fhv'];
const SMOOTH_WINDOW = 7; // 7-day centered rolling mean for overlay
// UTC parser: `daily_volume.json` dates are calendar dates with no time
// component. If we used `d3.timeParse` (local time) then on any host east of
// UTC, midnight-local would round-trip through `getUTCFullYear()` as the
// previous year — e.g. "2015-01-01" -> 2014. UTC parse keeps the year stable
// across machines.
const _parseDate = d3.utcParse('%Y-%m-%d');

function _toDaily(raw) {
  const byDate = new Map();
  for (const r of raw) {
    if (!TYPES.includes(r.type)) continue;
    let row = byDate.get(r.date);
    if (!row) {
      row = { date: r.date, yellow: 0, green: 0, fhv: 0 };
      byDate.set(r.date, row);
    }
    row[r.type] += +r.trips || 0;
  }

  const out = [...byDate.values()]
    .filter(r => r.date && _parseDate(r.date))
    .map(r => {
      const dt = _parseDate(r.date);
      return {
        date: dt,
        dateStr: r.date,
        year: dt.getUTCFullYear(),
        month: dt.getUTCMonth() + 1,
        day: dt.getUTCDate(),
        dayKey: `${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`,
        yellow: r.yellow,
        green: r.green,
        fhv: r.fhv,
        total: r.yellow + r.green + r.fhv,
      };
    })
    .sort((a, b) => a.date - b.date);

  return out;
}

/** Per-year groupings keyed by calendar year (2015..2024). */
function _toByYear(daily) {
  const m = new Map();
  for (const row of daily) {
    const y = row.year;
    if (!m.has(y)) m.set(y, []);
    m.get(y).push(row);
  }
  for (const arr of m.values()) arr.sort((a, b) => a.date - b.date);
  return m;
}

function _smoothYear(rows) {
  const half = Math.floor(SMOOTH_WINDOW / 2);
  const n = rows.length;
  return rows.map((r, i) => {
    const lo = Math.max(0, i - half);
    const hi = Math.min(n - 1, i + half);
    let sum = 0, cnt = 0;
    for (let j = lo; j <= hi; j++) { sum += rows[j].total; cnt++; }
    return { ...r, total: sum / cnt, totalRaw: r.total };
  });
}

export function buildNarrativeData(raw) {
  const daily = _toDaily(raw);
  const byYear = _toByYear(daily);

  const byYearAligned = new Map();
  const byYearSmoothed = new Map();
  for (const [year, rows] of byYear) {
    // Drop Feb 29 for leap-year-safe (month, day) alignment.
    const aligned = rows.filter(r => !(r.month === 2 && r.day === 29));
    byYearAligned.set(year, aligned);
    byYearSmoothed.set(year, _smoothYear(aligned));
  }

  const years = [...byYear.keys()].sort((a, b) => a - b);
  const dateExtent = d3.extent(daily, d => d.date);
  const totalExtent = d3.extent(daily, d => d.total);

  return {
    daily,
    byYear,
    byYearAligned,
    byYearSmoothed,
    years,
    dateExtent,
    totalExtent,
  };
}

/**
 * Average daily total trips by day-of-week (1=Mon..7=Sun) within a date
 * window. Returned as a 7-row array indexed 0..6 (Mon..Sun), so the three
 * Step-8 panels line up identically.
 *
 * @param {Array} daily      `data.daily` array (parsed Date objects).
 * @param {string} d0Str     window start, inclusive, "YYYY-MM-DD".
 * @param {string} d1Str     window end,   inclusive, "YYYY-MM-DD".
 */
export function dowAverages(daily, d0Str, d1Str) {
  const d0 = _parseDate(d0Str);
  const d1 = _parseDate(d1Str);
  const sums = [0, 0, 0, 0, 0, 0, 0];
  const cnts = [0, 0, 0, 0, 0, 0, 0];
  let totalSum = 0;
  let totalCnt = 0;
  for (const r of daily) {
    if (r.date < d0 || r.date > d1) continue;
    // JS getUTCDay: 0=Sun..6=Sat. Convert to 0=Mon..6=Sun.
    const dow = (r.date.getUTCDay() + 6) % 7;
    sums[dow] += r.total;
    cnts[dow]++;
    totalSum += r.total;
    totalCnt++;
  }
  const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  return {
    rows: labels.map((label, i) => ({
      dow: i,
      label,
      mean: cnts[i] > 0 ? sums[i] / cnts[i] : 0,
    })),
    overallMean: totalCnt > 0 ? totalSum / totalCnt : 0,
    d0Str,
    d1Str,
  };
}

/**
 * Sub-array of `daily` constrained to [d0, d1] inclusive.
 * Returns the actual minimum-total row in that window too, so callers
 * pin the trough annotation to the real data point rather than a
 * hardcoded coordinate.
 */
export function dailySlice(daily, d0Str, d1Str) {
  const d0 = _parseDate(d0Str);
  const d1 = _parseDate(d1Str);
  const rows = daily.filter(r => r.date >= d0 && r.date <= d1);
  let trough = null;
  for (const r of rows) {
    if (!trough || r.total < trough.total) trough = r;
  }
  return { rows, trough };
}
