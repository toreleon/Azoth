
## 2024-03-24 - Backtest runner performance bottleneck
**Learning:** O(n) filtering over historical time-series arrays within a hot loop (like checking stock and index closing price at every turn across candidates inside the backtest runner) can add massive CPU overhead, specifically in array allocation and traversal. In chronologically sorted arrays like financial series data, this operation is unnecessary.
**Action:** Use a binary search approach (e.g., `findLastBarIndex` utility) to achieve O(log n) performance for as-of-date array lookups throughout backtester and data sources instead of full filter arrays.
