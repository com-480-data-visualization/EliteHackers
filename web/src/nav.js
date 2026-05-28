/**
 * Cross-page navigation + end-of-story CTA — both driven by `LANDING` from
 * `src/siteConfig.js`. Centralising here means the story/dashboard HTML files
 * can stay layout-only and the LANDING flip is a single config change.
 */

import { LANDING, PAGE_FILES, PAGE_LABELS } from './siteConfig.js';

const OTHER = { story: 'dashboard', dashboard: 'story' };

/**
 * Populate the cross-page link group inside the nav.
 *
 * @param {'story'|'dashboard'} currentPage  which page is currently rendered.
 * @param {HTMLElement} container             the `<div>` to fill (id `nav-page-links`).
 *
 * Ordering rule: the page that LANDING names comes first.
 * The link for the page we're already on is rendered as a plain non-clickable
 * label (marked active), so the link group always doubles as a "you-are-here"
 * indicator without ever pointing at the page you're already viewing.
 */
export function renderNavLinks(currentPage, container) {
  if (!container) return;
  const order = [LANDING, OTHER[LANDING]];
  container.innerHTML = '';

  for (const page of order) {
    const isCurrent = page === currentPage;
    const el = document.createElement(isCurrent ? 'span' : 'a');
    el.className = 'nav__link' + (isCurrent ? ' nav__link--active' : '');
    el.textContent = PAGE_LABELS[page];
    if (!isCurrent) {
      el.href = '/' + PAGE_FILES[page];
    }
    container.appendChild(el);
  }
}

/**
 * Fill the end-of-story call-to-action (CTA) block (story page only).
 * Wording flips with LANDING so the CTA always frames the dashboard as
 * either "now try it yourself" (story is home) or "back to the dashboard"
 * (dashboard is home, the user came from there).
 */
export function renderStoryCTA(container) {
  if (!container) return;
  const isForward = LANDING === 'story';
  const headline = isForward
    ? 'Explore the full dashboard'
    : 'Back to the dashboard';
  const subline = isForward
    ? 'Now try it yourself — brush, filter and explore the data behind the story.'
    : 'Return to the tool to keep exploring the data behind the story.';
  const ctaLabel = isForward ? 'Open the dashboard' : 'Back to the dashboard';

  container.innerHTML = `
    <h2 class="story-cta__headline">${headline}</h2>
    <p class="story-cta__subline">${subline}</p>
    <a class="story-cta__btn" href="/${PAGE_FILES.dashboard}">${ctaLabel}</a>
  `;
}
