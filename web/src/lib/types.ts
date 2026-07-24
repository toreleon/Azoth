// Shared API contract between the Node data server (server/index.ts) and the
// React frontend. Every field the UI renders is defined here.
//
// UNITS: Vietnam board prices (last / ref / ceiling / floor / open / high / low /
// week52_* / spark values / eps / bvps) are in THOUSAND VND — e.g. 28.5 = 28,500 VND.
// Monetary aggregates (market_cap_vnd, notional) are in plain VND. Volume is in shares.

export type RangeKey = "1D" | "5D" | "1M" | "6M" | "YTD" | "1Y" | "5Y" | "MAX";

export const RANGE_KEYS: RangeKey[] = ["1D", "5D", "1M", "6M", "YTD", "1Y", "5Y", "MAX"];

/** Market session, derived from Vietnam trading hours (ICT). */
export type MarketState =
  | "pre-open"
  | "morning"
  | "lunch"
  | "afternoon"
  | "atc"
  | "after-hours"
  | "weekend";

// ---------------------------------------------------------------------------
// Indices (market strip)
// ---------------------------------------------------------------------------

export interface IndexSnapshot {
  symbol: string; // VNINDEX, VN30, HNXINDEX, HNX30, UPCOMINDEX
  name: string; // display name, e.g. "VN-Index"
  latest_close: number;
  latest_time: string; // ISO
  change_abs: number | null; // absolute, index points
  change_pct_1d: number | null;
  change_pct_1w: number | null;
  change_pct_1m: number | null;
  spark: number[]; // recent closes for the mini sparkline
}

export interface IndicesResponse {
  indices: IndexSnapshot[];
  asOf: string; // ISO
}

/** A member of an index, ranked by daily move on the index detail page. */
export interface IndexConstituent {
  ticker: string;
  name?: string;
  last: number | null; // thousand VND
  change_pct: number | null;
  spark: number[];
}

/**
 * Index detail (/index/:symbol). `hasConstituents` is false for HNX/HNX30/UPCOM,
 * where no constituent list is available from our sources.
 */
export interface IndexDetailResponse extends IndexSnapshot {
  hasConstituents: boolean;
  constituents: IndexConstituent[];
}

/** Index chart bars — mirrors OhlcvResponse but keyed by index symbol. */
export interface IndexOhlcvResponse {
  symbol: string;
  name: string;
  range: RangeKey;
  resolution: string;
  intraday: boolean;
  prevClose: number | null;
  bars: Bar[];
}

// ---------------------------------------------------------------------------
// Movers / discover
// ---------------------------------------------------------------------------

export interface MoverRow {
  ticker: string;
  name?: string;
  last: number | null; // thousand VND
  change_pct: number | null; // daily %
  ret_1w_pct: number | null;
  ret_1m_pct: number | null;
  spark: number[];
}

export interface MoversResponse {
  kind: "gainers" | "losers" | "active";
  universe: string;
  rows: MoverRow[];
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export interface SearchResult {
  ticker: string;
  name?: string;
  exchange?: string;
}

export interface SearchResponse {
  query: string;
  results: SearchResult[];
}

// ---------------------------------------------------------------------------
// Watchlist (sidebar) — lightweight quote rows with sparkline
// ---------------------------------------------------------------------------

export interface WatchRow {
  ticker: string;
  name?: string;
  last: number | null; // thousand VND
  change_abs: number | null; // thousand VND
  change_pct: number | null;
  spark: number[];
}

export interface WatchlistResponse {
  title: string;
  rows: WatchRow[];
}

// ---------------------------------------------------------------------------
// Quote (detail header + stats)
// ---------------------------------------------------------------------------

export interface QuoteStats {
  open: number | null; // thousand VND
  high: number | null; // thousand VND
  low: number | null; // thousand VND
  volume: number | null; // shares (latest session)
  avg_vol: number | null; // shares (avg over ~3m)
  market_cap_vnd: number | null; // VND
  pe: number | null;
  pb: number | null;
  ps: number | null;
  eps_thousand_vnd: number | null;
  bvps_thousand_vnd: number | null;
  roe_pct: number | null;
  roa_pct: number | null;
  dividend_yield_pct: number | null;
  shares_outstanding: number | null;
  foreign_ownership_pct: number | null;
  week52_high: number | null; // thousand VND
  week52_low: number | null; // thousand VND
  change_pct_1m: number | null; // performance over ~1 month
  change_pct_3m: number | null; // performance over ~3 months
  change_pct_ytd: number | null; // performance year-to-date
}

export interface QuoteResponse {
  ticker: string;
  exchange: string | null;
  nameVi: string | null;
  nameEn: string | null;
  currency: "VND";
  priceScale: number; // 1000 — board price * priceScale = VND
  ref: number | null; // reference / prev close proxy (thousand VND)
  ceiling: number | null;
  floor: number | null;
  last: number | null; // thousand VND
  change_abs: number | null; // vs ref, thousand VND
  change_pct: number | null; // vs ref
  session: MarketState;
  isOpen: boolean;
  stats: QuoteStats;
}

// ---------------------------------------------------------------------------
// OHLCV (chart)
// ---------------------------------------------------------------------------

export interface Bar {
  time: number; // unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface OhlcvResponse {
  ticker: string;
  range: RangeKey;
  resolution: string;
  intraday: boolean;
  prevClose: number | null; // baseline for the dashed "previous close" line
  bars: Bar[];
}

// ---------------------------------------------------------------------------
// Indicators (chart overlays + oscillator panes)
// ---------------------------------------------------------------------------

export interface LinePoint {
  time: number;
  value: number;
}

export interface BollingerPoint {
  time: number;
  upper: number;
  middle: number;
  lower: number;
}

export interface MacdPoint {
  time: number;
  macd: number;
  signal: number;
  histogram: number;
}

export interface IndicatorsResponse {
  ticker: string;
  range: RangeKey;
  sma20: LinePoint[];
  sma50: LinePoint[];
  ema20: LinePoint[];
  bollinger: BollingerPoint[];
  rsi14: LinePoint[];
  macd: MacdPoint[];
}

// ---------------------------------------------------------------------------
// News
// ---------------------------------------------------------------------------

export interface NewsItem {
  title: string;
  url?: string;
  publishedAt?: string; // ISO
  source?: string;
  snippet?: string;
  type?: string;
}

export interface NewsResponse {
  ticker: string;
  items: NewsItem[];
}

// ---------------------------------------------------------------------------
// Company / about + related
// ---------------------------------------------------------------------------

export interface CompanyInfo {
  nameVi?: string;
  nameEn?: string;
  floor?: string;
  website?: string;
  summary?: string;
  intro?: string;
  sector?: string;
}

export interface RelatedStock {
  ticker: string;
  name?: string;
  last: number | null; // thousand VND
  change_pct: number | null;
  spark: number[];
}

export interface AboutResponse {
  ticker: string;
  company: CompanyInfo;
  related: RelatedStock[];
}

// ---------------------------------------------------------------------------
// Financials (quarterly / annual key metrics)
// ---------------------------------------------------------------------------

export type FinancialUnit = "kVND" | "%" | "x";

export interface FinancialsColumn {
  label: string; // "Q2 2025" or "2025"
  year: number | null;
  quarter: number | null;
}

export interface FinancialMetric {
  key: string;
  label: string;
  unit: FinancialUnit;
  values: (number | null)[]; // aligned to columns
}

export interface FinancialsResponse {
  ticker: string;
  period: "quarterly" | "annual";
  columns: FinancialsColumn[];
  metrics: FinancialMetric[];
}

// ---------------------------------------------------------------------------
// Market news (home feed)
// ---------------------------------------------------------------------------

export interface MarketNewsResponse {
  items: NewsItem[];
}

// ---------------------------------------------------------------------------
// Stock sectors (home sidebar — mini index list)
// ---------------------------------------------------------------------------

export interface SectorRow {
  key: string;
  name: string;
  change_pct: number | null; // avg daily % change of constituents
  spark: number[]; // synthetic normalized index (rebased to 100, averaged)
  leaders: string[]; // up to 3 constituent tickers by |change|
}

export interface SectorsResponse {
  sectors: SectorRow[];
  asOf: string; // ISO
}

// ---------------------------------------------------------------------------
// Watchlists (user-managed, SQLite-backed)
// ---------------------------------------------------------------------------

export interface WatchlistMeta {
  id: number;
  name: string;
  tickers: string[];
}

export interface WatchlistsResponse {
  watchlists: WatchlistMeta[];
}

export interface WatchlistDetail {
  id: number;
  name: string;
  rows: WatchRow[]; // WatchRow (above) with live quote + sparkline
}

// ---------------------------------------------------------------------------
// Portfolios (manual holdings, Google-Finance style — NOT broker-linked)
// ---------------------------------------------------------------------------

export interface PortfolioMeta {
  id: number;
  name: string;
}

export interface PortfoliosResponse {
  portfolios: PortfolioMeta[];
}

export interface HoldingInput {
  ticker: string;
  quantity: number;
  avgCostVnd: number; // plain VND / share
}

export interface HoldingRow {
  id: number;
  ticker: string;
  name?: string;
  quantity: number;
  avgCostVnd: number; // plain VND / share
  last: number | null; // board units (thousand VND)
  change_pct: number | null; // day %
  marketValueVnd: number | null; // plain VND
  costBasisVnd: number; // plain VND
  gainVnd: number | null; // plain VND
  gainPct: number | null;
  dayChangeVnd: number | null; // plain VND
  weightPct: number | null;
  spark: number[];
}

export interface PortfolioTotals {
  marketValueVnd: number | null; // plain VND
  costBasisVnd: number; // plain VND
  gainVnd: number | null; // plain VND
  gainPct: number | null;
  dayChangeVnd: number | null; // plain VND
  dayChangePct: number | null;
}

export interface PortfolioResponse {
  id: number;
  name: string;
  holdings: HoldingRow[];
  totals: PortfolioTotals;
}
