/**
 * Site-wide configuration.
 *
 * `LANDING` is the single source of truth for which page lives at `/`.
 * Flipping the whole site is a one-word change here followed by a rebuild
 * (`npm run build`) — the Vite plugin in `vite.config.js` regenerates
 * `vercel.json` from this value, the dev server's `/` middleware reads it,
 * and `src/nav.js` reads it at runtime to order the cross-page nav links
 * and choose the story page's call-to-action wording.
 *
 *   'story'     -> '/' serves story.html;     dashboard.html is second  (DEFAULT)
 *   'dashboard' -> '/' serves dashboard.html; story.html     is second
 */
export const LANDING = 'story';

/** Map a logical page name to its real HTML file. */
export const PAGE_FILES = {
  story: 'story.html',
  dashboard: 'dashboard.html',
};

/** Cross-page link labels used by the nav. */
export const PAGE_LABELS = {
  story: 'Story',
  dashboard: 'Dashboard',
};
