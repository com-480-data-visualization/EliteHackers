"""Produce pre-aggregated JSON files consumed by the web front end."""

import argparse
import json
import re
import sys
from pathlib import Path
from datetime import date, timedelta
import calendar

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


def make_monthly_volume(yellow_files, green_files, fhv_files, out_path: Path):
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

    by_type = {}
    for r in rows:
        by_type.setdefault(r["type"], []).append(r)
    for t, rs in by_type.items():
        print(f"  {t}: {len(rs)} months, range {rs[0]['month']} → {rs[-1]['month']}")

    out_path.write_text(json.dumps(rows, indent=2))
    print(f"  Wrote {len(rows)} rows → {out_path}")
    return True


def make_daily_volume(yellow_files, green_files, fhv_files, out_path: Path):
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
        dfs = []
        for f in files:
            try:
                df = pl.read_parquet(f, columns=["pickup_date"])
                before = df.height
                df = df.filter(
                    (pl.col("pickup_date") >= MIN_DATE) &
                    (pl.col("pickup_date") <= MAX_DATE)
                )
                dropped_total += before - df.height
                dfs.append(df)
            except Exception as e:
                print(f"    Warning: could not read {f.name}: {e}")
        if not dfs:
            continue
        combined = pl.concat(dfs)
        agg = (combined.group_by("pickup_date")
                       .agg(pl.len().alias("trips"))
                       .sort("pickup_date"))
        for row in agg.iter_rows(named=True):
            d = row["pickup_date"]
            rows.append({
                "date": str(d),
                "type": vehicle_type,
                "trips": int(row["trips"])
            })

    if dropped_total:
        print(f"  Dropped {dropped_total:,} rows outside {MIN_DATE}..{MAX_DATE}")

    rows.sort(key=lambda r: (r["date"], r["type"]))
    out_path.write_text(json.dumps(rows, indent=2))
    print(f"  Wrote {len(rows)} rows → {out_path}")
    return True


def make_weekly_heatmap(yellow_files, green_files, fhv_files, out_path: Path):
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


def make_zones_volume(yellow_files, green_files, fhv_files, out_path: Path):
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

def make_trip_sample(yellow_files, green_files, fhv_files, out_path: Path):
    try:
        import polars as pl
    except ImportError:
        out_path.write_text("[]")
        return False

    SAMPLE_PER_YEAR = 10_000
    # Columns to read from parquet (must match preprocess.py output names).
    WANTED = ["pickup_date", "vehicle_type", "pickup_hour", "trip_distance",
              "fare_amount", "tip_pct", "duration_minutes", "passenger_count"]

    # Group files by year: {year: [(vehicle_type, path), ...]}
    by_year: dict[int, list] = {}
    for vtype, files in [("yellow", yellow_files), ("green", green_files), ("fhv", fhv_files)]:
        for f in files:
            m = re.search(r"(\d{4})-(\d{2})", f.name)
            if not m:
                continue
            year = int(m.group(1))
            by_year.setdefault(year, []).append((vtype, f))

    all_samples = []
    for year in sorted(by_year):
        entries = by_year[year]
        print(f"  {year}: {len(entries)} files", end="", flush=True)

        # Count rows per file using a single cheap column (metadata read in most parquets).
        counts = []
        for _, f in entries:
            try:
                counts.append(len(pl.read_parquet(f, columns=["pickup_hour"])))
            except Exception:
                counts.append(0)

        total = sum(counts)
        if total == 0:
            print(" — no rows, skipping")
            continue

        year_dfs = []
        for (vtype, f), count in zip(entries, counts):
            if count == 0:
                continue
            n = max(1, round(SAMPLE_PER_YEAR * count / total))
            try:
                schema = pl.read_parquet_schema(f)
                avail = [c for c in WANTED if c in schema]
                df = pl.read_parquet(f, columns=avail).sample(n=min(n, count), seed=42)
                # Inject vehicle_type when the parquet lacks it (some FHV files).
                if "vehicle_type" not in df.columns:
                    df = df.with_columns(pl.lit(vtype).alias("vehicle_type"))
                year_dfs.append(df)
            except Exception as e:
                print(f"\n    Warning ({f.name}): {e}", end="")

        if not year_dfs:
            print()
            continue

        combined = pl.concat(year_dfs, how="diagonal")
        if len(combined) > SAMPLE_PER_YEAR:
            combined = combined.sample(n=SAMPLE_PER_YEAR, seed=42)
        all_samples.append(combined)
        print(f" → {len(combined):,} sampled")

    if not all_samples:
        out_path.write_text("[]")
        return False

    final = pl.concat(all_samples, how="diagonal")

    # Rename to the schema V4 expects.
    rename_map = {
        "pickup_date":      "date",
        "vehicle_type":     "type",
        "trip_distance":    "distance_miles",
        "fare_amount":      "total_amount",
        "duration_minutes": "duration_min",
    }
    final = final.rename({k: v for k, v in rename_map.items() if k in final.columns})

    # Drop rows where the two primary scatter axes are null.
    drop_null_on = [c for c in ["distance_miles", "total_amount"] if c in final.columns]
    if drop_null_on:
        final = final.drop_nulls(subset=drop_null_on)

    # Cast date to string for JSON serialisation.
    if "date" in final.columns:
        final = final.with_columns(pl.col("date").cast(pl.String))

    # Round floats to 2 dp to keep file size reasonable.
    float_cols = [c for c, dt in final.schema.items() if dt in (pl.Float32, pl.Float64)]
    if float_cols:
        final = final.with_columns([pl.col(c).round(2) for c in float_cols])

    rows = final.to_dicts()
    out_path.write_text(json.dumps(rows))
    print(f"  Total: {len(rows):,} rows → {out_path}")
    return True


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
    parser.add_argument("--skip-sample", action="store_true")
    args = parser.parse_args()

    data_dir = args.data_dir
    out_dir = args.out_dir
    out_dir.mkdir(parents=True, exist_ok=True)

    print(f"Data dir : {data_dir}")
    print(f"Output   : {out_dir}")

    MAX_YM = (2024, 12)

    yellow_files = select_files(data_dir / "yellow", "yellow", max_year_month=MAX_YM)
    green_files  = select_files(data_dir / "green",  "green",  max_year_month=MAX_YM)
    # FHV before 2019-02 mixed HVFHV (Uber/Lyft) into the same file; exclude to avoid a misleading cliff.
    FHV_MIN_YM = (2019, 2)
    fhv_files    = select_files(data_dir / "fhv",    "fhv",
                                min_year_month=FHV_MIN_YM, max_year_month=MAX_YM)

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

    print("\n--- trip_sample.json ---")
    if not args.skip_sample:
        make_trip_sample(yellow_files, green_files, fhv_files, out_dir / "trip_sample.json")
    else:
        (out_dir / "trip_sample.json").write_text("[]")

    print("\nDone. Output files:")
    for f in sorted(out_dir.glob("*.json")):
        print(f"  {f.name}  ({f.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()
