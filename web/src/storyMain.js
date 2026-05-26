/**
 * Story page entry point.
 *
 * Phase 1 owns its own self-contained narrative graphic:
 *   - imports NOTHING from `src/views/` or `src/state/`
 *   - reads only `daily_volume.json` + `events.json` from the static data dir
 *   - computes every displayed statistic at runtime (see `narrative/stats.js`)
 *
 * Layout responsibilities here:
 *   - render the cross-page nav + end-of-story CTA (both LANDING-driven)
 *   - inject the live numbers into the step copy (`[data-stat]` placeholders)
 *   - build the `weeklyWindows` for Step 8 from `events.json`
 *   - construct the narrative graphic and wire Scrollama to it
 */

import * as d3 from 'd3';
import { renderNavLinks, renderStoryCTA } from './nav.js';
import { buildNarrativeData } from './narrative/data.js';
import { buildNarrativeStats } from './narrative/stats.js';
import { createNarrativeGraphic } from './narrative/narrativeGraphic.js';
import { buildSteps } from './narrative/steps.js';
import { initScrollama } from './narrative/scrollama_setup.js';

console.info('[NYC Mobility] Story page initialising…');

async function loadData() {
  const [daily, events] = await Promise.all([
    fetch('/data/daily_volume.json').then(r => r.json()),
    fetch('/data/events.json').then(r => r.json()),
  ]);
  return { daily, events };
}

/**
 * Derive the three Step-8 windows from `events.json`. The arithmetic mirrors
 * AGENT.md §1.6 exactly: D = length of the lockdown window, "before" is the
 * D days ending the day before the lockdown, "after" is the D days starting
 * at covid_phase1.date. Computed not hardcoded so a change to events.json
 * propagates automatically.
 */
function buildWeeklyWindows(events) {
  const _fmt = d3.utcFormat('%Y-%m-%d');
  const _parse = d3.utcParse('%Y-%m-%d');
  const lockdown = events.find(e => e.id === 'covid_lockdown');
  const phase1   = events.find(e => e.id === 'covid_phase1');
  if (!lockdown || !phase1) {
    console.warn('[NYC Mobility] Missing covid_lockdown / covid_phase1 events; weekly-shapes step will be empty.');
    return [];
  }
  const lo = _parse(lockdown.date);
  const hi = _parse(lockdown.end_date);
  const D = Math.round((hi - lo) / 86_400_000) + 1; // inclusive

  const dayShift = (date, n) => {
    const out = new Date(date.getTime());
    out.setUTCDate(out.getUTCDate() + n);
    return out;
  };

  const beforeEnd   = dayShift(lo, -1);
  const beforeStart = dayShift(beforeEnd, -(D - 1));
  const afterStart  = _parse(phase1.date);
  const afterEnd    = dayShift(afterStart, D - 1);

  return [
    { label: 'Before',  d0: _fmt(beforeStart), d1: _fmt(beforeEnd) },
    { label: 'During',  d0: _fmt(lo),          d1: _fmt(hi) },
    { label: 'After',   d0: _fmt(afterStart),  d1: _fmt(afterEnd) },
  ];
}

/**
 * Fill the `[data-stat]` placeholders in the step copy with the live numbers.
 * Keep the rounding sensible — no false precision.
 */
function injectStats(stats, dailyTotal) {
  const set = (key, text) => {
    document.querySelectorAll(`[data-stat="${key}"]`).forEach(el => {
      el.textContent = text;
    });
  };
  if (stats.julyDipMean    != null) set('julDipMean',     `${Math.round(stats.julyDipMean)}%`);
  if (stats.yearEndDipMean != null) set('decDipMean',     `${Math.round(stats.yearEndDipMean)}%`);
  if (stats.covidTroughPct != null) set('covidTrough',    `${Math.round(stats.covidTroughPct)}%`);
  if (dailyTotal != null)            set('totalBillions',  formatBillions(dailyTotal));
}

function formatBillions(n) {
  const b = n / 1e9;
  if (b >= 10) return `${b.toFixed(0)} billion`;
  return `${b.toFixed(1)} billion`;
}

async function main() {
  renderNavLinks('story', document.getElementById('nav-page-links'));
  renderStoryCTA(document.getElementById('story-cta'));

  const loading = document.getElementById('loading');

  try {
    const { daily: rawDaily, events } = await loadData();

    const narrativeData = buildNarrativeData(rawDaily);
    const stats = buildNarrativeStats(narrativeData);
    const weeklyWindows = buildWeeklyWindows(events);

    const totalTrips = narrativeData.daily.reduce((s, r) => s + r.total, 0);

    injectStats(stats, totalTrips);

    loading.classList.add('hidden');

    const graphic = createNarrativeGraphic(
      document.getElementById('narrative-chart'),
      narrativeData,
      stats,
      { weeklyWindows },
    );
    // Initial measure after the layer is mounted but before the first
    // scrollama trigger — guarantees the SVGs have non-zero dimensions when
    // step 1's enter() draws.
    graphic.resize();

    const steps = buildSteps(graphic, stats);
    initScrollama(steps, document.getElementById('narrative-progress'));
  } catch (err) {
    console.error('[NYC Mobility] Story data load failed:', err);
    loading.innerHTML = `<p style="color:var(--color-disruption)">Failed to load data: ${err.message}</p>`;
  }
}

main();
