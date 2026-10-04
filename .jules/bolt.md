## 2024-05-14 - Time-Series O(log n) Search Pattern
**Learning:** `src/agent/backtestRunner.ts` makes heavy use of `.filter((b) => b.time <= asOf)` to get the latest close price inside loop bounds, changing potentially O(1) loop lookups or O(log n) lookups into repetitive O(n) filtering over large arrays.
**Action:** Expose `findLastBarIndex` in `src/data/sources/dnsePublic.ts` and use binary search or track indices explicitly in tight loops.

## 2024-05-18 - Avoid O(n) array filtering and sorting on time-series market data
**Learning:** Time-series market data arrays (like OHLCV bars) in this codebase are inherently chronologically sorted. Using `.filter(b => b.time >= start && b.time <= end).sort(...)` is an O(n) anti-pattern.
**Action:** When extracting sub-intervals from chronologically sorted time-series arrays, use O(log n) binary search utilities (like `findFirstBarIndex` and `findLastBarIndex`) to find lower and upper bounds, followed by `.slice(startIdx, endIdx + 1)` instead.

## 2024-05-18 - Avoid unnecessary array allocations in frequent I/O paths
**Learning:** `upsertSession` in `src/runtime/sessionStore.ts` is called very frequently (every time a session record is appended, which happens constantly during agent streaming). The original implementation used `.filter()` to remove the existing session and then pushed the updated one, resulting in significant garbage collection overhead and an O(N) array allocation on every single token/event stream chunk. Since this function is the bottleneck for chat interactivity, replacing `.filter()` with `.findIndex()` and in-place assignment yielded a > 2x speedup on session updates.
**Action:** When updating arrays that back frequent disk I/O operations (like the session store), always prefer in-place mutation and sorting over immutable array recreation (`.filter()`, `.map()`) to minimize garbage collection pauses.
## 2026-09-14 - Avoid chained array operations when parsing NDJSON
**Learning:** When parsing large newline-delimited JSON files (like in `readSessionRecords`), using `.split('\n').filter(Boolean).map(JSON.parse)` creates massive intermediate arrays of strings, resulting in significant memory allocation and garbage collection overhead. This causes noticeable latency spikes when loading long session histories with thousands of records.
**Action:** Replace chained string/array methods with a `while` loop using `indexOf('\n')` and `substring()` to process NDJSON line-by-line without allocating intermediate arrays.

## 2026-09-15 - Replace Chained Array Methods with In-Place Loops for Ticker Scoring
**Learning:** `discoverTickers` in `src/tools/discover.ts` used chained `.filter().map().sort()` operations and object spreads (`{...c, metric: ...}`) to compute ticker metrics and rankings. This caused unnecessary $O(N)$ object allocations and garbage collection overhead across hundreds of ticker candidates on every discovery cycle.
**Action:** Replace chained `.filter().map()` calls with a single indexed `for` loop that mutates the freshly created `Candidate` objects in-place (`c.metric = ...`) and manually builds the resulting array before sorting, significantly reducing GC pressure. Also applied this pattern to `.slice().map()` and `.slice().reduce()` in `buildCandidate` and `top` result building.
## 2026-09-17 - Avoid chained slice and map in backtest interval generation
**Learning:** In `src/agent/backtestRunner.ts`, the `intervalCloses` function used `.slice().map()` to construct an array of timestamps. This creates two intermediate arrays, causing unnecessary garbage collection overhead, particularly when running backtests over long periods or with high frequency.
**Action:** Use a single indexed `for` loop to populate the resulting array directly from the original `vnindexBars` array without allocating intermediate structures.

## 2026-09-19 - Avoid chained array methods before Set initialization
**Learning:** Chaining `.map().filter()` inside a `new Set()` constructor creates multiple intermediate arrays, causing unnecessary memory allocation and garbage collection overhead in hot paths (like ticker normalization during discovery).
**Action:** Replace chained array methods with a direct indexed `for` loop that transforms, validates, and `.add()`s directly to a freshly initialized `Set`.
## 2024-05-18 - [SQLite Statement Caching]
**Learning:** better-sqlite3 `db.prepare()` is expensive enough that calling it in a hot loop (like `cached()`) causes significant performance overhead (~4x slower). Statement caching per-database instance is required for hot path queries.
**Action:** When using better-sqlite3 in frequently called functions (e.g. `cached()` wrapper or event loop hooks), lazily initialize and reuse prepared statements bound to the current database instance instead of preparing the statement on every call.

## 2026-09-28 - Avoid chained map and slice in hot paths
**Learning:** In `src/tools/technical.ts`, the `indicatorsTool` used chained array methods like `.map()` and `.slice().map()` to extract closes and construct the resulting bars array. This created intermediate array allocations causing significant garbage collection overhead during hot-path technical indicator computation.
**Action:** Replaced the chained array methods with a single, highly optimized indexed `for` loop to reduce memory allocations and avoid GC pressure.

## 2026-10-04 - Optimize hot loop array to Set extraction
**Learning:** When generating a bounded, deduplicated subset (Set) from an array in hot paths, avoid array method chains like `Array.from(new Set([...arr1, ...arr2.map(f)])).slice(0, N)`. This causes several intermediate array allocations that create significant GC pressure during long loops (e.g., historical backtests).
**Action:** Use an empty `Set` along with bounded `for` loops and a results array that implement an early exit (`tickers.length < maxCandidates`) to directly stream unique items. This processes fewer elements and generates zero intermediate arrays.

