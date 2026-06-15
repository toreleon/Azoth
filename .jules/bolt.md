## 2026-06-15 - Optimize Array Lookups with Binary Search
**Learning:** Backtests in this codebase loop over thousands of intervals across dozens of tickers. Using O(n) `Array.prototype.filter()` for chronologically sorted time-series lookups (like finding the latest price before `asOf`) is a major performance bottleneck due to CPU cycles and garbage collection from new array allocations.
**Action:** Replace `array.filter(b => b.time <= asOf)` with an O(log n) binary search utility `findLastBarIndex` when searching sorted chronological series like OHLCV data.
