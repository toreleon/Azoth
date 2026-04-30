# VNStockAgent

CLI agent platform for Vietnam stock investment decisions, built on the Claude Agent SDK (TypeScript).

**Phase 1 (current)** — advisory only: market data + technical indicators via a CLI chat.
Future phases add fundamentals, news/sentiment, macro, paper trading, and live broker execution (DNSE Entrade X).

## Setup

```bash
pnpm install        # or: npm install
cp .env.example .env
# edit .env and set ANTHROPIC_API_KEY
pnpm dev
```

## Try it

```
you> Show 30-day RSI for HPG
you> Compare MACD on FPT vs VCB
you> What's the bollinger band situation on VNINDEX (kind=index)?
```

## Configuration

Edit `src/config/config.yaml`:

- `autonomy`: only `advisory` is wired in Phase 1.
- `model`: any Claude model id (default `claude-sonnet-4-6`).
- `watchlist`: tickers the agent treats as default focus.
- `risk.*`: reserved for Phase 4+.

## Data sources

- **OHLCV (stocks + indices)**: DNSE Entrade public API (`services.entrade.com.vn/chart-api/v2/ohlcs/...`), no auth.
- **Quote / ref / ceiling / floor / company info**: SSI iBoard public (`iboard-query.ssi.com.vn/stock/...`), no auth.

Responses are cached in SQLite (`vnstock.db`) with short TTLs.

## Layout

```
src/
  cli.ts                   # readline REPL entry
  agent/orchestrator.ts    # system prompt + Agent SDK query loop
  tools/                   # SDK tools (market_quote, market_ohlcv, technical_indicators)
  data/sources/            # raw API clients (DNSE, SSI iBoard)
  data/cache.ts            # SQLite TTL cache
  storage/                 # better-sqlite3 + schema
  config/                  # YAML config + zod loader
```

See `/home/tore/.claude/plans/i-am-planning-to-wise-catmull.md` for the full multi-phase plan.
