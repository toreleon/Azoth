
## 2024-06-29 - Time-Series O(log n) optimization
**Learning:** Time-series arrays (like OHLCV bars) returned from the `dnsePublic` API are consistently sorted chronologically. In hot paths (like the backtest runner which simulates trading across many intervals), replacing the standard O(n) `.filter(b => b.time <= asOf)` pattern with a custom O(log n) binary search (`findLastBarIndex`) provides massive efficiency gains. It changes a per-turn complexity from O(n^2) to O(log n) and prevents needless array allocations on every interval step.
**Action:** When dealing with historical bars lookup, always verify if the data is chronologically sorted and favor binary search lookups over array filtering or `.findLast()`.
