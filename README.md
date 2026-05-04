# Azoth

Azoth is a professional agent CLI for Vietnam equity research, portfolio
workflow, and broker-aware trading operations.

It combines an interactive terminal UI, Claude Agent SDK orchestration,
market-data tools, multi-agent research, local journaling, paper trading,
backtesting, and optional DNSE Entrade X live broker integration. Azoth is
designed for disciplined decision support: every recommendation should be
grounded in tool output, written to a journal, and constrained by explicit
autonomy and risk settings.

> Azoth is investment software, not financial advice. Live trading can place
> real orders against a real account. Use advisory or paper mode until you have
> verified configuration, data quality, account state, and risk limits.

## Highlights

- **Agent-native CLI**: run Azoth from the terminal with a rich Ink-based UI,
  streaming model output, tool chips, status bar, slash commands, and resumable
  project sessions.
- **VN market research tools**: quote, OHLCV, technical indicators,
  fundamentals, company news, macro indices, foreign flow, ticker discovery,
  portfolio state, and decision journal.
- **Multi-agent desk**: structured analyst workflow with technical,
  fundamentals, news, sentiment, bull, bear, research manager, trader, risk,
  and portfolio roles.
- **Broker-aware execution**: advisory, confirm, and auto autonomy modes with
  paper broker support and DNSE Entrade X integration for live accounts.
- **Risk controls**: position sizing limits, order notional limits, optional
  ticker whitelist checks, market-hour checks, and buy freeze support.
- **Backtesting**: replay strategy behavior with the paper broker to validate
  feeds, accounting, lot sizing, fees, and guardrails before using live tools.
- **Local-first state**: configuration, SQLite cache, broker records,
  journals, broker records, team runs, and session logs live under `~/.azoth`
  by default.

## Quick Start

Requirements:

- Node.js 20 or newer
- pnpm or npm
- `ANTHROPIC_API_KEY` for the Claude Agent SDK

Install and initialize:

```bash
pnpm install
pnpm azoth:init
cp ~/.azoth/.env.example ~/.azoth/.env
```

Edit `~/.azoth/.env` and set:

```bash
ANTHROPIC_API_KEY=...
```

Start the professional TUI:

```bash
pnpm azoth
```

## Common Workflows

Ask the agent a market question:

```text
Should we add more bank exposure this week?
```

Run structured team analysis:

```text
/analyze FPT
/analyze HPG --rounds 3
/team Should we rotate from steel into banks this month?
```

Check market and portfolio state:

```text
/quote VCB
/positions
/journal decisions 10
```

Run a backtest:

```text
/backtest 2025-01-03 2025-04-30 1000000000
```

Manage sessions:

```text
/new
/sessions
/resume
/resume <session-id>
```

## Slash Commands

| Command | Purpose |
| --- | --- |
| `/team <message>` | Run a multi-agent debate on a market or portfolio question. |
| `/analyze <ticker> [--rounds N]` | Run structured team analysis for one ticker. |
| `/backtest [start] [end] [cash]` | Run a weekly backtest and render results inline. |
| `/journal [decisions\|orders\|fills\|alerts] [N]` | Show recent journal rows. |
| `/quote <ticker>` | Request quote, technicals, and recent news for a ticker. |
| `/positions` | Summarize current portfolio positions and exposures. |
| `/autonomy <advisory\|confirm\|auto>` | Persist the autonomy mode and rebuild tool access for new turns. |
| `/health [--probe]` | Check API key, config, DB, broker state, live-trading arm flag, market session, and optionally data providers. |
| `/new` | Start a new resumable session. |
| `/resume [id]` | Resume the latest session or a specific session. |
| `/sessions` | List recent project sessions. |
| `/help` | Show command help in the TUI. |

## Configuration

Azoth stores runtime state in `~/.azoth` unless `AZOTH_HOME` is set.

A fresh runtime contains:

- `~/.azoth/config.yaml` - user configuration
- `~/.azoth/.env.example` - environment template
- `~/.azoth/azoth.db` - SQLite cache, journal, broker, and run database
- `~/.azoth/projects/<encoded-cwd>/*.jsonl` - per-project session logs

Useful environment variables:

| Variable | Purpose |
| --- | --- |
| `ANTHROPIC_API_KEY` | Required model API key. |
| `AZOTH_HOME` | Override the runtime directory. |
| `VNSTOCK_CONFIG` | Override the config file path. |
| `VNSTOCK_DB` | Override the SQLite database path. |
| `AZOTH_ALT_SCREEN=1` | Run the TUI in the alternate screen buffer. |
| `VNSTOCK_LIVE_TRADING=1` | Explicitly enable live trading paths. |
| `DNSE_TEST_LIVE=1` | Run DNSE read-only live probes in tests. |

Default config:

```yaml
autonomy: advisory
model: glm-5.1

team:
  quick_model: glm-5.1
  deep_model: glm-5.1
  output_language: en

broker: paper

risk:
  max_position_pct: 0.15
  max_daily_loss_pct: 0.03
  max_order_notional_vnd: 50000000
  ticker_whitelist: []
  allow_margin: false
```

Autonomy modes:

- `advisory`: no order tools are exposed. Azoth recommends; the user executes.
- `confirm`: order tools are available, but each order requires CLI approval.
- `auto`: order tools run through configured guardrails before submission.

Broker modes:

- `paper`: local paper broker backed by SQLite.
- `dnse`: DNSE Entrade X / LightSpeed integration for live accounts.

## Data Sources

Azoth uses public and broker APIs for Vietnam market context:

- **OHLCV**: DNSE Entrade public chart API.
- **Quotes and reference prices**: SSI iBoard public endpoints.
- **Fundamentals**: VNDirect Finfo and CafeF.
- **News and disclosures**: CafeF.
- **Open web context**: model WebSearch when built-in market tools are not
  sufficient.

Market responses are cached in SQLite with short TTLs to keep the CLI fast and
reduce repeated network calls.

## Live Trading With DNSE

Live mode places real orders. Keep `autonomy: advisory` or `broker: paper`
until the checklist below is complete.

1. Open a DNSE account and enable Entrade X / LightSpeed API access.
2. Add `DNSE_USERNAME`, `DNSE_PASSWORD`, and `DNSE_ACCOUNT_NO` to
   `~/.azoth/.env`.
3. Find your account-specific `DNSE_LOAN_PACKAGE_ID`. After login, call
   `GET https://api.dnse.com.vn/margin-service/loan-products` with the JWT and
   choose the correct loan product id for your equity sub-account.
4. Set `broker: dnse` in `~/.azoth/config.yaml`.
5. Set `autonomy: confirm` first, so every order prompts for approval.
6. Run `pnpm test` and then `DNSE_TEST_LIVE=1 pnpm test` for read-only live
   probes.
7. Verify `broker_state` and `list_orders` return the expected cash, positions,
   and orders.
8. Only then set `VNSTOCK_LIVE_TRADING=1`.
9. During market hours, place one small 100-share test order on a liquid ticker
   and verify the result with DNSE directly.

The first `place_order` in a live session may trigger an email OTP prompt.

## Backtesting

Run the team-driven agent backtest:

```bash
pnpm backtest
```

Backtests use the paper broker and simulated time. They are intended to validate
data feeds, accounting behavior, lot sizing, fees, strategy assumptions, and
risk guardrails before using live broker tools.

## Development

Common commands:

```bash
pnpm azoth          # run the Ink TUI
pnpm azoth:init     # initialize ~/.azoth
pnpm analyze        # run the standalone analysis CLI
pnpm backtest       # run agent backtest
pnpm test           # run Vitest
pnpm typecheck      # run TypeScript type checks
pnpm build          # compile to dist/
```

Project layout:

```text
src/
  cli/azoth.tsx            Ink terminal UI entrypoint
  tui/                     TUI components, hooks, cards, theme, commands
  agent/orchestrator.ts    Agent SDK prompt, tools, sessions
  agent/team/              multi-agent research desk
  tools/                   market, portfolio, journal, broker tools
  data/sources/            DNSE, SSI, CafeF, VNDirect clients
  broker/                  paper and DNSE broker implementations
  risk/                    pre-trade guardrails
  storage/                 SQLite schema and database access
  runtime/                 ~/.azoth paths, bootstrap, session store
  config/                  YAML defaults and loader
```

## Operating Principles

Azoth is built around a few explicit constraints:

- Recommendations must be grounded in tool output, not memory.
- Prices are stated in correct units. VN stock prices from DNSE and SSI are in
  thousand VND.
- Vietnam settlement is treated as T+2.5; Azoth should not propose same-day
  round trips.
- Buy, sell, or hold recommendations should include technicals, fundamentals,
  news, and macro context.
- News citations should include source URL and publish date.
- Decisions should be persisted to the local journal with rationale and an exit
  plan.
- Order placement is disabled in advisory mode and guarded in auto mode.
