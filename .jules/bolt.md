
## 2024-07-08 - Binary Search beats Array.filter in Time-Series Hot Paths
**Learning:** O(n) `.filter()` operations to extract the last matching element in chronologically sorted time-series data (like OHLCV bars) are a significant architectural bottleneck inside nested backtesting loops (e.g., `priceOverride` inside `runBacktestSession`). They needlessly allocate memory and traverse the entire array.
**Action:** Always prefer O(log n) binary search lookups (`findLastBarIndex`) for time-based bounds checking in performance-critical backtest and data-fetching loops.
