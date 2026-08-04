## 2023-08-04 - Hot Path Object Allocation
**Learning:** In market scanner routines iterating over universes of 400+ tickers (like `buildCandidate`), avoiding intermediate `.map()` allocations of properties (like `closes` and `vols`) and chaining `slice().reduce()` drops processing time significantly. Native V8 `for` loops against the original array structures avoid continuous object creation and GC pauses.
**Action:** When working in ticker-looping logic for aggregations, directly index against the root array to sum metrics and avoid recreating sub-arrays.
