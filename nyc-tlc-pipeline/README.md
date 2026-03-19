# NYC TLC Trip Record Data — Data download, cleaning, preprocessing pipeline & Exploratory Dashboard

This directory contains:
(1) a Python data pipeline that downloads, validates, cleans, profiles, and exports TLC trip data, and 
(2) a lightweight interactive web dashboard built with D3.js that renders exploratory data analysis visualizations from the pipeline's output. 

The data is available at the [NYC TLC Trip Record Data Portal](https://www.nyc.gov/site/tlc/about/tlc-trip-record-data.page).

## Architecture Overview

```
TLC Data Portal (CDN)
       │
       ▼
  download.py ──► data/raw/*.parquet
       │
       ▼
  validate.py ──► reports/stats/*_validation.json
       │
       ▼
 preprocess.py ──► data/processed/*_clean.parquet
       │
       ▼
   profile.py ──► reports/stats/*_profile.md
       │
       ▼
   export.py  ──► data/exports/*.csv
       │
       ▼
  Dashboard (nyc-tlc-viz/)
  └── Preliminary D3.js charts for EDA
```

## Prerequisites

- **Python 3.11+** with pip
- **Node.js 18+** with npm
- **~60 GB disk space** for raw + processed data (for 2015-2025 range)
- **Mapbox token** (optional, for enhanced map styling)

## Part 1: Data Download, Validation, Cleaning, Preprocessing & Export

```bash
cd nyc-tlc-pipeline

# Install Python dependencies (in a conda env or virtualenv)
pip install -r requirements.txt

# Edit config.py to set your desired date range and vehicle types
# Default: 2015-01 to 2025-11, vehicle types: yellow, green, fhv
# We ignore FHVHV data (Uber/Lyft) by default due to its large size (~460 MB/month, 20M+ rows/month).

# Run the full pipeline
./run_pipeline.sh

# Or run individual scripts
python pipeline/download.py      # Download parquet files (might need to run multiple times to avoid overloading the request rate limit)
python pipeline/validate.py      # Schema validation
python pipeline/preprocess.py    # Cleaning + feature engineering
python pipeline/profile.py       # Statistical profiling
python pipeline/export.py        # Export CSVs for dashboard
```

**Output locations:**
- `data/raw/` — Downloaded parquet files + manifest.json
- `data/processed/` — Cleaned parquet files (snappy-compressed)
- `data/exports/` — 11 aggregated CSV files for the EDA Dashboard
- `reports/stats/` — Per-file validation JSON, profile markdown, dataset overview

## Part 2: EDA Dashboard Setup and Usage

> The pipeline must be run first — the EDA Dashboard reads from `data/exports/`.

```bash
cd nyc-tlc-viz
npm install
npm run dev
```

The dashboard will open at `http://localhost:3000`. Ensure the `nyc-tlc-pipeline/data/exports/` directory is populated with CSV files.

## Dataset

**Source:** [NYC TLC Trip Record Data](https://www.nyc.gov/site/tlc/about/tlc-trip-record-data.page)

**License:** Public domain / NYC Open Data

**Vehicle types:**

| Type | Description | Key Fields |
|------|-------------|------------|
| Yellow | Medallion taxis | pickup/dropoff datetime, distance, fare, tip, payment type, passenger count |
| Green | Boro taxis (outer boroughs) | Same as yellow with green-specific datetime columns |
| FHV | For-hire vehicles (base-dispatched) | dispatching_base_num, pickup/dropoff datetime, location IDs |

**Note:** FHVHV (Uber/Lyft) data is excluded by default due to its large size (~460 MB/month, 20M+ rows/month). To include it, add `"fhvhv"` to `VEHICLE_TYPES` in `config.py` and add `"fhvhv"` to `FARE_TYPES`, but be prepared for significantly longer processing times and higher memory requirements.

**Schema note:** Starting in 2025, HVFHV files include a `cbd_congestion_fee` column for the NYC congestion pricing program.

## Pipeline Outputs

### Reports (`reports/stats/`)

| File | Description |
|------|-------------|
| `{type}_{YYYY-MM}_validation.json` | Per-file validation: null rates, range checks, duplicate counts |
| `validation_summary.csv` | One-row-per-file summary of all validation checks |
| `{type}_{YYYY-MM}_profile.md` | Full statistical profile: numeric summary, temporal/geographic distributions, fare/speed analysis |
| `dataset_overview.md` | Cross-file summary: total trips per type/month, date range, null rates |

### Exports (`data/exports/`)

| File | Description |
|------|-------------|
| `trips_by_hour.csv` | Trip count, avg fare, avg duration by vehicle type and hour |
| `trips_by_dow.csv` | Trip count by vehicle type and day of week |
| `trips_by_month.csv` | Trip count by vehicle type and year-month |
| `trips_by_borough_od.csv` | Trip count by origin/destination borough pair |
| `top_pickup_zones.csv` | Top 50 pickup zones by trip count |
| `top_od_pairs.csv` | Top 100 origin-destination zone pairs |
| `fare_by_hour.csv` | Average/median fare and tip % by hour |
| `speed_by_hour.csv` | Average/median speed by hour |
| `payment_share.csv` | Payment method breakdown by vehicle type |
| `distance_distribution.csv` | Trip count by distance bucket |
| `zone_trip_counts.csv` | Pickup/dropoff counts for all 263 taxi zones |

## Visualization Descriptions

1. **Hourly Trip Demand** — Multi-line chart showing when during the day people take taxis. Reveals distinct morning and evening peaks, with yellow taxis peaking during evening rush while FHV demand stays steadier.

2. **Day of Week Distribution** — Grouped bar chart comparing ridership across the week. Similar patterns exist across vehicle types.

3. **Monthly Trip Volume Trend** — Stacked area chart showing ridership over time. The COVID-19 impact appears as a dramatic cliff.

4. **Average Fare by Hour** — Combo chart with bars for fare and a line for tip percentage. Late-night rides tend to be most expensive; tipping patterns shift with time of day.

5. **Trip Distance Distribution** — Horizontal bar chart on log scale showing most NYC trips are short hops under 5 miles, with a long tail of airport runs at 10–20 miles.

6. **Payment Method Breakdown** — Donut chart showing credit card dominance. Cash usage varies by vehicle type, with green taxis seeing slightly higher cash usage.

7. **Pickup Demand Choropleth** — SVG map colored by pickup volume. Midtown Manhattan and airport zones (JFK, LaGuardia) are the hottest zones.

8. **Borough O-D Heatmap** — Matrix showing which borough pairs generate the most trips. Intra-Manhattan trips dominate the diagonal, with significant Manhattan↔Brooklyn corridors.

9. **Speed by Hour** — Area chart showing when traffic is worst. Overnight hours show 20+ mph averages while midday drops below 12 mph in Manhattan.

## Tech Stack

### Pipeline (Python)

| Library | Purpose |
|---------|---------|
| httpx | Async HTTP downloads |
| pandas | Data manipulation |
| pyarrow | Parquet I/O |
| geopandas | Shapefile → GeoJSON conversion |
| tqdm | Download progress bars |
| rich | Terminal tables and colored output |
| numpy | Numerical operations |

### Dashboard (JavaScript)

| Library | Purpose |
|---------|---------|
| Vite | Build tool / dev server |
| D3.js v7 | All charts and the choropleth map |
| Mapbox GL JS v3 | Optional enhanced map styling |

## Known Limitations

- **Sample size vs. full dataset:** With the default 2015–2025 range, the pipeline processes hundreds of millions of trips, but earlier years may have different data quality standards.
- **FHV has less fare data:** For-hire vehicle records include only pickup/dropoff locations and times, not fare or tip information. Fare-related charts show only yellow and green taxis.
- **Passenger count nulls:** Newer yellow/green taxi data (2019+) has significantly higher null rates in the `passenger_count` field due to privacy changes.
- **CORS:** If serving the dashboard and CSV files from different origins, configure CORS headers appropriately. The default Vite dev server serves everything from the same origin.

