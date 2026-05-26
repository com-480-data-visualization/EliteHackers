/**
 * Phase-1 Scrollama wiring.
 *
 * Each `.narrative-step` div fires `steps[N].enter()`; the step handler sets
 * the complete graphic state (see steps.js). We also build a progress rail
 * (one dot per step) on the sticky graphic edge and keep its active dot in
 * sync with the current step.
 */

import scrollama from 'scrollama';

/**
 * @param {Object} steps   `{ 1: { enter() }, … 9: { enter() } }`
 * @param {HTMLElement} progressContainer  the empty `.narrative-progress` div
 */
export function initScrollama(steps, progressContainer) {
  const stepEls = [...document.querySelectorAll('.narrative-step')];

  // Build progress rail dots from the actual step count so adding/removing a
  // step elsewhere automatically updates the rail.
  if (progressContainer) {
    progressContainer.innerHTML = '';
    stepEls.forEach((el, idx) => {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'narrative-progress__dot';
      dot.setAttribute('data-step', String(idx + 1));
      dot.setAttribute('aria-label', `Jump to step ${idx + 1}`);
      dot.addEventListener('click', () => {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      progressContainer.appendChild(dot);
    });
  }

  function setActiveDot(n) {
    if (!progressContainer) return;
    progressContainer.querySelectorAll('.narrative-progress__dot').forEach((dot, idx) => {
      dot.classList.toggle('narrative-progress__dot--active', idx + 1 === n);
    });
  }

  // Fire the first step's state immediately so the user sees a correct frame
  // even before the first scroll event hits the threshold.
  if (steps[1]?.enter) steps[1].enter();
  setActiveDot(1);
  stepEls[0]?.classList.add('is-active');

  const scroller = scrollama();
  scroller
    .setup({
      step: '.narrative-step',
      offset: 0.55,
      debug: false,
    })
    .onStepEnter(({ element, index }) => {
      stepEls.forEach(el => el.classList.remove('is-active'));
      element.classList.add('is-active');
      const n = index + 1;
      setActiveDot(n);
      if (steps[n]?.enter) steps[n].enter();
    });

  window.addEventListener('resize', scroller.resize);
  return scroller;
}
