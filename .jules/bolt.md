## 2025-03-09 - [Optimize O(N) filtering in backtestRunner to O(log N) binary search]
**Learning:** Found O(N) array filtering in backtestRunner's `vnindexAt` and `priceOverride` on chronological arrays. Memory confirms bars are chronologically sorted and advises using O(log n) binary search lookups over O(n) array filtering.
**Action:** Replace `bars.filter(...).length ? ... : null` with binary search via `findLastBarIndex`.
