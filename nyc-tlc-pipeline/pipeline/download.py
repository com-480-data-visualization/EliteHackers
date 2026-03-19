"""Script 1: Download NYC TLC parquet files with async concurrency and resume support."""

import asyncio
import json
import os
import sys
import time
import random
from datetime import datetime, timezone

import httpx
import pandas as pd
import pyarrow.parquet as pq
from tqdm import tqdm

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from config import (
    CDN_BASE, END_MONTH, END_YEAR, RAW_DIR, START_MONTH, START_YEAR,
    VEHICLE_TYPES, ZONE_LOOKUP_URL, ZONE_SHAPEFILE_URL,
)

def _vehicle_type_from_filename(filename: str) -> str:
    for vtype in ["fhvhv", "yellow", "green", "fhv"]:
        if filename.startswith(f"{vtype}_tripdata_"):
            return vtype
    return "unknown"

def _print_size_summary_by_type(manifest: dict) -> None:
    rows = []
    for fname, entry in manifest.items():
        if not fname.endswith(".parquet"):
            continue
        if entry.get("status") != "success":
            continue
        vtype = _vehicle_type_from_filename(fname)
        rows.append((vtype, entry.get("file_size_bytes", 0)))

    if not rows:
        return

    totals = {}
    counts = {}
    for vtype, size in rows:
        totals[vtype] = totals.get(vtype, 0) + int(size or 0)
        counts[vtype] = counts.get(vtype, 0) + 1

    print("\n=== Download Size Summary (by vehicle type) ===")
    print(f"{'Type':<8} {'Files':>8} {'Total GB':>12} {'Avg MB/file':>14}")
    print("-" * 50)
    for vtype in sorted(totals.keys()):
        total_bytes = totals[vtype]
        file_count = counts.get(vtype, 0)
        avg_mb = (total_bytes / max(file_count, 1)) / (1024**2)
        print(f"{vtype:<8} {file_count:>8} {total_bytes/(1024**3):>12.2f} {avg_mb:>14.1f}")


def build_year_months(start_year: int, start_month: int,
                      end_year: int, end_month: int) -> list[tuple]:
    """Return list of (year, month) tuples for the configured range."""
    result = []
    year, month = start_year, start_month
    while (year, month) <= (end_year, end_month):
        result.append((year, month))
        month += 1
        if month > 12:
            month = 1
            year += 1
    return result


def load_manifest() -> dict:
    """Load existing manifest.json or return empty dict."""
    manifest_path = os.path.join(RAW_DIR, "manifest.json")
    if os.path.exists(manifest_path):
        with open(manifest_path, "r") as f:
            return json.load(f)
    return {}


def save_manifest(manifest: dict) -> None:
    """Persist manifest.json."""
    os.makedirs(RAW_DIR, exist_ok=True)
    manifest_path = os.path.join(RAW_DIR, "manifest.json")
    with open(manifest_path, "w") as f:
        json.dump(manifest, f, indent=2, default=str)


def verify_parquet(path: str) -> bool:
    """Return True if the file is a readable parquet with at least 1 row."""
    try:
        meta = pq.read_metadata(path)
        return meta.num_rows > 0 and meta.num_row_groups > 0
    except Exception:
        return False

def _safe_remove(path: str) -> None:
    try:
        if os.path.exists(path):
            os.remove(path)
    except Exception:
        pass


async def download_file(url: str, dest_path: str, session: httpx.AsyncClient) -> dict:
    """Download a single parquet file. Returns a manifest entry dict."""
    filename = os.path.basename(dest_path)
    part_path = dest_path + ".part"
    entry = {
        "filename": filename,
        "url": url,
        "download_timestamp": None,
        "file_size_bytes": 0,
        "row_count": 0,
        "status": "failed",
    }

    if os.path.exists(dest_path):
        if verify_parquet(dest_path):
            file_size = os.path.getsize(dest_path)
            try:
                row_count = len(pd.read_parquet(dest_path, engine="pyarrow"))
            except Exception:
                row_count = 0
            entry.update({
                "download_timestamp": datetime.now(timezone.utc).isoformat(),
                "file_size_bytes": file_size,
                "row_count": row_count,
                "status": "success",
            })
            return entry
        # Existing file is unreadable/corrupt -> remove and re-download
        _safe_remove(dest_path)

    # Clean up any previous partial download
    _safe_remove(part_path)

    # CloudFront will sometimes return 403 when rate-limited / blocked.
    # Retry with exponential backoff + jitter, respecting Retry-After where possible.
    max_attempts = 10
    base_backoff_s = 2.0
    politeness_delay_s = 0.75

    try:
        for attempt in range(1, max_attempts + 1):
            # Light stagger to avoid synchronized bursts across tasks
            await asyncio.sleep(random.uniform(0.05, 0.25))

            async with session.stream("GET", url) as response:
                if response.status_code == 404:
                    entry["status"] = "not_found"
                    print(f"  [404] {filename} — file not found on CDN, skipping.")
                    return entry

                if response.status_code in (403, 429):
                    retry_after = response.headers.get("retry-after")
                    if retry_after is not None:
                        try:
                            wait_s = float(retry_after)
                        except ValueError:
                            wait_s = base_backoff_s * (2 ** (attempt - 1))
                    else:
                        wait_s = base_backoff_s * (2 ** (attempt - 1))
                    wait_s = min(wait_s, 120.0) + random.uniform(0.0, 1.0)

                    if attempt < max_attempts:
                        print(f"  [RATE LIMIT] {filename} — HTTP {response.status_code}. Retrying in {wait_s:.1f}s (attempt {attempt}/{max_attempts})")
                        await asyncio.sleep(wait_s)
                        continue

                    entry["status"] = "rate_limited"
                    print(f"  [ERROR] {filename} — HTTP {response.status_code} (rate-limited). Giving up after {max_attempts} attempts.")
                    return entry

                # Other errors
                response.raise_for_status()
                total = int(response.headers.get("content-length", 0))

                os.makedirs(os.path.dirname(dest_path), exist_ok=True)
                progress = tqdm(
                    total=total, unit="B", unit_scale=True, unit_divisor=1024,
                    desc=f"  {filename}", leave=True,
                )
                bytes_written = 0
                with open(part_path, "wb") as f:
                    async for chunk in response.aiter_bytes(chunk_size=65536):
                        f.write(chunk)
                        bytes_written += len(chunk)
                        progress.update(len(chunk))
                progress.close()

                # If server provided content-length, enforce it to detect partial downloads
                if total and bytes_written != total:
                    _safe_remove(part_path)
                    wait_s = min(base_backoff_s * (2 ** (attempt - 1)), 120.0) + random.uniform(0.0, 1.0)
                    if attempt < max_attempts:
                        print(f"  [PARTIAL] {filename} — expected {total} bytes, got {bytes_written}. Retrying in {wait_s:.1f}s (attempt {attempt}/{max_attempts})")
                        await asyncio.sleep(wait_s)
                        continue
                    entry["status"] = "partial_download"
                    print(f"  [ERROR] {filename} — partial download after {max_attempts} attempts.")
                    return entry

                # Atomic move into place
                os.replace(part_path, dest_path)
                await asyncio.sleep(politeness_delay_s)
                break

        file_size = os.path.getsize(dest_path)
        is_valid = verify_parquet(dest_path)

        if is_valid:
            try:
                row_count = len(pd.read_parquet(dest_path, engine="pyarrow"))
            except Exception:
                row_count = 0
            entry.update({
                "download_timestamp": datetime.now(timezone.utc).isoformat(),
                "file_size_bytes": file_size,
                "row_count": row_count,
                "status": "success",
            })
        else:
            entry["status"] = "invalid_parquet"
            print(f"  [WARN] {filename} — downloaded but not a valid parquet file.")
            _safe_remove(dest_path)

    except httpx.HTTPStatusError as e:
        print(f"  [ERROR] {filename} — HTTP {e.response.status_code}")
    except Exception as e:
        print(f"  [ERROR] {filename} — {e}")
        _safe_remove(part_path)

    return entry


async def download_supplementary(session: httpx.AsyncClient) -> None:
    """Download zone lookup CSV and shapefile if not already present."""
    zone_csv_path = os.path.join(RAW_DIR, "taxi_zone_lookup.csv")
    zone_zip_path = os.path.join(RAW_DIR, "taxi_zones.zip")

    for url, dest in [(ZONE_LOOKUP_URL, zone_csv_path), (ZONE_SHAPEFILE_URL, zone_zip_path)]:
        if os.path.exists(dest):
            print(f"  [SKIP] {os.path.basename(dest)} already exists.")
            continue
        try:
            resp = await session.get(url)
            resp.raise_for_status()
            os.makedirs(os.path.dirname(dest), exist_ok=True)
            with open(dest, "wb") as f:
                f.write(resp.content)
            print(f"  [OK] Downloaded {os.path.basename(dest)} ({len(resp.content) / 1024:.1f} KB)")
        except Exception as e:
            print(f"  [ERROR] {os.path.basename(dest)} — {e}")


async def download_all(vehicle_types: list, year_months: list) -> None:
    """Orchestrate all downloads with concurrency limit."""
    manifest = load_manifest()
    # When rate-limited, concurrency=1 is the most reliable.
    semaphore = asyncio.Semaphore(1)

    tasks_to_download = []
    # Download in vehicle type order: green -> fhv -> yellow (matches config)
    for vtype in vehicle_types:
        for year, month in year_months:
            filename = f"{vtype}_tripdata_{year}-{month:02d}.parquet"
            url = f"{CDN_BASE}/{filename}"
            dest = os.path.join(RAW_DIR, filename)

            existing = manifest.get(filename)
            if existing and existing.get("status") == "success" and os.path.exists(dest):
                print(f"  [SKIP] {filename} — already downloaded.")
                continue

            tasks_to_download.append((url, dest, filename))

    print(f"\n  Files to download: {len(tasks_to_download)}")

    headers = {
        "User-Agent": "nyc-tlc-pipeline/1.0 (research; contact: local)",
        "Accept": "*/*",
    }
    limits = httpx.Limits(max_connections=10, max_keepalive_connections=5)
    async with httpx.AsyncClient(
        timeout=httpx.Timeout(300.0, connect=30.0),
        follow_redirects=True,
        headers=headers,
        limits=limits,
    ) as session:
        print("\n--- Downloading supplementary files ---")
        await download_supplementary(session)
        print("\n--- Downloading trip data files ---")

        async def _download_with_semaphore(url, dest):
            async with semaphore:
                return await download_file(url, dest, session)

        # With semaphore=1, run sequentially (most reliable under strict rate limiting)
        for url, dest, _ in tasks_to_download:
            result = await _download_with_semaphore(url, dest)
            manifest[result["filename"]] = result
            save_manifest(manifest)

    save_manifest(manifest)

    succeeded = sum(1 for e in manifest.values() if e.get("status") == "success")
    failed = sum(1 for e in manifest.values() if e.get("status") in ("failed", "invalid_parquet"))
    not_found = sum(1 for e in manifest.values() if e.get("status") == "not_found")
    total_bytes = sum(e.get("file_size_bytes", 0) for e in manifest.values() if e.get("status") == "success")

    print("\n=== Download Summary ===")
    print(f"  Total files attempted : {len(manifest)}")
    print(f"  Succeeded             : {succeeded}")
    print(f"  Failed                : {failed}")
    print(f"  Not found (404)       : {not_found}")
    print(f"  Total downloaded      : {total_bytes / (1024**3):.2f} GB")
    _print_size_summary_by_type(manifest)


def main():
    year_months = build_year_months(START_YEAR, START_MONTH, END_YEAR, END_MONTH)
    print(f"NYC TLC Data Download")
    print(f"  Date range : {START_YEAR}-{START_MONTH:02d} to {END_YEAR}-{END_MONTH:02d}")
    print(f"  Months     : {len(year_months)}")
    print(f"  Types      : {VEHICLE_TYPES}")
    print(f"  Total files: {len(year_months) * len(VEHICLE_TYPES)}")
    asyncio.run(download_all(VEHICLE_TYPES, year_months))


if __name__ == "__main__":
    main()
