# Project of Data Visualization (COM-480)

| Student's name | SCIPER |
| -------------- | ------ |
| Debajyoti Dasgupta | |
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

The dataset used in this project is the **NYC Taxi and Limousine Commission (TLC) Trip Record Data**, publicly available at:  
https://home4.nyc.gov/site/tlc/about/tlc-trip-record-data.page  

It contains detailed records of taxi trips in New York City, including Yellow Taxi, Green Taxi, and For-Hire Vehicles. Each record corresponds to a single trip and includes temporal, spatial, and financial information such as pickup and dropoff timestamps, trip distance, pickup and dropoff locations, passenger count, fare components, and total amount paid.

The data is provided in monthly Parquet files, each containing several million observations. For instance, the 2025 dataset alone includes more than 40 million trips across 11 months, making it a large-scale, high-resolution dataset suitable for analyzing mobility patterns and economic activity.

In terms of quality, the dataset is generally well-structured and consistent across months, with a stable schema of 20 variables. The use of standardized formats (timestamps, numerical variables, categorical IDs) facilitates processing and analysis. 

CHECK : However, some preprocessing is required before visualization. In particular, the dataset contains missing values and occasional inconsistencies, such as zero or unrealistic values for trip distance, passenger count, or fare amounts. Additionally, extreme outliers may appear due to data entry errors or atypical trips.

Overall, the dataset is of high quality and widely used in data analysis and visualization contexts. It provides a reliable and rich basis for studying urban transportation dynamics, although careful filtering and cleaning are necessary to ensure meaningful results.

### Problematic

> Frame the general topic of your visualization and the main axis that you want to develop.
> - What am I trying to show with my visualization?
> - Think of an overview for the project, your motivation, and the target audience.

This project aims to explore urban mobility patterns in New York City using taxi trip data. The main objective is to understand how trips evolve over time and how key variables such as distance, fare amount, and passenger count interact.

The core question guiding this visualization is: how do taxi usage patterns vary across different periods and what factors influence these variations? More specifically, we aim to highlight temporal trends (across years and months), detect anomalies or punctual divengences (or specific irregularities), and identify typical trip behaviors.
more traffic-driven questions : people motion, hours of day trends

The motivation comes from the importance of urban transportation in large cities, where understanding mobility flows can inform infrastructure planning and policy decisions.

The target audience includes students, data enthusiasts, and individuals interested in urban dynamics, without requiring advanced technical knowledge. Therefore, the visualizations will prioritize clarity, interactivity, and intuitive interpretation over technical complexity. (bullshit --> chnage to more specific, maybe add people that work for mobility questions).

### Exploratory Data Analysis

We write an automated pipeline to download, validate, clean, preprocess, and export the data from the [NYC TLC Trip Record Data Portal](https://www.nyc.gov/site/tlc/about/tlc-trip-record-data.page). We focus on a ten-year time period from Jan 2015 to Nov 2025 (with the main goals of capturing temporal data patterns across years as well observe interesting patterns during COVID-19 pandemic). Further, we use three taxi types: Yellow Taxi, Green Taxi, and For-Hire Vehicles (FHV). We ignore the For-Hire Vehicles Heavy Vehicles (FHVHV) due to its large size (~460 MB/month, 20M+ rows/month). Our pipeline is in the [nyc-tlc-pipeline](nyc-tlc-pipeline) directory. Overall, we automatically download the monthly Parquet files (which requires repeated runs with varying time intervals to avoid rate limits) and validate the raw schema. Next, we perform some basic cleaning of null values and preprocessing of the datetime and column names across different taxi types. This processed data is aggregated into CSV files for initial EDA explorations.

The dataset contains about 1.37 billion trips and covering 123 taxi zones across a ten-year time period. Yellow taxis account for the largest share (786 M trips), followed by FHV (520 M) and green taxis (67 M). Monthly trip counts show strong pre‑COVID volumes through 2019, a dramatic collapse in 2020 (especially April–June), and a gradual recovery from 2021 onwards. Overall data quality is high but not perfect: some key fields have non‑trivial missing values, for example, shared ride information is null in about 22.81% of records, pickup and dropoff zone IDs are missing in 9.6% and 3.4% of trips respectively, along with 2.4% entries missing airport fee fields. These statistics highlight both the scale of NYC taxi usage over time and where analysts need to be cautious about gaps or changing coverage in specific columns.

> Note: We observe a significant jump in the number of trips from June 2016 onwards due to the Errata about trip records (as mentioned on the official webpage), also reflected in the size of FHV-related parquet files.


### Related work


> - What others have already done with the data?
> - Why is your approach original?
> - What source of inspiration do you take? Visualizations that you found on other websites or magazines (might be unrelated to your data).
> - In case you are using a dataset that you have already explored in another context (ML or ADA course, semester project...), you are required to share the report of that work to outline the differences with the submission for this class.

## Milestone 2 (17th April, 5pm)

**10% of the final grade**


## Milestone 3 (29th May, 5pm)

**80% of the final grade**


## Late policy

- < 24h: 80% of the grade for the milestone
- < 48h: 70% of the grade for the milestone

