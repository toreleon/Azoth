## 2024-05-14 - Time-Series O(log n) Search Pattern
**Learning:** `src/agent/backtestRunner.ts` makes heavy use of `.filter((b) => b.time <= asOf)` to get the latest close price inside loop bounds, changing potentially O(1) loop lookups or O(log n) lookups into repetitive O(n) filtering over large arrays.
**Action:** Expose `findLastBarIndex` in `src/data/sources/dnsePublic.ts` and use binary search or track indices explicitly in tight loops.
## 2024-05-14 - Time-Series O(log n) Search Pattern
**Learning:** `src/data/sources/dnsePublic.ts` previously used a `.filter((b) => b.time <= asOf)` to clip historical arrays. This turned what should be a fast slice operation into an O(n) scan over entire time-series data.
**Action:** Used the already-available `findLastBarIndex` (which implements binary search) and `.slice()` to truncate the arrays in `O(log n)` time instead, massively speeding up lookups for arrays representing long timelines.
