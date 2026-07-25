## 2024-05-14 - Time-Series O(log n) Search Pattern
**Learning:** `src/agent/backtestRunner.ts` makes heavy use of `.filter((b) => b.time <= asOf)` to get the latest close price inside loop bounds, changing potentially O(1) loop lookups or O(log n) lookups into repetitive O(n) filtering over large arrays.
**Action:** Expose `findLastBarIndex` in `src/data/sources/dnsePublic.ts` and use binary search or track indices explicitly in tight loops.

## 2024-05-14 - Time-Series Date Boundaries
**Learning:** Extracting dates with `.filter((b) => b.time >= start && b.time <= end)` from chronologically sorted OHLCV bars is a common but expensive O(n) anti-pattern.
**Action:** When determining intervals inside backtests, use binary search (`findLastBarIndex` and lower-bound equivalent) followed by `.slice()` to extract elements in O(log n + k) time. Avoid `.sort()` since bars are inherently chronologically sorted.
