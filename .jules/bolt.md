## 2024-06-30 - O(log n) Time-Series Lookup
**Learning:** Backtesting pipelines often perform O(n) array filtering on chronologically sorted time-series data (like OHLCV bars) to find data "as of" a specific time. This becomes a bottleneck.
**Action:** Use binary search to find the correct index in O(log n) time, and use `.slice()` instead of `.filter()` to truncate arrays. A reusable `findLastBarIndex` utility was added to `src/data/sources/dnsePublic.ts`.
