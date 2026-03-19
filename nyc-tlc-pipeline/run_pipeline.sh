#!/bin/bash
set -e
PYTHON="/opt/anaconda3/envs/nyc_tlc/bin/python"
echo "=== NYC TLC Trip Data Pipeline ==="
echo "Using Python: $PYTHON"
cd "$(dirname "$0")"
$PYTHON pipeline/download.py
$PYTHON pipeline/validate.py
$PYTHON pipeline/preprocess.py
$PYTHON pipeline/profile.py
$PYTHON pipeline/export.py
echo "=== Pipeline complete. Exports in data/exports/ ==="
