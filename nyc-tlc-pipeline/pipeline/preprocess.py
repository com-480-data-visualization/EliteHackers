"""Script 3: Clean raw parquet files and engineer features."""

import os
import sys

import pandas as pd
from rich.console import Console
from rich.table import Table

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from config import (
    FARE_TYPES, MAX_FARE_AMOUNT, MAX_PASSENGER_COUNT, MAX_TRIP_DISTANCE_MILES,
    MAX_TRIP_DURATION_HOURS, MIN_FARE_AMOUNT, MIN_PASSENGER_COUNT,
    MIN_TRIP_DURATION_SECONDS, PROCESSED_DIR, RAW_DIR, ZONE_LOOKUP_URL,
)

console = Console()


def load_zone_lookup() -> pd.DataFrame:
    """Load taxi_zone_lookup.csv from data/raw/ or download if missing."""
    path = os.path.join(RAW_DIR, "taxi_zone_lookup.csv")
    if not os.path.exists(path):
        console.print(f"  Downloading zone lookup from {ZONE_LOOKUP_URL}...")
        import httpx
        resp = httpx.get(ZONE_LOOKUP_URL)
        resp.raise_for_status()
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "wb") as f:
            f.write(resp.content)
    return pd.read_csv(path)


def get_vehicle_type_from_filename(filename: str) -> str:
    """Infer vehicle type from the filename prefix."""
    basename = os.path.basename(filename)
    for vtype in ["fhvhv", "yellow", "green", "fhv"]:
        if basename.startswith(vtype):
            return vtype
    return "unknown"


def standardize_columns(df: pd.DataFrame, vehicle_type: str) -> pd.DataFrame:
    """Rename and add vehicle_type column."""
    col_map = {}
    if vehicle_type == "yellow":
        col_map = {
            "tpep_pickup_datetime": "pickup_datetime",
            "tpep_dropoff_datetime": "dropoff_datetime",
        }
    elif vehicle_type == "green":
        col_map = {
            "lpep_pickup_datetime": "pickup_datetime",
            "lpep_dropoff_datetime": "dropoff_datetime",
        }

    if vehicle_type == "fhvhv" and "trip_miles" in df.columns:
        col_map["trip_miles"] = "trip_distance"
    if vehicle_type == "fhvhv" and "base_passenger_fare" in df.columns:
        col_map["base_passenger_fare"] = "fare_amount"
    if vehicle_type == "fhvhv" and "tips" in df.columns:
        col_map["tips"] = "tip_amount"

    df = df.rename(columns=col_map)
    df.columns = [c.strip().lower().replace(" ", "_") for c in df.columns]

    if "pickup_datetime" in df.columns:
        df["pickup_datetime"] = pd.to_datetime(df["pickup_datetime"], errors="coerce")
    if "dropoff_datetime" in df.columns:
        df["dropoff_datetime"] = pd.to_datetime(df["dropoff_datetime"], errors="coerce")

    df["vehicle_type"] = vehicle_type
    return df


def clean_dataframe(df: pd.DataFrame, vehicle_type: str) -> tuple[pd.DataFrame, dict]:
    """Apply all cleaning steps. Return cleaned df and a dict of drop counts per step."""
    initial = len(df)
    drops = {}

    before = len(df)
    df = df.dropna(subset=["pickup_datetime"])
    drops["null_pickup_datetime"] = before - len(df)

    if "dropoff_datetime" in df.columns:
        before = len(df)
        df = df[df["dropoff_datetime"] > df["pickup_datetime"]]
        drops["dropoff_before_pickup"] = before - len(df)

    if "trip_distance" in df.columns:
        before = len(df)
        df = df[(df["trip_distance"] >= 0) & (df["trip_distance"] <= MAX_TRIP_DISTANCE_MILES)]
        drops["trip_distance_filter"] = before - len(df)

    if vehicle_type in FARE_TYPES and "fare_amount" in df.columns:
        before = len(df)
        df = df[(df["fare_amount"] >= MIN_FARE_AMOUNT) & (df["fare_amount"] <= MAX_FARE_AMOUNT)]
        drops["fare_amount_filter"] = before - len(df)

    if "pickup_datetime" in df.columns and "dropoff_datetime" in df.columns:
        duration_s = (df["dropoff_datetime"] - df["pickup_datetime"]).dt.total_seconds()
        before = len(df)
        mask = (duration_s >= MIN_TRIP_DURATION_SECONDS) & (duration_s <= MAX_TRIP_DURATION_HOURS * 3600)
        df = df[mask]
        drops["duration_filter"] = before - len(df)

    if "passenger_count" in df.columns:
        df["passenger_count"] = df["passenger_count"].clip(lower=MIN_PASSENGER_COUNT, upper=MAX_PASSENGER_COUNT)
        df.loc[df["passenger_count"].isna(), "passenger_count"] = pd.NA

    drops["total_dropped"] = initial - len(df)
    drops["rows_in"] = initial
    drops["rows_out"] = len(df)

    return df, drops


def engineer_features(df: pd.DataFrame, vehicle_type: str,
                      zone_lookup: pd.DataFrame) -> pd.DataFrame:
    """Add all engineered columns."""
    if "pickup_datetime" in df.columns:
        df["pickup_hour"] = df["pickup_datetime"].dt.hour
        df["pickup_dow"] = df["pickup_datetime"].dt.dayofweek
        df["pickup_month"] = df["pickup_datetime"].dt.month
        df["pickup_date"] = df["pickup_datetime"].dt.date
        df["is_weekend"] = df["pickup_dow"].isin([5, 6])

    if "pickup_datetime" in df.columns and "dropoff_datetime" in df.columns:
        df["duration_seconds"] = (df["dropoff_datetime"] - df["pickup_datetime"]).dt.total_seconds()
        df["duration_minutes"] = df["duration_seconds"] / 60

    if "trip_distance" in df.columns and "duration_seconds" in df.columns:
        df["speed_mph"] = df["trip_distance"] / (df["duration_seconds"] / 3600)
        df["speed_mph"] = df["speed_mph"].clip(upper=100)

    if vehicle_type in FARE_TYPES:
        if "fare_amount" in df.columns and "trip_distance" in df.columns:
            df["fare_per_mile"] = df["fare_amount"] / df["trip_distance"].replace(0, pd.NA)
        if "tip_amount" in df.columns and "fare_amount" in df.columns:
            df["tip_pct"] = df["tip_amount"] / df["fare_amount"].replace(0, pd.NA) * 100

    pu_lookup = zone_lookup.rename(columns={
        "LocationID": "pulocationid",
        "Zone": "PU_zone",
        "Borough": "PU_borough",
        "service_zone": "PU_service_zone",
    })
    do_lookup = zone_lookup.rename(columns={
        "LocationID": "dolocationid",
        "Zone": "DO_zone",
        "Borough": "DO_borough",
    })

    if "pulocationid" in df.columns:
        df = df.merge(pu_lookup[["pulocationid", "PU_zone", "PU_borough", "PU_service_zone"]],
                       on="pulocationid", how="left")
    if "dolocationid" in df.columns:
        df = df.merge(do_lookup[["dolocationid", "DO_zone", "DO_borough"]],
                       on="dolocationid", how="left")

    if "PU_borough" in df.columns and "DO_borough" in df.columns:
        df["same_borough"] = df["PU_borough"] == df["DO_borough"]

    return df


def preprocess_file(raw_path: str, vehicle_type: str,
                    zone_lookup: pd.DataFrame) -> None:
    """End-to-end preprocess one file and write to data/processed/."""
    filename = os.path.basename(raw_path)
    console.print(f"\n  Processing [cyan]{filename}[/cyan] ({vehicle_type})...")

    df = pd.read_parquet(raw_path, engine="pyarrow")
    df = standardize_columns(df, vehicle_type)
    df, drops = clean_dataframe(df, vehicle_type)
    df = engineer_features(df, vehicle_type, zone_lookup)

    out_name = filename.replace(".parquet", "_clean.parquet")
    out_path = os.path.join(PROCESSED_DIR, out_name)
    os.makedirs(PROCESSED_DIR, exist_ok=True)
    df.to_parquet(out_path, engine="pyarrow", compression="snappy", index=False)

    table = Table(title=f"Preprocessing: {filename}", show_lines=True)
    table.add_column("Step", style="cyan")
    table.add_column("Rows Dropped", justify="right", style="red")
    for step, count in drops.items():
        if step not in ("rows_in", "rows_out", "total_dropped"):
            table.add_row(step, f"{count:,}")
    table.add_row("─" * 30, "─" * 12)
    table.add_row("Rows in", f"{drops['rows_in']:,}")
    table.add_row("Rows out", f"{drops['rows_out']:,}")
    table.add_row("Total dropped", f"{drops['total_dropped']:,} ({drops['total_dropped']/max(drops['rows_in'],1)*100:.1f}%)")
    console.print(table)
    console.print(f"  → Written to [green]{out_path}[/green]")


def preprocess_all() -> None:
    """Run preprocess_file on all successfully downloaded raw files."""
    zone_lookup = load_zone_lookup()

    raw_files = sorted([
        f for f in os.listdir(RAW_DIR) if f.endswith(".parquet")
    ])

    if not raw_files:
        console.print("[yellow]No parquet files found in data/raw/[/yellow]")
        return

    for filename in raw_files:
        filepath = os.path.join(RAW_DIR, filename)
        vehicle_type = get_vehicle_type_from_filename(filename)
        preprocess_file(filepath, vehicle_type, zone_lookup)

    console.print(f"\n  [green]All files preprocessed. Output in {PROCESSED_DIR}[/green]")


def main():
    console.print("[bold]NYC TLC Data Preprocessing[/bold]\n")
    preprocess_all()


if __name__ == "__main__":
    main()
