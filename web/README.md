# NYC Taxi Mobility: High-level overview

**Live URL:** [https://elitehackers-six.vercel.app](https://elitehackers-six.vercel.app)

## Run locally

```bash
cd web && npm install && npm run build
npx vercel dev   # (we avoid npm run dev since it won't work for ``Explain this day" feature) 
```

## Pages

The site is split into two pages with native Vite multi-page support:

- `story.html` — scrollytelling narrative (built on `daily_volume.json` , fully decoupled from dashboard, the graphic lives in `src/narrative/narrativeGraphic.js`) and all statistical values are computed at runtime in `src/narrative/stats.js` )
- `dashboard.html` — Five linked interactive visualizations, namely `Annotated Event Timeline`, `Trip Volume Over Time` , `Weekly Pulse Heatmap` , `NYC Zone Choropleth` , `Trip Anatomy Explorer` (built on JSON aggregations of processed NYC TLC Monthly Parquet data files)

## Regenerate JSON aggregations

```bash
pip install polars
python nyc-tlc-pipeline/aggregations/make_milestone2_aggregations.py
python nyc-tlc-pipeline/aggregations/make_global_patterns.py
```

The script reads cleaned parquet files (output of `nyc-tlc-pipeline/pipeline/preprocess.py`) and produces the JSON files committed in `web/public/data/`.

#### Data aggregations

Pre-aggregated JSON files in `[public/data/](public/data/)`:

- `daily_volume.json` 
- `global_patterns.json`
- `monthly_volume.json`
- `taxi_zones.topojson`
- `trip_sample.json`
- `weekly_heatmap.json`
- `zones_volume.json`

## High-level Architecture of Central Filter

```
                        ┌─────────────┐
                        │  filterBus  │  ← single source of truth
                        │  (pub/sub)  │
                        └──────┬──────┘
              ┌────────────────┼────────────────┐
              ▼                ▼                ▼
       ┌─────────┐      ┌─────────┐      ┌─────────┐
       │   V1    │      │   V5    │      │Global   │
       │ stacked │      │timeline │      │controls │
       │  area   │      │+ events │      │(slider) │
       └─────────┘      └─────────┘      └─────────┘
       (brush → bus)    (click → bus)    (input → bus)

       ┌─────────┐  ┌─────────┐  ┌─────────┐
       │  V2 ☐   │  │  V3 ☐   │  │  V4 ☐   │
       │heatmap  │  │choropleth│  │ scatter │
       └─────────┘  └─────────┘  └─────────┘
       (Read from the bus only, no write allowed)
```

## Old Milestone 2 Content Below (Not relevant for Milestone 3)

## Milestone 2 Status


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

