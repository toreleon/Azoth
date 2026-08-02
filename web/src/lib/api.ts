// Typed fetch client for the Azoth data server. All endpoints are served under /api
// (proxied to the Node server in dev by vite.config.ts).

import type {
  AboutResponse,
  FinancialsResponse,
  HoldingInput,
  IndicatorsResponse,
  IndicesResponse,
  MarketNewsResponse,
  MoversResponse,
  NewsResponse,
  OhlcvResponse,
  PortfolioMeta,
  PortfolioResponse,
  PortfoliosResponse,
  QuoteResponse,
  RangeKey,
  SearchResponse,
  SectorsResponse,
  WatchlistDetail,
  WatchlistMeta,
  WatchlistResponse,
  WatchlistsResponse,
} from "./types";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
}

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(path, { signal, headers: { accept: "application/json" } });
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body?.error) msg = body.error;
    } catch {
      /* ignore parse errors */
    }
    throw new ApiError(res.status, msg);
  }
  return (await res.json()) as T;
}

async function mutate<T>(
  method: "POST" | "PATCH" | "DELETE" | "PUT",
  path: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const res = await fetch(path, {
    method,
    signal,
    headers: {
      accept: "application/json",
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    try {
      const b = (await res.json()) as { error?: string };
      if (b?.error) msg = b.error;
    } catch {
      /* ignore parse errors */
    }
    throw new ApiError(res.status, msg);
  }
  return (await res.json()) as T;
}

export const api = {
  indices: (signal?: AbortSignal) => getJson<IndicesResponse>("/api/indices", signal),

  movers: (kind: "gainers" | "losers" | "active", universe = "vn30", signal?: AbortSignal) =>
    getJson<MoversResponse>(`/api/movers?kind=${kind}&universe=${encodeURIComponent(universe)}`, signal),

  watchlist: (signal?: AbortSignal) => getJson<WatchlistResponse>("/api/watchlist", signal),

  marketNews: (signal?: AbortSignal) => getJson<MarketNewsResponse>("/api/market-news", signal),

  sectors: (signal?: AbortSignal) => getJson<SectorsResponse>("/api/sectors", signal),

  search: (q: string, signal?: AbortSignal) =>
    getJson<SearchResponse>(`/api/search?q=${encodeURIComponent(q)}`, signal),

  quote: (ticker: string, signal?: AbortSignal) =>
    getJson<QuoteResponse>(`/api/quote/${encodeURIComponent(ticker)}`, signal),

  ohlcv: (ticker: string, range: RangeKey, signal?: AbortSignal) =>
    getJson<OhlcvResponse>(`/api/ohlcv/${encodeURIComponent(ticker)}?range=${range}`, signal),

  indicators: (ticker: string, range: RangeKey, signal?: AbortSignal) =>
    getJson<IndicatorsResponse>(`/api/indicators/${encodeURIComponent(ticker)}?range=${range}`, signal),

  news: (ticker: string, signal?: AbortSignal) =>
    getJson<NewsResponse>(`/api/news/${encodeURIComponent(ticker)}`, signal),

  about: (ticker: string, signal?: AbortSignal) =>
    getJson<AboutResponse>(`/api/about/${encodeURIComponent(ticker)}`, signal),

  financials: (ticker: string, period: "quarterly" | "annual", signal?: AbortSignal) =>
    getJson<FinancialsResponse>(
      `/api/financials/${encodeURIComponent(ticker)}?period=${period}`,
      signal,
    ),

  // User-managed watchlists (SQLite-backed).
  watchlists: {
    list: (signal?: AbortSignal) => getJson<WatchlistsResponse>("/api/watchlists", signal),

    get: (id: number, signal?: AbortSignal) =>
      getJson<WatchlistDetail>(`/api/watchlists/${id}`, signal),

    create: (name: string) =>
      mutate<WatchlistMeta>("POST", "/api/watchlists", { name }),

    rename: (id: number, name: string) =>
      mutate<WatchlistMeta>("PATCH", `/api/watchlists/${id}`, { name }),

    remove: (id: number) => mutate<{ ok: true }>("DELETE", `/api/watchlists/${id}`),

    addItem: (id: number, ticker: string) =>
      mutate<WatchlistMeta>("POST", `/api/watchlists/${id}/items`, { ticker }),

    removeItem: (id: number, ticker: string) =>
      mutate<WatchlistMeta>(
        "DELETE",
        `/api/watchlists/${id}/items/${encodeURIComponent(ticker)}`,
      ),
  },

  // Manual portfolios (Google-Finance style — not broker-linked).
  portfolios: {
    list: (signal?: AbortSignal) => getJson<PortfoliosResponse>("/api/portfolios", signal),

    get: (id: number, signal?: AbortSignal) =>
      getJson<PortfolioResponse>(`/api/portfolios/${id}`, signal),

    create: (name: string) => mutate<PortfolioMeta>("POST", "/api/portfolios", { name }),

    rename: (id: number, name: string) =>
      mutate<PortfolioMeta>("PATCH", `/api/portfolios/${id}`, { name }),

    remove: (id: number) => mutate<{ ok: true }>("DELETE", `/api/portfolios/${id}`),

    addHolding: (id: number, input: HoldingInput) =>
      mutate<{ ok: true }>("POST", `/api/portfolios/${id}/holdings`, input),

    updateHolding: (holdingId: number, patch: Partial<HoldingInput>) =>
      mutate<{ ok: true }>("PATCH", `/api/holdings/${holdingId}`, patch),

    removeHolding: (holdingId: number) =>
      mutate<{ ok: true }>("DELETE", `/api/holdings/${holdingId}`),
  },
};
