## 2024-07-01 - O(log N) Time-Series Lookups using Binary Search
**Learning:** Market data arrays (like OHLCV bars) returned from DNSE and backtest environments are chronologically sorted. Using `Array.prototype.filter` to find bars before a certain timestamp inside the hot loop (e.g., simulated price lookups during backtesting) forces O(N) traversal and unnecessary array allocations.
**Action:** Always prefer `O(log n)` binary search (`findLastBarIndex`) over `O(N)` filtering for time-based lookups on sorted market data arrays to avoid CPU bottlenecks in performance-critical paths.
