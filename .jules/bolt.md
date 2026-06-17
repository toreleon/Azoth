## 2025-06-17 - [Optimize Chronological Array Lookups]
**Learning:** In backtesting hot loops (`agent/backtestRunner.ts`) and data source processing (`data/sources/dnsePublic.ts`), time-series data (like OHLCV arrays) is chronologically sorted. Using `Array.prototype.filter` to slice arrays up to a target time results in an unnecessary O(N) full-array scan.
**Action:** Always prefer O(log N) binary search utilities like `findLastBarIndex` when looking up historical time-series data to dramatically improve performance in repeated lookups.
