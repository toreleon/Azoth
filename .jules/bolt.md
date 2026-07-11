## 2025-02-12 - O(log N) Time-Series Lookups
**Learning:** In backtesting, searching chronologically sorted array data using `.filter(b => b.time <= asOf)` for every tick across every symbol creates an O(N) path inside the inner evaluation loop.
**Action:** When filtering chronological market bars by `time` (like in `clipBars` or `vnindexAt` / `priceOverride`), use binary search (`findLastBarIndex`) combined with `.slice()` (or indexing directly). This reduces O(N) scans to O(log N) and improves simulated strategy loop performance drastically.
