"""Central configuration for the NYC TLC data pipeline."""

import os

# Date range to download. Modify these to control scope.
START_YEAR = 2015
START_MONTH = 1
END_YEAR = 2025
END_MONTH = 11

# Vehicle types to include (FHVHV excluded — too large at ~460 MB/month)
# Download order matters when rate-limited: do green first, then fhv, then yellow.
VEHICLE_TYPES = ["green", "fhv", "yellow"]

# Which vehicle types have full fare/tip data
FARE_TYPES = ["yellow", "green"]

# Local storage paths (relative to project root)
PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))
RAW_DIR = os.path.join(PROJECT_ROOT, "data", "raw")
PROCESSED_DIR = os.path.join(PROJECT_ROOT, "data", "processed")
EXPORTS_DIR = os.path.join(PROJECT_ROOT, "data", "exports")
REPORTS_DIR = os.path.join(PROJECT_ROOT, "reports", "stats")

# CDN base URL
CDN_BASE = "https://d37ci6vzurychx.cloudfront.net/trip-data"
ZONE_LOOKUP_URL = "https://d37ci6vzurychx.cloudfront.net/misc/taxi_zone_lookup.csv"
ZONE_SHAPEFILE_URL = "https://d37ci6vzurychx.cloudfront.net/misc/taxi_zones.zip"

# Preprocessing thresholds (used in validate.py and preprocess.py)
MAX_TRIP_DISTANCE_MILES = 200
MAX_FARE_AMOUNT = 1000
MIN_FARE_AMOUNT = 0
MAX_TRIP_DURATION_HOURS = 12
MIN_TRIP_DURATION_SECONDS = 30
MAX_PASSENGER_COUNT = 6
MIN_PASSENGER_COUNT = 1
VALID_PAYMENT_TYPES = [1, 2, 3, 4, 5, 6]  # 1=credit card, 2=cash, etc.
