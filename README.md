# NYC Taxi Mobility

COM-480 Data Visualization · Spring 2026

Interactive exploration of 1.2 billion NYC taxi trips (2015–2024) across Yellow, Green, and FHV vehicle types.

## Students

| Student's name | SCIPER | Affiliation | Contact |
| :---: | :---: | :---: | :---: |
| [Paola Biocchi](https://people.epfl.ch/paola.biocchi) | 340437 | Master of Neuro-X, EPFL | [paola.biocchi@epfl.ch](mailto:paola.biocchi@epfl.ch) |
| [Siba Smarak Panigrahi](https://people.epfl.ch/siba.panigrahi) | 352339 | PhD, EDIC, EPFL | [siba.panigrahi@epfl.ch](mailto:siba.panigrahi@epfl.ch) |

## Final Deliverables

- [Website](https://elitehackers-six.vercel.app)
- [Process Book](milestone3/process_book.pdf)
- [Screen Cast](#)

Earlier milestones: [Milestone 1](milestone1/Milestone1_intro.md) · [Milestone 2](milestone2/milestone2.pdf)

## Repository Structure

| Directory | Description |
| --- | --- |
| `web/` | Main website: Vite + D3 dashboard with five linked views and two scrollytelling stories |
| `nyc-tlc-pipeline/` | Data pipeline: downloads TLC parquets, cleans them, and aggregates into JSON for the web app |
| `nyc-tlc-viz/` | Standalone EDA dashboard (nine chart components, Mapbox choropleth) |

## How to Run

### Prerequisites

- Node.js 18+
- Python 3.10+ with `pandas`, `geopandas`, `pyarrow`, `httpx` (pipeline only)

### Website

```bash
cd web
npm install
npm run dev   # → http://localhost:3001
```

### Data Pipeline (optional, data already included in `web/public/data/`)

```bash
cd nyc-tlc-pipeline
pip install -r requirements.txt

bash run_pipeline.sh           # full pipeline (~60 GB download, several hours)

# or generate only the web JSON after preprocessing:
python aggregations/make_milestone2_aggregations.py
python aggregations/make_global_patterns.py
```

## Tech Stack

<div align="center">
<code><img width="50" src="https://raw.githubusercontent.com/marwin1991/profile-technology-icons/refs/heads/main/icons/javascript.png" alt="JavaScript" title="JavaScript"/></code>
<code><img width="50" src="https://raw.githubusercontent.com/marwin1991/profile-technology-icons/refs/heads/main/icons/html.png" alt="HTML" title="HTML"/></code>
<code><img width="50" src="https://raw.githubusercontent.com/marwin1991/profile-technology-icons/refs/heads/main/icons/css.png" alt="CSS" title="CSS"/></code>
<code><img width="50" src="https://raw.githubusercontent.com/marwin1991/profile-technology-icons/refs/heads/main/icons/vite.png" alt="Vite" title="Vite"/></code>
<code><img width="50" src="https://raw.githubusercontent.com/marwin1991/profile-technology-icons/refs/heads/main/icons/python.png" alt="Python" title="Python"/></code>
<code><img width="50" src="https://raw.githubusercontent.com/marwin1991/profile-technology-icons/refs/heads/main/icons/node_js.png" alt="Node.js" title="Node.js"/></code>
<code><img width="50" src="https://raw.githubusercontent.com/marwin1991/profile-technology-icons/refs/heads/main/icons/github.png" alt="GitHub" title="GitHub"/></code>
</div>

Frontend: Vite 6 · D3 7 · Scrollama 3 · TopoJSON 3 · Vanilla JS ES modules

Pipeline: Pandas · GeoPandas · PyArrow · NumPy · httpx
