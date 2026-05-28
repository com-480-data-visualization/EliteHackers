/**
 * Site-wide configuration.
 *
 * `LANDING` is the single source of truth for which page lives at `/`.
 * (`npm run build`) — the Vite plugin in `vite.config.js` regenerates vercel.json from this value
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
