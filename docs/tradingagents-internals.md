# TauricResearch/TradingAgents — Internals Inventory

Source: github.com/TauricResearch/TradingAgents @ `main`. All paths below are repo-relative.

## 1. Agent prompts (verbatim signature lines + key directives)

All four analyst nodes share the same outer ChatPromptTemplate scaffold (system message + `MessagesPlaceholder("messages")`) which ends with:
> "If you or any other assistant has the FINAL TRANSACTION PROPOSAL: **BUY/HOLD/SELL** or deliverable, prefix your response with FINAL TRANSACTION PROPOSAL: **BUY/HOLD/SELL** so the team knows to stop."
That string is the only stop-signal: when an analyst makes no tool call, its content is captured as the report.

- `tradingagents/agents/analysts/market_analyst.py` — picks "up to **8 indicators**" from a hard-coded catalog (close_50_sma, close_200_sma, close_10_ema, macd/macds/macdh, rsi, boll/boll_ub/boll_lb, atr, vwma). Tools: `get_stock_data`, `get_indicators`. Forced order: stock_data first, then indicators. Output: free-text report with a trailing markdown table; written to `state.market_report`.
- `tradingagents/agents/analysts/social_media_analyst.py` — sentiment + company-specific news, single tool `get_news`. Output → `state.sentiment_report`.
- `tradingagents/agents/analysts/news_analyst.py` — macro + targeted; tools `get_news`, `get_global_news`. Output → `state.news_report`.
- `tradingagents/agents/analysts/fundamentals_analyst.py` — tools `get_fundamentals`, `get_balance_sheet`, `get_cashflow`, `get_income_statement`. Output → `state.fundamentals_report`.

All analysts require a markdown table at the end and are localized via `get_language_instruction()` (English emits empty string).

- `tradingagents/agents/researchers/bull_researcher.py` / `bear_researcher.py` — single-pass `llm.invoke(prompt)` (no tools). Prompt names five sections: Growth Potential / Competitive Advantages / Positive Indicators / Bear (or Bull) Counterpoints / Engagement. Each writes to `investment_debate_state.history` (combined), its own `bull_history`/`bear_history`, sets `current_response` to "Bull Analyst: …" or "Bear Analyst: …", and increments `count` by 1.
- `tradingagents/agents/risk_mgmt/aggressive_debator.py`, `conservative_debator.py`, `neutral_debator.py` — all three read the trader's plan plus the four analyst reports plus the other two debators' last responses. Each appends to a global `history`, its own `xxx_history`, sets `latest_speaker` = "Aggressive"/"Conservative"/"Neutral", updates its `current_xxx_response`, and increments `count`.
- `tradingagents/agents/trader/trader.py` — uses structured output via `bind_structured(llm, TraderProposal, "Trader")`. System: "You are a trading agent analyzing market data…" with the research plan injected. Outputs `TraderProposal { action: Buy|Hold|Sell, reasoning, entry_price?, stop_loss?, position_sizing? }`. Renders to markdown ending with `FINAL TRANSACTION PROPOSAL: **BUY/HOLD/SELL**` (kept for grep compatibility).
- `tradingagents/agents/managers/research_manager.py` — structured `ResearchPlan { recommendation: 5-tier, rationale, strategic_actions }`. Prompt enumerates the 5-tier scale (Buy / Overweight / Hold / Underweight / Sell) and explicitly says "reserve Hold for situations where the evidence on both sides is genuinely balanced".
- `tradingagents/agents/managers/portfolio_manager.py` — structured `PortfolioDecision { rating: 5-tier, executive_summary, investment_thesis, price_target?, key_risks?, time_horizon? }`. Prompt receives the research plan, trader's proposal, the entire risk-debate history, and (if non-empty) `past_context` injected as `"Lessons from prior decisions and outcomes:\n{past_context}"`. Schemas in `tradingagents/agents/schemas.py`.

## 2. Graph topology (`tradingagents/graph/setup.py`)

`StateGraph(AgentState)` with these nodes per selected analyst (default 4): `<X> Analyst`, `tools_<x>`, `Msg Clear <X>`. Wiring:

1. `START → first_analyst.Analyst`.
2. For each analyst i: conditional edge from `<X> Analyst` to either `tools_<x>` (if tool_calls present) or `Msg Clear <X>` (via `should_continue_<x>` in `conditional_logic.py`). `tools_<x> → <X> Analyst` (loop). `Msg Clear` → next analyst, or → `Bull Researcher` if last.
3. `Bull Researcher` ↔ `Bear Researcher` alternating (`should_continue_debate`); when `count >= 2 * max_debate_rounds` route to `Research Manager`.
4. `Research Manager → Trader → Aggressive Analyst`.
5. Risk loop `Aggressive → Conservative → Neutral → Aggressive…` (`should_continue_risk_analysis`); when `count >= 3 * max_risk_discuss_rounds` route to `Portfolio Manager`.
6. `Portfolio Manager → END`.

`Msg Clear` (`agent_utils.create_msg_delete`) issues `RemoveMessage` for every message and inserts a single `HumanMessage("Continue")` — done specifically to keep Anthropic happy between analyst stages while preserving the report fields written to state.

## 3. State shape (`tradingagents/agents/utils/agent_states.py`)

`AgentState(MessagesState)` adds: `company_of_interest`, `trade_date`, `sender`, `market_report`, `sentiment_report`, `news_report`, `fundamentals_report`, `investment_debate_state: InvestDebateState`, `investment_plan`, `trader_investment_plan`, `risk_debate_state: RiskDebateState`, `final_trade_decision`, `past_context`.

`InvestDebateState`: `bull_history`, `bear_history`, `history`, `current_response`, `judge_decision`, `count`.
`RiskDebateState`: `aggressive_history`, `conservative_history`, `neutral_history`, `history`, `latest_speaker`, `current_aggressive_response`, `current_conservative_response`, `current_neutral_response`, `judge_decision`, `count`.

State accumulates by full replacement of these fields each node return; no LangGraph reducers — strings just get concatenated inside each node body.

## 4. Risk debate

Confirmed three personas (aggressive / conservative / neutral) plus Portfolio Manager as the judge. `conditional_logic.should_continue_risk_analysis` (verbatim):
```python
if state["risk_debate_state"]["count"] >= 3 * self.max_risk_discuss_rounds:
    return "Portfolio Manager"
if latest_speaker.startswith("Aggressive"):     return "Conservative Analyst"
if latest_speaker.startswith("Conservative"):   return "Neutral Analyst"
return "Aggressive Analyst"
```
With the default `max_risk_discuss_rounds = 1` this is exactly one turn each (3 messages total) before the PM. The PM decides via structured output (`PortfolioDecision`); the rendered markdown is written to both `risk_debate_state.judge_decision` and `final_trade_decision`.

## 5. Memory system (`tradingagents/agents/utils/memory.py`)

Plain append-only **markdown file** at `~/.tradingagents/memory/trading_memory.md` (configurable). No vector DB, no Chroma, no SQLite for memory. Entries are separated by an HTML-comment delimiter `<!-- ENTRY_END -->`. Each entry's tag line:
- pending: `[YYYY-MM-DD | TICKER | <Rating> | pending]`
- resolved: `[YYYY-MM-DD | TICKER | <Rating> | +x.x% | +y.y% | Nd]`

Followed by `DECISION:\n…` and (after resolution) `REFLECTION:\n…`.

Read path — `get_past_context(ticker, n_same=5, n_cross=3)` returns up to 5 most-recent same-ticker resolved entries (full decision + reflection) and 3 cross-ticker entries (reflection only / 300-char decision excerpt). This string becomes `state.past_context`, injected only into the **Portfolio Manager** prompt.

Write path — `store_decision()` is called by `TradingAgentsGraph._run_graph` *after* the graph completes, appending a pending entry. Outcomes are filled in deferred at the **start of the next same-ticker run** by `_resolve_pending_entries()` (see §7). Atomic writes via temp-file + `os.replace`. Optional rotation via `memory_log_max_entries`.

## 6. Tools / data access (`tradingagents/dataflows/`)

Vendor abstraction in `dataflows/interface.py` + per-vendor modules. Available vendors: **yfinance** and **alpha_vantage** only. Categories `core_stock_apis | technical_indicators | fundamental_data | news_data` each pick a vendor via `config["data_vendors"]`, with per-tool override via `config["tool_vendors"]`.

LangChain `@tool`-bound facades in `agents/utils/{core_stock_tools, technical_indicators_tools, fundamental_data_tools, news_data_tools}.py`: `get_stock_data`, `get_indicators` (via stockstats with hard-coded indicator whitelist), `get_fundamentals`, `get_balance_sheet`, `get_cashflow`, `get_income_statement`, `get_news`, `get_global_news`, `get_insider_transactions`. **No FinnHub, Reddit, Google News, or SimFin.** ToolNodes built per-analyst in `trading_graph._create_tool_nodes`.

## 7. Reflection / post-trade (`tradingagents/graph/reflection.py`)

`Reflector.reflect_on_final_decision(final_decision, raw_return, alpha_return)` does **one** quick-LLM call producing 2–4 sentences of plain prose. Invoked from `TradingAgentsGraph._resolve_pending_entries` at the **start** of every `propagate(ticker, date)` run: it loads pending memory entries for that ticker, fetches `yf.Ticker(ticker)` and `yf.Ticker("SPY")` 5-day returns (`_fetch_returns`, holding_days=5, alpha = raw − SPY), generates the reflection, and `batch_update_with_outcomes` rewrites the markdown log atomically. Entries whose price is not yet available are skipped and retried next run.

## 8. Configuration knobs (`tradingagents/default_config.py`)

```python
"llm_provider": "openai",
"deep_think_llm": "gpt-5.4",        "quick_think_llm": "gpt-5.4-mini",
"backend_url": None,
"google_thinking_level": None, "openai_reasoning_effort": None, "anthropic_effort": None,
"checkpoint_enabled": False,
"output_language": "English",
"max_debate_rounds": 1,
"max_risk_discuss_rounds": 1,
"max_recur_limit": 100,
"data_vendors": {core_stock_apis|technical_indicators|fundamental_data|news_data: "yfinance"},
"tool_vendors": {},
"memory_log_path": "~/.tradingagents/memory/trading_memory.md",
"memory_log_max_entries": None,
```
Per-role LLM split (in `graph/setup.py`): all four analysts, both researchers, all three risk debators, and the Trader use `quick_thinking_llm`. Only the **Research Manager** and **Portfolio Manager** use `deep_thinking_llm`. Reflector and SignalProcessor also use the quick LLM; SignalProcessor is now LLM-free in practice (deterministic `parse_rating`).

There is no online/offline switch in the current `default_config.py`; vendor choice replaces it.

## 9. Output / decision shape

- Trader emits `TraderProposal` rendered as markdown ending with `FINAL TRANSACTION PROPOSAL: **BUY/HOLD/SELL**`; stored in `state.trader_investment_plan`.
- Research Manager emits `ResearchPlan` (5-tier rating + rationale + strategic_actions) → `state.investment_plan`.
- Portfolio Manager emits `PortfolioDecision` (5-tier rating, executive_summary, investment_thesis, optional price_target/key_risks/time_horizon) → `state.final_trade_decision`.
- `TradingAgentsGraph.propagate()` returns `(final_state, processed_signal)` where `processed_signal` is the parsed 5-tier rating string. The full state is also dumped to `<results_dir>/<ticker>/TradingAgentsStrategy_logs/full_states_log_<date>.json`.

## Notable extras (relevant for gap analysis)

- LangGraph SQLite checkpointing (`graph/checkpointer.py`) keyed by sha256(ticker:date) — opt-in via `checkpoint_enabled`. Per-ticker DB at `<cache>/checkpoints/<TICKER>.db`.
- The Portfolio Manager is the **only** node that sees `past_context`; bull/bear/risk debators do not. Memory therefore biases the *judge*, not the debate inputs.
- `agents/utils/rating.py` defines the canonical 5-tier scale and `parse_rating` regex used by signal_processing, memory log tagging, and Research Manager rendering.
- All inter-agent debate stays in English regardless of `output_language`; only user-facing analysts and PM honor the language switch.
