"""Standalone script to verify integrity of all downloaded parquet files in data/raw/."""

import os
import sys

import pyarrow.parquet as pq

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from config import RAW_DIR, VEHICLE_TYPES, START_YEAR, START_MONTH, END_YEAR, END_MONTH
from pipeline.download import build_year_months


def verify_parquet(path: str) -> tuple[bool, str]:
    try:
        meta = pq.read_metadata(path)
        if meta.num_rows == 0 or meta.num_row_groups == 0:
            return False, "empty (0 rows or 0 row groups)"
        return True, f"{meta.num_rows:,} rows, {meta.num_row_groups} row groups"
    except Exception as e:
        return False, str(e)


def main():
    year_months = build_year_months(START_YEAR, START_MONTH, END_YEAR, END_MONTH)

    total_expected = len(VEHICLE_TYPES) * len(year_months)
    print(f"Expected files: {total_expected} ({len(VEHICLE_TYPES)} types x {len(year_months)} months)\n")

    stats = {vtype: {"valid": 0, "corrupt": 0, "missing": 0, "total_bytes": 0} for vtype in VEHICLE_TYPES}
    corrupt_files = []
    missing_files = []

    for vtype in VEHICLE_TYPES:
        for year, month in year_months:
            filename = f"{vtype}_tripdata_{year}-{month:02d}.parquet"
            filepath = os.path.join(RAW_DIR, filename)

            if not os.path.exists(filepath):
                stats[vtype]["missing"] += 1
                missing_files.append(filename)
                continue

            ok, detail = verify_parquet(filepath)
            size = os.path.getsize(filepath)
            if ok:
                stats[vtype]["valid"] += 1
                stats[vtype]["total_bytes"] += size
            else:
                stats[vtype]["corrupt"] += 1
                corrupt_files.append((filename, detail))

    print(f"{'Type':<8} {'Valid':>6} {'Corrupt':>8} {'Missing':>8} {'Size (GB)':>10}")
    print("-" * 46)
    grand_valid = grand_corrupt = grand_missing = 0
    for vtype in VEHICLE_TYPES:
        s = stats[vtype]
        gb = s["total_bytes"] / (1024 ** 3)
        print(f"{vtype:<8} {s['valid']:>6} {s['corrupt']:>8} {s['missing']:>8} {gb:>10.2f}")
        grand_valid += s["valid"]
        grand_corrupt += s["corrupt"]
        grand_missing += s["missing"]

    print("-" * 46)
    print(f"{'TOTAL':<8} {grand_valid:>6} {grand_corrupt:>8} {grand_missing:>8}")

    if corrupt_files:
        print(f"\nCorrupt files ({len(corrupt_files)}):")
        for name, reason in corrupt_files:
            print(f"  {name} — {reason}")

    if missing_files:
        print(f"\nMissing files ({len(missing_files)}):")
        for name in missing_files:
            print(f"  {name}")

    if not corrupt_files and not missing_files:
        print("\nAll files present and valid!")


if __name__ == "__main__":
    main()
