## 2026-07-16 - O(log n) lookups with binary search
**Learning:** Found O(n) array filtering inside the backtest loop (`vnindex.filter` and `bars[sym].filter`) and within the dnse `clipBars` utility for finding chronological subsets of market data.
**Action:** Replaced O(n) array filtering with a reusable O(log n) binary search utility (`findLastBarIndex`) to quickly identify the index of the latest valid bar. This improved nested backtest loop performance from O(m*n) to O(m*log n) for price lookups.
