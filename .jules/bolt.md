## 2024-05-14 - Time-Series O(log n) Search Pattern
**Learning:** `src/agent/backtestRunner.ts` makes heavy use of `.filter((b) => b.time <= asOf)` to get the latest close price inside loop bounds, changing potentially O(1) loop lookups or O(log n) lookups into repetitive O(n) filtering over large arrays.
**Action:** Expose `findLastBarIndex` in `src/data/sources/dnsePublic.ts` and use binary search or track indices explicitly in tight loops.

## 2024-05-18 - Avoid O(n) array filtering and sorting on time-series market data
**Learning:** Time-series market data arrays (like OHLCV bars) in this codebase are inherently chronologically sorted. Using `.filter(b => b.time >= start && b.time <= end).sort(...)` is an O(n) anti-pattern.
**Action:** When extracting sub-intervals from chronologically sorted time-series arrays, use O(log n) binary search utilities (like `findFirstBarIndex` and `findLastBarIndex`) to find lower and upper bounds, followed by `.slice(startIdx, endIdx + 1)` instead.

## 2024-05-18 - Avoid unnecessary array allocations in frequent I/O paths
**Learning:** `upsertSession` in `src/runtime/sessionStore.ts` is called very frequently (every time a session record is appended, which happens constantly during agent streaming). The original implementation used `.filter()` to remove the existing session and then pushed the updated one, resulting in significant garbage collection overhead and an O(N) array allocation on every single token/event stream chunk. Since this function is the bottleneck for chat interactivity, replacing `.filter()` with `.findIndex()` and in-place assignment yielded a > 2x speedup on session updates.
**Action:** When updating arrays that back frequent disk I/O operations (like the session store), always prefer in-place mutation and sorting over immutable array recreation (`.filter()`, `.map()`) to minimize garbage collection pauses.
## 2024-05-19 - Avoid array map and reduce allocations in discovery loops
**Learning:** In high-volume scanning tools like `src/tools/discover.ts`, using `.map()` to pluck properties (e.g. `bars.map(b => b.close)`) followed by `.slice().reduce()` chains creates significant intermediate garbage collection overhead. Since this runs over hundreds of tickers per execution, it impacts memory and performance heavily.
**Action:** Replace `map` and `slice` operations with standard `for` loops bounded dynamically (e.g., `Math.max(0, len - N)`) and iterate directly over the original objects to achieve O(1) space complexity.

## 2024-05-19 - Undici audit fix
**Learning:** `pnpm audit` occasionally flags nested dependencies. Resolving `undici` issues by blindly overriding to the latest version (e.g., `8.0.0`) can break testing on Node 20 because Vitest and JSDOM rely on older Node internals.
**Action:** When fixing `undici` vulnerabilities in `package.json`, use an `overrides` range that forces the patched secure version of 7.x (e.g., `>=7.29.0 <8.0.0`) instead of allowing 8.x, to maintain compatibility with Node 20 test runners.
