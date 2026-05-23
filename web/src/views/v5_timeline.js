/**
 * V5 — Annotated Event Timeline.
 * Reads: state.dateRange, state.taxiTypes, state.selectedEvent
 * Writes: filterBus.update({ dateRange, selectedEvent }) on event marker click,
 *         a click anywhere on the plot (synthetic single-day inspection),
 *         Prev/Next, and Clear inside the event info panel.
 */

import * as d3 from 'd3';
import { update, subscribe, getState } from '../state/filterBus.js';

const CATEGORY_COLORS = {
  disruption: '#e05252',
  recovery: '#52b788',
  weather: '#4da6ff',
  policy: '#f5a623',
  holiday: '#c084fc',
};

// Neutral color used for a synthetic (clicked-day) selection, which has no
// event category. Distinct from every CATEGORY_COLORS value so a custom
// inspection never visually masquerades as a curated event.
const CUSTOM_COLOR = '#8b95a1';

const TYPES = ['yellow', 'green', 'fhv'];

// Per-taxi colors mirror V1's palette so the per-taxi stat rows in the event
// panel match the rest of the dashboard.
const TAXI_COLORS = {
  yellow: '#f5c542',
  green: '#2ecc71',
  fhv: '#9b6ff5',
};
const TAXI_LABELS = {
  yellow: 'Yellow',
  green: 'Green',
  fhv: 'FHV',
};

// App-wide valid range. daily_volume.json contains stray dates outside 2015–2024
// (parser leftovers from raw TLC files); clamp here so V5 doesn't span 2001–2098.
const APP_RANGE = [new Date('2015-01-01'), new Date('2024-12-31')];

const DAY_MS = 24 * 60 * 60 * 1000;
// Context window padding on each side of an event (Task 2a).
const CONTEXT_PAD_DAYS = 21;
// A click anywhere on the plot selects that day as a synthetic 1-day event;
// the propagated context window is the clicked day ± this many days.
const CUSTOM_DAY_PAD_DAYS = 30;
// Draw week gridlines when the visible x-domain is this short or shorter
// (≈4 months) — matches V1's DAILY_THRESHOLD_DAYS so both views switch to the
// daily-orientation look at the same zoom level.
const DAILY_THRESHOLD_DAYS = 120;
// Hide the recurring Dec 24 – Jan 2 holiday band when the visible window is
// shorter than this. At tight zooms the user is focused on a single event and
// the seasonal strip would read as clutter rather than context.
const HOLIDAY_BAND_MIN_DAYS = 90;

const PARSE = d3.timeParse('%Y-%m-%d');
const FORMAT_ISO = d3.timeFormat('%Y-%m-%d');

let _container, _dailyData, _events, _sortedEvents, _panelEl;

// Session-only cache for the "Explain this day" feature, keyed by the
// `YYYY-MM-DD` date string. Module-scope (not localStorage) so it lives only
// for the current page load — revisiting the same synthetic day during a
// session re-shows the prior result instead of re-calling Gemini.
const _explainCache = new Map();

export function init(container, { dailyData, events }) {
  _container = container;
  _dailyData = dailyData;
  _events = events;

  // Sort events chronologically once for Prev/Next navigation.
  _sortedEvents = events
    .slice()
    .sort((a, b) => PARSE(a.date) - PARSE(b.date));

  _panelEl = document.getElementById('v5-event-panel');

  const state = getState();
  _render(state);
  _renderPanel(state);
  subscribe(s => {
    _render(s);
    _renderPanel(s);
  });
}

// ─── Impact calculation: three-prong per-taxi stats engine ─────────────────────

/**
 * Compute three-prong (before / during / after), per-taxi-type statistics for
 * an event. All three windows have equal length `D` — the event's own duration
 * (inclusive day count, minimum 1 day). Per-type stats are tracked for each
 * active taxi type independently; an aggregate level (mean of summed-across-
 * types daily trips) is also returned so the caller can drive a single
 * natural-language headline (see `describeAggregateTrend`).
 *
 * Pure and total: missing/empty windows return `hasData: false` with `null`
 * stat values rather than throwing. Callers render `—` for null cells.
 *
 * Returns:
 *   {
 *     durationDays: D,
 *     before: { aggregateLevel, hasData, perType: { <type>: { level, volatility } } },
 *     during: { ...same shape... },
 *     after:  { ...same shape... },
 *   }
 * `perType` only contains types in `activeTypes`.
 */
export function computeEventImpact(ev, dailyData, activeTypes) {
  const types = Array.isArray(activeTypes) ? activeTypes.slice() : [];

  function emptyWindow() {
    const perType = {};
    for (const t of types) perType[t] = { level: null, volatility: null };
    return { aggregateLevel: null, hasData: false, perType };
  }

  const blank = {
    durationDays: 0,
    before: emptyWindow(),
    during: emptyWindow(),
    after: emptyWindow(),
  };

  if (!ev || !types.length || !Array.isArray(dailyData)) return blank;

  const eventStart = PARSE(ev.date);
  const eventEnd = ev.end_date ? PARSE(ev.end_date) : eventStart;
  if (!eventStart || !eventEnd || eventEnd < eventStart) return blank;

  const D = Math.max(1, Math.round((eventEnd - eventStart) / DAY_MS) + 1);

  // Short events compare against the SAME days one week away, so the baseline
  // isn't polluted by the weekday/weekend rhythm. Long events use the
  // immediately-adjacent window (it already averages over the weekly cycle).
  const SHORT_EVENT_MAX_DAYS = 7;

  let beforeStart, beforeEnd, afterStart, afterEnd;
  if (D < SHORT_EVENT_MAX_DAYS) {
    beforeStart = new Date(eventStart.getTime() - 7 * DAY_MS);
    beforeEnd   = new Date(eventEnd.getTime()   - 7 * DAY_MS);
    afterStart  = new Date(eventStart.getTime() + 7 * DAY_MS);
    afterEnd    = new Date(eventEnd.getTime()   + 7 * DAY_MS);
  } else {
    beforeStart = new Date(eventStart.getTime() - D * DAY_MS);
    beforeEnd   = new Date(eventStart.getTime() - DAY_MS);
    afterStart  = new Date(eventEnd.getTime()   + DAY_MS);
    afterEnd    = new Date(eventEnd.getTime()   + D * DAY_MS);
  }

  // Index daily trips per type per date for fast window slicing. Duplicate
  // (date, type) rows — should not exist but we collapse defensively — are
  // summed so the stats stay total even on malformed input.
  const typeSet = new Set(types);
  const byTypeByDate = new Map();
  for (const t of types) byTypeByDate.set(t, new Map());
  for (const row of dailyData) {
    if (!typeSet.has(row.type)) continue;
    const trips = +row.trips;
    if (!isFinite(trips)) continue;
    const m = byTypeByDate.get(row.type);
    m.set(row.date, (m.get(row.date) || 0) + trips);
  }

  // Union of all dates that have data for ANY active type. Used both to
  // detect the available date range (so out-of-range windows degrade) and to
  // iterate windows without re-parsing on every call.
  const allDateStrs = new Set();
  for (const m of byTypeByDate.values()) {
    for (const ds of m.keys()) allDateStrs.add(ds);
  }
  const allDates = Array.from(allDateStrs, ds => ({ ds, d: PARSE(ds) }))
    .filter(x => x.d)
    .sort((a, b) => a.d - b.d);
  if (!allDates.length) return { ...blank, durationDays: D };

  const dataMin = allDates[0].d;
  const dataMax = allDates[allDates.length - 1].d;

  function statsForWindow(from, to) {
    const lo = new Date(Math.max(+dataMin, +from));
    const hi = new Date(Math.min(+dataMax, +to));
    if (hi < lo) return emptyWindow();

    const datesInWin = [];
    for (const x of allDates) {
      if (x.d >= lo && x.d <= hi) datesInWin.push(x.ds);
    }
    if (!datesInWin.length) return emptyWindow();

    const perType = {};
    for (const t of types) {
      const m = byTypeByDate.get(t);
      const vals = [];
      for (const ds of datesInWin) {
        const v = m.get(ds);
        if (v != null && isFinite(v)) vals.push(v);
      }
      let level = null;
      let volatility = null;
      if (vals.length) {
        level = d3.mean(vals);
        if (vals.length >= 2 && level && level !== 0) {
          const sd = d3.deviation(vals);
          if (sd != null && isFinite(sd)) volatility = sd / level;
        }
      }
      perType[t] = { level, volatility };
    }

    // Aggregate = mean of per-date totals (sum across active types). A date
    // with NO data for any active type does not contribute to the mean.
    const dailyTotals = [];
    for (const ds of datesInWin) {
      let total = 0;
      let any = false;
      for (const t of types) {
        const v = byTypeByDate.get(t).get(ds);
        if (v != null && isFinite(v)) { total += v; any = true; }
      }
      if (any) dailyTotals.push(total);
    }
    const aggregateLevel = dailyTotals.length ? d3.mean(dailyTotals) : null;

    return {
      aggregateLevel,
      hasData: dailyTotals.length > 0,
      perType,
    };
  }

  return {
    durationDays: D,
    before: statsForWindow(beforeStart, beforeEnd),
    during: statsForWindow(eventStart, eventEnd),
    after: statsForWindow(afterStart, afterEnd),
  };
}

// ─── Aggregate-level trend description ─────────────────────────────────────────

/**
 * Convert the aggregate-level triple (before → during → after) of an impact
 * result into a short human-readable headline. The natural-language phrase is
 * derived from the aggregate mean daily trips ALONE — per-type levels and
 * volatility never influence the prose (they appear only in the grid).
 *
 * `isCustom` switches the wording from event language ("during the event") to
 * day-inspection language ("on the selected day"), since a synthetic single-day
 * selection is not an "event".
 *
 * Logic:
 *  - DURING vs BEFORE → the shock ("fell 69%" / "rose 22%").
 *  - AFTER vs BEFORE → the lasting effect ("recovered to within X%",
 *    "remained X% below baseline", …).
 *  - |change| < 5% on a comparison ⇒ that comparison reads as "roughly flat".
 *  - Both comparisons flat ⇒ a single "changed little" sentence.
 *  - Missing AFTER data is acknowledged rather than invented.
 *
 * Returns { html, direction } where `direction` is 'drop' | 'spike' | 'flat'
 * for the headline's colored emphasis class.
 */
function describeAggregateTrend(impact, isCustom) {
  const beforeLvl = impact.before.aggregateLevel;
  const duringLvl = impact.during.aggregateLevel;
  const afterLvl = impact.after.aggregateLevel;

  // Wording differs for a synthetic single-day inspection vs a real event.
  const duringNoun = isCustom ? 'the selected day' : 'the event';
  const duringWindowNoun = isCustom ? 'the selected day' : 'the event window';
  const beforeNoun = isCustom ? 'a week earlier' : 'before the event';
  const afterNoun = isCustom ? 'a week later' : 'after the event';

  if (!impact.before.hasData || beforeLvl == null || beforeLvl === 0) {
    return {
      html: `Daily trips: <strong>no baseline data</strong> available ${beforeNoun}.`,
      direction: 'flat',
    };
  }
  if (!impact.during.hasData || duringLvl == null) {
    return {
      html: `Daily trips: <strong>no data</strong> for ${duringWindowNoun}.`,
      direction: 'flat',
    };
  }

  const duringChange = ((duringLvl - beforeLvl) / beforeLvl) * 100;
  const hasAfter = impact.after.hasData && afterLvl != null;
  const afterChange = hasAfter ? ((afterLvl - beforeLvl) / beforeLvl) * 100 : null;

  const duringFlat = Math.abs(duringChange) < 5;
  const afterFlat = afterChange !== null && Math.abs(afterChange) < 5;

  if (duringFlat && (afterChange === null || afterFlat)) {
    return {
      html: `Daily trips <strong>changed little</strong> (&lt; 5%) across ${duringWindowNoun}.`,
      direction: 'flat',
    };
  }

  let direction = 'flat';
  let shock;
  if (duringFlat) {
    shock = `Daily trips held roughly flat on ${duringNoun}`;
  } else if (duringChange < 0) {
    direction = 'drop';
    shock = `Daily trips <strong>fell ${Math.abs(duringChange).toFixed(0)}%</strong> on ${duringNoun}`;
  } else {
    direction = 'spike';
    shock = `Daily trips <strong>rose ${duringChange.toFixed(0)}%</strong> on ${duringNoun}`;
  }
  const triplet = ` (${_formatTrips(beforeLvl)} → ${_formatTrips(duringLvl)})`;

  let recovery;
  if (afterChange === null) {
    recovery = `; no data available ${afterNoun}`;
  } else if (afterFlat) {
    const pct = Math.round(Math.abs(afterChange));
    recovery = pct === 0
      ? ', then settled back to baseline'
      : `, then recovered to within ${pct}% of baseline`;
  } else if (afterChange < 0) {
    recovery = ` and remained ${Math.abs(afterChange).toFixed(0)}% below baseline ${afterNoun}`;
  } else {
    recovery = ` and remained ${afterChange.toFixed(0)}% above baseline ${afterNoun}`;
  }

  return { html: `${shock}${triplet}${recovery}.`, direction };
}

// ─── Click / Prev / Next / Clear handlers ──────────────────────────────────────

/**
 * Compute the context window that propagates on an event click.
 * Clamps to APP_RANGE so views never request data outside 2015–2024.
 */
function _contextWindow(ev) {
  const eventStart = PARSE(ev.date);
  const eventEnd = ev.end_date ? PARSE(ev.end_date) : eventStart;
  const winStart = new Date(
    Math.max(+APP_RANGE[0], eventStart.getTime() - CONTEXT_PAD_DAYS * DAY_MS)
  );
  const winEnd = new Date(
    Math.min(+APP_RANGE[1], eventEnd.getTime() + CONTEXT_PAD_DAYS * DAY_MS)
  );
  return [winStart, winEnd];
}

function _selectEvent(ev) {
  if (!ev) return;
  const [winStart, winEnd] = _contextWindow(ev);
  update({ dateRange: [winStart, winEnd], selectedEvent: ev });
}

/**
 * Select an arbitrary clicked day as a synthetic single-day "event". This is
 * what makes the whole V5 plot clickable, not only the curated markers.
 *
 * The synthetic object has `synthetic: true` and a null category/description;
 * it is NOT added to `_events`, so it never appears as a marker and never
 * affects Prev/Next ordering. The stats engine treats it as a D=1 event, so
 * (per the SHORT_EVENT rule) BEFORE/AFTER are the same day one week earlier
 * and one week later. The propagated context window is the clicked day
 * ± CUSTOM_DAY_PAD_DAYS, clamped to APP_RANGE.
 */
function _selectDay(day) {
  if (!day) return;
  const d0 = d3.timeDay.floor(day);
  // Ignore clicks outside the dataset range entirely.
  if (d0 < APP_RANGE[0] || d0 > APP_RANGE[1]) return;

  const synthetic = {
    id: 'custom',
    synthetic: true,
    date: FORMAT_ISO(d0),
    label: _formatDate(d0),
    category: null,
    description: null,
  };

  const winStart = new Date(
    Math.max(+APP_RANGE[0], d0.getTime() - CUSTOM_DAY_PAD_DAYS * DAY_MS)
  );
  const winEnd = new Date(
    Math.min(+APP_RANGE[1], d0.getTime() + CUSTOM_DAY_PAD_DAYS * DAY_MS)
  );
  update({ dateRange: [winStart, winEnd], selectedEvent: synthetic });
}

function _clearSelection() {
  update({ dateRange: null, selectedEvent: null });
}

// ─── Formatting helpers ────────────────────────────────────────────────────────

// Match the y-axis tickFormat convention already in this file.
function _formatTrips(n) {
  if (n == null || !isFinite(n)) return '–';
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}k`;
  return d3.format(',')(Math.round(n));
}

// Panel cells use an em-dash for "no data" (per the impact-stats spec), versus
// the en-dash used by chart axes via `_formatTrips`. Keep these helpers
// separate so we don't accidentally change axis labels.
function _formatLevel(n) {
  if (n == null || !isFinite(n)) return '—';
  return _formatTrips(n);
}

function _formatCV(v) {
  if (v == null || !isFinite(v)) return '—';
  return v.toFixed(2);
}

// "before → during → after" triple for a given per-window value picker.
// `pick` returns the raw value for one window; `fmt` formats it.
function _formatTriple(impact, pick, fmt) {
  return ['before', 'during', 'after']
    .map(w => fmt(pick(impact[w])))
    .join(' → ');
}

function _formatDate(d) {
  return d3.timeFormat('%b %-d, %Y')(d);
}

function _capitalise(s) {
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// X-axis ticks + format chosen by visible window width. Mirrors V1's
// `_xAxisSpec`: zoomed views (≤ DAILY_THRESHOLD_DAYS) get day- or week-stepped
// ticks with a `'%d %b'` format so labels stay readable; wide views keep the
// original yearly ticks.
function _xAxisSpec(xDomain, iw) {
  const days = (xDomain[1] - xDomain[0]) / DAY_MS;
  if (days <= DAILY_THRESHOLD_DAYS) {
    const targetCount = Math.max(2, Math.floor(iw / 80));
    let interval;
    if (days <= targetCount * 2) {
      const step = Math.max(1, Math.ceil(days / targetCount));
      interval = d3.timeDay.every(step);
    } else {
      const weeks = days / 7;
      const step = Math.max(1, Math.ceil(weeks / targetCount));
      interval = d3.timeMonday.every(step);
    }
    return { interval, format: d3.timeFormat('%d %b') };
  }
  return { interval: d3.timeYear.every(1), format: d3.timeFormat('%Y') };
}

// ─── Main chart render ─────────────────────────────────────────────────────────

function _render(state) {
  const el = d3.select(_container);
  el.selectAll('*').remove();

  const rect = _container.getBoundingClientRect();
  const W = Math.max(rect.width || 900, 600);
  const H = 280;
  const M = { top: 32, right: 24, bottom: 48, left: 68 };
  const iw = W - M.left - M.right;
  const ih = H - M.top - M.bottom;

  // Aggregate daily data: sum across active types
  const activeTypes = TYPES.filter(t => state.taxiTypes.has(t));
  const byDate = d3.rollup(
    _dailyData.filter(d => activeTypes.includes(d.type)),
    vs => d3.sum(vs, v => +v.trips),
    d => d.date
  );

  let daily = Array.from(byDate, ([dateStr, trips]) => ({
    date: PARSE(dateStr),
    trips,
  })).filter(d => d.date && d.date >= APP_RANGE[0] && d.date <= APP_RANGE[1])
    .sort((a, b) => a.date - b.date);

  // Determine x-domain: user's brushed range (clamped) or the full app range.
  let xDomain = APP_RANGE;
  if (state.dateRange) {
    const d0 = new Date(Math.max(+APP_RANGE[0], +new Date(state.dateRange[0])));
    const d1 = new Date(Math.min(+APP_RANGE[1], +new Date(state.dateRange[1])));
    if (d1 > d0) {
      xDomain = [d0, d1];
      daily = daily.filter(d => d.date >= d0 && d.date <= d1);
    }
  }

  if (!daily.length) return;

  const xScale = d3.scaleTime()
    .domain(xDomain)
    .range([0, iw]);

  const yMax = d3.max(daily, d => d.trips) || 1;
  const yScale = d3.scaleLinear().domain([0, yMax * 1.1]).range([ih, 0]).nice();

  const svg = d3.select(_container).append('svg').attr('width', W).attr('height', H);
  const g = svg.append('g').attr('transform', `translate(${M.left},${M.top})`);

  // Gridlines
  g.append('g').attr('class', 'gridlines')
    .call(d3.axisLeft(yScale).tickSize(-iw).tickFormat(''))
    .select('.domain').remove();
  g.selectAll('.gridlines line').attr('class', 'gridline');

  // Week gridlines — Monday-aligned verticals, only when zoomed in enough that
  // a daily orientation reads usefully (matches V1's resolution switch).
  // Drawn here so they sit behind the event band, the line/area, and markers.
  const xDomDays = (xDomain[1] - xDomain[0]) / DAY_MS;
  if (xDomDays <= DAILY_THRESHOLD_DAYS) {
    const weeks = d3.timeMonday.range(xDomain[0], xDomain[1]);
    g.append('g').attr('class', 'week-gridlines')
      .selectAll('line')
      .data(weeks)
      .join('line')
        .attr('class', 'gridline week-gridline')
        .attr('x1', d => xScale(d)).attr('x2', d => xScale(d))
        .attr('y1', 0).attr('y2', ih);
  }

  // Recurring holiday band — ambient seasonal context (Dec 24 – Jan 2 of every
  // year intersecting xDomain). Drawn after the gridlines and before the event
  // band / line / area so it sits behind the data without competing with the
  // colored event highlight band.
  _drawHolidayBands(g, xScale, xDomain, ih);

  // Selected-event band (Task 2d) — drawn below the line so it sits behind data.
  if (state.selectedEvent) {
    _drawEventBand(g, state.selectedEvent, xScale, ih);
  }

  // Line
  const line = d3.line()
    .x(d => xScale(d.date))
    .y(d => yScale(d.trips))
    .curve(d3.curveMonotoneX);

  g.append('path').datum(daily)
    .attr('fill', 'none')
    .attr('stroke', 'var(--accent)')
    .attr('stroke-width', 1.5)
    .attr('d', line);

  // Area fill
  const area = d3.area()
    .x(d => xScale(d.date))
    .y0(ih).y1(d => yScale(d.trips))
    .curve(d3.curveMonotoneX);

  g.append('path').datum(daily)
    .attr('fill', 'var(--accent)')
    .attr('fill-opacity', 0.08)
    .attr('d', area);

  // Axes — tick interval + format follow the visible window width so a zoomed
  // event view shows day-precision labels matching V1, while the full view
  // keeps the original yearly ticks.
  const { interval: xTickInterval, format: xTickFormat } = _xAxisSpec(xDomain, iw);
  g.append('g').attr('class', 'axis axis--x')
    .attr('transform', `translate(0,${ih})`)
    .call(d3.axisBottom(xScale).ticks(xTickInterval).tickFormat(xTickFormat))
    .call(ax => ax.select('.domain').remove())
    .selectAll('text').attr('font-size', 11);

  g.append('g').attr('class', 'axis axis--y')
    .call(d3.axisLeft(yScale)
      .tickFormat(d => d >= 1e6 ? `${(d / 1e6).toFixed(1)}M` : d >= 1e3 ? `${(d / 1e3).toFixed(0)}k` : d))
    .call(ax => ax.select('.domain').remove());

  // Hover focus elements for the trip line (Feature A). Visual only —
  // `pointer-events: none` ensures they never intercept the click/move events
  // on the surface below, and they share the same parent `g` so the focus dot
  // and guide line sit in the SAME coordinate space as the line/area
  // (`xScale`/`yScale` values map directly to attribute values, no offset
  // arithmetic). Inserted BEFORE the click surface so the surface still
  // receives `mousemove`; hidden by default until the cursor enters.
  const hoverGuide = g.append('line')
    .attr('class', 'v5-hover-guide')
    .attr('y1', 0).attr('y2', ih)
    .style('opacity', 0);
  const hoverDot = g.append('circle')
    .attr('class', 'v5-hover-dot')
    .attr('r', 4)
    .style('opacity', 0);

  // Separate tooltip instance for the line-hover (shares `.tooltip` styling
  // with the marker tooltip below). Keeping them separate means the hover
  // tooltip can be shown/hidden independently of the marker tooltip without
  // either clobbering the other's contents on rapid mouse moves.
  const hoverTooltip = d3.select(_container).append('div')
    .attr('class', 'tooltip v5-hover-tooltip')
    .style('opacity', 0).style('position', 'absolute');

  // Bisector on the parsed Date — used to find the day in `daily` nearest the
  // cursor in O(log n) on every mousemove.
  const bisectDate = d3.bisector(d => d.date).left;
  const formatTripsExact = d3.format(',');

  // Transparent click surface — covers the whole plot area so a click ANYWHERE
  // selects the day under the cursor as a synthetic single-day inspection.
  // Inserted before markers/tooltip so the markers (added below) sit on top and
  // their own click handlers take precedence; marker handlers additionally call
  // stopPropagation so a marker click never also triggers a day inspection.
  //
  // The SAME rect also drives the line-hover (Feature A): a second overlay
  // would intercept clicks, so `mousemove`/`mouseout` are attached here.
  // Hover is purely visual — it never calls `update()` or `_selectDay`, so
  // hovering ≠ selecting.
  g.append('rect')
    .attr('class', 'v5-click-surface')
    .attr('x', 0).attr('y', 0)
    .attr('width', iw).attr('height', ih)
    .attr('fill', 'transparent')
    .style('cursor', 'crosshair')
    .on('click', function (event) {
      const [mx] = d3.pointer(event, this);
      const day = xScale.invert(mx);
      _selectDay(day);
    })
    .on('mousemove', function (event) {
      if (!daily.length) return;
      const [mx] = d3.pointer(event, this);
      const xDate = xScale.invert(mx);
      const i = bisectDate(daily, xDate);
      const d0 = daily[i - 1];
      const d1 = daily[i];
      const nearest = !d0 ? d1
        : !d1 ? d0
        : (xDate - d0.date > d1.date - xDate ? d1 : d0);
      if (!nearest) return;

      const fx = xScale(nearest.date);
      const fy = yScale(nearest.trips);
      hoverGuide
        .attr('x1', fx).attr('x2', fx)
        .style('opacity', 1);
      hoverDot
        .attr('cx', fx).attr('cy', fy)
        .style('opacity', 1);

      // Position the tooltip in container-space (the rect sits inside a
      // translated <g>, so we ask d3 for the cursor relative to the parent
      // container div that the absolute-positioned tooltip is anchored to).
      const [cx, cy] = d3.pointer(event, _container);
      hoverTooltip
        .style('opacity', 1)
        .html(`<div class="tooltip-title">${_formatDate(nearest.date)}</div>
               <div class="v5-hover-trips">${formatTripsExact(Math.round(nearest.trips))} trips</div>`)
        .style('left', `${cx + 12}px`)
        .style('top', `${cy - 30}px`);
    })
    .on('mouseout', function () {
      hoverGuide.style('opacity', 0);
      hoverDot.style('opacity', 0);
      hoverTooltip.style('opacity', 0);
    });

  // Event markers
  const visibleEvents = _events.filter(ev => {
    const d = PARSE(ev.date);
    return d >= xDomain[0] && d <= xDomain[1];
  });

  const tooltip = d3.select(_container).append('div').attr('class', 'tooltip')
    .style('opacity', 0).style('position', 'absolute');

  visibleEvents.forEach(ev => {
    const evDate = PARSE(ev.date);
    const cx = xScale(evDate);
    const color = CATEGORY_COLORS[ev.category] || '#888';

    const mg = g.append('g').attr('class', 'event-marker')
      .attr('transform', `translate(${cx}, 0)`)
      .style('cursor', 'pointer');

    mg.append('line')
      .attr('y1', 0).attr('y2', ih)
      .attr('stroke', color)
      .attr('stroke-opacity', 0.5)
      .attr('stroke-dasharray', '3,3')
      .attr('stroke-width', 1.5);

    mg.append('circle').attr('cy', -8).attr('r', 5)
      .attr('fill', color).attr('stroke', 'none');

    mg.on('mouseover', function(event) {
      tooltip.style('opacity', 1)
        .html(`<div class="tooltip-title" style="color:${color}">${ev.label}</div>
               <div style="color:var(--text-secondary);font-size:0.78rem">${ev.date}</div>
               <div style="margin-top:6px;max-width:220px;white-space:normal">${ev.description}</div>`)
        .style('left', `${event.offsetX + 12}px`)
        .style('top', `${event.offsetY - 30}px`);
    }).on('mouseout', () => tooltip.style('opacity', 0))
      .on('click', (event) => {
        // Stop the click reaching the underlying click surface, so a marker
        // click selects the curated event rather than a synthetic day.
        event.stopPropagation();
        _selectEvent(ev);
      });
  });

  // Category legend + holiday-band annotation
  const categories = [...new Set(visibleEvents.map(e => e.category))];
  const legendG = g.append('g').attr('transform', `translate(0, ${ih + 32})`);
  categories.forEach((cat, i) => {
    const item = legendG.append('g').attr('transform', `translate(${i * 120}, 0)`);
    item.append('circle').attr('cx', 5).attr('cy', 5).attr('r', 5)
      .attr('fill', CATEGORY_COLORS[cat] || '#888');
    item.append('text').attr('x', 14).attr('y', 9)
      .attr('fill', 'var(--text-muted)').attr('font-size', 10)
      .text(cat.charAt(0).toUpperCase() + cat.slice(1));
  });

  // Holiday-band annotation: explains the recurring amber strip as the
  // Christmas + New Year window. Uses a rect swatch (not a circle) so it
  // visually reads as a band annotation rather than a clickable event
  // category, and only renders when the band itself is showing so the legend
  // never explains something the user can't see on the chart.
  if (xDomDays >= HOLIDAY_BAND_MIN_DAYS) {
    const hItem = legendG.append('g')
      .attr('transform', `translate(${categories.length * 120}, 0)`);
    hItem.append('rect')
      .attr('x', 0).attr('y', 1)
      .attr('width', 10).attr('height', 8)
      .attr('fill', '#d4a574')
      .attr('fill-opacity', 0.55);
    hItem.append('text').attr('x', 14).attr('y', 9)
      .attr('fill', 'var(--text-muted)').attr('font-size', 10)
      .text('Holidays (Christmas and New Year)');
  }
}

// ─── Event band inside V5 (Task 2d) ────────────────────────────────────────────

function _drawEventBand(g, ev, xScale, ih) {
  const color = ev.synthetic ? CUSTOM_COLOR : (CATEGORY_COLORS[ev.category] || '#888');
  const eventStart = PARSE(ev.date);
  const eventEnd = ev.end_date ? PARSE(ev.end_date) : eventStart;
  if (!eventStart) return;

  const [xMin, xMax] = xScale.range();
  // Single-day events get a 1-day band so they remain visible inside the zoom.
  const bandEnd = ev.end_date
    ? eventEnd
    : new Date(eventStart.getTime() + DAY_MS);

  const x0 = Math.max(xMin, xScale(eventStart));
  const x1 = Math.min(xMax, xScale(bandEnd));
  if (x1 > x0) {
    g.append('rect')
      .attr('class', 'event-band')
      .attr('x', x0).attr('y', 0)
      .attr('width', Math.max(2, x1 - x0))
      .attr('height', ih)
      .attr('fill', color);
  }

  const lineX = xScale(eventStart);
  if (lineX >= xMin && lineX <= xMax) {
    g.append('line')
      .attr('class', 'event-band-line')
      .attr('x1', lineX).attr('x2', lineX)
      .attr('y1', 0).attr('y2', ih)
      .attr('stroke', color);
  }
}

// ─── Recurring holiday band (Dec 24 – Jan 2) ───────────────────────────────────

/**
 * Draw a faint translucent rect over every Dec 24 → Jan 2 window that
 * intersects the visible x-domain. This is recurring seasonal context — the
 * annual holiday lull — not an event: non-interactive, warm amber (distinct
 * from every event-category color) at a low fill-opacity so the seasonal
 * rhythm reads as ambient context rather than competing with the trip line
 * or the colored event highlight band.
 *
 * Gated by HOLIDAY_BAND_MIN_DAYS: at very tight zooms the strip would read as
 * noise rather than context, so we draw nothing. Independent of selectedEvent.
 *
 * Bands at the chart edges are clipped to xDomain so partial windows render
 * correctly (mirrors how event markers are filtered to the visible range).
 *
 * EACH visible band gets a small "Holidays" label centered above the band
 * near the top of the plot area. The strips are very narrow (≈10 days) and
 * regularly repeated, so labelling them all (rather than only the first) is
 * what makes the rhythm legible — a viewer reads "Holidays / Holidays /
 * Holidays…" and immediately groups the recurring dips as the same effect.
 */
function _drawHolidayBands(g, xScale, xDomain, ih) {
  const days = (xDomain[1] - xDomain[0]) / DAY_MS;
  if (days < HOLIDAY_BAND_MIN_DAYS) return;

  const [xMin, xMax] = xScale.range();
  // Include the year before xDomain[0] so a domain starting in early January
  // still picks up the tail of the prior Dec 24 – Jan 2 window.
  const startY = xDomain[0].getFullYear() - 1;
  const endY = xDomain[1].getFullYear();

  const bandG = g.append('g').attr('class', 'holiday-bands');

  for (let Y = startY; Y <= endY; Y++) {
    const bandStart = new Date(Y, 11, 24);
    const bandEnd = new Date(Y + 1, 0, 2);
    if (bandEnd < xDomain[0] || bandStart > xDomain[1]) continue;

    const clipStart = bandStart < xDomain[0] ? xDomain[0] : bandStart;
    const clipEnd = bandEnd > xDomain[1] ? xDomain[1] : bandEnd;
    const x0 = Math.max(xMin, xScale(clipStart));
    const x1 = Math.min(xMax, xScale(clipEnd));
    if (x1 <= x0) continue;

    bandG.append('rect')
      .attr('class', 'holiday-band')
      .attr('x', x0).attr('y', 0)
      .attr('width', x1 - x0)
      .attr('height', ih);

    bandG.append('text')
      .attr('class', 'holiday-band-label')
      .attr('x', x0 + (x1 - x0) / 2)
      .attr('y', 11)
      .attr('text-anchor', 'middle')
      .text('Holidays');
  }
}

// ─── "Explain this day" — Gemini proxy client ──────────────────────

/**
 * Ask the server-side Gemini proxy for a short, human-readable explanation of
 * what happened in NYC on `dateStr` (`YYYY-MM-DD`) that could plausibly move
 * the taxi-trip volume. Does no DOM work — Task 2's click handler renders the
 * result. Always returns a string on success or throws a caught `Error` whose
 * `.message` is suitable for showing to the user.
 *
 * `impact` is the computeEventImpact result for the selected day. We forward
 * the observed before/during levels and % change so the server prompt can
 * state the REAL direction and magnitude of the change — without this the
 * model can get the direction backwards (claiming a surge on a day trips
 * actually fell).
 *
 * Security: the Gemini key is NEVER read here. The browser only ever talks to
 * the same-origin `/api/explain` proxy; the key lives only in
 * `process.env.GEMINI_API_KEY` server-side.
 */
async function _explainDay(dateStr, impact) {
  // Derive the observed change from the aggregate before/during levels the
  // panel already computed. All fields optional — the server falls back to
  // neutral phrasing if they're missing.
  let impactPayload = null;
  if (impact && impact.before && impact.during) {
    const beforeLevel = impact.before.aggregateLevel;
    const duringLevel = impact.during.aggregateLevel;
    const pctChange =
      (typeof beforeLevel === 'number' && beforeLevel !== 0 &&
       typeof duringLevel === 'number')
        ? ((duringLevel - beforeLevel) / beforeLevel) * 100
        : null;
    impactPayload = { pctChange, beforeLevel, duringLevel };
  }

  const res = await fetch('/api/explain', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ date: dateStr, impact: impactPayload }),
  });

  if (!res.ok) {
    let msg = 'Could not explain this day right now.';
    try {
      const errJson = await res.json();
      if (errJson && typeof errJson.error === 'string' && errJson.error) {
        msg = errJson.error;
      }
    } catch {
      // Body was not JSON — keep the generic message.
    }
    throw new Error(msg);
  }

  const data = await res.json().catch(() => null);
  if (!data || typeof data.explanation !== 'string' || !data.explanation.trim()) {
    throw new Error('Empty response from Gemini');
  }
  return data.explanation;
}

// ─── Persistent info panel (Tasks 2c + 2e) ─────────────────────────────────────

function _renderPanel(state) {
  if (!_panelEl) return;

  const ev = state.selectedEvent;
  if (!ev) {
    _panelEl.className = 'event-panel event-panel--empty';
    _panelEl.innerHTML =
      '<p class="event-panel__hint">Click any day on the timeline to inspect it, or click a marker for a known event.</p>';
    return;
  }

  const isCustom = !!ev.synthetic;
  const color = isCustom ? CUSTOM_COLOR : (CATEGORY_COLORS[ev.category] || '#888');
  const evStart = PARSE(ev.date);
  const evEnd = ev.end_date ? PARSE(ev.end_date) : null;
  const dateLabel = evEnd
    ? `${_formatDate(evStart)} – ${_formatDate(evEnd)}`
    : _formatDate(evStart);

  // Prev/Next navigation.
  //  - Real event: step to the chronologically adjacent curated event.
  //  - Synthetic day: jump to the nearest curated event before / after the
  //    clicked day, so Prev/Next stays useful instead of being dead.
  let prevEv = null;
  let nextEv = null;
  if (isCustom) {
    for (const e of _sortedEvents) {
      if (PARSE(e.date) < evStart) prevEv = e;
      else if (PARSE(e.date) > evStart) { nextEv = e; break; }
    }
  } else {
    const idx = _sortedEvents.findIndex(e => e.id === ev.id);
    prevEv = idx > 0 ? _sortedEvents[idx - 1] : null;
    nextEv = idx >= 0 && idx < _sortedEvents.length - 1
      ? _sortedEvents[idx + 1]
      : null;
  }

  // Impact stats respect the live taxi-type toggle: aggregate headline and the
  // per-taxi grid both re-derive from the current active types on every render.
  const activeTypes = TYPES.filter(t => state.taxiTypes.has(t));
  const impact = computeEventImpact(ev, _dailyData, activeTypes);
  const impactHtml = _impactPanelHtml(impact, activeTypes, isCustom);

  // Header meta line: a real event shows its category dot + label; a synthetic
  // day inspection has no category, so it shows a neutral "Selected day" tag.
  const metaCategory = isCustom
    ? `<span class="event-panel__meta-item">
         <span class="event-panel__category-dot" style="background:${color}"></span>
         Selected day
       </span>`
    : `<span class="event-panel__meta-item">
         <span class="event-panel__category-dot" style="background:${color}"></span>
         ${_escape(_capitalise(ev.category))}
       </span>`;

  // A synthetic day has no description; omit the paragraph entirely rather
  // than rendering an empty one.
  const descriptionHtml = (!isCustom && ev.description)
    ? `<p class="event-panel__description">${_escape(ev.description)}</p>`
    : '';

  // "Explain this day" UI (Feature B) — ONLY for synthetic day selections,
  // never for curated events (those already carry a human-written
  // description). The button and result container are emitted together so the
  // panel layout doesn't shift between idle and post-click states; the
  // container is initially empty (no automatic fetch on render — the Gemini
  // call only happens on click).
  const explainBtnHtml = isCustom
    ? `<button class="event-panel__btn event-panel__btn--explain" data-action="explain">Explain this day</button>`
    : '';
  const explainContainerHtml = isCustom
    ? `<div class="event-explain" id="v5-explain"></div>`
    : '';

  _panelEl.className = 'event-panel';
  _panelEl.innerHTML = `
    <div class="event-panel__header">
      <div class="event-panel__title-group">
        <div class="event-panel__title" style="color:${color}">${_escape(ev.label)}</div>
        <div class="event-panel__meta">
          ${metaCategory}
          <span class="event-panel__meta-item">${_escape(dateLabel)}</span>
        </div>
      </div>
      <div class="event-panel__controls">
        <button class="event-panel__btn" data-action="prev" ${prevEv ? '' : 'disabled'}>← Prev</button>
        <button class="event-panel__btn" data-action="next" ${nextEv ? '' : 'disabled'}>Next →</button>
        ${explainBtnHtml}
        <button class="event-panel__btn event-panel__btn--clear" data-action="clear">Clear</button>
      </div>
    </div>
    ${descriptionHtml}
    ${explainContainerHtml}
    ${impactHtml}
  `;

  // Wire up button handlers (innerHTML wipes any prior listeners).
  _panelEl.querySelector('[data-action="prev"]')
    ?.addEventListener('click', () => _selectEvent(prevEv));
  _panelEl.querySelector('[data-action="next"]')
    ?.addEventListener('click', () => _selectEvent(nextEv));
  _panelEl.querySelector('[data-action="clear"]')
    ?.addEventListener('click', _clearSelection);

  // Wire up the "Explain this day" button + render any cached result so the
  // panel re-render (e.g. after a taxi-type toggle) does not erase a prior
  // explanation the user already loaded for this date.
  if (isCustom) {
    const explainBtnEl = _panelEl.querySelector('[data-action="explain"]');
    const explainContainerEl = _panelEl.querySelector('#v5-explain');
    if (explainContainerEl && _explainCache.has(ev.date)) {
      _renderExplanation(explainContainerEl, _explainCache.get(ev.date));
    }
    if (explainBtnEl && explainContainerEl) {
      explainBtnEl.addEventListener('click', async () => {
        const date = ev.date;

        if (_explainCache.has(date)) {
          _renderExplanation(explainContainerEl, _explainCache.get(date));
          return;
        }

        explainBtnEl.disabled = true;
        explainContainerEl.className = 'event-explain event-explain--loading';
        explainContainerEl.textContent = 'Asking Gemini…';

        try {
          const explanation = await _explainDay(date, impact);
          _explainCache.set(date, explanation);
          _renderExplanation(explainContainerEl, explanation);
        } catch (err) {
          const msg = (err && err.message) ? err.message
            : 'Could not explain this day right now.';
          explainContainerEl.className = 'event-explain event-explain--error';
          // Escape the message — even though we control most error strings,
          // some flow through from the API and must be treated as untrusted.
          explainContainerEl.innerHTML = `<p class="event-explain__error">${_escape(msg)}</p>`;
        } finally {
          // Re-enable so the user can retry (a transient failure, e.g. a
          // network blip, shouldn't wedge the button).
          explainBtnEl.disabled = false;
        }
      });
    }
  }
}

/**
 * Render a successful Gemini explanation into the container. Gemini output is
 * UNTRUSTED — we escape via `_escape` and never innerHTML the raw text. CSS
 * `white-space: pre-wrap` on `.event-explain__text` preserves any paragraph
 * breaks Gemini returned without us having to parse them.
 */
function _renderExplanation(container, text) {
  container.className = 'event-explain event-explain--success';
  container.innerHTML = `<p class="event-explain__text">${_escape(text)}</p>`;
}

/**
 * Build the impact block HTML: the aggregate-trend headline followed by a
 * compact per-taxi grid (mean daily trips and CV, each shown as a
 * Before → During → After triple). One row per type in `activeTypes`.
 *
 * Rows are filtered to types that have data in at least one of the three
 * windows: if a type's `level` is null across all of before / during / after
 * (e.g. FHV when the event is fully before FHV started in the dataset), the
 * row is omitted entirely instead of being rendered as three em-dashes.
 * Types that exist for part of the windows (e.g. an event straddling FHV's
 * start) still render with `—` in the empty cells — those dashes carry the
 * meaningful "this type didn't exist yet" signal.
 *
 * If no active type has any data in the windows, the grid is dropped entirely
 * and only the headline remains.
 *
 * `isCustom` only adjusts the headline wording (event vs. selected-day
 * language); the grid is identical for both.
 */
function _impactPanelHtml(impact, activeTypes, isCustom) {
  if (!impact || !activeTypes.length) return '';

  const trend = describeAggregateTrend(impact, isCustom);
  const headline =
    `<div class="event-panel__impact event-panel__impact--${trend.direction}">${trend.html}</div>`;

  const WINDOWS = ['before', 'during', 'after'];
  const typesWithData = activeTypes.filter(t =>
    WINDOWS.some(w => impact[w].perType[t]?.level != null)
  );
  if (!typesWithData.length) return headline;

  const rows = typesWithData.map(t => {
    const color = TAXI_COLORS[t] || '#888';
    const label = TAXI_LABELS[t] || _capitalise(t);
    const levels = _formatTriple(impact, w => w.perType[t]?.level, _formatLevel);
    const cvs = _formatTriple(impact, w => w.perType[t]?.volatility, _formatCV);
    return `
      <div class="event-stats__row">
        <span class="event-stats__type" style="color:${color}">${_escape(label)}</span>
        <span class="event-stats__metric">
          <span class="event-stats__metric-label">Mean daily trips</span>
          <span class="event-stats__metric-value">${levels}</span>
        </span>
        <span class="event-stats__metric">
          <span class="event-stats__metric-label">Volatility (CV)</span>
          <span class="event-stats__metric-value">${cvs}</span>
        </span>
      </div>`;
  }).join('');

  // The window-length legend reads naturally for both cases: a real event's
  // duration in days, or "1-day" for a synthetic single-day inspection.
  const grid = `
    <div class="event-stats" aria-label="Per-taxi impact statistics">
      <div class="event-stats__legend">Before → During → After (${impact.durationDays}-day windows)</div>
      ${rows}
    </div>`;

  return headline + grid;
}

function _escape(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}