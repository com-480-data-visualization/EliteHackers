/**
 * Runtime-computed statistics for the narrative copy and the overlay tooltip.
 *
 * All percentages are computed from `daily_volume.json` at load time — no
 * value displayed in copy is hardcoded.
 *
 *   julyDip:    Jul 4 daily total vs. Jul 11-25 mean baseline (per year)
 *   yearEndDip: Dec 24 - Jan 1 mean vs. Dec 8-18 mean baseline (per year)
 *   covidTrough: April 2020 mean daily total vs. April 2019 mean
 *
 * Per-year numbers feed the overlay tooltip; cross-year averages feed the
 * step copy.
 */

/** Mean of a numeric field over rows whose `dayKey` falls in [from, to]. */
function _meanInRange(rows, from, to, field = 'total') {
  let sum = 0, cnt = 0;
  for (const r of rows) {
    if (r.dayKey >= from && r.dayKey <= to) {
      sum += r[field];
      cnt++;
    }
  }
  return cnt > 0 ? sum / cnt : null;
}

/** Find the row whose dayKey exactly matches `key` (e.g. "07-04"). */
function _rowAtDayKey(rows, key, field = 'total') {
  for (const r of rows) {
    if (r.dayKey === key) return r[field];
  }
  return null;
}

/**
 * Per-year July 4th dip percentage.
 *
 * Baseline: Jul 11-25 in the same year (a normal-July window that avoids
 * the holiday itself and the weeks immediately adjacent).
 *
 * Returns Map<year, { dropPct, jul4, baseline }>.
 * `dropPct` is positive when Jul 4 is below the baseline (a true "dip").
 */
export function julyDips(byYearAligned) {
  const out = new Map();
  for (const [year, rows] of byYearAligned) {
    const jul4 = _rowAtDayKey(rows, '07-04');
    const baseline = _meanInRange(rows, '07-11', '07-25');
    if (jul4 == null || baseline == null || baseline === 0) continue;
    const dropPct = (1 - jul4 / baseline) * 100;
    out.set(year, { dropPct, jul4, baseline });
  }
  return out;
}

/**
 * Per-year year-end dip percentage.
 *
 * Compares Dec 24 + Dec 25 + Dec 26 + Dec 31 + Jan 1 (year's own holiday
 * cluster) against a normal-December baseline (Dec 8-18). The cluster
 * spans the year boundary; we average within the same year's rows since
 * `byYearAligned` keys by calendar year — Jan 1 of year Y is in year Y,
 * which already pairs naturally with Dec 24-31 of year Y. The visual
 * "year-end cliff" is the comparison of that cluster's mean to the early-
 * December baseline.
 *
 * Returns Map<year, { dropPct, holidayMean, baseline }>.
 */
export function yearEndDips(byYearAligned) {
  const out = new Map();
  for (const [year, rows] of byYearAligned) {
    const holidayKeys = ['12-24', '12-25', '12-26', '12-31', '01-01'];
    const holidayRows = rows.filter(r => holidayKeys.includes(r.dayKey));
    if (holidayRows.length === 0) continue;
    const holidayMean = holidayRows.reduce((s, r) => s + r.total, 0) / holidayRows.length;
    const baseline = _meanInRange(rows, '12-08', '12-18');
    if (baseline == null || baseline === 0) continue;
    const dropPct = (1 - holidayMean / baseline) * 100;
    out.set(year, { dropPct, holidayMean, baseline });
  }
  return out;
}

/**
 * COVID trough percentage: April-2020 mean daily volume vs. April-2019 mean.
 *
 * Uses the raw (un-smoothed) per-year aligned series — we want the actual
 * volume drop, not a smoothed approximation.
 */
export function covidTrough(byYearAligned) {
  const r2019 = byYearAligned.get(2019);
  const r2020 = byYearAligned.get(2020);
  if (!r2019 || !r2020) return null;
  const apr2019 = _meanInRange(r2019, '04-01', '04-30');
  const apr2020 = _meanInRange(r2020, '04-01', '04-30');
  if (apr2019 == null || apr2020 == null || apr2019 === 0) return null;
  const dropPct = (1 - apr2020 / apr2019) * 100;
  return { dropPct, apr2019, apr2020 };
}

/** Mean of a numeric series, ignoring null/NaN entries. */
function _meanOf(arr) {
  let sum = 0, cnt = 0;
  for (const v of arr) {
    if (v != null && !Number.isNaN(v)) { sum += v; cnt++; }
  }
  return cnt > 0 ? sum / cnt : null;
}

/**
 * Cross-year averages for headline copy. Returns:
 *   { julyDipMean, yearEndDipMean }
 *
 * Rounded sensibly by the caller (no false precision).
 */
export function crossYearAverages({ julyDipsMap, yearEndDipsMap }) {
  return {
    julyDipMean: _meanOf([...julyDipsMap.values()].map(v => v.dropPct)),
    yearEndDipMean: _meanOf([...yearEndDipsMap.values()].map(v => v.dropPct)),
  };
}

/**
 * Compute everything the narrative needs in one place. Saves the call site
 * from re-deriving overlapping numbers.
 */
export function buildNarrativeStats(narrativeData) {
  const { byYearAligned } = narrativeData;
  const julyDipsMap = julyDips(byYearAligned);
  const yearEndDipsMap = yearEndDips(byYearAligned);
  const trough = covidTrough(byYearAligned);
  const cross = crossYearAverages({ julyDipsMap, yearEndDipsMap });
  return {
    julyDipsMap,
    yearEndDipsMap,
    covidTroughPct: trough ? trough.dropPct : null,
    covidTroughDetail: trough,
    julyDipMean: cross.julyDipMean,
    yearEndDipMean: cross.yearEndDipMean,
  };
}
