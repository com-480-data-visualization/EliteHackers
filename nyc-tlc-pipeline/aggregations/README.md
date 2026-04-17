# Milestone 2 Aggregations

Produces pre-aggregated JSON files for the `web/` dashboard.

## Requirements

```bash
pip install polars
```

## Usage

```bash
python make_milestone2_aggregations.py \
  --data-dir /path/to/nyc-tlc-pipeline/data/processed \
  --out-dir   /path/to/web/public/data
```

Default `--data-dir` is `../data/processed` (i.e. `nyc-tlc-pipeline/data/processed`).  
Default `--out-dir` is `../../web/public/data`.

## Outputs


| File                  | Description                      |
| --------------------- | -------------------------------- |
| `monthly_volume.json` | Monthly trips by type (331 rows) |
| `daily_volume.json`   | Daily trips by type (~10k rows)  |
| `weekly_heatmap.json` | Hour × Day of Week × type aggregation    |
| `zones_volume.json`   | Pickup counts per zone           |
| `trip_sample.json`    | Stub (will be added in Milestone 3) |
| `events.json`         | Hand-curated annotation events (will be added in Milestone 3)  |


## Data rules applied

- **Vehicle types:** `yellow`, `green`, `fhv` only.
- **Date ranges:** Yellow + Green: 2015-01 to 2024-12. FHV: 2019-02 to 2024-12.
- **FHV cutoff reason:** Before Feb 2019, it contains both traditional FHV and HVFHV (High-volume FHV, e.g., Uber, Lyft, etc.) thus the counts were inflated. From Feb 2019, there was clear separation between these two vehicle types.

