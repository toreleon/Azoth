# Azoth Roadmap

This roadmap describes planned product direction for Azoth. It is not a
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

Azoth v0.1.0 provides the public baseline:

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

## Near Term

### Release And Install Quality

- Publish `v0.1.0` as the stable public baseline.
- Keep the TUI version sourced from installed package metadata.
- Add a lightweight `azoth --version` / `azoth version` command.
- Add post-install smoke checks for packaged CLI binaries.
- Keep release docs consolidated and aligned with Changesets output.

### Runtime Reliability

- Move all test and runtime scratch artifacts under `~/.azoth`, `.azoth`, or
  temp directories.
- Harden SQLite lifecycle handling for tests, CLI shutdown, and interrupted
  sessions.
- Add safer migration coverage for existing user databases.
- Improve `/health` output for missing config, unavailable providers, and
  broker-state inconsistencies.

### TUI Workflow

- Improve first-run setup validation and provider error messages.
- Add clearer session resume and session deletion flows.
- Add compact command output for repeated `/quote`, `/positions`, and
  `/journal` workflows.
- Add a dedicated `/version` or `/about` card with package, runtime path, DB
  path, broker, provider, and release link.

### Documentation

- Expand live trading setup docs with explicit DNSE read-only validation steps.
- Document the local SQLite schema at a high level.
- Add troubleshooting docs for npm install, native SQLite builds, provider
  setup, and TTY requirements.
- Add example workflows for research, portfolio review, backtesting, and paper
  trading.

## Mid Term

### Market Data

- Add provider health scoring and fallback diagnostics.
- Track source timestamps and freshness in rendered quote and analysis output.
- Improve ticker discovery with exchange, sector, liquidity, and watchlist
  filters.
- Add richer corporate-action and disclosure context where reliable sources are
  available.
- Add more cache controls for stale data, forced refresh, and provider probes.

### Research And Team Desk

- Make analyst role configuration easier to tune from config.
- Persist full team artifacts in a more inspectable form.
- Add comparison workflows for pairs, sectors, and portfolio candidates.
- Improve synthesis quality with structured evidence tables and source
  timestamps.
- Add configurable model choices per role for cost and latency control.

### Portfolio And Risk

- Add configurable risk presets for conservative, balanced, and aggressive
  operation.
- Improve drawdown, realized P&L, turnover, exposure, and concentration
  reporting.
- Add pre-trade impact previews before confirm or auto execution.
- Add alerting rules for position size, loss limits, stale data, and market
  session boundaries.
- Add paper/live broker parity checks where APIs allow safe comparison.

### Backtesting

- Add repeatable scenario files for backtests.
- Store and compare backtest runs in the TUI.
- Add benchmark and sector-relative analytics.
- Improve fill assumptions, fee models, and rejected-order reporting.
- Add export support for run summaries and journal evidence.

## Later

### Live Trading Operations

- Add stronger live-trading arming workflows with explicit preflight checklists.
- Add order preview, dry-run, and emergency stop commands.
- Add reconciliation between local records and broker-reported orders/fills.
- Add richer handling for broker outages, expired sessions, and partial fills.
- Add optional notification hooks for fills, rejects, and risk halts.

### Data And Integrations

- Add optional import/export for journals, portfolios, and sessions.
- Support additional Vietnam-market data providers when licensing and quality
  allow.
- Add optional document/context ingestion for company notes and user research.
- Add connector-style integration points without making cloud storage required.

### Evaluation And Quality

- Add evaluation datasets for team analysis, tool routing, and backtest
  consistency.
- Add regression checks for prompts and role outputs.
- Add benchmark prompts for latency, token usage, and answer structure.
- Add more deterministic tests around risk controls and broker accounting.

## Not Planned For Now

- Fully autonomous live trading without explicit user arming and risk gates.
- Custody of user credentials outside the local runtime or user-managed secret
  environment.
- A cloud-first hosted service as the default Azoth experience.
- Market data redistribution beyond what source terms permit.

## Contributing To The Roadmap

Use GitHub issues or pull requests to propose roadmap changes. Good proposals
should include the user workflow, expected behavior, safety implications, test
coverage, and whether the change affects public release notes.
