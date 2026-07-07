## 2024-07-07 - [O(n) Array filter optimization for chronologically sorted data]
**Learning:** O(n) array `.filter` over a time series dataset (which is common across this application like OHLCV data bars) can be a severe bottleneck during simulation operations like backtesting where the operation is queried thousands of times per interval turn.
**Action:** Always favor a custom O(log n) binary search (e.g. `findLastBarIndex`) rather than array mutations like `.filter()` when performing conditional checks (e.g. `b.time <= asOf`) over large arrays that are known to be chronologically sorted.
