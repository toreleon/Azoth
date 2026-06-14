## 2024-06-14 - Time-Series Lookup Bottleneck
**Learning:** Found a performance bottleneck specific to this codebase's architecture where backtesting runs `vnindex` and `bars` array lookups per interval using `O(n)` array filtering inside a loop. Since time-series market data is chronologically sorted, `O(n)` filter scans are incredibly inefficient.
**Action:** Implemented a binary search utility (`findLastBarIndex`) in `dnsePublic.ts` and replaced the `filter` calls in the critical loop to enable `O(log n)` lookups, drastically reducing time-complexity for data retrieval during backtests.
