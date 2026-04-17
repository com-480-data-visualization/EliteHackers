/** Reset button — clears all filter bus state. */

import { reset } from '../state/filterBus.js';
import { clearBrush } from '../views/v1_stackedArea.js';

export function init(btn) {
  btn.addEventListener('click', () => {
    clearBrush();
    reset();
  });
}
