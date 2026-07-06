## 2024-07-06 - O(n) filtering on chronological arrays is an anti-pattern
**Learning:** Found multiple instances where `array.filter(b => b.time <= asOf)` was used to find the latest value in chronologically sorted time-series data (like OHLCV bars) within performance-critical loops (e.g. Backtest runner). This is O(n) and creates a new array every time.
**Action:** Always use binary search (`findLastBarIndex`) for time-based lookups on sorted market data to reduce it to O(log n) time and avoid array allocations.
