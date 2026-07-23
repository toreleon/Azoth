# Azoth Finance — web dashboard

A Google-Finance-style web dashboard for Azoth's Vietnam-market data (HOSE/HNX/UPCOM).
It reuses Azoth's existing data layer (`src/data/sources/**`, DNSE/SSI/VNDirect/CafeF)
through a thin Node API server, and renders a React frontend that clones Google
Finance's information architecture and visual language (light + dark).

## What's here

- **`server/index.ts`** — a dependency-light Node `http` API server. It imports Azoth's
  `src/**` data clients directly and exposes JSON under `/api/*`. Data is TTL-cached via
  Azoth's SQLite cache (`~/.azoth/azoth.db`). No secrets required — all sources are public.
- **`src/`** — Vite + React + TypeScript frontend.
  - `pages/Home.tsx` — market-indices strip, VN30 movers (gainers/losers/active), market news.
  - `pages/Quote.tsx` — price header, interactive chart, then **Overview / Financials / News tabs**.
  - `components/` — TopNav (search + theme toggle), Sidebar (watchlist), ResearchPanel,
    MarketStrip/IndexCard, MoversTable, NewsList, QuoteHeader, PriceChart (lightweight-charts,
    with **Compare** multi-ticker % overlay), StatsGrid, RelatedStocks, AboutCompany,
    FinancialsTab (annual key metrics + chart), plus Sparkline + ChangeBadge primitives.
  - `lib/` — the shared API contract (`types.ts`), formatters (`format.ts`), and fetch client (`api.ts`).
  - `index.css` — the design system (Google-Finance-style tokens; light + dark themes).

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
| `GET /api/movers?kind=gainers\|losers\|active&universe=vn30` | Top movers |
| `GET /api/watchlist` | Sidebar watchlist rows |
| `GET /api/market-news` | Aggregated market news feed |
| `GET /api/search?q=` | Ticker/name search |
| `GET /api/quote/:ticker` | Quote header + stats |
| `GET /api/ohlcv/:ticker?range=1D..MAX` | Candles/area chart data |
| `GET /api/indicators/:ticker?range=` | SMA/EMA/Bollinger/RSI/MACD |
| `GET /api/news/:ticker` | Ticker news |
| `GET /api/about/:ticker` | Company profile + related stocks |
| `GET /api/financials/:ticker?period=annual` | Annual key metrics (EPS, BVPS, ROE, ROA, margins, P/E) from CafeF |

## Notes on units (Vietnam market)

- Board prices (last/ref/ceiling/floor/open/high/low/EPS/BVPS) are in **thousand VND**
  (28.5 = 28,500 VND). The frontend formatters scale to full VND (`28,500 ₫`).
- SSI iBoard returns ref/ceiling/floor in **plain VND**; the server normalizes them to
  board units (÷1000) so everything shares one scale.
- Market cap is in plain VND; volume is in shares.
- The intraday chart shifts timestamps +7h so the axis shows Vietnam exchange time (ICT).

## Scope

This is a data/visualization surface. The "Research" (AI) panel is a visual preview —
Azoth's AI analyst, ordering, backtesting, and broker workflows live in the terminal CLI.
Live portfolio/positions (which need broker auth) are intentionally not wired here.
