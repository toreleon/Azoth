## 2024-06-11 - Binary search for time-series lookups
**Learning:** O(n) `.filter()` over time-series data for latest-price lookups inside interval loops causes significant performance bottleneck.
**Action:** Always prefer O(log n) binary search when finding the latest element at or before a target timestamp in a sorted time-series array.
