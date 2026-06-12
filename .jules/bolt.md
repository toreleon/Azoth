## 2024-05-19 - Fast Lookups in Sorted Timeseries
**Learning:** O(n) operations like `Array.filter` inside hot loops for timeseries lookups (e.g., retrieving prices `asOf` a timestamp during thousands of backtest intervals) can create severe bottlenecks. The time-series data is naturally sorted by time, which allows for `O(log n)` lookups.
**Action:** When searching for the most recent data point up to a certain time in a sorted array, always use binary search instead of `filter()`. It provides a massive performance improvement.
