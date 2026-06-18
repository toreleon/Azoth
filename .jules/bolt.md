## 2024-10-24 - [O(n^2) Bottleneck in Backtester Lookup]
**Learning:** In backtesting loops, slicing/filtering time-series arrays using `.filter(b => b.time <= asOf)` on every single tick introduces an $O(N^2)$ execution time bottleneck, especially as the number of data points and ticks grows. Re-allocating arrays per tick is heavily detrimental.
**Action:** Always prefer $O(\log N)$ binary search lookups like `findLastBarIndex` when searching within chronologically sorted market data arrays, avoiding unnecessary object allocation.
