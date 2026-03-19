/**
 * Data loader — fetches all CSVs from the exports directory.
 * @module loader
 */
import * as d3 from 'd3';

const DATA_BASE = '../nyc-tlc-pipeline/data/exports';

/**
 * Load all exported CSV files in parallel and return a named data object.
 * @returns {Promise<Object>} Named object with all parsed datasets.
 */
export async function loadAll() {
  const files = {
    tripsByHour: 'trips_by_hour.csv',
    tripsByDow: 'trips_by_dow.csv',
    tripsByMonth: 'trips_by_month.csv',
    fareByHour: 'fare_by_hour.csv',
    distanceDistrib: 'distance_distribution.csv',
    paymentShare: 'payment_share.csv',
    zoneTripCounts: 'zone_trip_counts.csv',
    boroughOD: 'trips_by_borough_od.csv',
    speedByHour: 'speed_by_hour.csv',
  };

  const entries = Object.entries(files);
  const results = await Promise.all(
    entries.map(async ([key, filename]) => {
      try {
        const csv = await d3.csv(`${DATA_BASE}/${filename}`);
        return [key, csv];
      } catch (e) {
        console.warn(`Failed to load ${filename}:`, e);
        return [key, []];
      }
    })
  );

  const data = Object.fromEntries(results);

  const coerceNum = (d, fields) => {
    for (const f of fields) {
      if (d[f] !== undefined && d[f] !== '') d[f] = +d[f];
    }
  };

  if (data.tripsByHour) {
    data.tripsByHour.forEach(d =>
      coerceNum(d, ['hour', 'trip_count', 'avg_fare', 'avg_duration_min']));
  }
  if (data.tripsByDow) {
    data.tripsByDow.forEach(d =>
      coerceNum(d, ['day_of_week', 'trip_count']));
  }
  if (data.tripsByMonth) {
    data.tripsByMonth.forEach(d =>
      coerceNum(d, ['trip_count']));
  }
  if (data.fareByHour) {
    data.fareByHour.forEach(d =>
      coerceNum(d, ['hour', 'avg_fare', 'median_fare', 'avg_tip_pct']));
  }
  if (data.distanceDistrib) {
    data.distanceDistrib.forEach(d =>
      coerceNum(d, ['trip_count']));
  }
  if (data.paymentShare) {
    data.paymentShare.forEach(d =>
      coerceNum(d, ['payment_type', 'trip_count', 'share_pct']));
  }
  if (data.zoneTripCounts) {
    data.zoneTripCounts.forEach(d =>
      coerceNum(d, ['LocationID', 'pickup_count', 'dropoff_count']));
  }
  if (data.boroughOD) {
    data.boroughOD.forEach(d =>
      coerceNum(d, ['trip_count']));
  }
  if (data.speedByHour) {
    data.speedByHour.forEach(d =>
      coerceNum(d, ['hour', 'avg_speed_mph', 'median_speed_mph']));
  }

  return data;
}
