# Azoth Finance — web dashboard

A Google-Finance-style web dashboard for Azoth's Vietnam-market data (HOSE/HNX/UPCOM).
It reuses Azoth's existing data layer (`src/data/sources/**`, DNSE/SSI/VNDirect/CafeF)
through a thin Node API server, and renders a React frontend that clones Google
Finance's information architecture and visual language. The UI defaults to the
**light** theme (dark is available via the theme toggle; tokens flip on `[data-theme]`).

## What's here

- **`server/index.ts`** — a dependency-light Node `http` API server. It imports Azoth's
  `src/**` data clients directly and exposes JSON under `/api/*`. Data is TTL-cached via
  Azoth's SQLite cache (`~/.azoth/azoth.db`). No secrets required — all sources are public.
- **`server/store.ts`** — the SQLite persistence layer for user-managed watchlists and manual
  portfolios. Tables are prefixed `web_*` and share the same better-sqlite3 handle as the rest
  of Azoth; `ensureWebSchema()` creates them (and seeds a default watchlist) at server startup.
- **`src/`** — Vite + React + TypeScript frontend.
  - `pages/Home.tsx` — a row of **compact index cards** (small name, medium value, % badge,
    sparkline), a **Discover** strip (bluechip/sector shortcuts), and a **market summary**
    news block. Movers no longer live here — they moved to the **`/markets`** trends page.
  - `pages/Quote.tsx` — price header (with **add-to-list**), interactive chart, then
    **Overview / Financials / News tabs**.
  - `pages/SectorPage.tsx` — sector detail (`/sector/:key`), reached from the sidebar sector
    rail: average daily move, the synthetic sector-index trend, and the sector's members
    ranked by daily move.
  - `pages/IndexPage.tsx` — index detail (`/index/:symbol`), reached by clicking any index
    card: value + 1D/1W/1M performance, a range-tabbed area chart (`IndexChart`), and the
    index's **constituents** ranked by daily move. VN-Index and VN30 have constituent
    baskets; HNX/HNX30/UPCOM show a note instead, since no member list is published by our
    sources.
  - `pages/WatchlistPage.tsx` — a single user watchlist: live quote rows with add/remove a
    symbol, rename, and delete the list.
  - `pages/Portfolio.tsx` — a manually-entered portfolio (Google-Finance style, **not**
    broker-linked): holdings table with per-position and total gain/loss, day change, and weights;
    add/edit/remove holdings; create/rename/delete and switch between multiple portfolios.
  - `pages/MarketTrends.tsx` — market-trends tabs (Active / Gainers / Losers / Indexes) with a
    Liquid/VN30 universe toggle.
  - `components/` — TopNav (search + theme toggle), Sidebar (persistent watchlists + portfolios
    with inline add/remove, plus a **SectorRail** mini index-list of stock sectors),
    ResearchPanel, MarketStrip (compact IndexCards), MarketSummary (home news block),
    NewsList, QuoteHeader (perf summary line +
    add-to-list popover), DiscoverStrip, PriceChart (lightweight-charts, with **dropdown**
    chart-type / indicators / compare menus above a range-button row, and a **Compare**
    multi-ticker % overlay), StatsGrid (dense label→value grid), RelatedStocks, AboutCompany,
    FinancialsTab (annual key metrics + chart), PortfolioSummary / HoldingsTable / AddHoldingForm,
    plus Sparkline + ChangeBadge primitives.
  - `lib/` — the shared API contract (`types.ts`), formatters (`format.ts`), fetch client (`api.ts`),
    and `userData.tsx` (a `UserDataProvider` + `useWatchlists()` / `usePortfolios()` hooks that
    hold watchlist/portfolio state for the sidebar and pages).
  - `index.css` — the design system (Google-Finance-style tokens; **light theme by default**,
    dark via `[data-theme="dark"]`).

## Features

- **Persistent watchlists** — create multiple named lists, add/remove symbols from the sidebar,
  the watchlist page, or the stock header's add-to-list popover. Lists persist across restarts.
- **Manual portfolios** — track holdings (quantity + average cost) entered by hand and see live
  market value, total and per-position gain/loss, day change, and weights. Portfolios are
  **manual-entry only** and are not linked to any broker account.
- **Market trends** — dedicated pages for the most active stocks, top gainers/losers, and the
  market indices, with a liquid/VN30 universe toggle.
- **Add-to-list from the stock header** and a **Discover** strip on the home page for quick
  navigation into sectors and bluechips.

Watchlists and portfolios are persisted in the shared Azoth SQLite database (`~/.azoth/azoth.db`)
under `web_*` tables — no separate datastore, no broker credentials.

## Prerequisites

Install the **Azoth root** dependencies first (the server imports `../src`):

```bash
# from the repo root
pnpm install
```

Then install the web app's own dependencies:

```bash
# from web/
pnpm install
```

## Run

```bash
# from web/ — starts the API server (:8787) and Vite (:5273) together
pnpm dev
```

Open http://localhost:5273. Vite proxies `/api` → `http://localhost:8787`.

Run the pieces individually if you prefer:

```bash
pnpm server   # API server only (:8787)
pnpm client   # Vite dev server only (:5273)
```

## Build

```bash
pnpm build     # tsc + vite build → dist/
pnpm typecheck # type-check the frontend
```

## API endpoints

| Endpoint | Description |
| --- | --- |
| `GET /api/indices` | VN-Index, VN30, HNX-Index, HNX30, UPCOM with sparklines |
| `GET /api/index/:symbol` | Index detail: digest + constituents ranked by daily move (`hasConstituents` is false for HNX/HNX30/UPCOM) |
| `GET /api/index/:symbol/ohlcv?range=1D..MAX` | Index chart bars; `prevClose` is the prior session close for intraday ranges |
| `GET /api/movers?kind=gainers\|losers\|active&universe=vn30` | Top movers (used by `/markets`) |
| `GET /api/sectors` | Stock sectors for the sidebar rail: per-sector avg daily % change, a synthetic rebased-index sparkline, and top leaders, sorted by % change |
| `GET /api/sector/:key` | Sector detail: avg daily % change, synthetic index sparkline, and members ranked by daily move |
| `GET /api/watchlist` | Sidebar watchlist rows |
| `GET /api/market-news` | Aggregated market news feed (home market summary) |
| `GET /api/search?q=` | Ticker/name search |
| `GET /api/quote/:ticker` | Quote header + stats (incl. `change_pct_1m` / `_3m` / `_ytd` perf fields) |
| `GET /api/ohlcv/:ticker?range=1D..MAX` | Candles/area chart data |
| `GET /api/indicators/:ticker?range=` | SMA/EMA/Bollinger/RSI/MACD |
| `GET /api/news/:ticker` | Ticker news |
| `GET /api/about/:ticker` | Company profile + related stocks |
| `GET /api/financials/:ticker?period=annual` | Annual key metrics (EPS, BVPS, ROE, ROA, margins, P/E) from CafeF |

### Persistent (SQLite-backed `web_*` tables)

User watchlists:

| Endpoint | Description |
| --- | --- |
| `GET /api/watchlists` | All watchlists (id, name, tickers) |
| `POST /api/watchlists` `{name}` | Create a watchlist |
| `GET /api/watchlists/:id` | One watchlist with live quote rows |
| `PATCH /api/watchlists/:id` `{name}` | Rename a watchlist |
| `DELETE /api/watchlists/:id` | Delete a watchlist |
| `POST /api/watchlists/:id/items` `{ticker}` | Add a symbol |
| `DELETE /api/watchlists/:id/items/:ticker` | Remove a symbol |

Manual portfolios (not broker-linked):

| Endpoint | Description |
| --- | --- |
| `GET /api/portfolios` | All portfolios (id, name) |
| `POST /api/portfolios` `{name}` | Create a portfolio |
| `GET /api/portfolios/:id` | One portfolio with computed holdings + totals |
| `PATCH /api/portfolios/:id` `{name}` | Rename a portfolio |
| `DELETE /api/portfolios/:id` | Delete a portfolio |
| `POST /api/portfolios/:id/holdings` `{ticker,quantity,avgCostVnd}` | Add a holding |
| `PATCH /api/holdings/:id` `{quantity?,avgCostVnd?}` | Edit a holding |
| `DELETE /api/holdings/:id` | Remove a holding |

## Notes on units (Vietnam market)

- Board prices (last/ref/ceiling/floor/open/high/low/EPS/BVPS) are in **thousand VND**
  (28.5 = 28,500 VND). The frontend formatters scale to full VND (`28,500 ₫`).
- SSI iBoard returns ref/ceiling/floor in **plain VND**; the server normalizes them to
  board units (÷1000) so everything shares one scale.
- Market cap and portfolio money aggregates (market value, cost basis, gain, day change — every
  field ending in `Vnd`) are in **plain VND**; volume is in shares. Portfolio holding cost
  (`avgCostVnd`) is entered and stored as plain VND per share (a buy at 64,800 ₫ is `64800`).
- The intraday chart shifts timestamps +7h so the axis shows Vietnam exchange time (ICT).

## Scope

This is a data/visualization surface. The "Research" (AI) panel is a visual preview —
Azoth's AI analyst, ordering, backtesting, and broker workflows live in the terminal CLI.
The Portfolio page is **manual entry** (holdings you type in, priced with live market data);
broker-linked positions and cash (which need broker auth) are intentionally not wired here.
