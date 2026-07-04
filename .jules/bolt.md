## 2025-02-14 - Time-Series O(N) Array Filtering in Backtests
**Learning:** Backtesting engines iterate over many intervals and frequently need to find the "latest price as of time X". Using `bars.filter(b => b.time <= asOf).pop()` for time-sorted arrays creates an O(N) bottleneck that runs `O(Positions * Intervals)` times, significantly slowing down backtests.
**Action:** Always use O(log n) binary search (like `findLastBarIndex`) for lookups in chronologically sorted market data arrays instead of O(n) filtering.
