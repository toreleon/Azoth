## 2024-05-24 - O(log n) lookup for chronologically sorted market data arrays
**Learning:** In backtesting or any loop iterating over time, finding the last available data point (e.g., price `asOf` a timestamp) using `.filter().slice(-1)` is O(n). When executed inside a loop over a large array of sorted time-series market data (like OHLCV bars), this causes an O(n²) performance bottleneck.
**Action:** Always use binary search (e.g., `findLastBarIndex`) for lookups on chronologically sorted arrays. This reduces lookup time to O(log n) and eliminates the O(n²) bottleneck in loop scenarios.
