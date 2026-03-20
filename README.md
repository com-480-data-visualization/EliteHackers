# Project of Data Visualization (COM-480)

| Student's name | SCIPER |
| -------------- | ------ |
| Debajyoti Dasgupta | 416472 |
| Paola Biocchi | 340437 |
| Siba Smarak Panigrahi| 352339 |

[Milestone 1](#milestone-1) • [Milestone 2](#milestone-2) • [Milestone 3](#milestone-3)

## Milestone 1 (20th March, 5pm)

**10% of the final grade**

This is a preliminary milestone to let you set up goals for your final project and assess the feasibility of your ideas.
Please, fill the following sections about your project.

*(max. 2000 characters per section)*

### Dataset

> Find a dataset (or multiple) that you will explore. Assess the quality of the data it contains and how much preprocessing / data-cleaning it will require before tackling visualization. We recommend using a standard dataset as this course is not about scraping nor data processing.
>
> Hint: some good pointers for finding quality publicly available datasets ([Google dataset search](https://datasetsearch.research.google.com/), [Kaggle](https://www.kaggle.com/datasets), [OpenSwissData](https://opendata.swiss/en/), [SNAP](https://snap.stanford.edu/data/) and [FiveThirtyEight](https://data.fivethirtyeight.com/)).

The selected dataset is the **NYC Taxi and Limousine Commission (TLC) Trip Record Data**, available at [NYC TLC Trips Data](https://home4.nyc.gov/site/tlc/about/tlc-trip-record-data.page).

This dataset contains detailed trip-level records of taxi activity in NYC, including Yellow Taxis, Green Taxis, and For-Hire Vehicles (FHV). Each row represents a trip with temporal, spatial, and economic attributes (such as pickup and dropoff timestamps, distance, passengers count, fares).

The data is distributed as monthly Parquet files, each containing millions of records (e.g., ~40M trips in 2025), making it a large-scale, high-resolution dataset well-suited for analyzing urban mobility patterns, demand dynamics, and transportation economics.

**Data Quality Assessment**: Overall, the dataset is of high quality and reliability (reflecting its official municipal authority origin). Key strengths include:
* Consistent schema across time, with ~20 well-defined variables
* Standardized data types (e.g. categorical location IDs)
* High temporal granularity
* Comprehensive coverage of a major metropolitan transportation system. 
These characteristics make the dataset suitable for visualization tasks involving temporal trends, spatial distributions, and demand fluctuations.

**Preprocessing and Cleaning Requirements**: Despite its quality, preprocessing is required to ensure analytical validity:
* **Missing values**: Certain fields (e.g., passenger count, location IDs) may be incomplete
* **Invalid or unrealistic entries**:
  * Zero or negative trip distances
  * Implausible passenger counts (0 or excessively large values)
  * Fare amounts that are zero, negative, or inconsistent with distance
  * Occasional anomalies such as dropoff times preceding pickup times
* **Outliers**: Extreme values may arise from sensor errors, or data entry issues

To address these issues, the preprocessing pipeline will include:
* Validation of temporal and spatial consistency
* Filtering invalid records
* Handling missing values
* Outlier detection using statistical thresholds or domain-informed rules


### Problematic

> Frame the general topic of your visualization and the main axis that you want to develop.
> - What am I trying to show with my visualization?
> - Think of an overview for the project, your motivation, and the target audience.

This project focuses on analyzing and visualizing **urban mobility patterns in NYC**. 
The primary objective is to uncover how taxi usage evolves and how key factors such as trip distance, fare amount, passenger count, and time of day interact to shape mobility behavior.

At its core, the project is guided by the following question:
**How do taxi usage patterns vary across time, and what underlying factors drive these variations?**
To address this, the visualization will explore three main axes:
* **Temporal dynamics**: how demand fluctuates across hours of day, days of the week, and months of the year
* **Trip characteristics**: relationships between distance, fare, and passenger count
* **Behavioral patterns**: identifying typical vs. anomalous trips and detecting irregular spikes or drops in activity

**Motivation**: Urban transportation systems are a critical component of modern cities. Understanding how people move when, where, and under what conditions can provide valuable insights for improving infrastructure, optimizing traffic flow, and enhancing user experience. By leveraging a large-scale, real-world dataset, this project aims to bridge the gap between raw mobility data and actionable insights, highlighting patterns that are often hidden in high-dimensional data.

**Target Audience**: The visualizations are designed for a broad but relevant audience, including:
* Urban planners and transportation analysts interested in demand patterns and system efficiency
* Policy makers and city stakeholders, who rely on data-driven insights for infrastructure and regulation decisions
* Mobility and logistics professionals (e.g., ride-hailing, traffic management), to understand usage trends and peak demand
* Students and data practitioners, to explore real-world large-scale data through intuitive visual interfaces 

To serve this audience effectively, the project emphasizes clarity, interpretability, and interactive exploration, enabling users to derive insights without requiring deep technical expertise.


### Exploratory Data Analysis (EDA)
> Pre-processing of the data set you chose
> - Show some basic statistics and get insights about the data

To enable scalable analysis, we developed a pipeline to automatically download and preprocess the [NYC TLC Trip Record Data Portal](https://www.nyc.gov/site/tlc/about/tlc-trip-record-data.page). The goal is to extract high-level patterns and validate data consistency.

The analysis focuses on Yellow, Green, and FHV taxis, excluding High-Volume FHV due to computational constraints.

**Data Pipeline and Preprocessing:** The pipeline ([nyc-tlc-pipeline](nyc-tlc-pipeline)) performs the following steps:
1. Automated ingestion of Parquet files
2. Schema validation to ensure time consistency
3. Data cleaning
4. Schema harmonization across taxi types (e.g., unifying pickup timestamps)

A preview of the cleaned data is available for [Yellow Taxi (Jan 2015)](nyc-tlc-pipeline/data/preview/yellow_tripdata_2015-01_clean_preview.csv), and the full processed dataset is publicly hosted on [HuggingFace](https://huggingface.co/datasets/sibasmarakp/nyc-tlc-processed/tree/main/data).

**Aggregation Strategy:** Given the scale of the dataset, we perform aggregation-based EDA to make exploration tractable. The processed data is summarized into CSV files, capturing key dimensions: trips over time, fare and tip statistics, trip distance distributions, payment methods, spatial activity across taxi zones.

These aggregated views are visualized using interactive dashboards built with `D3.js` ([nyc-tlc-viz](nyc-tlc-viz)).

**Key Observations:** The dataset spans approximately 1.37 billion trips over 10 years and covers 123 taxi zones (786M _Yellow taxis_ trips, 520M _FHV_ trips, and 67M _Green taxis_ trips).
Several high-level patterns emerge:
* _Strong temporal seasonality_ (consistent peaks in pre-2020 years)
* _A sharp and sustained decline_ in trip volume corresponding to the COVID-19 pandemic
* _Clear daily and weekly usage cycles_, indicating commuting and leisure behaviors.

> Note: EDA visualizations are available in the [dashboard](nyc-tlc-viz/dashboard.md).

**Data Quality Insights:** Missing values in key fields which may bias some analyses. As a result, careful filtering or imputation strategies are required. Additionally, inconsistencies in FHV data before mid-2017 lead to data loss during preprocessing : we can restrict analysis to post-2017 data for FHV, or focus on the Yellow and Green taxi datasets.


### Related work

> - What others have already done with the data?
> - Why is your approach original?
> - What source of inspiration do you take? Visualizations that you found on other websites or magazines (might be unrelated to your data).
> - In case you are using a dataset that you have already explored in another context (ML or ADA course, semester project...), you are required to share the report of that work to outline the differences with the submission for this class.

The dataset is used in both academic research and industry for analyzing urban mobility, demand forecasting, and transportation efficiency. Prior work falls into 3 main categories:
* **Descriptive analytics:** They provide aggregated statistics (e.g. [Interactive Dashboard of NYC TLC Trip Data (Power BI)](https://app.powerbigov.us/view?r=eyJrIjoiMzlhMzA3NTItM2VkZS00NGM4LTgxYTQtNjRlMDc3MTkxMDkzIiwidCI6IjMyZjU2ZmM3LTVmODEtNGUyMi1hOTViLTE1ZGE2NjUxM2JlZiJ9)).
* **Predictive modeling approaches**: They focus on model performance (e.g. [New York City Taxi Trip Duration Prediction Kaggle Competition](https://www.kaggle.com/competitions/nyc-taxi-trip-duration)).
* **Mobility and urban science research:** Academic works analyze spatial-temporal patterns.
In addition, Data journalism platforms have also explored specific aspects like tipping behavior or airport traffic (e.g. [Uber Is Serving New York’s Outer Boroughs More Than Taxis Are – FiveThirtyEight](https://fivethirtyeight.com/features/uber-is-serving-new-yorks-outer-boroughs-more-than-taxis-are/)).

Despite the richness of prior analyses, most existing approaches exhibit **at least one of the following limitations**:
* Limited interactivity, restricting user-driven exploration
* Narrow scope, focusing on isolated variables
* Lack of multi-scale analysis
* Minimal focus on anomalies

This project aims to bridge the gap between large-scale data and intuitive understanding. The key aspects are:
* Multi-scale temporal analysis: We simultaneously explore patterns across hours, days, and years, enabling a unified view of mobility dynamics.
* Integrated feature relationships: We examine how trip distance, fare, passenger count, and time interact to shape behavior.
* Focus on anomalies and global events: We explicitly highlight disruptions such as the COVID-19 pandemic, treating them as analytical features rather than noise.
* Interactive, user-driven exploration: Our D3.js dashboards enable users to navigate among temporal, spatial, and economic dimensions.

The design is inspired by data storytelling platforms such as The New York Times and FiveThirtyEight, as well as Observable notebooks, which emphasize clarity, interactivity, narrative-driven designs, and progressive exploration.

## Milestone 2 (17th April, 5pm)

**10% of the final grade**


## Milestone 3 (29th May, 5pm)

**80% of the final grade**


## Late policy

- < 24h: 80% of the grade for the milestone
- < 48h: 70% of the grade for the milestone

