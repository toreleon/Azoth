## 2025-02-18 - [Optimize OHLCV bar lookups with binary search]
**Learning:** Backtest loops that repeatedly check time-series market data arrays (like OHLCV bars) for the current simulated time (`asOf`) can cause significant O(n) performance bottlenecks when using `Array.prototype.filter`, since these arrays are chronologically sorted.
**Action:** Always prefer O(log n) binary search lookups over O(n) array filtering for performance-critical path operations on chronologically sorted time-series arrays. Added a reusable `findLastBarIndex` utility to achieve this.
