/** Wire up Scrollama for the three-step narrative intro. */

import scrollama from 'scrollama';
import { steps } from './steps.js';

export function initScrollama() {
  const scroller = scrollama();

  scroller
    .setup({
      step: '.narrative-step',
      offset: 0.5,
      debug: false,
    })
    .onStepEnter(({ element, index }) => {
      document.querySelectorAll('.narrative-step').forEach(el => el.classList.remove('is-active'));
      element.classList.add('is-active');
      const n = index + 1;
      if (steps[n]?.enter) steps[n].enter();
    })
    .onStepExit(({ element, index }) => {
      const n = index + 1;
      if (steps[n]?.exit) steps[n].exit();
    });

  window.addEventListener('resize', scroller.resize);
  return scroller;
}
