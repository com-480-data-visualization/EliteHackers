"""Export aggregated CSVs for the visualization dashboard.

Uses an incremental/streaming approach — processes one parquet file at a time
and accumulates lightweight aggregations, avoiding loading all data into memory.
"""

import json
import os
import sys
from collections import defaultdict
from datetime import datetime, timezone

import numpy as np
import pandas as pd
from rich.console import Console
from rich.table import Table

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from config import EXPORTS_DIR, FARE_TYPES, PROCESSED_DIR, RAW_DIR

console = Console()

PAYMENT_LABELS = {
    1: "Credit card", 2: "Cash", 3: "No charge",
    4: "Dispute", 5: "Unknown", 6: "Voided trip",
}

DISTANCE_BUCKETS = [
    (0, 1, "0-1 mi"),
    (1, 2, "1-2 mi"),
    (2, 5, "2-5 mi"),
    (5, 10, "5-10 mi"),
    (10, 20, "10-20 mi"),
    (20, float("inf"), "20+ mi"),
]

DAY_NAMES = {
    0: "Monday", 1: "Tuesday", 2: "Wednesday", 3: "Thursday",
    4: "Friday", 5: "Saturday", 6: "Sunday",
}


def get_vehicle_type_from_filename(filename: str) -> str:
    basename = os.path.basename(filename)
    for vtype in ["fhvhv", "yellow", "green", "fhv"]:
        if basename.startswith(vtype):
            return vtype
    return "unknown"


def _save_csv(df: pd.DataFrame, filename: str) -> dict:
    """Save a DataFrame to CSV in the exports dir. Return metadata dict."""
    os.makedirs(EXPORTS_DIR, exist_ok=True)
    path = os.path.join(EXPORTS_DIR, filename)
    float_cols = df.select_dtypes(include=["float64", "float32"]).columns
    for col in float_cols:
        df[col] = df[col].round(2)
    df.to_csv(path, index=False)
    size = os.path.getsize(path)
    return {"filename": filename, "rows": len(df), "size_bytes": size}


class IncrementalAggregator:
    """Accumulates aggregations across files without holding raw data in memory."""

    def __init__(self):
        self.trips_by_hour = defaultdict(lambda: {"count": 0, "fare_sum": 0.0, "fare_n": 0, "dur_sum": 0.0, "dur_n": 0})
        self.trips_by_dow = defaultdict(int)
        self.trips_by_month = defaultdict(int)
        self.trips_by_borough_od = defaultdict(int)
        self.zone_pu_counts = defaultdict(int)
        self.zone_do_counts = defaultdict(int)
        self.od_pair_counts = defaultdict(int)
        self.fare_by_hour_sum = defaultdict(lambda: {"fare_sum": 0.0, "fare_n": 0, "tip_sum": 0.0, "tip_n": 0, "fares": []})
        self.speed_by_hour = defaultdict(lambda: {"speeds": []})
        self.payment_counts = defaultdict(int)
        self.distance_counts = defaultdict(int)
        self.pickup_zone_counts = defaultdict(lambda: defaultdict(int))

    def process_file(self, filepath: str):
        """Process one parquet file and accumulate aggregations."""
        filename = os.path.basename(filepath)
        vtype = get_vehicle_type_from_filename(filename)
        console.print(f"  Aggregating [cyan]{filename}[/cyan]...")

        cols_needed = [
            "vehicle_type", "pickup_hour", "pickup_dow", "pickup_datetime",
            "pickup_month", "fare_amount", "duration_minutes", "trip_distance",
            "speed_mph", "tip_pct", "payment_type",
            "PU_borough", "DO_borough", "PU_zone", "DO_zone",
            "pulocationid", "dolocationid",
        ]

        df = pd.read_parquet(filepath, engine="pyarrow")
        available = [c for c in cols_needed if c in df.columns]
        df = df[available]

        if "pickup_datetime" in df.columns:
            df["year_month"] = pd.to_datetime(df["pickup_datetime"], errors="coerce").dt.to_period("M").astype(str)

        vt = vtype

        if "pickup_hour" in df.columns:
            for hour, grp in df.groupby("pickup_hour"):
                key = (vt, int(hour))
                self.trips_by_hour[key]["count"] += len(grp)
                if "fare_amount" in grp.columns:
                    valid_fare = grp["fare_amount"].dropna()
                    self.trips_by_hour[key]["fare_sum"] += valid_fare.sum()
                    self.trips_by_hour[key]["fare_n"] += len(valid_fare)
                if "duration_minutes" in grp.columns:
                    valid_dur = grp["duration_minutes"].dropna()
                    self.trips_by_hour[key]["dur_sum"] += valid_dur.sum()
                    self.trips_by_hour[key]["dur_n"] += len(valid_dur)

        if "pickup_dow" in df.columns:
            for dow, cnt in df["pickup_dow"].value_counts().items():
                self.trips_by_dow[(vt, int(dow))] += cnt

        if "year_month" in df.columns:
            for ym, cnt in df["year_month"].value_counts().items():
                self.trips_by_month[(vt, ym)] += cnt

        if "PU_borough" in df.columns and "DO_borough" in df.columns:
            for (pu, do_), grp in df.groupby(["PU_borough", "DO_borough"]):
                self.trips_by_borough_od[(str(pu), str(do_), vt)] += len(grp)

        if "pulocationid" in df.columns:
            for loc, cnt in df["pulocationid"].value_counts().items():
                self.zone_pu_counts[int(loc)] += cnt
                if "PU_zone" in df.columns and "PU_borough" in df.columns:
                    subset = df[df["pulocationid"] == loc].iloc[0]
                    self.pickup_zone_counts[int(loc)]["zone"] = str(subset.get("PU_zone", ""))
                    self.pickup_zone_counts[int(loc)]["borough"] = str(subset.get("PU_borough", ""))
                    self.pickup_zone_counts[int(loc)]["count"] += cnt

        if "dolocationid" in df.columns:
            for loc, cnt in df["dolocationid"].value_counts().items():
                self.zone_do_counts[int(loc)] += cnt

        if "PU_zone" in df.columns and "DO_zone" in df.columns:
            for (pu, do_), grp in df.groupby(["PU_zone", "DO_zone"]):
                self.od_pair_counts[(str(pu), str(do_))] += len(grp)

        if vtype in FARE_TYPES and "fare_amount" in df.columns and "pickup_hour" in df.columns:
            for hour, grp in df.groupby("pickup_hour"):
                key = (vt, int(hour))
                fares = grp["fare_amount"].dropna()
                self.fare_by_hour_sum[key]["fare_sum"] += fares.sum()
                self.fare_by_hour_sum[key]["fare_n"] += len(fares)
                self.fare_by_hour_sum[key]["fares"].extend(
                    fares.sample(min(500, len(fares)), random_state=42).tolist()
                )
                if "tip_pct" in grp.columns:
                    tips = grp["tip_pct"].dropna()
                    self.fare_by_hour_sum[key]["tip_sum"] += tips.sum()
                    self.fare_by_hour_sum[key]["tip_n"] += len(tips)

        if "speed_mph" in df.columns and "pickup_hour" in df.columns:
            for hour, grp in df.groupby("pickup_hour"):
                key = (vt, int(hour))
                speeds = grp["speed_mph"].dropna()
                self.speed_by_hour[key]["speeds"].extend(
                    speeds.sample(min(500, len(speeds)), random_state=42).tolist()
                )

        if "payment_type" in df.columns and vtype in FARE_TYPES:
            for pt, cnt in df["payment_type"].value_counts().items():
                self.payment_counts[(vt, int(pt) if pd.notna(pt) else 0)] += cnt

        if "trip_distance" in df.columns:
            for low, high, label in DISTANCE_BUCKETS:
                if high == float("inf"):
                    mask = df["trip_distance"] >= low
                else:
                    mask = (df["trip_distance"] >= low) & (df["trip_distance"] < high)
                self.distance_counts[(vt, label)] += int(mask.sum())

        del df

    def export_all(self) -> list[dict]:
        """Convert accumulated aggregations into CSV exports."""
        exports = []

        exports.append(self._export_trips_by_hour())
        exports.append(self._export_trips_by_dow())
        exports.append(self._export_trips_by_month())
        exports.append(self._export_trips_by_borough_od())
        exports.append(self._export_top_pickup_zones())
        exports.append(self._export_top_od_pairs())
        exports.append(self._export_fare_by_hour())
        exports.append(self._export_speed_by_hour())
        exports.append(self._export_payment_share())
        exports.append(self._export_distance_distribution())
        exports.append(self._export_zone_trip_counts())

        return exports

    def _export_trips_by_hour(self) -> dict:
        rows = []
        for (vt, hour), v in sorted(self.trips_by_hour.items()):
            avg_fare = v["fare_sum"] / v["fare_n"] if v["fare_n"] > 0 else None
            avg_dur = v["dur_sum"] / v["dur_n"] if v["dur_n"] > 0 else None
            rows.append({"vehicle_type": vt, "hour": hour, "trip_count": v["count"],
                         "avg_fare": avg_fare, "avg_duration_min": avg_dur})
        return _save_csv(pd.DataFrame(rows), "trips_by_hour.csv")

    def _export_trips_by_dow(self) -> dict:
        rows = []
        for (vt, dow), cnt in sorted(self.trips_by_dow.items()):
            rows.append({"vehicle_type": vt, "day_of_week": dow,
                         "day_name": DAY_NAMES.get(dow, str(dow)), "trip_count": cnt})
        return _save_csv(pd.DataFrame(rows), "trips_by_dow.csv")

    def _export_trips_by_month(self) -> dict:
        rows = []
        for (vt, ym), cnt in sorted(self.trips_by_month.items()):
            rows.append({"vehicle_type": vt, "year_month": ym, "trip_count": cnt})
        return _save_csv(pd.DataFrame(rows), "trips_by_month.csv")

    def _export_trips_by_borough_od(self) -> dict:
        rows = []
        for (pu, do_, vt), cnt in sorted(self.trips_by_borough_od.items()):
            rows.append({"PU_borough": pu, "DO_borough": do_, "vehicle_type": vt, "trip_count": cnt})
        return _save_csv(pd.DataFrame(rows), "trips_by_borough_od.csv")

    def _export_top_pickup_zones(self) -> dict:
        rows = []
        for loc_id, info in self.pickup_zone_counts.items():
            rows.append({"PULocationID": loc_id, "PU_zone": info.get("zone", ""),
                         "PU_borough": info.get("borough", ""), "trip_count": info.get("count", 0)})
        df = pd.DataFrame(rows)
        if not df.empty:
            df = df.nlargest(50, "trip_count")
        return _save_csv(df, "top_pickup_zones.csv")

    def _export_top_od_pairs(self) -> dict:
        rows = []
        for (pu, do_), cnt in self.od_pair_counts.items():
            rows.append({"PU_zone": pu, "DO_zone": do_, "trip_count": cnt})
        df = pd.DataFrame(rows)
        if not df.empty:
            df = df.nlargest(100, "trip_count")
        return _save_csv(df, "top_od_pairs.csv")

    def _export_fare_by_hour(self) -> dict:
        rows = []
        for (vt, hour), v in sorted(self.fare_by_hour_sum.items()):
            avg_fare = v["fare_sum"] / v["fare_n"] if v["fare_n"] > 0 else None
            median_fare = float(np.median(v["fares"])) if v["fares"] else None
            avg_tip = v["tip_sum"] / v["tip_n"] if v["tip_n"] > 0 else None
            rows.append({"vehicle_type": vt, "hour": hour, "avg_fare": avg_fare,
                         "median_fare": median_fare, "avg_tip_pct": avg_tip})
        return _save_csv(pd.DataFrame(rows), "fare_by_hour.csv")

    def _export_speed_by_hour(self) -> dict:
        rows = []
        for (vt, hour), v in sorted(self.speed_by_hour.items()):
            if v["speeds"]:
                rows.append({"vehicle_type": vt, "hour": hour,
                             "avg_speed_mph": float(np.mean(v["speeds"])),
                             "median_speed_mph": float(np.median(v["speeds"]))})
        return _save_csv(pd.DataFrame(rows), "speed_by_hour.csv")

    def _export_payment_share(self) -> dict:
        rows = []
        for (vt, pt), cnt in sorted(self.payment_counts.items()):
            rows.append({"vehicle_type": vt, "payment_type": pt, "trip_count": cnt,
                         "payment_label": PAYMENT_LABELS.get(pt, "Other")})
        df = pd.DataFrame(rows)
        if not df.empty:
            totals = df.groupby("vehicle_type")["trip_count"].sum().reset_index(name="total")
            df = df.merge(totals, on="vehicle_type")
            df["share_pct"] = (df["trip_count"] / df["total"] * 100).round(2)
            df = df.drop(columns=["total"])
        return _save_csv(df, "payment_share.csv")

    def _export_distance_distribution(self) -> dict:
        rows = []
        for (vt, label), cnt in sorted(self.distance_counts.items()):
            rows.append({"vehicle_type": vt, "distance_bucket": label, "trip_count": cnt})
        return _save_csv(pd.DataFrame(rows), "distance_distribution.csv")

    def _export_zone_trip_counts(self) -> dict:
        zone_path = os.path.join(RAW_DIR, "taxi_zone_lookup.csv")
        if not os.path.exists(zone_path):
            return _save_csv(pd.DataFrame(), "zone_trip_counts.csv")

        zones = pd.read_csv(zone_path)
        zones = zones.rename(columns={"LocationID": "LocationID", "Zone": "zone", "Borough": "borough"})

        pu_df = pd.DataFrame([
            {"LocationID": k, "pickup_count": v} for k, v in self.zone_pu_counts.items()
        ])
        do_df = pd.DataFrame([
            {"LocationID": k, "dropoff_count": v} for k, v in self.zone_do_counts.items()
        ])

        result = zones[["LocationID", "zone", "borough"]].copy()
        if not pu_df.empty:
            result = result.merge(pu_df, on="LocationID", how="left")
        else:
            result["pickup_count"] = 0
        if not do_df.empty:
            result = result.merge(do_df, on="LocationID", how="left")
        else:
            result["dropoff_count"] = 0

        result["pickup_count"] = result["pickup_count"].fillna(0).astype(int)
        result["dropoff_count"] = result["dropoff_count"].fillna(0).astype(int)
        return _save_csv(result, "zone_trip_counts.csv")


def write_metadata(exports: list[dict]) -> None:
    metadata = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "exports": exports,
    }
    path = os.path.join(EXPORTS_DIR, "metadata.json")
    with open(path, "w") as f:
        json.dump(metadata, f, indent=2)
    console.print(f"  Metadata written to [green]{path}[/green]")


def export_all() -> None:
    """Run all export functions using incremental file-by-file aggregation."""
    files = sorted([f for f in os.listdir(PROCESSED_DIR) if f.endswith(".parquet")])
    if not files:
        console.print("[yellow]No processed files found.[/yellow]")
        return

    console.print(f"  Found {len(files)} processed files to aggregate.\n")

    agg = IncrementalAggregator()
    for f in files:
        agg.process_file(os.path.join(PROCESSED_DIR, f))

    console.print("\n  Generating CSV exports...")
    exports = agg.export_all()

    write_metadata(exports)

    table = Table(title="Export Summary", show_lines=True)
    table.add_column("File", style="cyan")
    table.add_column("Rows", justify="right")
    table.add_column("Size", justify="right")

    for e in exports:
        size_str = f"{e['size_bytes'] / 1024:.1f} KB" if e["size_bytes"] > 0 else "0 KB"
        table.add_row(e["filename"], f"{e['rows']:,}", size_str)

    console.print(table)
    console.print(f"\n  [green]All exports written to {EXPORTS_DIR}[/green]")


def main():
    console.print("[bold]NYC TLC Data Export (Incremental)[/bold]\n")
    export_all()


if __name__ == "__main__":
    main()
