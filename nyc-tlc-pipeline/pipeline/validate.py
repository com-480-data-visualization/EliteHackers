"""Schema validation and data integrity checks on downloaded parquet files."""

import json
import os
import sys

import pandas as pd
from rich.console import Console
from rich.table import Table

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from config import (
    MAX_PASSENGER_COUNT, MAX_TRIP_DISTANCE_MILES, MIN_PASSENGER_COUNT,
    RAW_DIR, REPORTS_DIR, VALID_PAYMENT_TYPES,
)

console = Console()

EXPECTED_COLUMNS = {
    "yellow": [
        "tpep_pickup_datetime", "tpep_dropoff_datetime", "PULocationID",
        "DOLocationID", "trip_distance", "fare_amount", "tip_amount",
        "total_amount", "payment_type", "passenger_count",
    ],
    "green": [
        "lpep_pickup_datetime", "lpep_dropoff_datetime", "PULocationID",
        "DOLocationID", "trip_distance", "fare_amount", "tip_amount",
        "total_amount", "payment_type", "passenger_count",
    ],
    "fhvhv": [
        "hvfhs_license_num", "pickup_datetime", "dropoff_datetime",
        "PULocationID", "DOLocationID", "trip_miles", "driver_pay",
    ],
    "fhv": [
        "dispatching_base_num", "pickup_datetime", "dropoff_datetime",
        "PULocationID", "DOLocationID",
    ],
}


def get_vehicle_type_from_filename(filename: str) -> str:
    """Infer vehicle type from the filename prefix."""
    basename = os.path.basename(filename)
    for vtype in ["fhvhv", "yellow", "green", "fhv"]:
        if basename.startswith(vtype):
            return vtype
    return "unknown"


def check_nulls(df: pd.DataFrame) -> dict:
    """Return null percentage per column."""
    total = len(df)
    if total == 0:
        return {}
    null_counts = df.isnull().sum()
    return {col: round(float(null_counts[col]) / total * 100, 2) for col in df.columns}


def check_ranges(df: pd.DataFrame, vehicle_type: str) -> dict:
    """Return count of out-of-range values per numeric column."""
    results = {}

    if vehicle_type in ("yellow", "green"):
        if "PULocationID" in df.columns:
            oob = ((df["PULocationID"] < 1) | (df["PULocationID"] > 265)).sum()
            results["PULocationID_out_of_range"] = int(oob)
        if "DOLocationID" in df.columns:
            oob = ((df["DOLocationID"] < 1) | (df["DOLocationID"] > 265)).sum()
            results["DOLocationID_out_of_range"] = int(oob)
        if "trip_distance" in df.columns:
            neg = (df["trip_distance"] < 0).sum()
            over = (df["trip_distance"] > MAX_TRIP_DISTANCE_MILES).sum()
            results["trip_distance_negative"] = int(neg)
            results["trip_distance_over_max"] = int(over)
        if "fare_amount" in df.columns:
            non_numeric = (~pd.to_numeric(df["fare_amount"], errors="coerce").notna() & df["fare_amount"].notna()).sum()
            results["fare_amount_non_numeric"] = int(non_numeric)
        if "payment_type" in df.columns:
            invalid = (~df["payment_type"].isin(VALID_PAYMENT_TYPES) & df["payment_type"].notna()).sum()
            results["payment_type_invalid"] = int(invalid)
        if "passenger_count" in df.columns:
            oob = (
                (df["passenger_count"].notna()) &
                ((df["passenger_count"] < MIN_PASSENGER_COUNT) | (df["passenger_count"] > MAX_PASSENGER_COUNT))
            ).sum()
            null_pct = round(df["passenger_count"].isnull().sum() / len(df) * 100, 2) if len(df) > 0 else 0
            results["passenger_count_out_of_range"] = int(oob)
            results["passenger_count_null_pct"] = null_pct

    elif vehicle_type == "fhvhv":
        if "PULocationID" in df.columns:
            oob = ((df["PULocationID"] < 1) | (df["PULocationID"] > 265)).sum()
            results["PULocationID_out_of_range"] = int(oob)
        if "DOLocationID" in df.columns:
            oob = ((df["DOLocationID"] < 1) | (df["DOLocationID"] > 265)).sum()
            results["DOLocationID_out_of_range"] = int(oob)
        if "trip_miles" in df.columns:
            neg = (df["trip_miles"] < 0).sum()
            results["trip_miles_negative"] = int(neg)
        if "hvfhs_license_num" in df.columns:
            null_ct = df["hvfhs_license_num"].isnull().sum()
            results["hvfhs_license_num_null"] = int(null_ct)
        if "driver_pay" in df.columns:
            non_numeric = (~pd.to_numeric(df["driver_pay"], errors="coerce").notna() & df["driver_pay"].notna()).sum()
            results["driver_pay_non_numeric"] = int(non_numeric)

    elif vehicle_type == "fhv":
        if "PULocationID" in df.columns:
            oob = ((df["PULocationID"] < 1) | (df["PULocationID"] > 265)).sum()
            results["PULocationID_out_of_range"] = int(oob)
        if "DOLocationID" in df.columns:
            oob = ((df["DOLocationID"] < 1) | (df["DOLocationID"] > 265)).sum()
            results["DOLocationID_out_of_range"] = int(oob)

    return results


def check_duplicates(df: pd.DataFrame, vehicle_type: str) -> int:
    """Return number of duplicate rows on the key columns."""
    if vehicle_type == "yellow":
        key_cols = ["tpep_pickup_datetime", "PULocationID", "DOLocationID"]
    elif vehicle_type == "green":
        key_cols = ["lpep_pickup_datetime", "PULocationID", "DOLocationID"]
    elif vehicle_type in ("fhvhv", "fhv"):
        key_cols = ["pickup_datetime", "PULocationID", "DOLocationID"]
    else:
        return 0

    available = [c for c in key_cols if c in df.columns]
    if not available:
        return 0

    return int(df.duplicated(subset=available, keep="first").sum())


def validate_datetime_columns(df: pd.DataFrame, vehicle_type: str) -> dict:
    """Check datetime columns are valid types and dropoff > pickup for HVFHV."""
    results = {}

    if vehicle_type == "yellow":
        pickup_col, dropoff_col = "tpep_pickup_datetime", "tpep_dropoff_datetime"
    elif vehicle_type == "green":
        pickup_col, dropoff_col = "lpep_pickup_datetime", "lpep_dropoff_datetime"
    else:
        pickup_col, dropoff_col = "pickup_datetime", "dropoff_datetime"

    if pickup_col in df.columns:
        is_dt = pd.api.types.is_datetime64_any_dtype(df[pickup_col])
        results[f"{pickup_col}_is_datetime"] = is_dt

    if vehicle_type == "fhvhv" and pickup_col in df.columns and dropoff_col in df.columns:
        if pd.api.types.is_datetime64_any_dtype(df[pickup_col]) and pd.api.types.is_datetime64_any_dtype(df[dropoff_col]):
            bad_order = (df[dropoff_col] <= df[pickup_col]).sum()
            results["dropoff_before_or_equal_pickup"] = int(bad_order)

    return results


def check_empty_columns(df: pd.DataFrame) -> list:
    """Return list of columns that are entirely null."""
    return [col for col in df.columns if df[col].isnull().all()]


def validate_file(path: str, vehicle_type: str) -> dict:
    """Run all checks for a single file. Return validation report dict."""
    filename = os.path.basename(path)
    df = pd.read_parquet(path, engine="pyarrow")

    report = {
        "filename": filename,
        "vehicle_type": vehicle_type,
        "row_count": len(df),
        "checks": {},
    }

    expected = EXPECTED_COLUMNS.get(vehicle_type, [])
    present = [c for c in expected if c in df.columns]
    missing = [c for c in expected if c not in df.columns]
    report["checks"]["expected_columns_present"] = present
    report["checks"]["missing_columns"] = missing
    report["checks"]["columns_present_pass"] = len(missing) == 0

    empty_cols = check_empty_columns(df)
    report["checks"]["empty_columns"] = empty_cols
    report["checks"]["no_empty_columns_pass"] = len(empty_cols) == 0

    report["checks"]["datetime_validation"] = validate_datetime_columns(df, vehicle_type)

    report["checks"]["null_percentages"] = check_nulls(df)
    report["checks"]["range_checks"] = check_ranges(df, vehicle_type)
    report["checks"]["duplicate_count"] = check_duplicates(df, vehicle_type)

    all_range_ok = all(v == 0 for k, v in report["checks"]["range_checks"].items() if not k.endswith("_pct"))
    report["checks"]["overall_pass"] = (
        report["checks"]["columns_present_pass"]
        and report["checks"]["no_empty_columns_pass"]
        and all_range_ok
    )

    return report


def print_summary_table(results: list[dict]) -> None:
    """Print a rich table of validation results to stdout."""
    table = Table(title="Validation Summary", show_lines=True)
    table.add_column("File", style="cyan")
    table.add_column("Type", style="magenta")
    table.add_column("Rows", justify="right")
    table.add_column("Cols OK", justify="center")
    table.add_column("Empty Cols", justify="center")
    table.add_column("Duplicates", justify="right")
    table.add_column("Overall", justify="center")

    for r in results:
        cols_ok = "[green]✓[/green]" if r["checks"]["columns_present_pass"] else "[red]✗[/red]"
        empty_ok = "[green]✓[/green]" if r["checks"]["no_empty_columns_pass"] else "[red]✗[/red]"
        overall = "[green]PASS[/green]" if r["checks"]["overall_pass"] else "[yellow]WARN[/yellow]"
        dup_count = str(r["checks"]["duplicate_count"])

        table.add_row(
            r["filename"], r["vehicle_type"],
            f"{r['row_count']:,}", cols_ok, empty_ok, dup_count, overall,
        )

    console.print(table)


def validate_all() -> None:
    """Run validate_file on all files in data/raw/. Write reports."""
    os.makedirs(REPORTS_DIR, exist_ok=True)
    results = []

    raw_files = sorted([
        f for f in os.listdir(RAW_DIR) if f.endswith(".parquet")
    ])

    if not raw_files:
        console.print("[yellow]No parquet files found in data/raw/[/yellow]")
        return

    for filename in raw_files:
        filepath = os.path.join(RAW_DIR, filename)
        vehicle_type = get_vehicle_type_from_filename(filename)
        console.print(f"  Validating [cyan]{filename}[/cyan] ({vehicle_type})...")

        report = validate_file(filepath, vehicle_type)
        results.append(report)

        parts = filename.replace(".parquet", "").split("_tripdata_")
        if len(parts) == 2:
            report_name = f"{parts[0]}_{parts[1]}_validation.json"
        else:
            report_name = f"{filename.replace('.parquet', '')}_validation.json"

        report_path = os.path.join(REPORTS_DIR, report_name)
        with open(report_path, "w") as f:
            json.dump(report, f, indent=2, default=str)

    summary_rows = []
    for r in results:
        row = {
            "filename": r["filename"],
            "vehicle_type": r["vehicle_type"],
            "row_count": r["row_count"],
            "columns_present_pass": r["checks"]["columns_present_pass"],
            "no_empty_columns_pass": r["checks"]["no_empty_columns_pass"],
            "duplicate_count": r["checks"]["duplicate_count"],
            "overall_pass": r["checks"]["overall_pass"],
        }
        summary_rows.append(row)

    summary_df = pd.DataFrame(summary_rows)
    summary_path = os.path.join(REPORTS_DIR, "validation_summary.csv")
    summary_df.to_csv(summary_path, index=False)

    print_summary_table(results)
    console.print(f"\n  [green]Validation reports written to {REPORTS_DIR}[/green]")


def main():
    console.print("[bold]NYC TLC Data Validation[/bold]\n")
    validate_all()


if __name__ == "__main__":
    main()
