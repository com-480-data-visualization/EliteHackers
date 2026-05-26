# AGENT.md — Page Split + Scrollytelling Narrative Rework

This task has **two phases**. Do Phase 0 first, fully verify it, then do
Phase 1. They are independent — Phase 0 must leave the site working with the
*current* (un-reworked) narrative before Phase 1 begins.

---

# PHASE 0 — Split story and dashboard into two pages

## 0.1 Objective

The site is currently a single `index.html` with a `#narrative` section and a
`#dashboard` section stacked on one page, switched by a JS mode-toggle button.

Split them into **two separate pages**:

- a **story page** — the scrollytelling narrative only
- a **dashboard page** — the V1-V5 dashboard only

The story page is the **landing page** by default (the URL `/` serves the
story), with the dashboard as the second page. This must be switchable with a
single config change — see section 0.5.

## 0.2 Hard constraints

- **V1-V5 and the dashboard must not change** — not the views, not their
  order, not their controls, not the filterBus. After Phase 0, the dashboard
  page must be functionally byte-identical to today's `#dashboard` section.
- The narrative section in Phase 0 stays **as it currently is** (the existing
  3-step COVID story). Phase 0 only *moves* it to its own page. The rework
  happens in Phase 1.
- No new heavy dependencies. Vite + D3 + Scrollama only.

## 0.3 Page structure

Use Vite's native multi-page support. Create two HTML entry points:

- `web/story.html` — contains the `<nav>`, the `#narrative` section, the
  loading overlay. Loads a story-only JS entry.
- `web/dashboard.html` — contains the `<nav>`, the `#dashboard` section, the
  loading overlay. Loads a dashboard-only JS entry.

Update `vite.config.js` with a multi-page `build.rollupOptions.input` map for
both HTML files. Keep `publicDir: 'public'`, `outDir: 'dist'`.

Split `src/main.js` into two slim entry modules so each page loads only what it
needs:

- `src/storyMain.js` — loads `daily_volume.json` (plus whatever the current
  narrative needs), initialises Scrollama and the narrative graphic. Does NOT
  import or initialise V1-V5 or the controls.
- `src/dashboardMain.js` — loads the dashboard data, initialises V1-V5 and the
  controls exactly as `main.js` does today. Does NOT import Scrollama or the
  narrative.

The old `src/main.js` may be deleted once both entries replace it, or kept as a
thin re-export — your call, but no page should load both halves.

Remove the in-page **mode-toggle** button and its handler — it is obsolete once
the pages are separate.

## 0.4 Navigation between pages

The `<nav>` currently uses in-page anchors. Change it to cross-page links:

- On the story page, the nav links to the dashboard page.
- On the dashboard page, the nav links to the story page.
- The dashboard's internal section anchors (`#v1`-`#v5`) remain valid
  *within* the dashboard page.

Nav link **labels, order, and which link is shown first** are driven by the
config constant in section 0.5 — do not hardcode them.

## 0.5 The landing-page switch (REQUIRED — must be a one-line change)

Create `src/siteConfig.js` exporting a single constant:

```js
// 'story'     -> '/' serves the story; dashboard is the second page  (DEFAULT)
// 'dashboard' -> '/' serves the dashboard; story is the second page
export const LANDING = 'story';
```

Everything that differs between the two arrangements must read from `LANDING`,
so flipping the whole site is exactly one word plus a rebuild. Specifically:

1. **Root URL routing.** `/` must serve whichever page `LANDING` names. Do NOT
   do this by renaming files. Instead add a `web/vercel.json` with a `rewrites`
   rule, and for local dev a Vite middleware/redirect, so `/` resolves to
   `story.html` or `dashboard.html` per `LANDING`. The two real files keep
   stable names (`story.html`, `dashboard.html`) regardless.
   - If a build-time rewrite keyed to a JS constant proves impractical, the
     acceptable fallback is: keep both rewrite rules in `vercel.json`, one
     active and one commented, with a clear one-line instruction at the top of
     the file naming which block to swap — but the JS-constant approach is
     preferred.
2. **Nav links** — the "other page" link, its label, and ordering are derived
   from `LANDING` at runtime.
3. **The story's end-of-story call-to-action** (see section 0.6) — its text and
   direction derive from `LANDING`.

Document the switch in one short `README` note: "To make the dashboard the
landing page, set `LANDING = 'dashboard'` in `src/siteConfig.js` and rebuild."

## 0.6 End-of-story call-to-action

The story page must end with a clear CTA block (after the last narrative step)
linking to the dashboard:

- When `LANDING === 'story'`: forward CTA — e.g. **"Explore the full
  dashboard"** framed as *now try it yourself*.
- When `LANDING === 'dashboard'`: back-reference — e.g. **"Back to the
  dashboard"** framed as *return to the tool*.

## 0.7 Phase 0 acceptance checklist

- [ ] `npm run build` succeeds; `dist/` contains both HTML pages.
- [ ] Visiting `/` serves the story page (with default `LANDING = 'story'`).
- [ ] The story page does NOT load/instantiate V1-V5 (check the network tab or
      bundle — dashboard view modules absent).
- [ ] The dashboard page does NOT load Scrollama.
- [ ] Dashboard page is functionally identical to today's `#dashboard`
      (all five views, controls, brushing work).
- [ ] Nav links move correctly between the two pages.
- [ ] Setting `LANDING = 'dashboard'` and rebuilding makes `/` serve the
      dashboard, flips the nav, and flips the CTA — with no other code change.
- [ ] No mode-toggle button remains.

**Stop here and confirm Phase 0 works before starting Phase 1.**

---

# PHASE 1 — Rework the narrative into an interactive data story

Phase 1 changes ONLY the story page (`story.html`, `src/storyMain.js`,
`src/narrative/*`). The dashboard page and V1-V5 remain untouched.

## 1.1 Objective

Replace the current 3-step COVID narrative with a 9-step interactive data
story with two arcs, in this order:

1. **Recurring events** — July 4th and the year-end holidays cause the same
   demand dips every year. Recurrence is the point.
2. **The COVID shock** — March 2020 broke that rhythm. Show the collapse and
   how the *weekly pattern itself* degraded before / during / after.

## 1.2 Scope boundary for Phase 1 — DO NOT TOUCH

- `src/views/v1`-`v5`, `v_globalPatterns.js`
- `src/state/filterBus.js`, `src/controls/*`, `src/api/*`
- `dashboard.html` and `src/dashboardMain.js`
- Any JSON in `public/data/` (read-only inputs)

**You may modify:** `story.html`, `src/storyMain.js`, `src/narrative/*`
(rewrite freely, add files), and **append-only** to the narrative CSS in a
clearly-commented block.

The narrative graphic must be a **new self-contained module** — it owns its own
SVG and never imports from `src/views/` or `src/state/`.

## 1.3 Data

`public/data/daily_volume.json` — array of `{ date: "YYYY-MM-DD", type:
"yellow"|"green"|"fhv", trips: number }`, ~11k rows, 2015-01-01 to 2024-12-31.

`public/data/events.json` — read `covid_lockdown` and `covid_phase1` for the
COVID window dates (see section 1.6).

Data caveat — handle explicitly, do not hide: FHV data only exists from
**Feb 2019**. Pre-2019 totals are Yellow+Green only, so pre-2019 lines sit
lower in the overlay. Add a one-line footnote in the graphic or step copy;
do NOT silently distort.

## 1.4 The narrative graphic (core deliverable)

One new module, e.g. `src/narrative/narrativeGraphic.js`, rendering into the
sticky narrative container. Three coordinated views; scroll steps switch
between them.

### 1.4a Timeline view
Daily total trips (sum of active taxi types) as a single filled line/area,
2015-2024. Supports:
- Animated zoom to a sub-range (e.g. just 2020).
- Optional dashed **ghost line**: the 2019 trajectory drawn over the zoomed
  window as a counterfactual.
- A **direct annotation** at the COVID trough: dot + leader line + large
  "-97%" label + subtitle, pinned to the actual minimum data point (not
  hardcoded coordinates).

### 1.4b Year-overlay view (hero of the recurring arc)
All ten years on a shared **Jan 1 to Dec 31** axis, one line per year.
- **Smoothing:** apply a **7-day centered rolling mean** per year before
  drawing — raw daily sawtooth obscures the holiday dips.
- **Leap-year alignment:** align by (month, day), not ordinal day-of-year;
  drop Feb 29.
- Default: all lines neutral grey, ~0.3 opacity.
- A **highlight mode** param (`null | 'jul' | 'dec' | 'both'`): draws a
  translucent vertical **band** over the window(s) — July approx Jul 1-8,
  year-end approx Dec 22-Jan 2 — and redraws the line segments inside the
  band(s) in an accent color, thicker, full opacity. July accent =
  `--color-policy` (amber); year-end accent = `--color-disruption` (red).

### 1.4c Small-multiples strip (supporting view)
Ten thumbnails, one per year, each a tiny sparkline of that year's daily
volume.
- Thumbnails use **raw** (unsmoothed) data — at thumbnail size noise reads as
  texture.
- The active recurring window is marked on every thumbnail simultaneously when
  the corresponding step is active.
- Visible only during the recurring-event steps; hidden/collapsed otherwise.

### 1.4d Coordinated interactivity (REQUIRED)
Scroll drives story beats; hover enables exploration within a beat. Do NOT add
free controls (toggles, dropdowns) that compete with scroll.
- **Hover a small-multiple thumbnail** -> that year's line brightens / comes
  forward in the overlay (others dim); mouse-out restores.
- **Hover the overlay near a highlighted dip** -> tooltip with that year and
  its exact % drop vs. that year's surrounding-window baseline (section 1.7).
- Provide an accessible static fallback; the graphic carries an `aria-label`
  summary.
- Wrap motion in `@media (prefers-reduced-motion: reduce)`.

## 1.5 Step sequence (9 steps)

Each step = a `.narrative-step` div with `data-step="N"` and a `.step-content`
block. Scrollama `onStepEnter` calls `steps[N].enter()`, which sets the
**complete graphic state** for that step (self-sufficient — no reliance on a
matching `exit()`, so scrolling up or down always lands on a correct frame).

| Step | View | Graphic state | Copy beat |
|------|------|---------------|-----------|
| 1 | timeline | full 2015-2024, no annotation | Hook: a decade of trips, one continuous pulse |
| 2 | overlay | morph in; all years grey, no highlight | The city keeps a calendar — 10 years on one axis |
| 3 | overlay + multiples | highlight 'jul'; multiples visible, July marked | July 4th empties the streets (computed avg dip %) |
| 4 | overlay + multiples | highlight 'dec'; year-end marked | The year-end cliff — deepest recurring valley |
| 5 | overlay + multiples | highlight 'both' | Predictable for a decade — two dips, every year |
| 6 | timeline | morph back; zoom toward 2020; ghost 2019 line in | Then came 2020 — the rhythm breaks |
| 7 | timeline | zoom to 2020; ghost line; -97% trough annotation | The PAUSE that stopped the city |
| 8 | weekly-shapes | three Mon-Sun mini-charts (section 1.6) | Before / during / after — the weekly rhythm degraded |
| 9 | timeline | zoom 2020-2022, recovery visible | A long, uneven climb back |

Transitions between views should animate (cross-fade acceptable if a true morph
is too costly) — do not hard-cut. The end-of-story CTA (section 0.6) follows
step 9.

## 1.6 Step 8 — weekly-shape sketches (before / during / after)

Three small line charts side by side, **identical y-scale**. Each plots
**average trips by day-of-week (Mon to Sun)** over one of three equal-length
windows from `events.json`:
- `covid_lockdown` = 2020-03-22 to 2020-06-07 -> window length D = 78 days.
- **before:** the 78 days ending 2020-03-21.
- **during:** 2020-03-22 to 2020-06-07.
- **after:** 78 days starting at `covid_phase1.date` = 2020-06-08.

The visual must show: *before* = normal weekly rhythm; *during* = near-flat,
near-zero; *after* = partially recovered, not back to the before shape. Label
each panel with its date range and mean daily volume.

## 1.7 Computed statistics (compute at runtime — never hardcode)

- **July 4th dip %:** per year, Jul-4 daily total vs. that year's mean over a
  normal-July baseline (e.g. Jul 11-25). Cross-year average in copy; per-year
  in tooltips.
- **Year-end dip %:** same method — Dec 24-Jan 1 vs. a normal-December baseline
  (e.g. Dec 8-18).
- **COVID trough -%:** April-2020 mean daily volume vs. April-2019 mean.
- Round sensibly; no false precision.

## 1.8 Supporting UI

- **Progress rail:** 9 dots on the sticky graphic edge; active dot
  filled/enlarged; built dynamically from step count.
- **Step copy:** one idea + one number per step; sentence case headings.
  Add `.accent-jul` / `.accent-dec` / `.accent-covid` classes keyed to
  storyline colors.
- **Annotation boxes:** keep the existing `.annotation-box` pattern; add
  storyline-colored left borders.

## 1.9 Visual language

Reuse the CSS custom properties in `src/styles/tokens.css` (`--color-*`,
`--text-*`, `--bg-*`, `--radius*`). Dark theme. Flat — no gradients, no shadows
beyond existing `--shadow-*` tokens. No new palette.

## 1.10 Phase 1 acceptance checklist

- [ ] `npm run build` succeeds, no console errors on load.
- [ ] Dashboard page + V1-V5 byte-identical to post-Phase-0 state.
- [ ] All 9 steps fire correctly scrolling down AND up.
- [ ] Overlay shows 10 years; July & year-end dips visibly align.
- [ ] Hovering a thumbnail highlights that year in the overlay.
- [ ] Hovering an overlay dip shows a computed per-year % tooltip.
- [ ] Step 8 shows three comparable weekly-shape charts.
- [ ] COVID trough annotation reads ~-97%, computed not hardcoded.
- [ ] FHV pre-2019 gap acknowledged in copy or footnote.
- [ ] `prefers-reduced-motion` disables transitions.
- [ ] Narrative graphic imports nothing from `src/views/` or `src/state/`.
- [ ] The `LANDING` switch from Phase 0 still works.

## 1.11 Out of scope

- No changes to V1-V5, the dashboard page, or their order.
- No new data files or pipeline changes — compute from `daily_volume.json`.
- No new heavy dependencies. No backend/API work.