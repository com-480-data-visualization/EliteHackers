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

The dataset selected for this project is the **New York City Taxi and Limousine Commission (TLC) Trip Record Data**, publicly available at: [NYC TLC Trips Data](https://home4.nyc.gov/site/tlc/about/tlc-trip-record-data.page)

This dataset contains detailed trip-level records of taxi activity in New York City, including Yellow Taxis, Green Taxis, and For-Hire Vehicles (FHV). Each row corresponds to a single trip and captures temporal, spatial, and economic attributes, such as pickup and dropoff timestamps, trip distance, passenger count, geographic location identifiers, fare components, and total payment amount.

The data is distributed as monthly Parquet files, each containing millions of records. For example, the 2025 dataset alone comprises over 40 million trips across 11 months, making it a large-scale, high-resolution dataset well-suited for analyzing urban mobility patterns, demand dynamics, and transportation economics.

**Data Quality Assessment**: Overall, the dataset is of high quality and reliability, reflecting its origin from an official municipal authority and its widespread use in academic and industry research. Key strengths include:
* Consistent schema across time, with ~20 well-defined variables
* Standardized data types (timestamps, numeric values, categorical location IDs)
* High temporal granularity, enabling fine-grained analysis
* Comprehensive coverage of a major metropolitan transportation system
These characteristics make the dataset particularly suitable for visualization tasks involving temporal trends, spatial distributions, and demand fluctuations.

**Preprocessing and Cleaning Requirements**: Despite its overall quality, the dataset requires non-trivial preprocessing to ensure analytical validity:
* Missing values: Certain fields (e.g., passenger count or location IDs) may be incomplete
* Invalid or unrealistic entries:
  * Zero or negative trip distances
  * Implausible passenger counts (e.g., 0 or excessively large values)
  * Fare amounts that are zero, negative, or inconsistent with the distance
* Outliers: Extreme values may arise from sensor errors, data entry issues, or rare edge-case trips
* Temporal inconsistencies: Occasional anomalies such as dropoff times preceding pickup times

To address these issues, the preprocessing pipeline will include:
* Filtering invalid or implausible records
* Handling missing values (removal or imputation where appropriate)
* Outlier detection using statistical thresholds or domain-informed rules
* Validation of temporal and spatial consistency


### Problematic

> Frame the general topic of your visualization and the main axis that you want to develop.
> - What am I trying to show with my visualization?
> - Think of an overview for the project, your motivation, and the target audience.

This project focuses on analyzing and visualizing **urban mobility patterns in New York City using large-scale taxi trip data**. 
The primary objective is to uncover how taxi usage evolves and how key factors such as trip distance, fare amount, passenger count, and time of day interact to shape mobility behavior.

At its core, the project is guided by the following question:
**How do taxi usage patterns vary across time, and what underlying factors drive these variations?**
To address this, the visualization will explore three main axes:
* **Temporal dynamics**: how demand fluctuates across hours of the day, days of the week, and months of the year
* **Trip characteristics**: relationships between distance, fare, and passenger count
* **Behavioral patterns**: identifying typical vs. anomalous trips and detecting irregular spikes or drops in activity
Additionally, the project will investigate traffic-driven insights, including peak congestion hours, commuting patterns, and differences in weekday and weekend mobility.

**Motivation**: Urban transportation systems are a critical component of modern cities. Understanding how people move when, where, and under what conditions can provide valuable insights for improving infrastructure, optimizing traffic flow, and enhancing user experience. By leveraging a large-scale, real-world dataset, this project aims to bridge the gap between raw mobility data and actionable insights, highlighting patterns that are often hidden in high-dimensional data.

**Target Audience**: The visualizations are designed for a broad but relevant audience, including:
* Urban planners and transportation analysts are interested in demand patterns and system efficiency
* Policy makers and city stakeholders, who rely on data-driven insights for infrastructure and regulation decisions
* Mobility and logistics professionals (e.g., ride-hailing, traffic management), seeking to understand usage trends and peak demand
* Students and data practitioners, looking to explore real-world, large-scale data through intuitive visual interfaces
To serve this audience effectively, the project emphasizes clarity, interpretability, and interactive exploration, enabling users to derive insights without requiring deep technical expertise.


### Exploratory Data Analysis (EDA)

To enable scalable analysis, we developed a data pipeline to automatically download and preprocess records from the [NYC TLC Trip Record Data Portal](https://www.nyc.gov/site/tlc/about/tlc-trip-record-data.page). The goal of this stage is to extract high-level patterns and validate data consistency before moving to more advanced visualizations.

Our analysis focuses on **three taxi categories**: Yellow Taxis, Green Taxis, and For-Hire Vehicles (FHVs). High-Volume FHVs were excluded due to their significantly larger storage footprint (_≈450 MB_ per file per month), which would substantially increase computational overhead at this stage.

**Data Pipeline and Preprocessing:** The pipeline (nyc-tlc-pipeline) performs the following steps:
1. Automated ingestion of monthly Parquet files
2. Schema validation to ensure consistency across time
3. Data cleaning, including handling of null values and removal of clearly invalid records
4. Schema harmonization across taxi types. For example, aligning different datetime fields (`tpep_pickup_datetime`, `lpep_pickup_datetime`) into a unified `pickup_datetime`
5. Standardization of column names and formats for downstream analysis
A preview of the cleaned data is available for [Yellow Taxi (2015-01)](nyc-tlc-pipeline/data/preview/yellow_tripdata_2015-01_clean_preview.csv), and the full processed dataset is hosted on [HuggingFace](https://huggingface.co/datasets/sibasmarakp/nyc-tlc-processed/tree/main/data).

**Aggregation Strategy:** Given the scale of the dataset, we perform aggregation-based EDA to make exploration tractable. The processed data is summarized into CSV files, capturing key dimensions:
* _Temporal aggregations_: trips by hour of day, day of week, and month
* _Economic indicators_: fare and tip statistics over time
* _Trip characteristics_: distribution of trip distances
* _Behavioral signals_: payment method usage
* _Spatial activity_: pickup and dropoff counts across taxi zones
These aggregated views are visualized using interactive dashboards built with D3.js, enabling efficient exploration of temporal and spatial trends.

**Key Observations:** The dataset spans approximately 1.37 billion trips over 10 years and covers 123 taxi zones. The distribution across taxi types is as follows:
* _Yellow taxis_: 786M trips
* _For-Hire Vehicles (FHV)_: 520M trips
* _Green taxis_: 67M trips

Several high-level patterns emerge:
* _Strong temporal seasonality_, with consistent peaks in pre-2020 years
* _A sharp and sustained decline_ in trip volume during early 2020, corresponding to the COVID-19 pandemic (most pronounced between April and June)
* _Clear daily and weekly usage cycles_, indicating commuting and leisure-driven mobility patterns

**Data Quality Insights:** While overall data quality is high, several limitations must be accounted for:
Missing values in key fields:
* Shared ride indicators: ~22.8% missing.
* Pickup zone IDs: ~9.6% missing.
* Dropoff zone IDs: ~3.4% missing.
* Airport fees: ~2.4% missing.
These gaps are not uniformly distributed and may introduce bias in specific analyses (e.g., spatial or shared mobility trends). As a result, careful filtering or imputation strategies are required depending on the task.

**Limitations and Next Steps:** A notable issue arises with FHV data before June 2016: a substantial number of records are dropped during preprocessing. This aligns with known inconsistencies documented in the TLC data errata. To address this in future stages, we consider two possible directions:
* Restrict analysis to post-2016 data for FHV, or
* Focus primarily on the Yellow and Green taxi datasets, which exhibit higher consistency over time
* For this initial milestone, we retain the full 10-year range to capture global trends, while acknowledging these limitations.


### Related work

> - What others have already done with the data?
> - Why is your approach original?
> - What source of inspiration do you take? Visualizations that you found on other websites or magazines (might be unrelated to your data).
> - In case you are using a dataset that you have already explored in another context (ML or ADA course, semester project...), you are required to share the report of that work to outline the differences with the submission for this class.

The NYC TLC dataset is used in both academic research and industry for analyzing urban mobility, demand forecasting, and transportation efficiency. Prior work typically falls into three main categories:
* **Descriptive analytics and dashboards:** Platforms such as NYC Taxi & Limousine Commission reports and public dashboards provide aggregated statistics on trip volumes, revenue, and geographic distribution. These are often static or limited in interactivity.
* **Predictive modeling and machine learning**: Some studies use this dataset for tasks such as demand prediction, travel time estimation, and surge-pricing modeling. These works focus on model performance rather than interpretability or visualization.
* **Mobility and urban science research:** Academic works analyze spatial-temporal patterns, congestion, and human mobility behavior, often using clustering or network-based methods. However, these analyses are typically presented through static figures and lack interactive exploration.
  
In addition, several data journalism platforms (e.g., FiveThirtyEight) have explored subsets of the dataset, often focusing on specific questions such as tipping behavior or airport traffic.

**Limitations of Existing Work:** Despite the richness of prior analyses, most existing approaches exhibit at least one of the following limitations:
* Limited interactivity, restricting user-driven exploration
* Narrow scope, focusing on isolated variables rather than integrated patterns
* Lack of multi-scale analysis, failing to connect hourly, daily, and yearly trends
* Minimal focus on anomalies or disruptions, such as the impact of COVID-19

**Our Approach and Originality**: This project takes a visual analytics perspective, aiming to bridge the gap between large-scale data and intuitive understanding. The key distinguishing aspects are:
* Multi-scale temporal analysis: We simultaneously explore patterns across hours, days, months, and years, enabling a unified view of mobility dynamics.
* Integrated feature relationships: Rather than analyzing variables in isolation, we examine how trip distance, fare, passenger count, and time interact to shape behavior.
* Focus on anomalies and global events: We explicitly highlight disruptions such as the COVID-19 pandemic, treating them as first-class analytical features rather than noise.
* Interactive, user-driven exploration: Our D3.js dashboards enable users to navigate among temporal, spatial, and economic dimensions seamlessly.

**Sources of Inspiration:** The design of our visualizations draws inspiration from high-quality data storytelling and interactive visualization platforms, including:
* The New York Times interactive graphics are known for their clarity and narrative-driven design
* Observable notebooks, which emphasize interactivity and exploratory workflows
* FiveThirtyEight, particularly for combining statistical rigor with accessible storytelling
These sources influenced our focus on clean design, progressive disclosure of information, and intuitive user interaction.

**Prior Work with This Dataset:** We have not used this dataset in prior coursework or projects. Therefore, this work is developed specifically for this visualization project, with a focus on exploratory analysis and interactive design rather than predictive modeling.

## Milestone 2 (17th April, 5pm)

**10% of the final grade**


## Milestone 3 (29th May, 5pm)

**80% of the final grade**


## Late policy

- < 24h: 80% of the grade for the milestone
- < 48h: 70% of the grade for the milestone

