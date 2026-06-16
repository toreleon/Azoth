## 2024-06-25 - Time-Series Market Data Filtering Bottleneck
**Learning:** Chronologically sorted market data arrays (`Bar[]`) were being repeatedly traversed with O(n) `.filter()` calls inside the backtest runner. For intervals over long periods, this creates a massive performance bottleneck.
**Action:** Replace O(n) array `.filter()` on sorted time-series arrays with O(log n) binary search (`findLastBarIndex`) and `.slice()` or direct array indexing where only the latest elements are needed. This provides a dramatic performance improvement especially during backtesting.
