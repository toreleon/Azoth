# Gap Analysis: Azoth Team Module vs TauricResearch/TradingAgents

Comparison of Azoth's [`src/agent/team/`](../src/agent/team/) module against [TauricResearch/TradingAgents](https://github.com/TauricResearch/TradingAgents) `main` branch. Both stacks share the conceptual roster (analysts → researchers → trader → risk → portfolio manager) but Azoth made several deliberate simplifications and a few unintentional omissions.

Sources: upstream code inventory in [tradingagents-internals.md](./tradingagents-internals.md); Azoth team module in [`src/agent/team/index.ts`](../src/agent/team/index.ts), [`prompts.ts`](../src/agent/team/prompts.ts), [`runner.ts`](../src/agent/team/runner.ts), [`tools.ts`](../src/agent/team/tools.ts), [`state.ts`](../src/agent/team/state.ts).

---

## High-impact gaps (architectural)

### 1. Risk debate is single-voice, not three-way
- **Upstream:** Three risk debaters (Aggressive / Conservative / Neutral) take turns in a round-robin loop until `count >= 3 * max_risk_discuss_rounds`, then the **Portfolio Manager itself acts as the risk judge** with the full risk-debate transcript visible.
- **Azoth:** A single `RiskManager` role does an approve/reject + sizing-haircut. PM only sees the risk *summary*. Risk veto enforced post-hoc by runner ([`index.ts:207-211`](../src/agent/team/index.ts#L207-L211)).
- **Why it matters:** Loses the structured aggressive-vs-conservative tension that's a core feature of the upstream paper.

### 2. No memory or post-trade reflection
- **Upstream:** [`memory.py`](https://github.com/TauricResearch/TradingAgents) stores each decision in `~/.tradingagents/memory/trading_memory.md`. At the **start of every next same-ticker run**, `_resolve_pending_entries` fetches 5-day returns vs SPY, generates a 2-4 sentence reflection via quick-LLM, and rewrites the entry. PM (and only PM) gets `past_context = 5 same-ticker resolved entries + 3 cross-ticker reflections`.
- **Azoth:** Zero feedback loop. Each run is stateless. Trader can call `journal_read` but no realized-return tagging, no reflection, no `past_context` injection.
- **Why it matters:** Upstream's main learning mechanism; without it the system can't improve from its own track record.

### 3. Research Manager is missing
- **Upstream:** Between bull/bear debate and trader sits a **Research Manager** emitting structured `ResearchPlan { recommendation: 5-tier, rationale, strategic_actions }` using the deep-think LLM. Trader reads the plan, not raw debate.
- **Azoth:** Trader reads raw bull/bear transcript directly. No intermediate synthesis layer.
- **Why it matters:** Research Manager is one of only two nodes upstream that uses the deep-think model. Skipping it pushes synthesis onto a quick-think trader.

### 4. Decision scale is 4-tier vs 5-tier
- **Upstream:** Canonical 5-tier rating: **Buy / Overweight / Hold / Underweight / Sell**. Both Research Manager and Portfolio Manager emit this; SignalProcessor parses it deterministically.
- **Azoth:** 4-tier: BUY / SELL / HOLD / WATCH. No "overweight"/"underweight" middle states.
- **Why it matters:** Upstream prompt explicitly tells PM to "reserve Hold for genuinely balanced evidence" — middle tiers absorb lukewarm cases that Azoth funnels into HOLD/WATCH ambiguously.

---

## Medium-impact gaps (capability)

### 5. No deep-think vs quick-think model split
- **Upstream:** All analysts, researchers, risk debators, and Trader use `quick_think_llm`. Only Research Manager and Portfolio Manager use `deep_think_llm`. Cost-aware by design.
- **Azoth:** Single `cfg.model` everywhere; `modelOverride` is a global override, not a per-role tier ([`runner.ts:24`](../src/agent/team/runner.ts#L24)).

### 6. No conditional branching / tool-loop subgraph
- **Upstream:** Each analyst wired with tool-call loop: `analyst → tools_<x> → analyst → … → Msg Clear → next`. `should_continue_<x>` predicate watches for `tool_calls`.
- **Azoth:** One SDK turn per role. Claude Agent SDK handles tool-use loops internally, so this is partly papered over — but no graph-level retry or `Msg Clear`. Could matter for non-Anthropic models.

### 7. Analyst output is structured JSON, not free-text + table
- **Upstream:** Analysts output **free-text markdown reports ending with a markdown table**, written to `state.market_report` etc. Length and form open.
- **Azoth:** Analysts return strict JSON `{summary, score: -1..1, detail: {...}}`. Bull/bear see only the JSON `summary`.
- **Why it matters:** Numeric `score` collapses analyst reasoning into one float. Debate loses nuance.

### 8. No persistent checkpointing
- **Upstream:** Optional LangGraph SQLite checkpointing per `sha256(ticker:date)` — pause/resume mid-graph.
- **Azoth:** No mid-run checkpoints. If a role fails partway, run is lost (though `team_role_outputs` records partial progress).

---

## Low-impact gaps & Azoth-side advantages

### 9. Where Azoth is **better**
- **Per-role tool whitelisting via MCP** ([`tools.ts`](../src/agent/team/tools.ts)) — upstream gives analysts whatever `bind_tools` exposes; Azoth enforces tighter least-privilege.
- **Streaming events** (`role_start`/`role_delta`/`role_tool`/`role_end`/`final`) — upstream prints to console; Azoth has typed event API the TUI consumes.
- **VN-specific data** (DNSE / SSI / CafeF / VNDirect / foreign flow) — upstream is US-only via yfinance + alpha_vantage.
- **Parallel analyst phase** (`Promise.all` in [`index.ts:79`](../src/agent/team/index.ts#L79)) — upstream runs analysts sequentially.

### 10. Output language switching
- **Upstream:** `output_language` config switches user-facing analyst + PM prompts; debate stays English.
- **Azoth:** Hardcoded English/VN-mixed.

---

## Severity & effort summary

| # | Gap | Severity | Effort |
|---|-----|----------|--------|
| 1 | Three-way risk debate (Aggressive/Conservative/Neutral) | High | Medium |
| 2 | Memory + post-trade reflection (`past_context`) | High | Large |
| 3 | Research Manager between debate and trader | High | Small |
| 4 | 5-tier rating scale | High | Small |
| 5 | Deep/quick LLM tier split | Medium | Small |
| 6 | Tool-loop subgraph + `Msg Clear` | Medium | Skip (SDK) |
| 7 | Free-text markdown reports vs JSON | Medium | Medium |
| 8 | Mid-run checkpointing | Medium | Medium |
| 9 | Per-role tool whitelisting | Azoth wins | — |
| 10 | Output language switch | Low | Small |
