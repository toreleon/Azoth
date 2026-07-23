// Typed fetch client for the Azoth data server. All endpoints are served under /api
// (proxied to the Node server in dev by vite.config.ts).

import type {
  AboutResponse,
  FinancialsResponse,
  IndicatorsResponse,
  IndicesResponse,
  MarketNewsResponse,
  MoversResponse,
  NewsResponse,
  OhlcvResponse,
  QuoteResponse,
  RangeKey,
  SearchResponse,
  WatchlistResponse,
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

export const api = {
  indices: (signal?: AbortSignal) => getJson<IndicesResponse>("/api/indices", signal),

  movers: (kind: "gainers" | "losers" | "active", universe = "vn30", signal?: AbortSignal) =>
    getJson<MoversResponse>(`/api/movers?kind=${kind}&universe=${encodeURIComponent(universe)}`, signal),

  watchlist: (signal?: AbortSignal) => getJson<WatchlistResponse>("/api/watchlist", signal),

  marketNews: (signal?: AbortSignal) => getJson<MarketNewsResponse>("/api/market-news", signal),

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
};
