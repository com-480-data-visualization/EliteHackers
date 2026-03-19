"""Statistical profiling and markdown report generation for processed files."""

import os
import sys

import numpy as np
import pandas as pd
from rich.console import Console

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from config import FARE_TYPES, PROCESSED_DIR, RAW_DIR, REPORTS_DIR

console = Console()

PAYMENT_LABELS = {
    1: "Credit card", 2: "Cash", 3: "No charge",
    4: "Dispute", 5: "Unknown", 6: "Voided trip",
}


def get_vehicle_type_from_filename(filename: str) -> str:
    basename = os.path.basename(filename)
    for vtype in ["fhvhv", "yellow", "green", "fhv"]:
        if basename.startswith(vtype):
            return vtype
    return "unknown"


def load_zone_lookup() -> pd.DataFrame:
    path = os.path.join(RAW_DIR, "taxi_zone_lookup.csv")
    if os.path.exists(path):
        return pd.read_csv(path)
    return pd.DataFrame()


def compute_overview(df: pd.DataFrame, filename: str, vehicle_type: str) -> dict:
    """Return overview metrics dict."""
    date_col = "pickup_datetime" if "pickup_datetime" in df.columns else None
    date_range = ("N/A", "N/A")
    if date_col and pd.api.types.is_datetime64_any_dtype(df[date_col]):
        date_range = (str(df[date_col].min().date()), str(df[date_col].max().date()))

    return {
        "file": filename,
        "vehicle_type": vehicle_type,
        "total_trips": len(df),
        "date_range_start": date_range[0],
        "date_range_end": date_range[1],
        "column_count": len(df.columns),
    }


def compute_numeric_summary(df: pd.DataFrame) -> pd.DataFrame:
    """Return DataFrame with one row per numeric column and all statistics."""
    numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
    if not numeric_cols:
        return pd.DataFrame()

    rows = []
    for col in numeric_cols:
        series = df[col].dropna()
        if len(series) == 0:
            continue
        rows.append({
            "column": col,
            "mean": round(series.mean(), 2),
            "median": round(series.median(), 2),
            "std": round(series.std(), 2),
            "min": round(series.min(), 2),
            "p5": round(series.quantile(0.05), 2),
            "p25": round(series.quantile(0.25), 2),
            "p75": round(series.quantile(0.75), 2),
            "p95": round(series.quantile(0.95), 2),
            "max": round(series.max(), 2),
            "null_count": int(df[col].isnull().sum()),
            "null_pct": round(df[col].isnull().sum() / len(df) * 100, 2) if len(df) > 0 else 0,
        })
    return pd.DataFrame(rows)


def compute_temporal_distributions(df: pd.DataFrame) -> dict:
    """Return dict of DataFrames: by_hour, by_dow, by_date."""
    result = {}
    if "pickup_hour" in df.columns:
        result["by_hour"] = df.groupby("pickup_hour").size().reset_index(name="trip_count")
    if "pickup_dow" in df.columns:
        result["by_dow"] = df.groupby("pickup_dow").size().reset_index(name="trip_count")
    if "pickup_date" in df.columns:
        result["by_date"] = df.groupby("pickup_date").size().reset_index(name="trip_count")
    return result


def compute_geographic_distributions(df: pd.DataFrame,
                                     zone_lookup: pd.DataFrame) -> dict:
    """Return dict: top_pickup_zones, top_dropoff_zones, top_od_pairs."""
    result = {}

    if "PU_zone" in df.columns:
        top_pu = df.groupby(["pulocationid", "PU_zone", "PU_borough"]).size().reset_index(name="trip_count")
        result["top_pickup_zones"] = top_pu.nlargest(20, "trip_count")
    elif "pulocationid" in df.columns:
        top_pu = df.groupby("pulocationid").size().reset_index(name="trip_count")
        result["top_pickup_zones"] = top_pu.nlargest(20, "trip_count")

    if "DO_zone" in df.columns:
        top_do = df.groupby(["dolocationid", "DO_zone", "DO_borough"]).size().reset_index(name="trip_count")
        result["top_dropoff_zones"] = top_do.nlargest(20, "trip_count")
    elif "dolocationid" in df.columns:
        top_do = df.groupby("dolocationid").size().reset_index(name="trip_count")
        result["top_dropoff_zones"] = top_do.nlargest(20, "trip_count")

    if "PU_zone" in df.columns and "DO_zone" in df.columns:
        od = df.groupby(["PU_zone", "DO_zone"]).size().reset_index(name="trip_count")
        result["top_od_pairs"] = od.nlargest(20, "trip_count")

    return result


def compute_fare_analysis(df: pd.DataFrame, vehicle_type: str) -> dict:
    """Return fare and tip statistics. Return empty dict for FHV."""
    if vehicle_type not in FARE_TYPES:
        return {}

    result = {}
    if "fare_amount" in df.columns and "pickup_hour" in df.columns:
        fare_by_hour = df.groupby("pickup_hour")["fare_amount"].agg(["mean", "median"]).round(2)
        result["fare_by_hour"] = fare_by_hour.reset_index()

    if "tip_pct" in df.columns and "payment_type" in df.columns:
        tip_by_payment = df.groupby("payment_type")["tip_pct"].agg(["mean", "median"]).round(2)
        result["tip_by_payment"] = tip_by_payment.reset_index()

    if "payment_type" in df.columns:
        payment_share = df["payment_type"].value_counts().reset_index()
        payment_share.columns = ["payment_type", "count"]
        payment_share["share_pct"] = (payment_share["count"] / payment_share["count"].sum() * 100).round(2)
        payment_share["label"] = payment_share["payment_type"].map(PAYMENT_LABELS).fillna("Other")
        result["payment_share"] = payment_share

    if "fare_amount" in df.columns:
        percentiles = [0.05, 0.25, 0.5, 0.75, 0.95]
        fare_dist = df["fare_amount"].quantile(percentiles).round(2)
        result["fare_percentiles"] = fare_dist.to_dict()

    return result


def compute_speed_analysis(df: pd.DataFrame) -> dict:
    """Return speed and duration statistics."""
    result = {}

    if "speed_mph" in df.columns and "pickup_hour" in df.columns:
        speed_by_hour = df.groupby("pickup_hour")["speed_mph"].agg(["mean", "median"]).round(2)
        result["speed_by_hour"] = speed_by_hour.reset_index()

    if "speed_mph" in df.columns and "PU_borough" in df.columns:
        speed_by_boro = df.groupby("PU_borough")["speed_mph"].agg(["mean", "median"]).round(2)
        result["speed_by_borough"] = speed_by_boro.reset_index()

    if "duration_minutes" in df.columns:
        percentiles = [0.05, 0.25, 0.5, 0.75, 0.95]
        dur_dist = df["duration_minutes"].quantile(percentiles).round(2)
        result["duration_percentiles"] = dur_dist.to_dict()

    if "speed_mph" in df.columns:
        over_60 = (df["speed_mph"] > 60).sum()
        result["trips_over_60mph"] = int(over_60)
        result["trips_over_60mph_pct"] = round(over_60 / max(len(df), 1) * 100, 2)

    return result


def _df_to_markdown(df: pd.DataFrame) -> str:
    """Convert a DataFrame to a markdown table string."""
    if df.empty:
        return "*No data*\n"
    lines = []
    headers = list(df.columns)
    lines.append("| " + " | ".join(str(h) for h in headers) + " |")
    lines.append("| " + " | ".join("---" for _ in headers) + " |")
    for _, row in df.iterrows():
        lines.append("| " + " | ".join(str(v) for v in row.values) + " |")
    return "\n".join(lines) + "\n"


def _dict_to_markdown_table(d: dict, key_header: str = "Metric", val_header: str = "Value") -> str:
    lines = [f"| {key_header} | {val_header} |", "| --- | --- |"]
    for k, v in d.items():
        lines.append(f"| {k} | {v} |")
    return "\n".join(lines) + "\n"


def compute_data_quality(df: pd.DataFrame, numeric_summary: pd.DataFrame) -> list[str]:
    """Return list of data quality notes."""
    notes = []
    total = len(df)
    if total == 0:
        return ["Dataset is empty."]

    for col in df.columns:
        null_rate = df[col].isnull().sum() / total * 100
        if null_rate > 5:
            notes.append(f"Column `{col}` has {null_rate:.1f}% null values.")

    if not numeric_summary.empty:
        for _, row in numeric_summary.iterrows():
            if row["std"] == 0 and row["null_count"] < total:
                notes.append(f"Column `{row['column']}` has zero variance (constant value).")

        for _, row in numeric_summary.iterrows():
            q1, q3 = row["p25"], row["p75"]
            iqr = q3 - q1
            if iqr > 0:
                lower, upper = q1 - 1.5 * iqr, q3 + 1.5 * iqr
                col_data = df[row["column"]].dropna()
                outliers = ((col_data < lower) | (col_data > upper)).sum()
                if outliers > total * 0.05:
                    notes.append(f"Column `{row['column']}` has {outliers:,} IQR outliers ({outliers/total*100:.1f}%).")

    return notes if notes else ["No significant data quality issues detected."]


def write_profile_report(profile: dict, output_path: str) -> None:
    """Render all statistics as a markdown file."""
    lines = []
    ov = profile["overview"]
    lines.append(f"# Profile Report: {ov['file']}\n")

    lines.append("## 1. Overview\n")
    lines.append(_dict_to_markdown_table({
        "File": ov["file"],
        "Vehicle type": ov["vehicle_type"],
        "Total trips": f"{ov['total_trips']:,}",
        "Date range": f"{ov['date_range_start']} to {ov['date_range_end']}",
        "Columns": ov["column_count"],
    }))
    lines.append("")

    lines.append("## 2. Numeric Column Summary\n")
    lines.append(_df_to_markdown(profile["numeric_summary"]))
    lines.append("")

    lines.append("## 3. Temporal Distributions\n")
    temporal = profile.get("temporal", {})
    for key in ["by_hour", "by_dow", "by_date"]:
        if key in temporal:
            lines.append(f"### {key.replace('_', ' ').title()}\n")
            df_t = temporal[key]
            if isinstance(df_t, pd.DataFrame) and len(df_t) > 50:
                lines.append(f"*{len(df_t)} rows — showing first 10 and last 10*\n")
                lines.append(_df_to_markdown(pd.concat([df_t.head(10), df_t.tail(10)])))
            elif isinstance(df_t, pd.DataFrame):
                lines.append(_df_to_markdown(df_t))
            lines.append("")

    lines.append("## 4. Geographic Distributions\n")
    geo = profile.get("geographic", {})
    for key, title in [("top_pickup_zones", "Top 20 Pickup Zones"),
                       ("top_dropoff_zones", "Top 20 Dropoff Zones"),
                       ("top_od_pairs", "Top 20 Origin-Destination Pairs")]:
        if key in geo and isinstance(geo[key], pd.DataFrame):
            lines.append(f"### {title}\n")
            lines.append(_df_to_markdown(geo[key]))
            lines.append("")

    lines.append("## 5. Fare Analysis\n")
    fare = profile.get("fare", {})
    if not fare:
        lines.append("*Not applicable for this vehicle type.*\n")
    else:
        for key, title in [("fare_by_hour", "Fare by Hour"),
                           ("tip_by_payment", "Tip % by Payment Type"),
                           ("payment_share", "Payment Type Share")]:
            if key in fare and isinstance(fare[key], pd.DataFrame):
                lines.append(f"### {title}\n")
                lines.append(_df_to_markdown(fare[key]))
                lines.append("")
        if "fare_percentiles" in fare:
            lines.append("### Fare Distribution Percentiles\n")
            lines.append(_dict_to_markdown_table(fare["fare_percentiles"], "Percentile", "Fare ($)"))
            lines.append("")

    lines.append("## 6. Speed Analysis\n")
    speed = profile.get("speed", {})
    for key, title in [("speed_by_hour", "Speed by Hour"),
                       ("speed_by_borough", "Speed by Borough")]:
        if key in speed and isinstance(speed[key], pd.DataFrame):
            lines.append(f"### {title}\n")
            lines.append(_df_to_markdown(speed[key]))
            lines.append("")
    if "duration_percentiles" in speed:
        lines.append("### Duration (minutes) Percentiles\n")
        lines.append(_dict_to_markdown_table(speed["duration_percentiles"], "Percentile", "Minutes"))
        lines.append("")
    if "trips_over_60mph" in speed:
        lines.append(f"Trips exceeding 60 mph: {speed['trips_over_60mph']:,} ({speed['trips_over_60mph_pct']}%)\n\n")

    lines.append("## Data Quality\n")
    for note in profile.get("data_quality", []):
        lines.append(f"- {note}")
    lines.append("")

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, "w") as f:
        f.write("\n".join(lines))


def write_dataset_overview(all_profiles: list[dict]) -> None:
    """Write the cross-file dataset_overview.md."""
    lines = ["# Dataset Overview\n"]

    trips_by_type = {}
    trips_by_month = {}
    all_zones = set()
    total_trips = 0
    min_date, max_date = None, None

    for p in all_profiles:
        ov = p["overview"]
        vtype = ov["vehicle_type"]
        trips_by_type[vtype] = trips_by_type.get(vtype, 0) + ov["total_trips"]
        total_trips += ov["total_trips"]

        fname = ov["file"]
        parts = fname.replace("_clean.parquet", "").split("_tripdata_")
        if len(parts) == 2:
            month_key = parts[1]
        else:
            month_key = "unknown"
        trips_by_month[month_key] = trips_by_month.get(month_key, 0) + ov["total_trips"]

        for d in [ov["date_range_start"], ov["date_range_end"]]:
            if d and d != "N/A":
                if min_date is None or d < min_date:
                    min_date = d
                if max_date is None or d > max_date:
                    max_date = d

        geo = p.get("geographic", {})
        if "top_pickup_zones" in geo and isinstance(geo["top_pickup_zones"], pd.DataFrame):
            if "PU_zone" in geo["top_pickup_zones"].columns:
                all_zones.update(geo["top_pickup_zones"]["PU_zone"].tolist())

    lines.append("## Summary\n")
    lines.append(_dict_to_markdown_table({
        "Total trips": f"{total_trips:,}",
        "Date range": f"{min_date} to {max_date}",
        "Unique zones seen": len(all_zones),
    }))
    lines.append("")

    lines.append("## Trips by Vehicle Type\n")
    lines.append("| Vehicle Type | Trip Count |")
    lines.append("| --- | --- |")
    for vt, ct in sorted(trips_by_type.items()):
        lines.append(f"| {vt} | {ct:,} |")
    lines.append("")

    lines.append("## Trips by Month\n")
    lines.append("| Month | Trip Count |")
    lines.append("| --- | --- |")
    for m, ct in sorted(trips_by_month.items()):
        lines.append(f"| {m} | {ct:,} |")
    lines.append("")

    lines.append("## Overall Null Rates\n")
    null_accum = {}
    total_rows = 0
    for p in all_profiles:
        ns = p["numeric_summary"]
        if isinstance(ns, pd.DataFrame) and not ns.empty:
            for _, row in ns.iterrows():
                col = row["column"]
                if col not in null_accum:
                    null_accum[col] = 0
                null_accum[col] += row["null_count"]
            total_rows += p["overview"]["total_trips"]

    if total_rows > 0:
        lines.append("| Column | Null Count | Null % |")
        lines.append("| --- | --- | --- |")
        for col, nc in sorted(null_accum.items(), key=lambda x: -x[1]):
            if nc > 0:
                lines.append(f"| {col} | {nc:,} | {nc/total_rows*100:.2f}% |")
    lines.append("")

    overview_path = os.path.join(REPORTS_DIR, "dataset_overview.md")
    os.makedirs(REPORTS_DIR, exist_ok=True)
    with open(overview_path, "w") as f:
        f.write("\n".join(lines))
    console.print(f"  Written: [green]{overview_path}[/green]")


def profile_all() -> None:
    """Run profiling on all processed files and write reports."""
    os.makedirs(REPORTS_DIR, exist_ok=True)
    zone_lookup = load_zone_lookup()
    all_profiles = []

    processed_files = sorted([
        f for f in os.listdir(PROCESSED_DIR) if f.endswith(".parquet")
    ])

    if not processed_files:
        console.print("[yellow]No processed parquet files found.[/yellow]")
        return

    for filename in processed_files:
        filepath = os.path.join(PROCESSED_DIR, filename)
        vehicle_type = get_vehicle_type_from_filename(filename)
        console.print(f"  Profiling [cyan]{filename}[/cyan]...")

        df = pd.read_parquet(filepath, engine="pyarrow")

        numeric_summary = compute_numeric_summary(df)
        profile = {
            "overview": compute_overview(df, filename, vehicle_type),
            "numeric_summary": numeric_summary,
            "temporal": compute_temporal_distributions(df),
            "geographic": compute_geographic_distributions(df, zone_lookup),
            "fare": compute_fare_analysis(df, vehicle_type),
            "speed": compute_speed_analysis(df),
            "data_quality": compute_data_quality(df, numeric_summary),
        }

        all_profiles.append(profile)

        parts = filename.replace("_clean.parquet", "").split("_tripdata_")
        if len(parts) == 2:
            report_name = f"{parts[0]}_{parts[1]}_profile.md"
        else:
            report_name = f"{filename.replace('.parquet', '')}_profile.md"

        report_path = os.path.join(REPORTS_DIR, report_name)
        write_profile_report(profile, report_path)
        console.print(f"  → [green]{report_path}[/green]")

    write_dataset_overview(all_profiles)
    console.print(f"\n  [green]Profiling complete. Reports in {REPORTS_DIR}[/green]")


def main():
    console.print("[bold]NYC TLC Data Profiling[/bold]\n")
    profile_all()


if __name__ == "__main__":
    main()
