## 2024-07-15 - [Bolt: Binary Search Optimization]
**Learning:** O(N) array filtering on chronologically sorted time-series arrays inside a hot loop (like backtesting) is a significant bottleneck.
**Action:** Replace `array.filter(b => b.time <= asOf)` with O(log N) binary search for large time-series data structures.
