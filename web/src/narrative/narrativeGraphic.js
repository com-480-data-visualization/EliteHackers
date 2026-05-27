/**
 * Phase-1 narrative graphic — self-contained, scroll-driven module.
 *
 * Imports NOTHING from `src/views/` or `src/state/` (the dashboard half of
 * the codebase). Owns its own SVG roots and never touches filterBus.
 *
 * Architecture: one root container with three stacked "layers" (timeline,
 * year-overlay-plus-multiples, weekly-shapes). Each scroll step calls
 * `instance.setStep(state)` with the COMPLETE graphic state for that step;
 * the graphic figures out which layer to fade in and how to redraw. There
 * is no `exit()` — every `setStep` is self-sufficient so scrolling up or
 * down always lands on a correct frame.
 *
 * Reduced-motion: a `prefers-reduced-motion: reduce` user preference shrinks
 * all transitions to 0 ms (handled below by `_dur`).
 *
 * @typedef {Object} StepState
 * @property {'timeline'|'overlay'|'weekly'} view
 * @property {{d0: Date, d1: Date}|null} [zoom]      timeline zoom window
 * @property {{year: number, d0: Date, d1: Date}|null} [ghost]
 * @property {boolean} [annotateTrough]              draw the -97% callout
 * @property {null|'jul'|'dec'|'both'} [highlight]   overlay band highlight
 * @property {boolean} [multiplesVisible]
 */

import * as d3 from 'd3';

const COLOR_NEUTRAL    = '#e6edf3';   // matches --text-primary
const COLOR_GREY_LINE  = '#586069';   // matches --text-muted (dim overlay lines)
const COLOR_JUL        = '#f5a623';   // matches --color-policy (amber)
const COLOR_DEC        = '#e05252';   // matches --color-disruption (red)
const COLOR_SEP        = '#52b788';   // matches --color-recovery (green) — used
                                      // for the September rebound. Distinct from
                                      // the dip accents so a *rise* reads as
                                      // recovery, not loss.
const COLOR_COVID      = '#e05252';
const COLOR_GHOST      = '#4da6ff';   // matches --accent

const MARGIN_TIMELINE = { top: 24, right: 28, bottom: 32, left: 56 };
const MARGIN_OVERLAY  = { top: 24, right: 28, bottom: 28, left: 56 };
const MARGIN_THUMB    = { top: 6,  right: 4,  bottom: 6,  left: 4 };
const MARGIN_WEEKLY   = { top: 32, right: 16, bottom: 46, left: 44 };

// Each window carries a `kind` so the tooltip + accent colour can be decided
// without re-deriving from index position. `sep` is a *lift* not a dip; the
// tooltip uses positive "+X%" formatting and looks up `septemberLiftsMap`.
const HIGHLIGHT_WINDOWS = {
  jul: [{ from: '07-01', to: '07-08', kind: 'jul' }],
  sep: [{ from: '09-01', to: '09-10', kind: 'sep' }],
  dec: [{ from: '12-22', to: '12-31', kind: 'dec' }, { from: '01-01', to: '01-02', kind: 'dec' }],
  all: [
    { from: '07-01', to: '07-08', kind: 'jul' },
    { from: '09-01', to: '09-10', kind: 'sep' },
    { from: '12-22', to: '12-31', kind: 'dec' },
    { from: '01-01', to: '01-02', kind: 'dec' },
  ],
};
const ACCENT_BY_KIND = { jul: COLOR_JUL, sep: COLOR_SEP, dec: COLOR_DEC };

/**
 * `prefers-reduced-motion` is read once at construction. If the user toggles
 * the OS preference mid-session they'll get the new behavior on next reload —
 * good enough for a static site, and avoids re-binding listeners per step.
 */
const PREFERS_REDUCED_MOTION =
  typeof window !== 'undefined' &&
  window.matchMedia &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function _dur(ms) { return PREFERS_REDUCED_MOTION ? 0 : ms; }

/** Build a reference Date in 2024 (leap year) from a "MM-DD" key. Used as
 *  the canonical x-axis domain for the overlay so all years align by
 *  (month, day) regardless of which year they came from. We pick 2024 only
 *  so the axis labels look natural; the year of the date object is irrelevant
 *  to the visual. */
function _refDate(monthDay) {
  return new Date(Date.UTC(2024, +monthDay.slice(0, 2) - 1, +monthDay.slice(3, 5)));
}

const NUM_FMT_COMPACT = d3.format('.2s');

/**
 * Format trip totals as e.g. "1.2M" / "850k". Replaces D3's trailing "G" with
 * "B" so the COVID-era 1.2-billion trip totals read naturally to a US reader.
 */
function _fmtTrips(n) {
  if (n == null || Number.isNaN(n)) return '—';
  return NUM_FMT_COMPACT(n).replace('G', 'B');
}

/* ─── factory ─────────────────────────────────────────────────────────── */

/**
 * @param {HTMLElement} container  the sticky-graphic root (e.g. `#narrative-chart`)
 * @param {Object} data            output of `buildNarrativeData`
 * @param {Object} stats           output of `buildNarrativeStats`
 * @param {Object} [opts]
 * @param {Array<{label:string, d0:string, d1:string}>} [opts.weeklyWindows]
 *        Three windows for Step 8. Each window's daily-mean is computed at
 *        render time, not hardcoded.
 */
export function createNarrativeGraphic(container, data, stats, opts = {}) {
  const root = d3.select(container).classed('narrative-graphic-root', true);
  root.attr('role', 'group');

  // ARIA summary — read by screen readers as the accessible static
  // fallback. Refreshed by `setStep` so it always describes the current beat.
  const ariaSummary = root
    .append('div')
    .attr('class', 'ng-aria-summary')
    .attr('role', 'status')
    .attr('aria-live', 'polite');

  // FHV footnote — surfaces the pre-2019 data gap on views where it's
  // actually relevant (the timeline and the 10-year overlay both span the
  // gap). Hidden on the weekly-shapes step, which is entirely about 2020
  // and where the footnote was colliding with the panel-group title.
  const footnote = root
    .append('div')
    .attr('class', 'ng-footnote')
    .text('Pre-Feb 2019 totals are Yellow + Green only; FHV reporting began Feb 2019.');

  // Tooltip — one DOM node reused across layers.
  const tooltip = root
    .append('div')
    .attr('class', 'ng-tooltip')
    .style('opacity', 0);

  // Layers. Each is its own absolutely-positioned <div>; switching views is a
  // CSS opacity cross-fade. Within a layer, normal d3 transitions handle the
  // smaller updates (highlight, zoom, ghost).
  const timelineLayer = root.append('div').attr('class', 'ng-layer ng-layer--timeline').style('opacity', 0);
  const overlayLayer  = root.append('div').attr('class', 'ng-layer ng-layer--overlay').style('opacity', 0);
  const weeklyLayer   = root.append('div').attr('class', 'ng-layer ng-layer--weekly').style('opacity', 0);

  /* ─── timeline layer ─────────────────────────────────────────────── */
  const timeline = _buildTimeline(timelineLayer, data, tooltip);

  /* ─── overlay layer (overlay chart + small-multiples strip) ─────── */
  const overlay = _buildOverlay(overlayLayer, data, stats, tooltip);

  /* ─── weekly layer ──────────────────────────────────────────────── */
  const weeklyWindows = opts.weeklyWindows ?? [];
  const weekly = _buildWeekly(weeklyLayer, data, weeklyWindows);

  let _currentView = null;

  function setStep(state) {
    const view = state.view;
    if (view !== _currentView) {
      timelineLayer.transition().duration(_dur(450)).style('opacity', view === 'timeline' ? 1 : 0);
      overlayLayer .transition().duration(_dur(450)).style('opacity', view === 'overlay'  ? 1 : 0);
      weeklyLayer  .transition().duration(_dur(450)).style('opacity', view === 'weekly'   ? 1 : 0);
      _currentView = view;
    }

    if (view === 'timeline') {
      timeline.update({
        zoom: state.zoom || null,
        ghost: state.ghost || null,
        annotateTrough: !!state.annotateTrough,
        // Forward the computed percentage. Forgetting this here is what
        // made the trough annotation read "-0%" — the timeline closure had
        // no way to know the real pct otherwise.
        troughPct: Number.isFinite(state.troughPct) ? state.troughPct : 0,
      });
    } else if (view === 'overlay') {
      overlay.update({
        highlight: state.highlight || null,
        multiplesVisible: !!state.multiplesVisible,
      });
    } else if (view === 'weekly') {
      weekly.update();
    }

    // The FHV footnote is rendered at the top of the chart frame and would
    // collide with the weekly-shapes panel-group title (which lives at the
    // top of that layer). Hide it on the weekly step; it's also off-topic
    // there — that step is entirely about 2020.
    footnote.style('display', view === 'weekly' ? 'none' : '');

    ariaSummary.text(state.aria || '');
  }

  function resize() {
    timeline.resize();
    overlay.resize();
    weekly.resize();
  }
  window.addEventListener('resize', resize);

  return { setStep, resize };
}

/* ─── timeline layer ───────────────────────────────────────────────────── */

function _buildTimeline(layer, data, tooltip) {
  const svg = layer.append('svg').attr('class', 'ng-svg ng-svg--timeline');
  const gMain = svg.append('g').attr('class', 'ng-main');

  const axisXGroup = gMain.append('g').attr('class', 'axis axis--x');
  const axisYGroup = gMain.append('g').attr('class', 'axis axis--y');

  const areaPath  = gMain.append('path').attr('class', 'ng-timeline-area');
  const linePath  = gMain.append('path').attr('class', 'ng-timeline-line');
  const ghostPath = gMain.append('path').attr('class', 'ng-timeline-ghost').style('opacity', 0);
  const ghostLabel = gMain.append('text').attr('class', 'ng-timeline-ghost-label').style('opacity', 0);

  // Annotation order (back-to-front): leader, chip, then label + sub text.
  // The dot is drawn last so it sits *above* the line/area paths and reads
  // as the anchor. The chip is solid enough (CSS `fill-opacity`) to keep
  // the text legible over the busy April-2020 / 2019-ghost area.
  const annotationGroup  = gMain.append('g').attr('class', 'ng-annotation').style('opacity', 0);
  const annotationLeader = annotationGroup.append('line').attr('class', 'ng-annotation-leader');
  const annotationChip   = annotationGroup.append('rect').attr('class', 'ng-annotation-chip');
  const annotationLabel  = annotationGroup.append('text').attr('class', 'ng-annotation-label');
  const annotationSub    = annotationGroup.append('text').attr('class', 'ng-annotation-sub');
  const annotationDot    = annotationGroup.append('circle').attr('class', 'ng-annotation-dot').attr('r', 5);

  // Hover layer — invisible overlay that captures mouse for the tooltip.
  const hoverLine = gMain.append('line').attr('class', 'ng-hover-guide').style('opacity', 0);
  const hoverDot  = gMain.append('circle').attr('class', 'ng-hover-dot').attr('r', 3.5).style('opacity', 0);

  const fullExtent = data.dateExtent;
  let _state = { zoom: null, ghost: null, annotateTrough: false, troughPct: 0 };
  let _innerW = 0, _innerH = 0, _x, _y;

  function _resize() {
    const { width, height } = layer.node().getBoundingClientRect();
    if (width === 0 || height === 0) return;
    svg.attr('width', width).attr('height', height).attr('viewBox', `0 0 ${width} ${height}`);
    gMain.attr('transform', `translate(${MARGIN_TIMELINE.left},${MARGIN_TIMELINE.top})`);
    _innerW = Math.max(0, width - MARGIN_TIMELINE.left - MARGIN_TIMELINE.right);
    _innerH = Math.max(0, height - MARGIN_TIMELINE.top - MARGIN_TIMELINE.bottom);
    _redraw();
  }

  function _redraw() {
    const domain = _state.zoom ? [_state.zoom.d0, _state.zoom.d1] : fullExtent;
    _x = d3.scaleUtc().domain(domain).range([0, _innerW]);

    const rowsInWindow = data.daily.filter(d => d.date >= domain[0] && d.date <= domain[1]);
    const yMax = d3.max(rowsInWindow, d => d.total) || 1;
    _y = d3.scaleLinear().domain([0, yMax]).nice().range([_innerH, 0]);

    const line = d3.line()
      .defined(d => Number.isFinite(d.total))
      .x(d => _x(d.date))
      .y(d => _y(d.total))
      .curve(d3.curveMonotoneX);

    const area = d3.area()
      .defined(d => Number.isFinite(d.total))
      .x(d => _x(d.date))
      .y0(_innerH)
      .y1(d => _y(d.total))
      .curve(d3.curveMonotoneX);

    const t = d3.transition().duration(_dur(550));

    areaPath.datum(rowsInWindow).transition(t).attr('d', area);
    linePath.datum(rowsInWindow).transition(t).attr('d', line);

    axisXGroup.attr('transform', `translate(0,${_innerH})`)
      .transition(t)
      .call(d3.axisBottom(_x).ticks(Math.max(3, _innerW / 110)).tickSizeOuter(0));
    axisYGroup.transition(t).call(d3.axisLeft(_y).ticks(5).tickFormat(_fmtTrips));

    /* ghost 2019 line (counterfactual) */
    if (_state.ghost) {
      const { year, d0, d1 } = _state.ghost;
      const ghostRows = data.byYear.get(year) || [];
      // Map ghost-year dates into the *current* x-scale: shift each ghost
      // date by (currentDomainStart.year - ghostYear) so 2019-04-01 lines up
      // with the position 2020-04-01 occupies on the current axis. This is
      // the "counterfactual" overlay — what 2020 would have looked like if
      // it had followed 2019.
      const yearShift = domain[0].getUTCFullYear() - year;
      const projected = ghostRows
        .map(r => ({
          dateProj: new Date(Date.UTC(r.year + yearShift, r.month - 1, r.day)),
          total: r.total,
        }))
        .filter(r => r.dateProj >= d0 && r.dateProj <= d1);
      const ghostLine = d3.line()
        .defined(d => Number.isFinite(d.total))
        .x(d => _x(d.dateProj))
        .y(d => _y(d.total))
        .curve(d3.curveMonotoneX);
      ghostPath.datum(projected).transition(t).attr('d', ghostLine).style('opacity', 0.85);
      const lastPt = projected[projected.length - 1];
      if (lastPt) {
        ghostLabel
          .attr('x', _x(lastPt.dateProj) - 6)
          .attr('y', _y(lastPt.total) - 8)
          .text(`${year} trajectory`)
          .transition(t).style('opacity', 0.9);
      }
    } else {
      ghostPath.transition(t).style('opacity', 0);
      ghostLabel.transition(t).style('opacity', 0);
    }

    /* trough annotation */
    if (_state.annotateTrough) {
      // Pin the dot to the *actual* minimum total in [domain[0], domain[1]] —
      // not a hardcoded coordinate. The percentage comes from `stats` via
      // `_state.troughPct` (April-2020 mean vs. April-2019 mean), so the
      // displayed number is computed end-to-end.
      const trough = rowsInWindow.reduce(
        (best, r) => (!best || r.total < best.total ? r : best),
        null,
      );
      if (trough) {
        const pct = Number.isFinite(_state.troughPct) ? _state.troughPct : 0;
        const labelText = `\u2212${Math.abs(pct).toFixed(0)}%`; // U+2212 minus
        const subText   = d3.utcFormat('%b %d, %Y')(trough.date);

        const cx = _x(trough.date);
        const cy = _y(trough.total);

        // Chip dimensions are fixed (rather than measured via getBBox) so the
        // d3 transition interpolates a stable rectangle — getBBox during a
        // transition is unreliable, and the text we render here is always
        // "-NN%" + a date, with bounded length.
        const CHIP_W = 118, CHIP_H = 46;
        const STAND_OFF = 24;   // gap between dot and chip along the leader

        // Place the chip up + to the side of the dot. The trough sits at the
        // bottom of the chart with the dashed 2019 ghost line passing high
        // above; up-and-out is always into open space. We prefer the right
        // side; flip to the left when there's no room.
        const wantsRight = (cx + STAND_OFF + CHIP_W + 6) <= _innerW;
        const dirX = wantsRight ? 1 : -1;
        const rawChipX = cx + dirX * STAND_OFF + (dirX < 0 ? -CHIP_W : 0);
        const rawChipY = cy - 110;

        // Clamp so the chip always sits fully inside the plot area.
        const chipX = Math.min(Math.max(4, rawChipX), Math.max(4, _innerW - CHIP_W - 4));
        const chipY = Math.min(Math.max(4, rawChipY), Math.max(4, _innerH - CHIP_H - 4));

        // The leader meets the *edge* of the chip facing the dot, with a
        // small inset so the dashes don't overprint the chip border.
        const leaderEndX = wantsRight ? chipX : (chipX + CHIP_W);
        const leaderEndY = chipY + CHIP_H / 2;

        const padX = 11;
        const labelBaselineY = chipY + 24;
        const subBaselineY   = chipY + 39;

        annotationDot.transition(t).attr('cx', cx).attr('cy', cy);
        annotationLeader.transition(t)
          .attr('x1', cx).attr('y1', cy)
          .attr('x2', leaderEndX).attr('y2', leaderEndY);
        annotationChip.transition(t)
          .attr('x', chipX).attr('y', chipY)
          .attr('width', CHIP_W).attr('height', CHIP_H);
        annotationLabel.transition(t)
          .attr('x', chipX + padX).attr('y', labelBaselineY)
          .text(labelText);
        annotationSub.transition(t)
          .attr('x', chipX + padX).attr('y', subBaselineY)
          .text(subText);
        annotationGroup.transition(t).style('opacity', 1);
      }
    } else {
      annotationGroup.transition(t).style('opacity', 0);
    }
  }

  // Hover — show a tooltip with the day's total. Cheap binary search on the
  // current-window slice.
  function _attachHover() {
    const captureRect = gMain.append('rect')
      .attr('class', 'ng-hover-capture')
      .attr('x', 0).attr('y', 0)
      .attr('fill', 'transparent')
      .attr('pointer-events', 'all');

    function refresh() {
      captureRect.attr('width', _innerW).attr('height', _innerH);
    }

    captureRect.on('mousemove', (event) => {
      const [mx] = d3.pointer(event, gMain.node());
      const date = _x.invert(mx);
      const domain = _state.zoom ? [_state.zoom.d0, _state.zoom.d1] : fullExtent;
      const rows = data.daily.filter(d => d.date >= domain[0] && d.date <= domain[1]);
      if (rows.length === 0) return;
      const bisect = d3.bisector(d => d.date).left;
      const i = bisect(rows, date);
      const a = rows[Math.max(0, i - 1)];
      const b = rows[Math.min(rows.length - 1, i)];
      const row = (!b || (a && (date - a.date) < (b.date - date))) ? a : b;
      if (!row) return;
      const cx = _x(row.date);
      const cy = _y(row.total);
      hoverLine.attr('x1', cx).attr('x2', cx).attr('y1', 0).attr('y2', _innerH).style('opacity', 0.7);
      hoverDot.attr('cx', cx).attr('cy', cy).style('opacity', 1);
      tooltip
        .style('opacity', 1)
        .html(
          `<div class="ng-tt-title">${d3.utcFormat('%b %d, %Y')(row.date)}</div>` +
          `<div class="ng-tt-row"><span>Total trips</span><strong>${_fmtTrips(row.total)}</strong></div>`,
        )
        .style('left', `${cx + MARGIN_TIMELINE.left + 14}px`)
        .style('top',  `${cy + MARGIN_TIMELINE.top - 8}px`);
    });
    captureRect.on('mouseleave', () => {
      hoverLine.style('opacity', 0);
      hoverDot.style('opacity', 0);
      tooltip.style('opacity', 0);
    });

    const obs = new ResizeObserver(refresh);
    obs.observe(layer.node());
    refresh();
  }
  _attachHover();

  return {
    update(state) {
      _state = state;
      _redraw();
    },
    resize: _resize,
  };
}

/* ─── overlay layer ────────────────────────────────────────────────────── */

function _buildOverlay(layer, data, stats, tooltip) {
  const chartWrap = layer.append('div').attr('class', 'ng-overlay-chart-wrap');
  const svg = chartWrap.append('svg').attr('class', 'ng-svg ng-svg--overlay');
  const gMain = svg.append('g').attr('class', 'ng-main');

  const bandsGroup     = gMain.append('g').attr('class', 'ng-overlay-bands');
  const greyLinesGroup = gMain.append('g').attr('class', 'ng-overlay-grey');
  const accentLinesGroup = gMain.append('g').attr('class', 'ng-overlay-accent');
  const hoverGroup     = gMain.append('g').attr('class', 'ng-overlay-hover');
  const axisXGroup     = gMain.append('g').attr('class', 'axis axis--x');
  const axisYGroup     = gMain.append('g').attr('class', 'axis axis--y');

  const multiplesWrap = layer.append('div').attr('class', 'ng-multiples');
  const multipleLabel = layer.append('div').attr('class', 'ng-multiples-label').text('Hover a year below to highlight it');

  let _innerW = 0, _innerH = 0, _x, _y;
  let _state = { highlight: null, multiplesVisible: false };
  let _hoverYear = null;

  // Day-of-year domain in 2024 reference space — leap-year-safe because the
  // upstream data already dropped Feb 29.
  const xDomain = [_refDate('01-01'), _refDate('12-31')];

  // Stash precomputed line strings? Too small to bother — we redraw on
  // resize and on highlight changes; cheap.

  function _resize() {
    const wrapRect = chartWrap.node().getBoundingClientRect();
    if (wrapRect.width === 0 || wrapRect.height === 0) return;
    svg.attr('width', wrapRect.width).attr('height', wrapRect.height).attr('viewBox', `0 0 ${wrapRect.width} ${wrapRect.height}`);
    gMain.attr('transform', `translate(${MARGIN_OVERLAY.left},${MARGIN_OVERLAY.top})`);
    _innerW = Math.max(0, wrapRect.width - MARGIN_OVERLAY.left - MARGIN_OVERLAY.right);
    _innerH = Math.max(0, wrapRect.height - MARGIN_OVERLAY.top - MARGIN_OVERLAY.bottom);
    _redraw();
    _resizeMultiples();
  }

  function _redraw() {
    _x = d3.scaleUtc().domain(xDomain).range([0, _innerW]);

    const allSmoothed = [...data.byYearSmoothed.values()].flat();
    const yMax = d3.max(allSmoothed, d => d.total) || 1;
    _y = d3.scaleLinear().domain([0, yMax]).nice().range([_innerH, 0]);

    const line = d3.line()
      .defined(d => Number.isFinite(d.total))
      .x(d => _x(_refDate(d.dayKey)))
      .y(d => _y(d.total))
      .curve(d3.curveMonotoneX);

    const t = d3.transition().duration(_dur(450));

    /* Highlight bands */
    const windows = _state.highlight ? HIGHLIGHT_WINDOWS[_state.highlight] : [];
    bandsGroup.selectAll('rect.ng-overlay-band')
      .data(windows, (_, i) => `${_state.highlight}-${i}`)
      .join(
        enter => enter.append('rect')
          .attr('class', 'ng-overlay-band')
          .attr('y', 0)
          .attr('x', d => _x(_refDate(d.from)))
          .attr('width', d => Math.max(2, _x(_refDate(d.to)) - _x(_refDate(d.from))))
          .attr('height', _innerH)
          .attr('fill', (d, i) => _windowAccent(_state.highlight, i))
          .style('opacity', 0)
          .call(sel => sel.transition(t).style('opacity', 0.18)),
        update => update
          .attr('x', d => _x(_refDate(d.from)))
          .attr('width', d => Math.max(2, _x(_refDate(d.to)) - _x(_refDate(d.from))))
          .attr('height', _innerH)
          .attr('fill', (d, i) => _windowAccent(_state.highlight, i)),
        exit => exit.transition(t).style('opacity', 0).remove(),
      );

    /* Grey baseline lines — every year */
    const greyJoin = greyLinesGroup.selectAll('path.ng-overlay-line')
      .data([...data.byYearSmoothed.entries()], ([y]) => y);
    greyJoin.join(
      enter => enter.append('path')
        .attr('class', 'ng-overlay-line')
        .attr('fill', 'none')
        .attr('stroke', COLOR_GREY_LINE)
        .attr('stroke-width', 1)
        .style('opacity', 0.32)
        .attr('d', ([, rows]) => line(rows)),
      update => update
        .style('opacity', d => {
          if (_hoverYear != null && d[0] === _hoverYear) return 0.95;
          if (_hoverYear != null) return 0.10;
          return 0.32;
        })
        .attr('stroke', d => (_hoverYear != null && d[0] === _hoverYear) ? COLOR_NEUTRAL : COLOR_GREY_LINE)
        .attr('stroke-width', d => (_hoverYear != null && d[0] === _hoverYear) ? 1.6 : 1)
        .attr('d', ([, rows]) => line(rows)),
      exit => exit.remove(),
    );

    /* Accent segments inside the highlight bands — drawn per-(year, window).
       Within each highlighted window we redraw that year's line segment in
       the window-specific accent color, thicker and at full opacity. */
    accentLinesGroup.selectAll('*').remove();
    if (_state.highlight) {
      for (const [, rows] of data.byYearSmoothed) {
        for (let wi = 0; wi < windows.length; wi++) {
          const win = windows[wi];
          const seg = rows.filter(r => r.dayKey >= win.from && r.dayKey <= win.to);
          if (seg.length < 2) continue;
          accentLinesGroup.append('path')
            .datum(seg)
            .attr('class', 'ng-overlay-line ng-overlay-line--accent')
            .attr('fill', 'none')
            .attr('stroke', _windowAccent(_state.highlight, wi))
            .attr('stroke-width', 1.8)
            .style('opacity', 0.9)
            .attr('d', line);
        }
      }
    }

    /* Axes */
    axisXGroup.attr('transform', `translate(0,${_innerH})`)
      .transition(t)
      .call(d3.axisBottom(_x).ticks(d3.utcMonth.every(1)).tickFormat(d3.utcFormat('%b')).tickSizeOuter(0));
    axisYGroup.transition(t).call(d3.axisLeft(_y).ticks(5).tickFormat(_fmtTrips));

    _attachOverlayHover();

    /* Multiples */
    if (_state.multiplesVisible) {
      multiplesWrap.style('display', 'flex');
      multipleLabel.style('display', 'block');
      _renderMultiples();
    } else {
      multiplesWrap.style('display', 'none');
      multipleLabel.style('display', 'none');
    }
  }

  function _windowAccent(mode, index) {
    const win = HIGHLIGHT_WINDOWS[mode]?.[index];
    return win ? ACCENT_BY_KIND[win.kind] : COLOR_GREY_LINE;
  }

  /* Multiples strip */
  function _renderMultiples() {
    multiplesWrap.selectAll('*').remove();
    const years = data.years;
    for (const year of years) {
      const cell = multiplesWrap.append('div')
        .attr('class', 'ng-mult-cell')
        .attr('data-year', year)
        .on('mouseenter', () => { _hoverYear = year; cell.classed('is-active', true); _highlightYearOnly(year); })
        .on('mouseleave', () => { _hoverYear = null; multiplesWrap.selectAll('.ng-mult-cell').classed('is-active', false); _highlightYearOnly(null); });
      cell.append('div').attr('class', 'ng-mult-year').text(year);
      cell.append('div').attr('class', 'ng-mult-spark');
    }
    _resizeMultiples();
  }

  function _resizeMultiples() {
    multiplesWrap.selectAll('.ng-mult-cell').each(function () {
      const cell = d3.select(this);
      const year = +cell.attr('data-year');
      const sparkContainer = cell.select('.ng-mult-spark');
      sparkContainer.selectAll('*').remove();
      const sparkRect = sparkContainer.node().getBoundingClientRect();
      if (sparkRect.width === 0 || sparkRect.height === 0) return;
      const sparkSvg = sparkContainer.append('svg')
        .attr('width', sparkRect.width).attr('height', sparkRect.height)
        .attr('viewBox', `0 0 ${sparkRect.width} ${sparkRect.height}`);
      const sparkG = sparkSvg.append('g')
        .attr('transform', `translate(${MARGIN_THUMB.left},${MARGIN_THUMB.top})`);
      const innerW = sparkRect.width - MARGIN_THUMB.left - MARGIN_THUMB.right;
      const innerH = sparkRect.height - MARGIN_THUMB.top - MARGIN_THUMB.bottom;

      const rows = data.byYear.get(year) || []; // raw, unsmoothed
      const sx = d3.scaleUtc().domain(xDomain).range([0, innerW]);
      const sy = d3.scaleLinear().domain([0, d3.max([...data.byYear.values()].flat(), d => d.total) || 1]).range([innerH, 0]);
      const sLine = d3.line()
        .defined(d => Number.isFinite(d.total))
        .x(d => sx(_refDate(d.dayKey)))
        .y(d => sy(d.total));

      /* Active window marker */
      const windows = _state.highlight ? HIGHLIGHT_WINDOWS[_state.highlight] : [];
      for (let wi = 0; wi < windows.length; wi++) {
        const win = windows[wi];
        sparkG.append('rect')
          .attr('class', 'ng-mult-band')
          .attr('x', sx(_refDate(win.from)))
          .attr('width', Math.max(1, sx(_refDate(win.to)) - sx(_refDate(win.from))))
          .attr('y', 0).attr('height', innerH)
          .attr('fill', _windowAccent(_state.highlight, wi))
          .style('opacity', 0.22);
      }

      sparkG.append('path')
        .datum(rows)
        .attr('class', 'ng-mult-line')
        .attr('fill', 'none')
        .attr('stroke', COLOR_GREY_LINE)
        .attr('stroke-width', 0.8)
        .style('opacity', 0.85)
        .attr('d', sLine);
    });
  }

  function _highlightYearOnly(year) {
    greyLinesGroup.selectAll('path.ng-overlay-line')
      .style('opacity', d => {
        if (year == null) return 0.32;
        return d[0] === year ? 0.95 : 0.08;
      })
      .attr('stroke', d => (year != null && d[0] === year) ? COLOR_NEUTRAL : COLOR_GREY_LINE)
      .attr('stroke-width', d => (year != null && d[0] === year) ? 1.7 : 1);
  }

  /* Overlay hover — generic anywhere, plus kind-aware tooltips inside bands.
   *
   * Two stacked hit layers inside `hoverGroup`:
   *   1) a base full-area capture (appended first → underneath) that shows
   *      a per-year date+value tooltip wherever the cursor is. This is what
   *      makes Thanksgiving / Memorial-Day / Presidents'-Day dips discoverable
   *      without a dedicated band, per the spec.
   *   2) per-band hit-rects (appended after → on top) that fire a richer
   *      "dip / lift" tooltip with the runtime % from the matching stats map.
   */
  function _attachOverlayHover() {
    hoverGroup.selectAll('*').remove();

    const _placeTooltip = (event) => {
      const [mx] = d3.pointer(event, gMain.node());
      tooltip
        .style('left', `${mx + MARGIN_OVERLAY.left + 12}px`)
        .style('top',  `${event.offsetY + 4}px`);
    };
    const _clearTooltip = () => {
      tooltip.style('opacity', 0);
      _highlightYearOnly(_hoverYear);
    };

    /* 1) Generic per-year tooltip anywhere on the overlay */
    hoverGroup.append('rect')
      .attr('class', 'ng-overlay-base-capture')
      .attr('width', _innerW).attr('height', _innerH)
      .attr('fill', 'transparent')
      .attr('pointer-events', 'all')
      .on('mousemove', (event) => {
        const [mx, my] = d3.pointer(event, gMain.node());
        const cursorDate = _x.invert(mx);
        const dayKey =
          `${String(cursorDate.getUTCMonth() + 1).padStart(2, '0')}-` +
          `${String(cursorDate.getUTCDate()).padStart(2, '0')}`;

        // Prefer the year a thumbnail is being hovered; otherwise pick the
        // year whose smoothed curve at this dayKey is closest to the cursor.
        let pickedYear = null, pickedRow = null;
        if (_hoverYear != null) {
          const r = data.byYearSmoothed.get(_hoverYear)?.find(x => x.dayKey === dayKey);
          if (r) { pickedYear = _hoverYear; pickedRow = r; }
        }
        if (pickedYear == null) {
          const yVal = _y.invert(my);
          let bestDist = Infinity;
          for (const [year, rows] of data.byYearSmoothed) {
            const r = rows.find(x => x.dayKey === dayKey);
            if (!r) continue;
            const d = Math.abs(r.total - yVal);
            if (d < bestDist) { bestDist = d; pickedYear = year; pickedRow = r; }
          }
        }
        if (pickedYear == null) return;
        tooltip
          .style('opacity', 1)
          .html(
            `<div class="ng-tt-title">${d3.utcFormat('%b %d')(cursorDate)} \u00b7 ${pickedYear}</div>` +
            `<div class="ng-tt-row"><span>Avg. daily trips</span><strong>${_fmtTrips(pickedRow.total)}</strong></div>`,
          );
        _placeTooltip(event);
        _highlightYearOnly(pickedYear);
      })
      .on('mouseleave', _clearTooltip);

    /* 2) Per-band, kind-aware tooltip (dip / lift) */
    if (!_state.highlight) return;
    const windows = HIGHLIGHT_WINDOWS[_state.highlight];

    for (let wi = 0; wi < windows.length; wi++) {
      const win = windows[wi];
      const x1 = _x(_refDate(win.from));
      const x2 = _x(_refDate(win.to));
      hoverGroup.append('rect')
        .attr('x', x1).attr('y', 0)
        .attr('width', Math.max(2, x2 - x1))
        .attr('height', _innerH)
        .attr('fill', 'transparent')
        .attr('pointer-events', 'all')
        .on('mousemove', (event) => {
          const isLift = win.kind === 'sep';
          const map =
            win.kind === 'jul' ? stats.julyDipsMap :
            win.kind === 'sep' ? stats.septemberLiftsMap :
            stats.yearEndDipsMap;
          const accent = ACCENT_BY_KIND[win.kind];
          const valueOf = (info) => isLift ? info.liftPct : info.dropPct;

          // Prefer the hovered thumbnail's year; otherwise pick the year with
          // the most extreme effect (deepest dip / biggest lift).
          let pickedYear = _hoverYear;
          if (pickedYear == null || !map.has(pickedYear)) {
            let bestMag = -Infinity;
            for (const [year, info] of map) {
              const mag = valueOf(info);
              if (mag > bestMag) { bestMag = mag; pickedYear = year; }
            }
          }
          if (pickedYear == null) return;
          const info = map.get(pickedYear);
          if (!info) return;

          const value = valueOf(info);
          const sign  = isLift ? '+' : '\u2212';
          const title = isLift ? 'September rebound'
                               : (win.kind === 'jul' ? 'July 4th dip' : 'Year-end dip');
          const subline = isLift ? 'Lift vs. August baseline' : 'Drop vs. baseline';

          tooltip
            .style('opacity', 1)
            .html(
              `<div class="ng-tt-title">${title}</div>` +
              `<div class="ng-tt-row"><span>Year</span><strong>${pickedYear}</strong></div>` +
              `<div class="ng-tt-row"><span>${subline}</span><strong style="color:${accent}">${sign}${Math.abs(value).toFixed(0)}%</strong></div>`,
            );
          _placeTooltip(event);
          _highlightYearOnly(pickedYear);
        })
        .on('mouseleave', _clearTooltip);
    }
  }

  return {
    update(state) {
      _state = state;
      _redraw();
    },
    resize: _resize,
  };
}

/* ─── weekly-shapes layer (Step 8) ────────────────────────────────────── */

function _buildWeekly(layer, data, windows) {
  // Three panels in a row. They share a y-scale so the reader sees the
  // collapse in absolute terms — `during` should be a near-flat near-zero
  // line below the `before` and `after` envelopes.
  layer.append('h3').attr('class', 'ng-weekly-title').text('Weekly rhythm — before / during / after the PAUSE');
  const panels = layer.append('div').attr('class', 'ng-weekly-panels');

  // Lazy import: dowAverages — but we don't want a circular import. Inline a
  // minimal aggregator here instead, identical in shape to data.js's.
  function _agg(d0Str, d1Str) {
    const _parse = d3.utcParse('%Y-%m-%d');
    const d0 = _parse(d0Str), d1 = _parse(d1Str);
    const sums = [0, 0, 0, 0, 0, 0, 0];
    const cnts = [0, 0, 0, 0, 0, 0, 0];
    let totalSum = 0, totalCnt = 0;
    for (const r of data.daily) {
      if (r.date < d0 || r.date > d1) continue;
      const dow = (r.date.getUTCDay() + 6) % 7;
      sums[dow] += r.total;
      cnts[dow]++;
      totalSum += r.total;
      totalCnt++;
    }
    return {
      rows: ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map((label, i) => ({
        label, mean: cnts[i] > 0 ? sums[i] / cnts[i] : 0,
      })),
      overallMean: totalCnt > 0 ? totalSum / totalCnt : 0,
    };
  }

  // Pre-compute all three panels so we can lock a shared y-axis.
  const aggs = windows.map(w => ({ ...w, ...(_agg(w.d0, w.d1)) }));
  const yMaxShared = d3.max(aggs, p => d3.max(p.rows, r => r.mean)) || 1;

  const cells = panels.selectAll('div.ng-weekly-cell')
    .data(aggs)
    .enter().append('div')
    .attr('class', d => `ng-weekly-cell ng-weekly-cell--${d.label.toLowerCase().replace(/\s+/g, '-')}`);

  cells.append('div').attr('class', 'ng-weekly-cell-label')
    .text(d => d.label);
  cells.append('div').attr('class', 'ng-weekly-cell-range')
    .text(d => `${d.d0} → ${d.d1}`);
  cells.append('div').attr('class', 'ng-weekly-cell-mean')
    .text(d => `Mean: ${_fmtTrips(d.overallMean)} trips/day`);

  const chartHolders = cells.append('div').attr('class', 'ng-weekly-cell-chart');

  // Track instances for resize.
  const instances = [];
  chartHolders.each(function (d) {
    const holder = d3.select(this);
    const svg = holder.append('svg').attr('class', 'ng-svg ng-svg--weekly');
    const gMain = svg.append('g').attr('class', 'ng-main');
    const linePath = gMain.append('path').attr('class', 'ng-weekly-line');
    const dotsGroup = gMain.append('g').attr('class', 'ng-weekly-dots');
    const axisXGroup = gMain.append('g').attr('class', 'axis axis--x');
    const axisYGroup = gMain.append('g').attr('class', 'axis axis--y');

    instances.push({ holder, svg, gMain, linePath, dotsGroup, axisXGroup, axisYGroup, data: d });
  });

  function _resize() {
    for (const inst of instances) {
      const { width, height } = inst.holder.node().getBoundingClientRect();
      if (width === 0 || height === 0) continue;
      inst.svg.attr('width', width).attr('height', height).attr('viewBox', `0 0 ${width} ${height}`);
      inst.gMain.attr('transform', `translate(${MARGIN_WEEKLY.left},${MARGIN_WEEKLY.top})`);
      const innerW = Math.max(0, width - MARGIN_WEEKLY.left - MARGIN_WEEKLY.right);
      const innerH = Math.max(0, height - MARGIN_WEEKLY.top - MARGIN_WEEKLY.bottom);

      const x = d3.scalePoint().domain(inst.data.rows.map(r => r.label)).range([0, innerW]).padding(0.15);
      const y = d3.scaleLinear().domain([0, yMaxShared]).nice().range([innerH, 0]);
      const line = d3.line().x(r => x(r.label)).y(r => y(r.mean)).curve(d3.curveMonotoneX);

      inst.linePath
        .datum(inst.data.rows)
        .attr('d', line)
        .attr('fill', 'none')
        .attr('stroke', COLOR_COVID)
        .attr('stroke-width', 1.6);

      const dots = inst.dotsGroup.selectAll('circle').data(inst.data.rows);
      dots.join('circle')
        .attr('cx', r => x(r.label))
        .attr('cy', r => y(r.mean))
        .attr('r', 3)
        .attr('fill', COLOR_COVID);

      // At three-up panel widths, full "Mon..Sun" labels run together; drop
      // to single-letter labels (M T W T F S S) AND rotate them -45° so each
      // text element clears its neighbour and still sits under its tick.
      // The text-anchor=end + rotate(-45) recipe makes the *end* of each
      // string land at the tick, with the rest of the text trailing up-left
      // into the bottom margin we widened for exactly this.
      inst.axisXGroup
        .attr('transform', `translate(0,${innerH})`)
        .call(d3.axisBottom(x).tickSizeOuter(0).tickFormat(label => label.charAt(0)))
        .selectAll('text')
          .style('text-anchor', 'end')
          .attr('transform', 'rotate(-45)');
      inst.axisYGroup
        .call(d3.axisLeft(y).ticks(4).tickFormat(_fmtTrips));
    }
  }

  return {
    update() { _resize(); },
    resize: _resize,
  };
}
