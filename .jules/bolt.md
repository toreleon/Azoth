## 2025-02-23 - Avoid O(n) array filtering on chronologically sorted time-series data
**Learning:** During backtesting, the `vnindexAt` and `priceOverride` functions were calling `.filter((b) => b.time <= asOf)` for every symbol at every backtest turn. This creates an O(n) lookup over potentially large bar arrays, which degrades performance significantly as intervals and candidate universes scale. Chronologically sorted time-series arrays should not be filtered.
**Action:** Use a binary search utility like `findLastBarIndex` for an O(log n) lookup to retrieve the latest relevant data point.
