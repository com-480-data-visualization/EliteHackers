/**
 * Story step handlers — called by scrollama_setup.js on step enter/exit.
 *
 * Invariant: every step's `exit` fully reverses its `enter`, so scrolling in
 * either direction never leaves residual state from another step.
 */

import { update } from '../state/filterBus.js';
import {
  brushTo,
  clearBrush,
  highlightBand,
  clearHighlightBand,
} from '../views/v1_stackedArea.js';

const TAXI_ALL = new Set(['yellow', 'green', 'fhv']);
const BASELINE_2019 = { d0: new Date('2019-01-01'), d1: new Date('2019-12-31') };
const COVID_2020    = { d0: new Date('2020-01-01'), d1: new Date('2020-12-31') };

export const steps = {
  1: {
    enter() {
      clearHighlightBand();
      clearBrush();
      update({ dateRange: null, taxiTypes: TAXI_ALL });
    },
    exit() {},
  },

  2: {
    enter() {
      document.getElementById('step2-annotation').style.display = 'block';
      highlightBand(BASELINE_2019.d0, BASELINE_2019.d1, '2019 baseline');
    },
    exit() {
      document.getElementById('step2-annotation').style.display = 'none';
      clearHighlightBand();
    },
  },

  3: {
    enter() {
      brushTo(COVID_2020.d0, COVID_2020.d1);
      update({ dateRange: [COVID_2020.d0, COVID_2020.d1] });
      document.getElementById('step3-annotation').style.display = 'block';
    },
    exit() {
      document.getElementById('step3-annotation').style.display = 'none';
      clearBrush();
      update({ dateRange: null });
    },
  },
};
