# 🚕 NYC Taxi Mobility

COM-480 Data Visualization · Spring 2026

Interactive exploration of 900 million NYC taxi trips (2015–2024) across Yellow, Green, and FHV vehicle types.

<p align="center">
  <img src="readme_image.jpg" alt="NYC taxis at night" width="100%">
</p>

## 👥 Students

| Student's name                                                 | SCIPER | Affiliation             | Contact                                                 |
| -------------------------------------------------------------- | ------ | ----------------------- | ------------------------------------------------------- |
| [Paola Biocchi](https://people.epfl.ch/paola.biocchi)          | 340437 | Master of Neuro-X, EPFL | [paola.biocchi@epfl.ch](mailto:paola.biocchi@epfl.ch)   |
| [Siba Smarak Panigrahi](https://people.epfl.ch/siba.panigrahi) | 352339 | PhD, EDIC, EPFL         | [siba.panigrahi@epfl.ch](mailto:siba.panigrahi@epfl.ch) |

(alphabetical order)

## 📦 Final Deliverables

- [Website](https://elitehackers-six.vercel.app)
- [Process Book](milestone3/ProcessBook.pdf)
- [Screen Cast](https://www.youtube.com/watch?v=yVMu4vhhtss)

Earlier milestones: [Milestone 1](milestone1/Milestone1_intro.md) · [Milestone 2](milestone2/milestone2.pdf)

## 🗂️ Repository Structure

| Directory           | Description                                                                                  |
| ------------------- | -------------------------------------------------------------------------------------------- |
| `web/`              | Main website: Vite + D3 dashboard with five linked views and scrollytelling story narrative  |
| `nyc-tlc-pipeline/` | Data pipeline: downloads TLC parquets, cleans them, and aggregates into JSON for the website |
| `nyc-tlc-viz/`      | Standalone EDA dashboard (used in Milestone 1)                                               |

## 🚀 How to Run

### Prerequisites

- Node.js 18+
- Python 3.11+ with `pandas`, `geopandas`, `pyarrow`, `httpx` (or use `pip install -r nyc-tlc-pipeline/requirements.txt` in a conda or virtualenv)

### Website

```bash
cd web
npm install && npm run build
npx vercel dev  # (see the website locally, we avoid `npm run dev` since it won't work for the "Explain this day" feature as Vite serves only static frontend)
```

### Download processed data from Huggingface (optional)

> **Note**: You can download the processed data with the following commands, which will preserve the structure (requires ~38 GB space). You **do not need to download this to launch the website** as the necessary JSON aggregations are already committed at `web/public/data/`.

```bash
pip install huggingface_hub
mkdir -p nyc-tlc-pipeline/data/processed

huggingface-cli download sibasmarakp/nyc-tlc-processed \
  --repo-type dataset \
  --include "data/**/*.parquet" \
  --local-dir nyc-tlc-pipeline/

find nyc-tlc-pipeline/data -mindepth 2 -name "*.parquet" -exec mv -t nyc-tlc-pipeline/data/processed/ {} +
find nyc-tlc-pipeline/data -mindepth 1 -type d -empty ! -name processed -delete
```

> **Note**: To download the raw data and process from scratch, please follow the instructions [here](nyc-tlc-pipeline/README.md). Note, this will take several hours and requires a lot of disk space (~60 GB).

### Data Pipeline (optional)

> **Note**: Assuming you have the processed data stored in `nyc-tlc-pipeline/data/processed`, you can generate the aggregated JSON files using the following commands. You **do not need to run this to launch the website** as the necessary JSON aggregations are already committed.

```bash
cd nyc-tlc-pipeline
pip install -r requirements.txt

bash run_pipeline.sh # full pipeline (several hours, preprocessed data already present in HuggingFace)

# generate only the web JSON after creating (or fetching) the preprocessed data:
pip install polars
python aggregations/make_milestone2_aggregations.py
python aggregations/make_global_patterns.py
```

## 🛠️ Tech Stack

**Frontend**

![Vite](https://img.shields.io/badge/Vite_6-646CFF?logo=vite&logoColor=white&style=flat-square)
![D3](https://img.shields.io/badge/D3_7-F9A03C?logo=d3dotjs&logoColor=white&style=flat-square)
![JavaScript](https://img.shields.io/badge/ES_Modules-F7DF1E?logo=javascript&logoColor=black&style=flat-square)
![Scrollama](https://img.shields.io/badge/Scrollama_3-333333?style=flat-square)
![TopoJSON](https://img.shields.io/badge/TopoJSON_3-555555?style=flat-square)

**Pipeline**

![Python](https://img.shields.io/badge/Python_3.11+-3776AB?logo=python&logoColor=white&style=flat-square)
![Pandas](https://img.shields.io/badge/Pandas-150458?logo=pandas&logoColor=white&style=flat-square)
![NumPy](https://img.shields.io/badge/NumPy-013243?logo=numpy&logoColor=white&style=flat-square)
![GeoPandas](https://img.shields.io/badge/GeoPandas-139C5A?style=flat-square)
![PyArrow](https://img.shields.io/badge/PyArrow-E25A1C?style=flat-square)
![Polars](https://img.shields.io/badge/Polars-CD792C?logo=polars&logoColor=white&style=flat-square)
