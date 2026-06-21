## 2026-06-21 - Optimize time-series data filtering with binary search
**Learning:** Market data time series (like OHLCV bars) are chronologically sorted arrays. Using `O(n)` array filtering methods (like `.filter((b) => b.time <= asOf)`) inside iterative loops such as backtest intervals creates a significant performance bottleneck.
**Action:** Replace `O(n)` linear filtering with `O(log n)` binary searches when looking up or truncating time-series data up to a certain point in time. Use binary search to find the index and then `.slice(0, index + 1)` or directly access the last valid element.
