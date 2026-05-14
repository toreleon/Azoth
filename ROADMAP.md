# Azoth 12-Month Product Roadmap

This roadmap sequences Azoth from the current `v0.1.0` public baseline into a
daily-use Vietnam equity workflow product over May 2026-April 2027. It is not a
commitment to ship every item in order; priorities may change based on broker
API behavior, market data reliability, user feedback, and safety review.

## Product Principles

- Keep Azoth terminal-native, fast, and useful for repeated daily workflows.
- Prefer decision support and auditability over opaque automation.
- Keep live trading explicitly armed, risk-gated, and easy to disable.
- Treat Vietnam-market data quality as a core product concern.
- Preserve local-first ownership of config, sessions, journals, and broker
  records.

## Current Baseline

Azoth v0.1.0, released on May 4, 2026, provides the public baseline:

- Chat-first Ink TUI with slash commands and resumable local sessions.
- Claude Agent SDK orchestration with Azoth market, portfolio, journal, team,
  and broker tools.
- Multi-agent research desk for team questions and single-ticker analysis.
- Vietnam equity data tools for quotes, OHLCV, technicals, fundamentals, news,
  macro indices, foreign flow, and ticker discovery.
- Local SQLite runtime for cache, journals, broker state, team runs, orders,
  fills, alerts, and project sessions.
- Paper broker, risk guardrails, and team-driven backtesting.
- Optional DNSE Entrade X / LightSpeed live broker integration.
- Public npm packaging and automated release workflow.

## Release Sequence

### v0.2 - Stabilization And Install Quality

- Ship `azoth --version`, `azoth -v`, and `azoth version`.
- Add packaged CLI smoke checks for the compiled binary.
- Harden SQLite lifecycle handling for tests, CLI shutdown, interrupted
  sessions, and user database migrations.
- Improve `/health` for missing config, unavailable providers, broker-state
  inconsistencies, live-trading arming, and provider probes.
- Improve first-run provider validation and error messages.
- Expand live trading setup docs with explicit DNSE read-only validation steps.

### v0.3 - Daily Workflow Foundation

- Improve compact `/quote`, `/positions`, and `/journal` output for repeated
  daily use.
- Add `/about` with package version, runtime path, DB path, broker, provider,
  and release references.
- Add clearer session resume and session deletion flows.
- Add journal import/export for decisions, orders, fills, and alerts.
- Add workflow docs for morning review, watchlist review, end-of-day journaling,
  paper trading, and backtesting.

### v0.4 - Watchlists, Alerts, And Data Trust

- Add watchlist-aware ticker discovery with exchange, sector, liquidity, and
  saved-list filters.
- Add provider health scoring, fallback diagnostics, source timestamps, and
  freshness display in quote and analysis output.
- Add cache controls for stale data, forced refresh, and provider probes.
- Add alert rules for position size, loss limits, stale data, and market session
  boundaries.
- Persist alert events locally so alerts are auditable alongside journal rows.

### v0.5 - Portfolio Review And Comparison

- Add comparison workflows for pairs, sectors, and portfolio candidates.
- Improve drawdown, realized P&L, turnover, exposure, and concentration
  reporting.
- Add pre-trade impact previews before confirm or auto execution.
- Add configurable risk presets for conservative, balanced, and aggressive
  operation.
- Improve team synthesis with structured evidence tables and source timestamps.
- Add configurable model choices per role for cost and latency control.

### v0.6 - Backtesting And Operations Depth

- Add repeatable scenario files for backtests.
- Store and compare backtest runs in the TUI.
- Add benchmark and sector-relative analytics.
- Improve fill assumptions, fee models, and rejected-order reporting.
- Add export support for run summaries and journal evidence.
- Add paper/live broker parity checks where APIs allow safe comparison.
- Add order preview, dry-run, emergency stop, and stronger live-trading preflight
  commands.

## Public Interfaces

- CLI: `azoth --version`, `azoth -v`, and `azoth version`.
- TUI: `/about`, watchlist-aware discovery flows, backtest scenario selection,
  backtest run comparison, alert management, and order preview/dry-run.
- Config: risk presets, data freshness/cache controls, alert rules, watchlists,
  and optional per-role model settings.
- Storage: provider health/freshness metadata, watchlists, alert rules/events,
  inspectable team artifacts, backtest scenarios, and comparable backtest
  summaries.

## Validation

- Keep every release gated by `pnpm typecheck`, `pnpm test`, `pnpm build`, and
  packaged CLI smoke validation.
- Add focused tests for each new slash command, config migration, SQLite schema
  migration, stale-data behavior, alert trigger, risk preset, and backtest
  scenario.
- Keep DNSE live validation read-only by default; require explicit live env flags
  for any broker integration checks.
- Add regression prompts for team output structure, evidence timestamps, tool
  routing, and backtest consistency once `v0.5` begins.

## Not Planned For This Roadmap

- Fully autonomous live trading without explicit user arming and risk gates.
- Custody of user credentials outside the local runtime or user-managed secret
  environment.
- A cloud-first hosted service as the default Azoth experience.
- Market data redistribution beyond what source terms permit.

## Contributing To The Roadmap

Use GitHub issues or pull requests to propose roadmap changes. Good proposals
should include the user workflow, expected behavior, safety implications, test
coverage, and whether the change affects public release notes.
