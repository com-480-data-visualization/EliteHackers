/**
 * 10-step narrative — each entry's `enter()` sets the COMPLETE graphic state
 * for that beat. There is no `exit()` — scrolling up or down always lands on
 * a correct frame because every step is self-sufficient.
 *
 * Step sequence:
 *
 *   1  timeline          full 2015-2024, no annotation
 *   2  overlay           all years grey, no highlight
 *   3  overlay + mults   highlight 'jul'  — July 4th dip
 *   4  overlay + mults   highlight 'dec'  — year-end cliff
 *   5  overlay + mults   highlight 'sep'  — September rebound (NEW)
 *   6  overlay + mults   highlight 'all'  — pattern holds (July + Sep + Dec)
 *   7  timeline          zoom toward 2020, ghost 2019
 *   8  timeline          zoom 2020, ghost 2019, trough annotation
 *   9  weekly            three Mon-Sun mini-charts
 *  10  timeline          zoom 2020-2022 recovery
 */

const D = s => new Date(s); // tiny alias for readability

const ZOOM_2020       = { d0: D('2020-01-01'), d1: D('2020-12-31') };
const ZOOM_RECOVERY   = { d0: D('2020-01-01'), d1: D('2022-12-31') };
const ZOOM_LATE_2019_2020 = { d0: D('2019-10-01'), d1: D('2020-12-31') };
const GHOST_2019 = { year: 2019, d0: ZOOM_2020.d0, d1: ZOOM_2020.d1 };
const GHOST_2019_LATE = { year: 2019, d0: ZOOM_LATE_2019_2020.d0, d1: ZOOM_LATE_2019_2020.d1 };

/**
 * @param {Object} graphic  return value of `createNarrativeGraphic`
 * @param {Object} stats    return value of `buildNarrativeStats`
 *                          (used to pass live numbers like covidTroughPct
 *                          into the trough annotation)
 */
export function buildSteps(graphic, stats) {
  const troughPct = stats.covidTroughPct ?? 0;

  return {
    1: { enter: () => graphic.setStep({
      view: 'timeline',
      zoom: null,
      ghost: null,
      annotateTrough: false,
      troughPct,
      aria: 'Timeline of daily taxi trips, 2015 to 2024. A continuous pulse with annual rhythms and a deep collapse in spring 2020.',
    }) },

    2: { enter: () => graphic.setStep({
      view: 'overlay',
      highlight: null,
      multiplesVisible: false,
      aria: 'Year overlay: ten yearly curves overlaid on a shared January-to-December axis.',
    }) },

    3: { enter: () => graphic.setStep({
      view: 'overlay',
      highlight: 'jul',
      multiplesVisible: true,
      aria: 'July 4th window highlighted across all ten years.',
    }) },

    4: { enter: () => graphic.setStep({
      view: 'overlay',
      highlight: 'dec',
      multiplesVisible: true,
      aria: 'Year-end holiday window highlighted across all ten years.',
    }) },

    5: { enter: () => graphic.setStep({
      view: 'overlay',
      highlight: 'sep',
      multiplesVisible: true,
      aria: 'Early-September rebound window highlighted across all ten years.',
    }) },

    6: { enter: () => graphic.setStep({
      view: 'overlay',
      highlight: 'all',
      multiplesVisible: true,
      aria: 'July, September and year-end windows all highlighted together across the ten years.',
    }) },

    7: { enter: () => graphic.setStep({
      view: 'timeline',
      zoom: ZOOM_LATE_2019_2020,
      ghost: null,
      annotateTrough: false,
      troughPct,
      aria: 'Timeline zooming toward 2020 with the 2019 trajectory ghosted in as a counterfactual.',
    }) },

    8: { enter: () => graphic.setStep({
      view: 'timeline',
      zoom: ZOOM_2020,
      ghost: GHOST_2019,
      annotateTrough: true,
      troughPct,
      aria: `Timeline zoomed to 2020 with a minus ${Math.round(troughPct)} percent annotation pinned to the April trough.`,
    }) },

    9: { enter: () => graphic.setStep({
      view: 'weekly',
      aria: 'Three small line charts comparing average daily trips by day of week, before, during and after the PAUSE order.',
    }) },

    10: { enter: () => graphic.setStep({
      view: 'timeline',
      zoom: ZOOM_RECOVERY,
      ghost: null,
      annotateTrough: false,
      troughPct,
      aria: 'Timeline zoomed to 2020-2022 showing a long, uneven climb back from the trough.',
    }) },
  };
}
