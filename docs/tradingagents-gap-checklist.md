# TradingAgents Parity Checklist

Actionable, ordered close-list derived from [`tradingagents-gap-analysis.md`](./tradingagents-gap-analysis.md). Order reflects best ROI: small wins first, then the architectural lifts.

Conventions:
- [ ] open · [x] done · [~] in progress
- File paths are relative to repo root.

---

## Phase 1 — Quick wins (low effort, high impact)

### Gap #3 — Add Research Manager node
- [x] Add `RoleName` `"researchManager"` to [`src/agent/team/state.ts`](../src/agent/team/state.ts) and a `ResearchPlan` schema (5-tier recommendation, rationale, strategic_actions).
- [x] Add `researchManagerPrompt()` to [`src/agent/team/prompts.ts`](../src/agent/team/prompts.ts) — input: analysts + bull/bear transcript; output: structured plan.
- [x] Insert phase between debate and trader in [`src/agent/team/index.ts`](../src/agent/team/index.ts); pass plan (not raw debate) to trader.
- [x] Update [`src/agent/team/storage.ts`](../src/agent/team/storage.ts) to persist the role.
- [x] Test: extend [`tests/team.test.ts`](../tests/team.test.ts) — assert Research Manager runs after debate, before trader; trader prompt contains plan.

### Gap #4 — Adopt 5-tier rating scale
- [x] Replace `Action = BUY|SELL|HOLD|WATCH` with `Rating = Buy|Overweight|Hold|Underweight|Sell` in [`state.ts`](../src/agent/team/state.ts).
- [x] Update Trader / Risk / PM Zod schemas + prompts in [`prompts.ts`](../src/agent/team/prompts.ts) — quote upstream wording: "reserve Hold for genuinely balanced evidence".
- [x] Risk-veto downgrade in [`index.ts:207-211`](../src/agent/team/index.ts#L207-L211): map rejected Buy/Overweight → Hold; rejected Sell/Underweight → Hold.
- [x] Update `decisions.action` column / migration: keep legacy column, add `rating` column for new runs (forward-only).
- [x] Update [`TeamDecisionCard`](../src/tui/lib/cards.tsx) color map.
- [x] Test: add ratings parsing to `tests/team.test.ts`.

### Gap #5 — Deep/quick LLM tier split
- [ ] Add `team.deep_model` / `team.quick_model` to config schema in [`src/config/loader.ts`](../src/config/loader.ts) and [`src/runtime/defaultConfig.ts`](../src/runtime/defaultConfig.ts).
- [ ] In [`runner.ts`](../src/agent/team/runner.ts), select model per role: deep for `researchManager` + `portfolio`; quick for everything else. Honor existing `modelOverride` as final override.
- [ ] Test: stub assertion that `analysts` and `trader` use quick model, `portfolio` uses deep.

### Gap #10 — Output language switch
- [x] Add `team.output_language` config (default `"en"`).
- [x] Localize user-facing role prompts (analysts, PM); keep bull/bear/risk debate in English.
- [x] Test: snapshot of Vietnamese prompt rendering.

---

## Phase 2 — Architectural

### Gap #1 — Three-way risk debate
- [ ] Replace single `risk` role with three: `riskAggressive`, `riskConservative`, `riskNeutral` in [`state.ts`](../src/agent/team/state.ts) (`RoleName` union, `RiskDebateState` mirror of upstream's TypedDict).
- [ ] Add three role prompts in [`prompts.ts`](../src/agent/team/prompts.ts) — each sees: 4 analyst reports + trader proposal + other two debaters' last responses.
- [ ] Round-robin loop in [`index.ts`](../src/agent/team/index.ts): `Aggressive → Conservative → Neutral → Aggressive…` until `count >= 3 * config.team.max_risk_discuss_rounds` (default 1).
- [ ] Promote Portfolio Manager to risk judge: pass full risk-debate history into [`portfolioPrompt`](../src/agent/team/prompts.ts) instead of single `RiskReview`.
- [ ] Remove standalone `RiskManager` role; delete legacy approval gate; PM's rating IS the risk decision.
- [ ] Update tool whitelists in [`tools.ts`](../src/agent/team/tools.ts) — each risk persona gets `portfolio_list`, `macro_indices`, `foreign_flow`.
- [ ] Test: assert ordering Aggressive → Conservative → Neutral; assert PM prompt receives all three transcripts.

### Gap #7 — Free-text markdown reports for analysts
- [ ] Change analyst output schema: `{report: string, score?: number, table_md: string}` — keep score optional for downstream weighting.
- [ ] Update analyst prompts in [`prompts.ts`](../src/agent/team/prompts.ts) to require trailing markdown table (mirror upstream).
- [ ] Update bull/bear/research-manager prompts to consume full `report` string, not `summary`.
- [ ] Update [`TeamDecisionCard`](../src/tui/lib/cards.tsx) to render report excerpts (truncated).
- [ ] Update `tests/team.test.ts` fixtures.

---

## Phase 3 — Memory & learning

### Gap #2 — Past-context memory + post-trade reflection
- [ ] New module `src/agent/team/memory.ts`. Choose store:
  - [ ] Decision: SQLite tables `team_memory_entries` (pending/resolved + reflection text) — fits Azoth's persistence model. Reject upstream's flat-file approach.
- [ ] On team-run completion, append pending entry: `{ticker, asOf, rating, decisionMd}`.
- [ ] On team-run start (before analysts), invoke `resolvePendingEntries(ticker)`:
  - [ ] Compute 5-trading-day return via existing [`getStockOhlcv`](../src/data/sources/dnsePublic.js).
  - [ ] Compute alpha vs VNINDEX (use [`getIndexOhlcv`](../src/data/sources/dnsePublic.js)).
  - [ ] Single quick-LLM call: 2–4 sentence reflection.
  - [ ] Update entry to resolved.
- [ ] Build `getPastContext(ticker, nSame=5, nCross=3)` returning string; inject into Portfolio Manager prompt only.
- [ ] Add `team.holding_days` (default 5) and `team.benchmark_ticker` (default `VNINDEX`) to config.
- [ ] Tests:
  - [ ] `memory.test.ts` — pending → resolved transition with stubbed price fetch.
  - [ ] Reflector receives raw + alpha returns.
  - [ ] PM prompt contains `past_context` only when entries exist.

---

## Phase 4 — Robustness

### Gap #8 — Mid-run checkpointing
- [ ] Persist intermediate `TeamState` after each role to existing `team_role_outputs` (already done) AND a new `team_run_state` row keyed by `runId`.
- [ ] Add `resumeRunId` parameter to [`runTeamAnalysis`](../src/agent/team/index.ts); on resume, replay completed roles from DB, skip ahead.
- [ ] CLI flag `pnpm analyze --resume <runId>` in [`src/cli/analyze.ts`](../src/cli/analyze.ts).
- [ ] Test: kill mid-run, resume, assert no duplicate role rows.

### Gap #6 — Tool-loop subgraph (deferred, SDK handles)
- [x] Skip — Claude Agent SDK already loops tool calls within one turn.

---

## Verification (per phase)

After each phase: `pnpm typecheck && pnpm test`. End-to-end smoke:
```bash
ANTHROPIC_API_KEY=… pnpm analyze FPT --rounds 2
sqlite3 ~/.azoth/azoth.db "SELECT role, count(*) FROM team_role_outputs WHERE run_id=(SELECT id FROM team_runs ORDER BY created_at DESC LIMIT 1) GROUP BY role"
```
Expected after Phase 2: rows for `technical`, `fundamentals`, `news`, `sentiment`, `bull`, `bear`, `researchManager`, `trader`, `riskAggressive`, `riskConservative`, `riskNeutral`, `portfolio`.
