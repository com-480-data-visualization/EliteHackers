# EliteHackers — NYC Taxi Mobility

COM-480 Data Visualization · Spring 2026

Interactive visualizations to understand taxi mobility in New York City (NYC)

## Students 👨‍🎓


| Student's name | SCIPER | Affiliation             | Contact                                                 |
| -------------------------------------------------------------- | ------ | ----------------------- | ------------------------------------------------------- |
| [Paola Biocchi](https://people.epfl.ch/paola.biocchi)          | 340437 | Master of Neuro-X, EPFL | [paola.biocchi@epfl.ch](mailto:paola.biocchi@epfl.ch)   |
| [Siba Smarak Panigrahi](https://people.epfl.ch/siba.panigrahi) | 352339 | PhD, EDIC, EPFL         | [siba.panigrahi@epfl.ch](mailto:siba.panigrahi@epfl.ch) |


(alphabetical order)

## Final Deliverables 🚚

- [Website](https://elitehackers-six.vercel.app) 🕸️
- [Process Book](milestone3/process_book.pdf) 📖
- [Screen Cast](#) 📽️

## Structure of the Repository 🏛️

The other milestone deliverables are included in the following directories:

- [Milestone 1](milestone1/Milestone1_intro.md)
- [Milestone 2](milestone2/milestone2.pdf)

Beyond these, the additional important code is organized as follows:

| Directory | Description |
| --------- | ----------- |
| `nyc-tlc-pipeline/` | raw TLC parquet files converted to cleaned data and later aggregated into JSON/CSV for the web visualizations |
| `nyc-tlc-viz/` | standalone EDA dashboard (D3.js, Vite) that reads pipeline CSV exports |
| `web/` | main website (Vite + D3.js + Scrollama) that includes two specific stories (COVID-19 and year-end holidays) and a dashboard with insightful patterns and user controls |
---


## `nyc-tlc-pipeline/`

### Pipeline stages — run in order


| File                     | What it does                                                                                                                                                                                                                                                               |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `config.py`              | Central config: date range, vehicle types, cleaning thresholds, all paths                                                                                                                                                                                                  |
| `pipeline/download.py`   | Async-downloads monthly `.parquet` files from TLC CDN with retry/backoff. Also fetches `taxi_zone_lookup.csv` and `taxi_zones.zip`. Writes `data/raw/manifest.json`.                                                                                                       |
| `pipeline/validate.py`   | Checks schema, null rates, value ranges, duplicates. Writes per-file JSON reports + `reports/stats/validation_summary.csv`.                                                                                                                                                |
| `pipeline/preprocess.py` | Cleans data (invalid fares, distances, durations), renames columns, engineers features: `pickup_hour`, `pickup_dow`, `duration_minutes`, `speed_mph`, `tip_pct`, zone/borough joins. Output: `data/processed/*_clean.parquet` (snappy).                                    |
| `pipeline/profile.py`    | Statistical summaries per file (distributions, top zones, OD pairs, fare analysis). Output: `reports/stats/*.md`.                                                                                                                                                          |
| `pipeline/export.py`     | Incremental aggregation to 11 CSVs consumed by `nyc-tlc-viz`: `trips_by_hour`, `trips_by_dow`, `trips_by_month`, `fare_by_hour`, `speed_by_hour`, `distance_distribution`, `payment_share`, `zone_trip_counts`, `trips_by_borough_od`, `top_pickup_zones`, `top_od_pairs`. |
| `pipeline/check_raw.py`  | Standalone utility: counts valid/corrupt/missing raw files and total GB downloaded.                                                                                                                                                                                        |
| `run_pipeline.sh`        | Runs all five stages in sequence using the `nyc_tlc` conda env.                                                                                                                                                                                                            |


### Aggregation scripts — produce JSON for `web/`


| File                                           | Output                                                                                                                     |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `aggregations/make_milestone2_aggregations.py` | `monthly_volume.json`, `daily_volume.json`, `weekly_heatmap.json`, `zones_volume.json`, `events.json` → `web/public/data/` |
| `aggregations/make_global_patterns.py`         | `global_patterns.json` (hourly demand by year and by borough, 7×24 grids) → `web/public/data/`                             |


### Setup

```bash
cd nyc-tlc-pipeline
pip install -r requirements.txt   # or: conda create -n nyc_tlc && conda activate nyc_tlc && pip install -r requirements.txt
```

Dependencies: `polars`, `pandas`, `pyarrow`, `httpx`, `tqdm`, `rich`, `numpy`.

### Running

```bash
# Full pipeline (downloads ~60 GB, takes several hours)
bash run_pipeline.sh

# Or stage by stage:
python pipeline/download.py
python pipeline/validate.py
python pipeline/preprocess.py
python pipeline/export.py

# Check download status at any point:
python pipeline/check_raw.py

# Generate web data after preprocess is done:
python aggregations/make_milestone2_aggregations.py
python aggregations/make_global_patterns.py
```

> **Note:** `download.py` is rate-limited by the TLC CDN and may need to be run multiple times. It resumes from where it left off using `manifest.json`.

---

## `web/` — Main website

**Stack:** Vite 6, D3 7, Scrollama 3, TopJSON 3. Vanilla JS ES modules, no framework.

### Source files


| File                               | Role                                                                                                                                                          |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.html`                       | Single-page app shell. Defines nav, narrative section (scrollama steps), dashboard section (V1–V5 panels), and Global Patterns section.                       |
| `src/main.js`                      | Entry point: fetches all JSON data, initialises all views and controls.                                                                                       |
| `src/state/filterBus.js`           | Central pub/sub state bus. All views subscribe to it; controls call `update()`. State: `dateRange`, `taxiTypes`, `selectedZone`.                              |
| `src/controls/taxiTypeToggle.js`   | Yellow / Green / FHV toggle buttons — writes to `filterBus.taxiTypes`.                                                                                        |
| `src/controls/yearSlider.js`       | Dual range slider (2015–2024) — writes to `filterBus.dateRange`. Syncs bidirectionally with V1 brush.                                                         |
| `src/controls/resetButton.js`      | Resets all filterBus state to defaults.                                                                                                                       |
| `src/views/v1_stackedArea.js`      | Monthly stacked area chart with brush for date range selection. Used twice (dashboard + narrative).                                                           |
| `src/views/v5_timeline.js`         | Daily line chart with annotated event markers (COVID, blizzards, policy changes). Click a marker to zoom.                                                     |
| `src/views/v_globalPatterns.js`    | 7×24 demand heatmap (day of week × hour). Local controls: year range slider, borough multi-select, normalize toggle. Click a row for a 24h detail line chart. |
| `src/views/v2_heatmap.js`          | Stub — Milestone 3.                                                                                                                                           |
| `src/views/v3_choropleth.js`       | Stub — Milestone 3.                                                                                                                                           |
| `src/views/v4_scatter.js`          | Stub — Milestone 3.                                                                                                                                           |
| `src/narrative/scrollama_setup.js` | Initialises Scrollama on `.narrative-step` elements.                                                                                                          |
| `src/narrative/steps.js`           | Defines what happens on each scroll step: brush V1 to a date range, show/hide annotation overlays.                                                            |
| `src/styles/tokens.css`            | CSS custom properties: colors, typography, spacing, shadows.                                                                                                  |
| `src/styles/main.css`              | All component styles.                                                                                                                                         |


### Data files (`public/data/`)


| File                                                           | Contents                                                                    | Source                            |
| -------------------------------------------------------------- | --------------------------------------------------------------------------- | --------------------------------- |
| `monthly_volume.json`                                          | `[{month, type, trips}]` — 331 rows                                         | `make_milestone2_aggregations.py` |
| `daily_volume.json`                                            | `[{date, type, trips}]` — ~10k rows                                         | `make_milestone2_aggregations.py` |
| `events.json`                                                  | 17 hand-curated events (COVID, blizzards, fare hikes, holidays)             | `make_milestone2_aggregations.py` |
| `global_patterns.json`                                         | `{heatmap_by_year, heatmap_by_borough, borough_list}` — hourly demand grids | `make_global_patterns.py`         |
| `taxi_zones.topojson`                                          | NYC taxi zone polygons (263 zones)                                          | TLC / NYC Open Data               |
| `weekly_heatmap.json`, `zones_volume.json`, `trip_sample.json` | Empty stubs — Milestone 3                                                   | —                                 |


### Setup & run

```bash
cd web
npm install
npm run dev      # dev server → http://localhost:3001 (opens automatically)
npm run build    # production build → dist/
```

Requires Node.js 18+. If not installed: `brew install node` or download from nodejs.org.

---

## `nyc-tlc-viz/` — Standalone EDA dashboard

**Stack:** Vite 6, D3 7, Mapbox GL JS 3. Nine independent chart components.

Reads CSVs directly from `../nyc-tlc-pipeline/data/exports/` via a Vite dev-server middleware (no copy needed). **Requires the pipeline `export.py` stage to have run.**


| Component                 | Chart type                                           |
| ------------------------- | ---------------------------------------------------- |
| `ChartHourlyDemand.js`    | Multi-line: trips by hour, one line per vehicle type |
| `ChartDayOfWeek.js`       | Grouped bar chart by day of week                     |
| `ChartMonthlyTrend.js`    | Stacked area with brush zoom + COVID band            |
| `ChartFareByHour.js`      | Dual-axis: avg fare (bar) + tip % (line)             |
| `ChartDistanceDistrib.js` | Horizontal grouped bars, log/linear toggle           |
| `ChartPaymentSplit.js`    | Donut chart by payment method                        |
| `MapPickupChoropleth.js`  | Mapbox choropleth of 263 taxi zones                  |
| `ChartBoroughOD.js`       | 6×6 origin–destination heatmap                       |
| `ChartSpeedByHour.js`     | Avg + median speed band by hour                      |


```bash
cd nyc-tlc-viz
npm install
npm run dev      # → http://localhost:3000
```

Optional: set `VITE_MAPBOX_TOKEN` in a `.env` file for styled map tiles; falls back to NYC Open Data GeoJSON otherwise.

---

## Data flow

```
TLC CDN (monthly .parquet files)
  └─ download.py → data/raw/
  └─ preprocess.py → data/processed/*_clean.parquet
        ├─ export.py → data/exports/*.csv ──────────────────→ nyc-tlc-viz/
        ├─ make_milestone2_aggregations.py → web/public/data/monthly_volume.json
        │                                    web/public/data/daily_volume.json
        │                                    web/public/data/events.json
        └─ make_global_patterns.py ────────→ web/public/data/global_patterns.json
```

