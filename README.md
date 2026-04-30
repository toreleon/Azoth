# VNStockAgent

CLI agent platform for Vietnam stock investment decisions, built on the Claude Agent SDK (TypeScript).

All five phases of the original plan are now in:

- **Phase 1** — market data + technical indicators
- **Phase 2** — fundamentals + per-ticker news
- **Phase 3** — macro indices, foreign flow, portfolio, and decision journal
- **Phase 4** — paper broker, autonomy modes (advisory / confirm / auto), risk guardrails, RSI backtest
- **Phase 5** — DNSE Entrade X live broker (LightSpeed v2 REST) + broker contract tests

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

## Live trading (DNSE Entrade X)

**Read this before flipping the switch.** Live mode places real orders against
a real account.

1. Open a DNSE account and enable Entrade X / LightSpeed API access.
2. Fill `DNSE_USERNAME`, `DNSE_PASSWORD`, `DNSE_ACCOUNT_NO` in `.env`.
3. **Find your `DNSE_LOAN_PACKAGE_ID`**: this is account-specific. After
   logging in once, hit `GET https://api.dnse.com.vn/margin-service/loan-products`
   with the JWT and pick an `id` for your equity sub-account. Community values
   like `1372` are NOT yours.
4. Set `broker: dnse` in `src/config/config.yaml`.
5. Set `autonomy: confirm` (recommended) — every order will prompt y/N in the
   CLI before submission.
6. Run `pnpm test` and `pnpm dev` with `DNSE_TEST_LIVE=1` set, but **leave
   `VNSTOCK_LIVE_TRADING` unset** for now. Verify `broker_state` and
   `list_orders` calls return your real cash + positions.
7. Only then set `VNSTOCK_LIVE_TRADING=1` and place a single 100-share test
   order on a liquid ticker (SSI, VND, VPB) during market hours.
8. The first `place_order` of each session triggers an email OTP prompt.

The DNSE client is built defensively — DNSE has not published a stable public
spec, so field names are parsed leniently. If you hit a parse error, capture
the raw HTTP response and patch `src/broker/dnse.ts`.

## Backtesting

```
pnpm backtest --days=180 --rsi-buy=30 --rsi-sell=70 --lots=2
```

Replays an RSI mean-reversion strategy on the watchlist via PaperBroker.
Sanity-checks data feeds, lot sizing, fees, and accounting without spending
LLM tokens.

## Tests

```
pnpm test                # PaperBroker contract suite
DNSE_TEST_LIVE=1 pnpm test   # also runs DNSE read-only probes
```

See `/home/tore/.claude/plans/i-am-planning-to-wise-catmull.md` for the full multi-phase plan.
