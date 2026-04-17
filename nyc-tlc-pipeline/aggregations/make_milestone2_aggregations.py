"""
Milestone 2 Aggregation Script — NYC TLC Taxi Data
====================================================
Produces pre-aggregated JSON files consumed by the web/ front end.

Columns relied upon from the processed parquet files (output of preprocess.py):
  pickup_datetime, pickup_date, vehicle_type, trip_distance, fare_amount, tip_amount,
  tip_pct, pickup_hour, pickup_dow, PU_zone, PU_borough, DO_zone, DO_borough

Usage:
  python make_milestone2_aggregations.py --data-dir /path/to/nyc-tlc-pipeline/data/processed \
                                          --out-dir /path/to/web/public/data

The script reads Polars or DuckDB lazily — no 38 GB loaded into RAM at once.
"""

import argparse
import json
import re
import sys
from pathlib import Path
from datetime import date, timedelta
import calendar

# ---------------------------------------------------------------------------
# File selection helpers
# ---------------------------------------------------------------------------

def select_files(dir_path: Path, vehicle_type: str,
                 min_year_month: tuple[int, int] | None = None,
                 max_year_month: tuple[int, int] | None = None) -> list[Path]:
    pattern = re.compile(rf"{vehicle_type}_tripdata_(\d{{4}})-(\d{{2}})_clean\.parquet")
    out = []
    for f in sorted(dir_path.glob(f"{vehicle_type}_tripdata_*.parquet")):
        m = pattern.match(f.name)
        if not m:
            continue
        ym = (int(m.group(1)), int(m.group(2)))
        if min_year_month and ym < min_year_month:
            continue
        if max_year_month and ym > max_year_month:
            continue
        out.append(f)
    return sorted(out)


# ---------------------------------------------------------------------------
# Sanity reporting
# ---------------------------------------------------------------------------

def sanity_report(yellow_files, green_files, fhv_files, data_dir):
    print("\n=== Sanity Report ===")
    print(f"Yellow files selected : {len(yellow_files)}")
    print(f"Green  files selected : {len(green_files)}")
    print(f"FHV    files selected : {len(fhv_files)}")

    def date_range(files):
        if not files:
            return "N/A", "N/A"
        names = [f.name for f in files]
        months = []
        for n in names:
            m = re.search(r"(\d{4})-(\d{2})", n)
            if m:
                months.append((int(m.group(1)), int(m.group(2))))
        return f"{min(months)[0]}-{min(months)[1]:02d}", f"{max(months)[0]}-{max(months)[1]:02d}"

    for label, files in [("Yellow", yellow_files), ("Green", green_files), ("FHV", fhv_files)]:
        lo, hi = date_range(files)
        print(f"  {label}: {lo} → {hi}  ({len(files)} files)")

    try:
        import polars as pl
        if fhv_files:
            sample = pl.read_parquet(fhv_files[0], columns=["vehicle_type"], n_rows=5)
            vt = sample["vehicle_type"].unique().to_list()
            print(f"\nFHV sample vehicle_type values: {vt}")
            if "fhvhv" in vt:
                print("ERROR: FHVHV data found in FHV files — stop and investigate!")
                sys.exit(1)
    except ImportError:
        print("(Polars not installed; skipping vehicle_type check — install with: pip install polars)")

    print("===================\n")


# ---------------------------------------------------------------------------
# Monthly volume (V1)
# ---------------------------------------------------------------------------

def make_monthly_volume(yellow_files, green_files, fhv_files, out_path: Path):
    """Produce monthly_volume.json: [{month, type, trips}, ...]"""
    try:
        import polars as pl
    except ImportError:
        print("Polars not installed. Install with: pip install polars")
        return False

    rows = []
    for vehicle_type, files in [("yellow", yellow_files), ("green", green_files), ("fhv", fhv_files)]:
        if not files:
            continue
        print(f"  Aggregating monthly volume for {vehicle_type} ({len(files)} files)...")
        dfs = []
        for f in files:
            m = re.search(r"(\d{4})-(\d{2})", f.name)
            if not m:
                continue
            yr, mo = int(m.group(1)), int(m.group(2))
            try:
                df = pl.read_parquet(f, columns=["pickup_datetime"])
                count = len(df)
                dfs.append({"month": f"{yr}-{mo:02d}", "type": vehicle_type, "trips": count})
            except Exception as e:
                print(f"    Warning: could not read {f.name}: {e}")
        rows.extend(dfs)

    rows.sort(key=lambda r: (r["month"], r["type"]))

    # Sanity check
    by_type = {}
    for r in rows:
        by_type.setdefault(r["type"], []).append(r)
    for t, rs in by_type.items():
        print(f"  {t}: {len(rs)} months, range {rs[0]['month']} → {rs[-1]['month']}")

    out_path.write_text(json.dumps(rows, indent=2))
    print(f"  Wrote {len(rows)} rows → {out_path}")
    return True


# ---------------------------------------------------------------------------
# Daily volume (V5)
# ---------------------------------------------------------------------------

def make_daily_volume(yellow_files, green_files, fhv_files, out_path: Path):
    """Produce daily_volume.json: [{date, type, trips}, ...]"""
    try:
        import polars as pl
    except ImportError:
        print("Polars not installed. Install with: pip install polars")
        return False

    # Raw TLC parquets occasionally contain pickup_date values far outside the
    # file's nominal month (typos/sentinels — e.g. 2001-01-01 or 2098-09-11).
    # Drop anything outside the dashboard's valid 2015-01-01 .. 2024-12-31 window.
    from datetime import date
    MIN_DATE = date(2015, 1, 1)
    MAX_DATE = date(2024, 12, 31)

    rows = []
    dropped_total = 0
    for vehicle_type, files in [("yellow", yellow_files), ("green", green_files), ("fhv", fhv_files)]:
        if not files:
            continue
        print(f"  Aggregating daily volume for {vehicle_type} ({len(files)} files)...")
        for f in files:
            try:
                df = pl.read_parquet(f, columns=["pickup_date"])
                before = df.height
                df = df.filter(
                    (pl.col("pickup_date") >= MIN_DATE) &
                    (pl.col("pickup_date") <= MAX_DATE)
                )
                dropped_total += before - df.height
                agg = (df.group_by("pickup_date")
                         .agg(pl.len().alias("trips"))
                         .sort("pickup_date"))
                for row in agg.iter_rows(named=True):
                    d = row["pickup_date"]
                    rows.append({
                        "date": str(d),
                        "type": vehicle_type,
                        "trips": int(row["trips"])
                    })
            except Exception as e:
                print(f"    Warning: could not read {f.name}: {e}")

    if dropped_total:
        print(f"  Dropped {dropped_total:,} rows outside {MIN_DATE}..{MAX_DATE}")

    rows.sort(key=lambda r: (r["date"], r["type"]))
    out_path.write_text(json.dumps(rows, indent=2))
    print(f"  Wrote {len(rows)} rows → {out_path}")
    return True


# ---------------------------------------------------------------------------
# Weekly heatmap (V2)
# ---------------------------------------------------------------------------

def make_weekly_heatmap(yellow_files, green_files, fhv_files, out_path: Path):
    """Produce weekly_heatmap.json: [{dow, hour, trips, type}, ...]"""
    try:
        import polars as pl
    except ImportError:
        out_path.write_text("[]")
        return False

    rows = []
    for vehicle_type, files in [("yellow", yellow_files), ("green", green_files), ("fhv", fhv_files)]:
        if not files:
            continue
        print(f"  Aggregating weekly heatmap for {vehicle_type}...")
        dfs = []
        for f in files:
            try:
                df = pl.read_parquet(f, columns=["pickup_hour", "pickup_dow"])
                dfs.append(df)
            except Exception as e:
                print(f"    Warning: {f.name}: {e}")
        if not dfs:
            continue
        combined = pl.concat(dfs)
        agg = (combined.group_by(["pickup_dow", "pickup_hour"])
                       .agg(pl.len().alias("trips"))
                       .sort(["pickup_dow", "pickup_hour"]))
        for row in agg.iter_rows(named=True):
            rows.append({
                "dow": int(row["pickup_dow"]),
                "hour": int(row["pickup_hour"]),
                "trips": int(row["trips"]),
                "type": vehicle_type
            })

    out_path.write_text(json.dumps(rows, indent=2))
    print(f"  Wrote {len(rows)} rows → {out_path}")
    return True


# ---------------------------------------------------------------------------
# Zone volume (V3)
# ---------------------------------------------------------------------------

def make_zones_volume(yellow_files, green_files, fhv_files, out_path: Path):
    """Produce zones_volume.json: [{zone_id, trips}, ...]"""
    try:
        import polars as pl
    except ImportError:
        out_path.write_text("[]")
        return False

    zone_counts = {}
    for vehicle_type, files in [("yellow", yellow_files), ("green", green_files), ("fhv", fhv_files)]:
        if not files:
            continue
        print(f"  Aggregating zone volume for {vehicle_type}...")
        for f in files:
            try:
                df = pl.read_parquet(f, columns=["PU_zone"])
                agg = (df.drop_nulls("PU_zone")
                         .group_by("PU_zone")
                         .agg(pl.len().alias("trips")))
                for row in agg.iter_rows(named=True):
                    zone = row["PU_zone"]
                    zone_counts[zone] = zone_counts.get(zone, 0) + int(row["trips"])
            except Exception as e:
                print(f"    Warning: {f.name}: {e}")

    rows = [{"zone_id": k, "trips": v} for k, v in sorted(zone_counts.items())]
    out_path.write_text(json.dumps(rows, indent=2))
    print(f"  Wrote {len(rows)} zones → {out_path}")
    return True


# ---------------------------------------------------------------------------
# Events (V5, narrative)
# ---------------------------------------------------------------------------

def make_events(out_path: Path):
    """Produce events.json: hand-curated annotation events."""
    events = [
        # --- COVID ---
        {
            "id": "covid_lockdown",
            "date": "2020-03-22",
            "end_date": "2020-05-31",
            "label": "COVID-19 Lockdown",
            "category": "disruption",
            "description": "NYC PAUSE order. Non-essential travel halted; taxi trips fell ~90%."
        },
        {
            "id": "covid_phase1",
            "date": "2020-06-08",
            "end_date": "2020-06-21",
            "label": "Phase 1 Reopening",
            "category": "recovery",
            "description": "NYC Phase 1 reopening: construction, manufacturing, curbside retail."
        },
        {
            "id": "covid_phase2",
            "date": "2020-06-22",
            "end_date": "2020-07-05",
            "label": "Phase 2 Reopening",
            "category": "recovery",
            "description": "Phase 2: offices, in-store retail, barbershops, outdoor dining."
        },
        {
            "id": "covid_phase4",
            "date": "2020-07-20",
            "label": "Phase 4 Reopening",
            "category": "recovery",
            "description": "Phase 4 (no indoor dining): low-risk outdoor activities, media/entertainment."
        },
        # --- Blizzards ---
        {
            "id": "blizzard_jonas_2016",
            "date": "2016-01-23",
            "end_date": "2016-01-24",
            "label": "Blizzard Jonas",
            "category": "weather",
            "description": "Historic snowstorm. NYC travel ban Jan 23; ~27 inches of snow."
        },
        {
            "id": "blizzard_stella_2017",
            "date": "2017-03-14",
            "label": "Blizzard Stella",
            "category": "weather",
            "description": "Nor'easter Stella; NYC dodged worst but still ~7 inches, disrupting service."
        },
        {
            "id": "blizzard_2018",
            "date": "2018-03-07",
            "end_date": "2018-03-08",
            "label": "Nor'easter Riley",
            "category": "weather",
            "description": "Nor'easter Riley: heavy snow and coastal flooding."
        },
        # --- Fare hikes ---
        {
            "id": "fare_hike_2015",
            "date": "2015-01-01",
            "label": "NYC Taxi Fare Update",
            "category": "policy",
            "description": "TLC fare structure in effect at start of dataset period."
        },
        {
            "id": "fare_hike_2023",
            "date": "2023-08-14",
            "label": "Taxi Fare Increase",
            "category": "policy",
            "description": "NYC yellow taxi base fare raised for first time since 2012 (from $2.50 to $3.00)."
        },
        {
            "id": "congestion_pricing_2024",
            "date": "2024-06-30",
            "label": "Congestion Pricing Paused",
            "category": "policy",
            "description": "Governor Hochul paused MTA congestion pricing program days before launch."
        },
        # --- Holidays (multi-year anchors — key ones) ---
        {
            "id": "nye_2016",
            "date": "2016-01-01",
            "label": "New Year's Eve 2015/2016",
            "category": "holiday",
            "description": "NYE peak demand — one of the busiest taxi nights of the year."
        },
        {
            "id": "thanksgiving_2019",
            "date": "2019-11-28",
            "label": "Thanksgiving 2019",
            "category": "holiday",
            "description": "Thanksgiving Day — typically the lowest weekday trip volume of the year."
        },
        {
            "id": "nye_2020",
            "date": "2020-01-01",
            "label": "New Year's Eve 2019/2020",
            "category": "holiday",
            "description": "Last pre-COVID NYE. Yellow+Green peak ~600k trips/day."
        },
        {
            "id": "christmas_2020",
            "date": "2020-12-25",
            "label": "Christmas 2020",
            "category": "holiday",
            "description": "First post-lockdown Christmas; volume recovering but still far below normal."
        },
        {
            "id": "nye_2022",
            "date": "2022-01-01",
            "label": "New Year's Eve 2021/2022",
            "category": "holiday",
            "description": "Omicron wave subdued celebrations."
        },
        # --- Other disruptions ---
        {
            "id": "hurricane_ida_2021",
            "date": "2021-09-01",
            "end_date": "2021-09-02",
            "label": "Hurricane Ida Remnants",
            "category": "weather",
            "description": "Record rainfall flooded NYC subway; street flooding paralyzed taxi operations."
        },
        {
            "id": "subway_shutdown_2017",
            "date": "2017-08-01",
            "label": "MTA 'Summer of Hell'",
            "category": "disruption",
            "description": "MTA emergency repairs on Penn Station; summer-long service cuts drove taxi surge."
        },
    ]

    out_path.write_text(json.dumps(events, indent=2))
    print(f"  Wrote {len(events)} events → {out_path}")
    return True


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Produce Milestone 2 JSON aggregations")
    parser.add_argument("--data-dir", type=Path,
                        default=Path(__file__).parent.parent / "data" / "processed",
                        help="Directory containing cleaned parquet files")
    parser.add_argument("--out-dir", type=Path,
                        default=Path(__file__).parent.parent.parent / "web" / "public" / "data",
                        help="Output directory for JSON files")
    parser.add_argument("--skip-monthly", action="store_true")
    parser.add_argument("--skip-daily", action="store_true")
    parser.add_argument("--skip-heatmap", action="store_true")
    parser.add_argument("--skip-zones", action="store_true")
    args = parser.parse_args()

    data_dir = args.data_dir
    out_dir = args.out_dir
    out_dir.mkdir(parents=True, exist_ok=True)

    print(f"Data dir : {data_dir}")
    print(f"Output   : {out_dir}")

    MAX_YM = (2024, 12)

    yellow_files = select_files(data_dir / "yellow", "yellow", max_year_month=MAX_YM)
    green_files  = select_files(data_dir / "green",  "green",  max_year_month=MAX_YM)
    # FHV cutoff: Feb 2019. Before this, HVFHV (Uber/Lyft/Via) was included in
    # the FHV files; starting 2019-02 the TLC reports HVFHV separately. Since this
    # dashboard excludes HVFHV, using pre-2019-02 FHV mixes two service categories
    # and shows a misleading 30M-to-1M cliff in V1.
    FHV_MIN_YM = (2019, 2)
    fhv_files    = select_files(data_dir / "fhv",    "fhv",
                                min_year_month=FHV_MIN_YM, max_year_month=MAX_YM)

    # If files are directly in data_dir (flat layout)
    if not yellow_files:
        yellow_files = select_files(data_dir, "yellow", max_year_month=MAX_YM)
        green_files  = select_files(data_dir, "green",  max_year_month=MAX_YM)
        fhv_files    = select_files(data_dir, "fhv",    min_year_month=FHV_MIN_YM, max_year_month=MAX_YM)

    sanity_report(yellow_files, green_files, fhv_files, data_dir)

    print("\n--- monthly_volume.json ---")
    if not args.skip_monthly:
        make_monthly_volume(yellow_files, green_files, fhv_files, out_dir / "monthly_volume.json")

    print("\n--- daily_volume.json ---")
    if not args.skip_daily:
        make_daily_volume(yellow_files, green_files, fhv_files, out_dir / "daily_volume.json")

    print("\n--- weekly_heatmap.json ---")
    if not args.skip_heatmap:
        make_weekly_heatmap(yellow_files, green_files, fhv_files, out_dir / "weekly_heatmap.json")
    else:
        (out_dir / "weekly_heatmap.json").write_text("[]")

    print("\n--- zones_volume.json ---")
    if not args.skip_zones:
        make_zones_volume(yellow_files, green_files, fhv_files, out_dir / "zones_volume.json")
    else:
        (out_dir / "zones_volume.json").write_text("[]")

    print("\n--- trip_sample.json (stub) ---")
    (out_dir / "trip_sample.json").write_text("[]")
    print(f"  Wrote stub [] → {out_dir / 'trip_sample.json'}")

    print("\n--- events.json ---")
    make_events(out_dir / "events.json")

    print("\nDone. Output files:")
    for f in sorted(out_dir.glob("*.json")):
        print(f"  {f.name}  ({f.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()
