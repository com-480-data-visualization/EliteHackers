# Project of Data Visualization (COM-480)

| Student's name | SCIPER |
| -------------- | ------ |
| Debajyoti Dasgupta | |
| Paola Biocchi | 340437 |
| | |

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

> Pre-processing of the data set you chose
> - Show some basic statistics and get insights about the data

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

