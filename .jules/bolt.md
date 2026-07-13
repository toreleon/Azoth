
## 2025-02-14 - Replace O(N) array filtering with O(log N) binary search for time-series lookups
**Learning:** Backtesting and historical time series retrieval rely heavily on clipping market data to an `asOf` timestamp. A common pattern in the codebase was filtering the entire `Bar[]` array (which is chronologically sorted) via `bars.filter(b => b.time <= asOf)`. This results in O(N) traversal for every `asOf` turn in the backtest and every price override check, scaling poorly with fine-grained resolutions and long test periods.
**Action:** Replace O(N) `Array.filter` with a binary search lookup to locate the bounds (`findLastBarIndex`). Used `.slice(0, index + 1)` when an array subset is needed. Reusing existing sorted properties makes data filtering and lookups practically instant.
