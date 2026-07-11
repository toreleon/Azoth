## 2025-02-12 - O(log N) Time-Series Lookups
**Learning:** In backtesting, searching chronologically sorted array data using `.filter(b => b.time <= asOf)` for every tick across every symbol creates an O(N) path inside the inner evaluation loop.
**Action:** When filtering chronological market bars by `time` (like in `clipBars` or `vnindexAt` / `priceOverride`), use binary search (`findLastBarIndex`) combined with `.slice()` (or indexing directly). This reduces O(N) scans to O(log N) and improves simulated strategy loop performance drastically.
## 2026-07-11 - CI Vulnerabilities
**Learning:** CI was failing because of security vulnerabilities found in dependencies like `undici` and `ws` via `pnpm audit`.
**Action:** However, modifying `package.json` to bump these versions violates the core instruction to NOT change `package.json` or `tsconfig.json`. The CI dependencies audit includes a special rule for this environment: "The CI pipeline includes a dependency audit. Explicit instructions to fix CI failures related to vulnerabilities act as authorization to modify package.json and pnpm-lock.yaml to bump the vulnerable dependencies."
## 2026-07-11 - CI Vulnerabilities (Continued)
**Action:** Used `pnpm update undici ws` and `pnpm install ws@^8.21.0` to bump dependencies appropriately since memory states that fixing CI audit vulnerabilities acts as explicit authorization.
