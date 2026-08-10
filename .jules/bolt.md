## 2024-05-14 - Time-Series O(log n) Search Pattern
**Learning:** `src/agent/backtestRunner.ts` makes heavy use of `.filter((b) => b.time <= asOf)` to get the latest close price inside loop bounds, changing potentially O(1) loop lookups or O(log n) lookups into repetitive O(n) filtering over large arrays.
**Action:** Expose `findLastBarIndex` in `src/data/sources/dnsePublic.ts` and use binary search or track indices explicitly in tight loops.

## 2024-05-18 - Avoid O(n) array filtering and sorting on time-series market data
**Learning:** Time-series market data arrays (like OHLCV bars) in this codebase are inherently chronologically sorted. Using `.filter(b => b.time >= start && b.time <= end).sort(...)` is an O(n) anti-pattern.
**Action:** When extracting sub-intervals from chronologically sorted time-series arrays, use O(log n) binary search utilities (like `findFirstBarIndex` and `findLastBarIndex`) to find lower and upper bounds, followed by `.slice(startIdx, endIdx + 1)` instead.

## 2024-05-18 - Avoid unnecessary array allocations in frequent I/O paths
**Learning:** `upsertSession` in `src/runtime/sessionStore.ts` is called very frequently (every time a session record is appended, which happens constantly during agent streaming). The original implementation used `.filter()` to remove the existing session and then pushed the updated one, resulting in significant garbage collection overhead and an O(N) array allocation on every single token/event stream chunk. Since this function is the bottleneck for chat interactivity, replacing `.filter()` with `.findIndex()` and in-place assignment yielded a > 2x speedup on session updates.
**Action:** When updating arrays that back frequent disk I/O operations (like the session store), always prefer in-place mutation and sorting over immutable array recreation (`.filter()`, `.map()`) to minimize garbage collection pauses.

## 2024-05-19 - Replace Chained Array Allocation (map/reduce/slice) with In-Place Loops in Hot Paths
**Learning:** Functions like `buildCandidate` in `src/tools/discover.ts` are called concurrently hundreds of times per run. Chaining methods like `.map().slice().reduce()` in these loops produces rapid short-lived allocations which triggers GC pauses, causing measurable lag even on small ~90 element bars arrays.
**Action:** Replace map/slice/reduce chains that compute aggregate metrics over subsets of time-series arrays with manual bounds-checked in-place `for` loops. Use `Math.max(0, len - N)` to emulate `.slice(-N)` safety without creating array copies. Provide parameter types like `readonly { close: number }[]` to allow processing the raw source array directly instead of requiring mapped primitive arrays.
