# NYC Taxi Mobility: High-level overview and Milestone 2 Status

**Live URL:** [https://elitehackers-six.vercel.app](https://elitehackers-six.vercel.app)

## Run locally

```bash
cd web
npm install
npm run dev   # opens http://localhost:3001
```

## Regenerate JSON aggregations

```bash
pip install polars
python nyc-tlc-pipeline/aggregations/make_milestone2_aggregations.py \
  --data-dir nyc-tlc-pipeline/data/processed \
  --out-dir   web/public/data
```

The script reads cleaned parquet files (output of `nyc-tlc-pipeline/pipeline/preprocess.py`) and produces the JSON files committed in `web/public/data/`.

#### Data aggregations

Pre-aggregated JSON files in `[web/public/data/](web/public/data/)`:

- `monthly_volume.json` — 331 rows (Yellow/Green 2015–2024, FHV 2017-06–2024-12)
- `daily_volume.json` — ~10k rows
- `events.json` — 12 curated annotation events
- `taxi_zones.topojson` — 460 KB simplified TopoJSON

## High-level Architecture

```
                        ┌─────────────┐
                        │  filterBus  │  ← single source of truth
                        │  (pub/sub)  │
                        └──────┬──────┘
              ┌────────────────┼────────────────┐
              ▼                ▼                ▼
       ┌─────────┐      ┌─────────┐      ┌─────────┐
       │   V1    │      │   V5    │      │Controls │
       │ stacked │      │timeline │      │toggle / │
       │  area   │      │+ events │      │ slider  │
       └─────────┘      └─────────┘      └─────────┘
       (brush → bus)    (click → bus)    (input → bus)

       ┌─────────┐  ┌─────────┐  ┌─────────┐
       │  V2 ☐   │  │  V3 ☐   │  │  V4 ☐   │
       │heatmap  │  │choropleth│  │ scatter │
       └─────────┘  └─────────┘  └─────────┘
         (stubs, will be added in Milestone 3)
```

## Data scope

This dashboard visualises NYC TLC Yellow taxi, Green taxi, and traditional FHV (For-Hire Vehicle) data. HVFHV (high-volume rideshare — Uber, Lyft, Via) is excluded. Yellow and Green cover 2015–2024. FHV is shown from February 2019 onward, when the TLC separated high-volume rideshare (Uber, Lyft, Via) into a distinct HVFHV category. Pre-Feb-2019 FHV data included rideshare and would mix two fundamentally different service types in one series.

## Milestone 2 status


| View                    | Status         | Notes                                                                                                                                                                     |
| ----------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V1 Trip Volume          | **Functional** | Brush, tooltip, FHV cutoff annotation                                                                                                                                     |
| V5 Event Timeline       | **Functional** | Daily line + event markers + click-to-filter (currently, sample events are added and to show the functionality, in Milestone 3, it would be real-events with real-impact) |
| V2 Weekly Pulse Heatmap | Stub           | Placeholder panel, Milestone 3                                                                                                                                            |
| V3 Zone Choropleth      | Stub           | Placeholder panel, Milestone 3                                                                                                                                            |
| V4 Trip Anatomy Scatter | Stub           | Placeholder panel, Milestone 3                                                                                                                                            |
| Scrollama narrative     | **Functional** | 3-step story (expand and prepare a separate narrative mode for multiple events other than the COVID, Milestone 3)                                                         |
| Global controls         | **Functional** | Taxi toggle, year slider, reset                                                                                                                                           |


## For Milestone 3

- Implement V2 heatmap from `weekly_heatmap.json`
- Implement V3 choropleth from `taxi_zones.topojson` + `zones_volume.json`
- Implement V4 scatter from `trip_sample.json`
- Run aggregation script on full parquet tree to regenerate accurate `daily_volume.json` (current file interpolates monthly totals)
- Add multiple narratives beyond COVID-19 and expand to weather, fare hikes, policy changes, etc.

