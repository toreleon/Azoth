## 2025-02-09 - O(log N) Time Series Lookups in Backtesting
**Learning:** Backtest engines running repeated interval simulations often re-query historical price arrays. Using `.filter()` to truncate arrays up to an `asOf` date is an O(N) operation per query that allocates intermediate arrays, severely bottlenecking multi-interval backtests.
**Action:** Always prefer O(log N) binary search lookups over O(N) array filtering when interacting with chronologically sorted time-series data, specifically returning index positions to avoid array copying overhead.
