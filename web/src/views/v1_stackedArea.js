/**
 * V1 — Trip Volume Over Time (stacked area chart).
 * Reads: state.dateRange, state.taxiTypes
 * Writes: filterBus.update({ dateRange }) on user brush
 *
 * Factory pattern — each init() call is fully isolated (own closed-over state).
 * Module-level brushTo/clearBrush delegate to whichever instance was marked primary.
 */

import * as d3 from 'd3';
import { update, subscribe, getState } from '../state/filterBus.js';

const COLORS = { yellow: '#f5c542', green: '#2ecc71', fhv: '#9b6ff5' };
const LABELS  = { yellow: 'Yellow Taxi', green: 'Green Taxi', fhv: 'For-Hire Vehicle (FHV)' };
const TYPES   = ['yellow', 'green', 'fhv'];
// FHV reporting is shown from Feb 2019 onward. Before this date, TLC FHV files
// included HVFHV (Uber/Lyft/Via) volume; from 2019-02 HVFHV was split into its own
// category (excluded from this dashboard).
const FHV_START   = new Date('2019-02-01');
const FHV_LABEL   = 'HVFHV split (rideshare separated)';
const TRANSITION_MS = 400;

let _primaryInstance = null;
const _allInstances = [];

// ─── Public module API ────────────────────────────────────────────────────────

export function init(container, data, { primary = true } = {}) {
  const inst = _createInstance(container, data);
  if (primary) _primaryInstance = inst;
  _allInstances.push(inst);
  return inst;
}

export function brushTo(d0, d1)  { _primaryInstance?.brushTo(d0, d1); }
export function clearBrush()     { _primaryInstance?.clearBrush(); }

// Highlight band spans across all instances so both dashboard & narrative charts show it.
export function highlightBand(d0, d1, label) {
  for (const inst of _allInstances) inst.highlightBand(d0, d1, label);
}
export function clearHighlightBand() {
  for (const inst of _allInstances) inst.clearHighlightBand();
}

// ─── Instance factory ─────────────────────────────────────────────────────────

function _createInstance(container, data) {
  // All mutable state is closed over — no module-level globals leaking between instances.
  let _wide, _xDomain, _iw, _ih;
  let _xScale, _yScale, _xAxisG;
  let _areaGroup, _bandGroup, _fhvMarkGroup, _clipId, _brushEl, _brush;
  let _currentTypes = new Set(TYPES);
  let _band = null; // { d0, d1, label } when active, else null

  // ── Parse raw data once ──────────────────────────────────────────────────────
  function _parse() {
    const parsed = data.map(d => ({
      month: d3.timeParse('%Y-%m')(d.month),
      type:  d.type,
      trips: +d.trips,
    })).filter(d => d.month);

    const byMonth = d3.rollup(parsed, vs => {
      const obj = { month: vs[0].month };
      for (const v of vs) obj[v.type] = v.trips;
      return obj;
    }, d => d.month.getTime());

    _wide = Array.from(byMonth.values()).sort((a, b) => a.month - b.month);
    for (const row of _wide) {
      for (const t of TYPES) if (row[t] == null) row[t] = 0;
    }
    _xDomain = d3.extent(_wide, d => d.month);
  }

  // ── Re-stack helper ──────────────────────────────────────────────────────────
  function _stack(activeTypes) {
    return d3.stack()
      .keys(activeTypes)
      .value((d, k) => (k === 'fhv' && d.month < FHV_START) ? 0 : (d[k] ?? 0))(_wide);
  }

  // ── Area generator ───────────────────────────────────────────────────────────
  function _makeArea() {
    return d3.area()
      .x(d => _xScale(d.data.month))
      .y0(d => _yScale(d[0]))
      .y1(d => _yScale(d[1]))
      .curve(d3.curveMonotoneX);
  }

  // ── Highlight band (used by narrative Step 2) ────────────────────────────────
  function _drawBand() {
    if (!_bandGroup) return;
    _bandGroup.selectAll('*').remove();
    if (!_band) return;
    const { d0, d1, label } = _band;
    const [xMin, xMax] = _xScale.range();
    const x0 = Math.max(xMin, _xScale(d0));
    const x1 = Math.min(xMax, _xScale(d1));
    if (!(x1 > x0)) return; // outside current domain

    _bandGroup.append('rect')
      .attr('class', 'year-band')
      .attr('x', x0).attr('y', 0)
      .attr('width', x1 - x0).attr('height', _ih)
      .attr('fill-opacity', 0)
      .transition().duration(TRANSITION_MS)
      .attr('fill-opacity', 0.10);

    if (label) {
      _bandGroup.append('text')
        .attr('class', 'year-band-label')
        .attr('x', x0 + 6).attr('y', 14)
        .attr('opacity', 0)
        .text(label)
        .transition().duration(TRANSITION_MS)
        .attr('opacity', 1);
    }
  }

  // ── FHV cutoff annotation (recomputed each render so it tracks x-scale) ────
  function _drawFhvMark(activeTypes) {
    if (!_fhvMarkGroup) return;
    _fhvMarkGroup.selectAll('*').remove();

    if (!activeTypes.includes('fhv')) return;

    // Hide when Feb 2019 falls outside the current x-domain.
    const [d0, d1] = _xScale.domain();
    if (FHV_START < d0 || FHV_START > d1) return;

    const cx = _xScale(FHV_START);
    _fhvMarkGroup.append('line')
      .attr('class', 'fhv-cutoff-line')
      .attr('x1', cx).attr('x2', cx).attr('y1', 0).attr('y2', _ih);

    // Flip label to left side of line if it would overflow the chart width.
    const LABEL_PX = 165;
    const flip = cx + LABEL_PX + 4 > _iw;
    _fhvMarkGroup.append('text')
      .attr('class', 'fhv-cutoff-label')
      .attr('x', flip ? cx - 4 : cx + 4)
      .attr('y', 16)
      .attr('text-anchor', flip ? 'end' : 'start')
      .text(FHV_LABEL);
  }

  // ── Legend helper ────────────────────────────────────────────────────────────
  function _updateLegend(activeTypes) {
    const el = d3.select(container).select('.v1-legend');
    if (el.empty()) return;
    el.selectAll('*').remove();
    activeTypes.forEach((t, i) => {
      const lg = el.append('g').attr('transform', `translate(${i * 185}, 0)`);
      lg.append('rect').attr('width', 12).attr('height', 12).attr('rx', 2).attr('fill', COLORS[t]);
      lg.append('text').attr('x', 16).attr('y', 10)
        .attr('fill', 'var(--text-secondary)').attr('font-size', 11).text(LABELS[t]);
    });
  }

  // ── Subscriber — reacts to filterBus state changes ───────────────────────────
  function _onStateChange(state) {
    if (!_areaGroup) return;

    _currentTypes = new Set(state.taxiTypes);
    const activeTypes = TYPES.filter(t => state.taxiTypes.has(t));
    const series = _stack(activeTypes);

    // Update x domain
    const xDom = state.dateRange
      ? [new Date(state.dateRange[0]), new Date(state.dateRange[1])]
      : _xDomain;
    _xScale.domain(xDom);

    // Update y domain
    const yMax = d3.max(series, s => d3.max(s, d => d[1])) || 1;
    _yScale.domain([0, yMax * 1.05]).nice();

    const area = _makeArea();

    // Animate area paths in/out
    _areaGroup.selectAll('.area-path')
      .data(series, d => d.key)
      .join(
        enter => enter.append('path').attr('class', 'area-path')
          .attr('fill', d => COLORS[d.key]).attr('fill-opacity', 0).attr('d', area)
          .call(el => el.transition().duration(TRANSITION_MS).attr('fill-opacity', 0.85)),
        upd => upd.call(el => el.transition().duration(TRANSITION_MS)
          .attr('fill-opacity', 0.85).attr('d', area)),
        exit => exit.call(el => el.transition().duration(TRANSITION_MS)
          .attr('fill-opacity', 0).remove())
      );

    // Update x axis
    _xAxisG.transition().duration(TRANSITION_MS)
      .call(d3.axisBottom(_xScale)
        .ticks(d3.timeMonth.every(Math.ceil(_iw / 80)))
        .tickFormat(d3.timeFormat('%b %Y')))
      .call(ax => ax.select('.domain').remove())
      .selectAll('text').attr('dy', '1em').attr('font-size', 10);

    // Update y axis
    d3.select(container).select('.axis--y')
      .transition().duration(TRANSITION_MS)
      .call(d3.axisLeft(_yScale)
        .tickFormat(d => d >= 1e6 ? `${(d/1e6).toFixed(0)}M` : d >= 1e3 ? `${(d/1e3).toFixed(0)}k` : d))
      .call(ax => ax.select('.domain').remove());

    _updateLegend(activeTypes);
    _drawBand();
    _drawFhvMark(activeTypes);

    // Sync brush position — programmatic move has sourceEvent === null (guard ignores it)
    if (state.dateRange) {
      const sel = [_xScale(new Date(state.dateRange[0])), _xScale(new Date(state.dateRange[1]))];
      if (sel[0] >= 0 && sel[1] <= _iw && sel[0] < sel[1]) {
        _brushEl.call(_brush.move, sel);
      }
    } else {
      _brushEl.call(_brush.move, null); // clear brush visually
    }
  }

  // ── Initial build ────────────────────────────────────────────────────────────
  function _build(state) {
    const el = d3.select(container);
    el.selectAll('*').remove();

    const rect = container.getBoundingClientRect();
    const W  = Math.max(rect.width || 900, 600);
    const H  = 340;
    const M  = { top: 24, right: 24, bottom: 56, left: 68 };
    _iw = W - M.left - M.right;
    _ih = H - M.top - M.bottom;

    _clipId = 'v1-clip-' + Math.random().toString(36).slice(2);
    _currentTypes = new Set(state.taxiTypes);
    const activeTypes = TYPES.filter(t => state.taxiTypes.has(t));
    const series = _stack(activeTypes);

    const xDom = state.dateRange
      ? [new Date(state.dateRange[0]), new Date(state.dateRange[1])]
      : _xDomain;

    _xScale = d3.scaleTime().domain(xDom).range([0, _iw]).clamp(true);
    const yMax = d3.max(series, s => d3.max(s, d => d[1])) || 1;
    _yScale = d3.scaleLinear().domain([0, yMax * 1.05]).range([_ih, 0]).nice();

    const svg = el.append('svg').attr('width', W).attr('height', H)
      .attr('aria-label', 'Trip volume stacked area chart');

    svg.append('defs').append('clipPath').attr('id', _clipId)
      .append('rect').attr('width', _iw).attr('height', _ih + 4).attr('y', -4);

    const g = svg.append('g').attr('transform', `translate(${M.left},${M.top})`);

    // Gridlines
    g.append('g').attr('class', 'gridlines')
      .call(d3.axisLeft(_yScale).tickSize(-_iw).tickFormat(''))
      .select('.domain').remove();
    g.selectAll('.gridlines line').attr('class', 'gridline');

    // Area paths
    _areaGroup = g.append('g').attr('clip-path', `url(#${_clipId})`);
    _areaGroup.selectAll('.area-path')
      .data(series, d => d.key)
      .join('path')
      .attr('class', 'area-path')
      .attr('fill', d => COLORS[d.key])
      .attr('fill-opacity', 0.85)
      .attr('d', _makeArea());

    // Highlight band layer — above areas, below axes/brush
    _bandGroup = g.append('g').attr('class', 'band-group').attr('clip-path', `url(#${_clipId})`);

    // FHV cutoff annotation layer — drawn here every render so it tracks x-scale
    _fhvMarkGroup = g.append('g')
      .attr('class', 'fhv-mark-group')
      .attr('clip-path', `url(#${_clipId})`);
    _drawFhvMark(activeTypes);

    // X axis — save ref for later updates
    _xAxisG = g.append('g').attr('class', 'axis axis--x')
      .attr('transform', `translate(0,${_ih})`)
      .call(d3.axisBottom(_xScale)
        .ticks(d3.timeMonth.every(Math.ceil(_iw / 80)))
        .tickFormat(d3.timeFormat('%b %Y')))
      .call(ax => ax.select('.domain').remove());
    _xAxisG.selectAll('text').attr('dy', '1em').attr('font-size', 10);

    // Y axis
    g.append('g').attr('class', 'axis axis--y')
      .call(d3.axisLeft(_yScale)
        .tickFormat(d => d >= 1e6 ? `${(d/1e6).toFixed(0)}M` : d >= 1e3 ? `${(d/1e3).toFixed(0)}k` : d))
      .call(ax => ax.select('.domain').remove());

    // Legend
    g.append('g').attr('class', 'v1-legend')
      .attr('transform', `translate(0, ${_ih + 36})`);
    _updateLegend(activeTypes);

    // Tooltip
    const tooltip = el.append('div').attr('class', 'tooltip')
      .style('opacity', 0).style('position', 'absolute');
    const bisect = d3.bisector(d => d.month).left;

    // Brush — sourceEvent guard prevents filterBus ↔ brush feedback loop
    _brush = d3.brushX()
      .extent([[0, 0], [_iw, _ih]])
      .on('end', function(event) {
        if (!event.sourceEvent) return; // programmatic move — ignore
        if (!event.selection) {
          update({ dateRange: null });
          return;
        }
        const [x0, x1] = event.selection.map(_xScale.invert);
        const span = (x1 - x0) / (1000 * 60 * 60 * 24 * 30);
        if (span < 6) console.info('[V1] brush < 6 months — signal daily zoom', x0, x1);
        update({ dateRange: [x0, x1] });
      });

    _brushEl = g.append('g').attr('class', 'brush').call(_brush);

    // Attach hover listeners to the brush's overlay rect — it sits on top of
    // the chart area and would otherwise swallow pointer events. Namespaced
    // (.tip) so we don't overwrite the brush's own internal handlers.
    _brushEl.select('.overlay')
      .on('mousemove.tip', function(event) {
        if (event.buttons !== 0) return; // user is dragging a brush — skip tooltip
        const [mx] = d3.pointer(event);
        const x0 = _xScale.invert(mx);
        const idx = bisect(_wide, x0, 1);
        const dL = _wide[idx - 1], dR = _wide[idx];
        if (!dL) return;
        const d = dR && (x0 - dL.month > dR.month - x0) ? dR : dL;
        const active = TYPES.filter(t => _currentTypes.has(t));
        let html = `<div class="tooltip-title">${d3.timeFormat('%b %Y')(d.month)}</div>`;
        for (const t of [...active].reverse()) {
          const v = t === 'fhv' && d.month < FHV_START ? null : d[t];
          if (v == null) continue;
          html += `<div class="tooltip-row">
            <span class="tooltip-swatch" style="background:${COLORS[t]}"></span>
            ${LABELS[t]}: <strong>${d3.format(',')(v)}</strong>
          </div>`;
        }
        const [px, py] = d3.pointer(event, container);
        tooltip.style('opacity', 1).style('left', `${px + 12}px`).style('top', `${py - 20}px`).html(html);
        g.selectAll('.hover-line').remove();
        g.append('line').attr('class', 'hover-line')
          .attr('x1', _xScale(d.month)).attr('x2', _xScale(d.month))
          .attr('y1', 0).attr('y2', _ih)
          .attr('stroke', 'rgba(255,255,255,0.2)').attr('stroke-width', 1)
          .attr('pointer-events', 'none');
      })
      .on('mouseleave.tip', () => {
        tooltip.style('opacity', 0);
        g.selectAll('.hover-line').remove();
      });

    if (state.dateRange) {
      const sel = [_xScale(new Date(state.dateRange[0])), _xScale(new Date(state.dateRange[1]))];
      if (sel[0] < sel[1]) _brushEl.call(_brush.move, sel);
    }
  }

  // Instance API
  function brushTo(d0, d1) {
    if (!_brush || !_brushEl || !_xScale) return;
    _brushEl.call(_brush.move, [_xScale(d0), _xScale(d1)]);
  }

  function clearBrush() {
    if (!_brush || !_brushEl) return;
    _brushEl.call(_brush.move, null);
  }

  function highlightBand(d0, d1, label) {
    _band = { d0, d1, label };
    _drawBand();
  }

  function clearHighlightBand() {
    _band = null;
    if (_bandGroup) {
      _bandGroup.selectAll('*')
        .transition().duration(TRANSITION_MS)
        .attr('fill-opacity', 0).attr('opacity', 0)
        .remove();
    }
  }

  // Bootstrap
  _parse();
  _build(getState());
  subscribe(_onStateChange);

  return { brushTo, clearBrush, highlightBand, clearHighlightBand };
}
