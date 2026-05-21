"""
Global Patterns Aggregation Script — NYC TLC Taxi Data
=======================================================
Produces global_patterns.json consumed by the "Global Patterns" tab in web/.

Data produced:
  heatmap_by_year    — [{year, type, dow, hour, trips}, ...]   ~5 040 rows
  heatmap_by_borough — [{borough, type, dow, hour, trips}, ...]  ~2 520 rows
  borough_list       — [str, ...]

Columns relied upon (output of preprocess.py):
  pickup_dow, pickup_hour, PU_borough

Usage:
  python aggregations/make_global_patterns.py
  python aggregations/make_global_patterns.py \\
      --data-dir data/processed --out-dir ../../web/public/data
"""

import argparse
import json
import re
from pathlib import Path


# ---------------------------------------------------------------------------
# File selection
# ---------------------------------------------------------------------------

def select_files(dir_path: Path, vehicle_type: str,
                 min_year_month=None,
                 max_year_month=None) -> list[tuple[int, Path]]:
    """Return sorted list of (year, path) for matching cleaned parquet files."""
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
        out.append((ym[0], f))
    return sorted(out)


# ---------------------------------------------------------------------------
# Aggregation
# ---------------------------------------------------------------------------

def make_global_patterns(yellow_files, green_files, fhv_files, out_path: Path) -> bool:
    try:
        import polars as pl
    except ImportError:
        print("Polars not installed. Install with: pip install polars")
        return False

    # ── By-year aggregation ──────────────────────────────────────────────────
    print("\n[1/2] Aggregating by year (dow × hour × year × type)...")
    year_rows: dict[tuple, int] = {}

    for vehicle_type, year_files in [("yellow", yellow_files), ("green", green_files), ("fhv", fhv_files)]:
        if not year_files:
            continue
        print(f"  {vehicle_type}: {len(year_files)} files")
        for year, f in year_files:
            try:
                df = pl.read_parquet(f, columns=["pickup_dow", "pickup_hour"])
                agg = (df.group_by(["pickup_dow", "pickup_hour"])
                         .agg(pl.len().alias("trips"))
                         .sort(["pickup_dow", "pickup_hour"]))
                for row in agg.iter_rows(named=True):
                    key = (year, vehicle_type, int(row["pickup_dow"]), int(row["pickup_hour"]))
                    year_rows[key] = year_rows.get(key, 0) + int(row["trips"])
            except Exception as e:
                print(f"    Warning: {f.name}: {e}")

    heatmap_by_year = [
        {"year": k[0], "type": k[1], "dow": k[2], "hour": k[3], "trips": v}
        for k, v in sorted(year_rows.items())
    ]
    print(f"  → {len(heatmap_by_year):,} rows")

    # ── By-borough aggregation ───────────────────────────────────────────────
    print("\n[2/2] Aggregating by borough (dow × hour × borough × type)...")
    borough_rows: dict[tuple, int] = {}

    for vehicle_type, year_files in [("yellow", yellow_files), ("green", green_files), ("fhv", fhv_files)]:
        if not year_files:
            continue
        print(f"  {vehicle_type}: {len(year_files)} files")
        for year, f in year_files:
            try:
                df = pl.read_parquet(f, columns=["pickup_dow", "pickup_hour", "PU_borough"])
                df = df.drop_nulls("PU_borough")
                agg = (df.group_by(["PU_borough", "pickup_dow", "pickup_hour"])
                         .agg(pl.len().alias("trips"))
                         .sort(["PU_borough", "pickup_dow", "pickup_hour"]))
                for row in agg.iter_rows(named=True):
                    key = (row["PU_borough"], vehicle_type, int(row["pickup_dow"]), int(row["pickup_hour"]))
                    borough_rows[key] = borough_rows.get(key, 0) + int(row["trips"])
            except Exception as e:
                print(f"    Warning: {f.name}: {e}")

    heatmap_by_borough = [
        {"borough": k[0], "type": k[1], "dow": k[2], "hour": k[3], "trips": v}
        for k, v in sorted(borough_rows.items())
    ]
    borough_list = sorted(set(r["borough"] for r in heatmap_by_borough))
    print(f"  → {len(heatmap_by_borough):,} rows, {len(borough_list)} boroughs: {borough_list}")

    # ── Write output ─────────────────────────────────────────────────────────
    output = {
        "heatmap_by_year": heatmap_by_year,
        "heatmap_by_borough": heatmap_by_borough,
        "borough_list": borough_list,
    }
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(output))
    size_mb = out_path.stat().st_size / 1e6
    print(f"\nWrote {out_path}  ({size_mb:.1f} MB)")
    return True


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="Produce global_patterns.json for the Global Patterns tab"
    )
    parser.add_argument(
        "--data-dir", type=Path,
        default=Path(__file__).parent.parent / "data" / "processed",
        help="Directory containing cleaned parquet files",
    )
    parser.add_argument(
        "--out-dir", type=Path,
        default=Path(__file__).parent.parent.parent / "web" / "public" / "data",
        help="Output directory for JSON files",
    )
    args = parser.parse_args()

    data_dir = args.data_dir
    out_dir  = args.out_dir

    print(f"Data dir : {data_dir}")
    print(f"Output   : {out_dir}")

    MAX_YM     = (2024, 12)
    FHV_MIN_YM = (2019, 2)

    # Try subdirectory layout first (yellow/, green/, fhv/)
    yellow_files = select_files(data_dir / "yellow", "yellow", max_year_month=MAX_YM)
    green_files  = select_files(data_dir / "green",  "green",  max_year_month=MAX_YM)
    fhv_files    = select_files(data_dir / "fhv",    "fhv",
                                min_year_month=FHV_MIN_YM, max_year_month=MAX_YM)

    # Fallback: flat layout (all files in data_dir)
    if not yellow_files:
        yellow_files = select_files(data_dir, "yellow", max_year_month=MAX_YM)
        green_files  = select_files(data_dir, "green",  max_year_month=MAX_YM)
        fhv_files    = select_files(data_dir, "fhv",
                                    min_year_month=FHV_MIN_YM, max_year_month=MAX_YM)

    print(f"\nFiles found: yellow={len(yellow_files)}, "
          f"green={len(green_files)}, fhv={len(fhv_files)}")

    if not any([yellow_files, green_files, fhv_files]):
        print("\nNo processed parquet files found. Run the pipeline first:")
        print("  python pipeline/preprocess.py")
        return

    make_global_patterns(yellow_files, green_files, fhv_files, out_dir / "global_patterns.json")


if __name__ == "__main__":
    main()
