# NYC Taxi Mobility

COM-480 Data Visualization · Spring 2026

Interactive exploration of 900 million NYC taxi trips (2015–2024) across Yellow, Green, and FHV vehicle types.

## Students


| Student's name                                                 | SCIPER | Affiliation             | Contact                                                 |
| -------------------------------------------------------------- | ------ | ----------------------- | ------------------------------------------------------- |
| [Paola Biocchi](https://people.epfl.ch/paola.biocchi)          | 340437 | Master of Neuro-X, EPFL | [paola.biocchi@epfl.ch](mailto:paola.biocchi@epfl.ch)   |
| [Siba Smarak Panigrahi](https://people.epfl.ch/siba.panigrahi) | 352339 | PhD, EDIC, EPFL         | [siba.panigrahi@epfl.ch](mailto:siba.panigrahi@epfl.ch) |


(alphabetical order)

## Final Deliverables

- [Website](https://elitehackers-six.vercel.app)
- [Process Book](milestone3/process_book.pdf)
- [Screen Cast](https://youtu.be/yVMu4vhhtss)

Earlier milestones: [Milestone 1](milestone1/Milestone1_intro.md) · [Milestone 2](milestone2/milestone2.pdf)

## Repository Structure


| Directory           | Description                                                                                  |
| ------------------- | -------------------------------------------------------------------------------------------- |
| `web/`              | Main website: Vite + D3 dashboard with five linked views and scrollytelling story narrative  |
| `nyc-tlc-pipeline/` | Data pipeline: downloads TLC parquets, cleans them, and aggregates into JSON for the website |
| `nyc-tlc-viz/`      | Standalone EDA dashboard (used in Milestone 1 an)                                            |


## How to Run

### Prerequisites

- Node.js 18+
- Python 3.11+ with `pandas`, `geopandas`, `pyarrow`, `httpx` (or use `pip install -r nyc-tlc-pipeline/requirements.txt` in a conda or virtualenv)

### Website

```bash
cd web
npm install && npm run build
npx vercel dev  # (we avoid `npm run dev` since it won't work for ``Explain this day" feature as Vite serves only static frontend) 
```

### Download processed data from Huggingface (optional)

> **Note**: You can download the processed data (with the following commands which will preserve the structure (this will require ~38 GB space). However, you **do not need to download this to launch the website** as the necessary json aggregations are already committed in the repository at `web/public/data/`.

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

> **Note**: Assuming you have the processed data stored in `nyc-tlc-pipeline/data/processed`, you can generate the aggregated json files using the following commands. However, you **do not need to download this to launch the website** as the necessary json aggregations are already committed in the repository.

```bash
cd nyc-tlc-pipeline
pip install -r requirements.txt

bash run_pipeline.sh # full pipeline (several hours, preprocessed data already present in HuggingFace)

# or generate only the web JSON after creating (or fetching) the preprocessed data:
python aggregations/make_milestone2_aggregations.py
python aggregations/make_global_patterns.py
```

## Tech Stack

Frontend: Vite 6 · D3 7 · Scrollama 3 · TopoJSON 3 · Vanilla JS ES modules

Pipeline: Pandas · GeoPandas · PyArrow · NumPy · httpx