/**
 * Azoth Finance — data server.
 *
 * A dependency-light Node http server that reuses Azoth's existing Vietnam-market
 * data layer (src/data/sources/**, src/tools/**) and exposes it as JSON under /api
 * for the React dashboard. Run with: pnpm server  (tsx watch server/index.ts)
 *
 * All prices from DNSE/SSI are in THOUSAND VND (28.5 = 28,500 VND); we pass them
 * through unscaled and let the frontend format. Market cap is plain VND.
 */
import http from "node:http";
import { RSI, MACD, SMA, EMA, BollingerBands } from "technicalindicators";

import { cached } from "../../src/data/cache.js";
import { getDb } from "../../src/storage/db.js";
import {
  getStockOhlcv,
  getIndexOhlcv,
  type Bar,
  type Resolution,
} from "../../src/data/sources/dnsePublic.js";
import { getQuote } from "../../src/data/sources/ssiIboard.js";
import {
  getRatio,
  RATIOS,
  getCompanyProfile,
  getCompanyProfilesByFloor,
  type ListedExchange,
} from "../../src/data/sources/vndirectFinfo.js";
import {
  getTickerNews,
  getCompanyIntro,
  getFinancialRatios,
} from "../../src/data/sources/cafef.js";
import { TICKER_UNIVERSES } from "../../src/tools/discover.js";
import {
  ensureWebSchema,
  listWatchlists,
  getWatchlistMeta,
  createWatchlist,
  renameWatchlist,
  deleteWatchlist,
  addWatchlistItem,
  removeWatchlistItem,
  listPortfolios,
  getPortfolio,
  createPortfolio,
  renamePortfolio,
  deletePortfolio,
  getHoldings,
  addHolding,
  updateHolding,
  deleteHolding,
} from "./store.js";

const PORT = Number(process.env.AZOTH_WEB_PORT ?? 8787);
const DAY = 86400;

function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

// ---------------------------------------------------------------------------
// Small utilities
// ---------------------------------------------------------------------------

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]!);
    }
  });
  await Promise.all(workers);
  return out;
}

function pct(now: number | undefined, prev: number | undefined): number | null {
  if (now == null || prev == null || prev === 0) return null;
  return ((now - prev) / prev) * 100;
}

/**
 * SSI iBoard returns ref/ceiling/floor in plain VND (e.g. 64600), whereas DNSE
 * OHLCV closes are in THOUSAND VND (64.8). Normalize SSI values to board units
 * (thousand VND) so everything downstream shares one scale.
 */
function ssiBoard(v: number | null | undefined): number | null {
  return v != null && Number.isFinite(v) && v > 0 ? v / 1000 : null;
}

function round(v: number | null | undefined, digits = 2): number | null {
  if (v == null || !Number.isFinite(v)) return null;
  const f = 10 ** digits;
  return Math.round(v * f) / f;
}

// ---------------------------------------------------------------------------
// Market session (Vietnam / ICT, UTC+7)
// ---------------------------------------------------------------------------

type MarketState =
  | "pre-open"
  | "morning"
  | "lunch"
  | "afternoon"
  | "atc"
  | "after-hours"
  | "weekend";

function marketSession(): { session: MarketState; isOpen: boolean } {
  const ict = new Date(Date.now() + 7 * 3600 * 1000);
  const day = ict.getUTCDay(); // 0 Sun .. 6 Sat
  const minutes = ict.getUTCHours() * 60 + ict.getUTCMinutes();
  if (day === 0 || day === 6) return { session: "weekend", isOpen: false };
  if (minutes < 9 * 60) return { session: "pre-open", isOpen: false };
  if (minutes < 11 * 60 + 30) return { session: "morning", isOpen: true };
  if (minutes < 13 * 60) return { session: "lunch", isOpen: false };
  if (minutes < 14 * 60 + 30) return { session: "afternoon", isOpen: true };
  if (minutes < 14 * 60 + 45) return { session: "atc", isOpen: true };
  return { session: "after-hours", isOpen: false };
}

// ---------------------------------------------------------------------------
// Core data helpers (cached)
// ---------------------------------------------------------------------------

/** Daily bars for a stock over `days`, cached (10 min TTL). */
async function dailyBars(ticker: string, days: number): Promise<Bar[]> {
  const to = nowSec();
  const from = to - days * DAY;
  const bucket = new Date(to * 1000).toISOString().slice(0, 10);
  const key = `web:daily:${ticker}:${days}:${bucket}`;
  return cached(key, 600, () => getStockOhlcv(ticker, "1D", from, to));
}

/** Daily bars for an index over `days`, cached. */
async function dailyIndexBars(symbol: string, days: number): Promise<Bar[]> {
  const to = nowSec();
  const from = to - days * DAY;
  const bucket = new Date(to * 1000).toISOString().slice(0, 10);
  const key = `web:idxdaily:${symbol}:${days}:${bucket}`;
  return cached(key, 300, () => getIndexOhlcv(symbol, "1D", from, to));
}

interface MiniDigest {
  ticker: string;
  last: number | null;
  prevClose: number | null;
  changeAbs: number | null;
  changePct: number | null;
  spark: number[];
  volume: number | null;
}

/** Last close, prev close, change, and a 30-point sparkline for a stock. */
async function miniDigest(ticker: string): Promise<MiniDigest> {
  const bars = await dailyBars(ticker, 60).catch(() => [] as Bar[]);
  if (!bars.length) {
    return { ticker, last: null, prevClose: null, changeAbs: null, changePct: null, spark: [], volume: null };
  }
  const last = bars[bars.length - 1]!;
  const prev = bars[bars.length - 2];
  const changeAbs = prev ? last.close - prev.close : null;
  return {
    ticker,
    last: last.close,
    prevClose: prev?.close ?? null,
    changeAbs: changeAbs == null ? null : round(changeAbs, 3),
    changePct: round(pct(last.close, prev?.close), 2),
    spark: bars.slice(-30).map((b) => b.close),
    volume: last.volume,
  };
}

const INDEX_NAMES: Record<string, string> = {
  VNINDEX: "VN-Index",
  VN30: "VN30",
  HNX: "HNX-Index",
  HNX30: "HNX30",
  UPCOM: "UPCOM",
};

async function indexDigest(symbol: string) {
  const bars = await dailyIndexBars(symbol, 60).catch(() => [] as Bar[]);
  if (!bars.length) return null;
  const last = bars[bars.length - 1]!;
  const prev1 = bars[bars.length - 2];
  const prev5 = bars[bars.length - 6];
  const prev22 = bars[bars.length - 23];
  return {
    symbol,
    name: INDEX_NAMES[symbol] ?? symbol,
    latest_close: round(last.close, 2)!,
    latest_time: new Date(last.time * 1000).toISOString(),
    change_abs: prev1 ? round(last.close - prev1.close, 2) : null,
    change_pct_1d: round(pct(last.close, prev1?.close), 2),
    change_pct_1w: round(pct(last.close, prev5?.close), 2),
    change_pct_1m: round(pct(last.close, prev22?.close), 2),
    spark: bars.slice(-30).map((b) => b.close),
  };
}

// ---------------------------------------------------------------------------
// Ticker → name index (for search + labels), cached 24h
// ---------------------------------------------------------------------------

interface NameEntry {
  ticker: string;
  name: string;
  exchange: string;
}

async function nameIndex(): Promise<NameEntry[]> {
  return cached("web:nameindex:v1", 24 * 3600, async () => {
    const floors: ListedExchange[] = ["HOSE", "HNX", "UPCOM"];
    const chunks = await Promise.all(
      floors.map((f) => getCompanyProfilesByFloor(f, 1000).catch(() => [])),
    );
    const seen = new Set<string>();
    const out: NameEntry[] = [];
    for (const chunk of chunks) {
      for (const p of chunk) {
        const code = (p.code ?? "").toUpperCase();
        if (!/^[A-Z]{3}$/.test(code) || seen.has(code)) continue;
        seen.add(code);
        out.push({ ticker: code, name: p.enName || p.vnName || code, exchange: p.floor ?? "" });
      }
    }
    return out;
  });
}

async function nameFor(ticker: string): Promise<string | undefined> {
  const idx = await nameIndex().catch(() => [] as NameEntry[]);
  return idx.find((e) => e.ticker === ticker)?.name;
}

// ---------------------------------------------------------------------------
// Range → resolution mapping for the chart
// ---------------------------------------------------------------------------

type RangeKey = "1D" | "5D" | "1M" | "6M" | "YTD" | "1Y" | "5Y" | "MAX";

function rangeToPlan(range: RangeKey): { resolution: Resolution; fromSec: number; intraday: boolean } {
  const to = nowSec();
  switch (range) {
    case "1D":
      return { resolution: "1", fromSec: to - 5 * DAY, intraday: true };
    case "5D":
      return { resolution: "15", fromSec: to - 9 * DAY, intraday: true };
    case "1M":
      return { resolution: "1H", fromSec: to - 40 * DAY, intraday: true };
    case "6M":
      return { resolution: "1D", fromSec: to - 200 * DAY, intraday: false };
    case "YTD": {
      const jan1 = Date.UTC(new Date().getUTCFullYear(), 0, 1) / 1000;
      return { resolution: "1D", fromSec: jan1, intraday: false };
    }
    case "1Y":
      return { resolution: "1D", fromSec: to - 400 * DAY, intraday: false };
    case "5Y":
      return { resolution: "1W", fromSec: to - 5 * 380 * DAY, intraday: false };
    case "MAX":
      return { resolution: "1M", fromSec: to - 30 * 380 * DAY, intraday: false };
  }
}

/** For a 1D range, keep only bars from the latest calendar day present. */
function lastSessionOnly(bars: Bar[]): Bar[] {
  if (!bars.length) return bars;
  const lastDay = new Date(bars[bars.length - 1]!.time * 1000).toISOString().slice(0, 10);
  return bars.filter((b) => new Date(b.time * 1000).toISOString().slice(0, 10) === lastDay);
}

// ---------------------------------------------------------------------------
// Indicators
// ---------------------------------------------------------------------------

function alignLine(values: number[], out: number[], bars: Bar[]) {
  const offset = values.length - out.length;
  return out
    .map((v, k) => ({ time: bars[offset + k]!.time, value: round(v, 3)! }))
    .filter((p) => p.value != null && Number.isFinite(p.value));
}

function computeIndicators(bars: Bar[]) {
  const closes = bars.map((b) => b.close);
  const empty = { sma20: [], sma50: [], ema20: [], bollinger: [], rsi14: [], macd: [] };
  if (closes.length < 20) return empty;

  const sma20 = closes.length >= 20 ? alignLine(closes, SMA.calculate({ period: 20, values: closes }), bars) : [];
  const sma50 = closes.length >= 50 ? alignLine(closes, SMA.calculate({ period: 50, values: closes }), bars) : [];
  const ema20 = closes.length >= 20 ? alignLine(closes, EMA.calculate({ period: 20, values: closes }), bars) : [];

  const bbRaw = closes.length >= 20 ? BollingerBands.calculate({ period: 20, stdDev: 2, values: closes }) : [];
  const bbOffset = closes.length - bbRaw.length;
  const bollinger = bbRaw.map((b, k) => ({
    time: bars[bbOffset + k]!.time,
    upper: round(b.upper, 3)!,
    middle: round(b.middle, 3)!,
    lower: round(b.lower, 3)!,
  }));

  const rsiRaw = closes.length >= 15 ? RSI.calculate({ period: 14, values: closes }) : [];
  const rsi14 = alignLine(closes, rsiRaw, bars);

  const macdRaw =
    closes.length >= 35
      ? MACD.calculate({
          values: closes,
          fastPeriod: 12,
          slowPeriod: 26,
          signalPeriod: 9,
          SimpleMAOscillator: false,
          SimpleMASignal: false,
        })
      : [];
  const macdOffset = closes.length - macdRaw.length;
  const macd = macdRaw
    .map((m, k) => ({
      time: bars[macdOffset + k]!.time,
      macd: round(m.MACD, 3),
      signal: round(m.signal, 3),
      histogram: round(m.histogram, 3),
    }))
    .filter((m) => m.macd != null && m.signal != null) as {
    time: number;
    macd: number;
    signal: number;
    histogram: number;
  }[];

  return { sma20, sma50, ema20, bollinger, rsi14, macd };
}

// ---------------------------------------------------------------------------
// Endpoint handlers
// ---------------------------------------------------------------------------

async function handleIndices() {
  const symbols = ["VNINDEX", "VN30", "HNX", "HNX30", "UPCOM"];
  const snaps = await Promise.all(symbols.map(indexDigest));
  return { indices: snaps.filter(Boolean), asOf: new Date().toISOString() };
}

function resolveUniverse(universe: string): string[] {
  const u = universe.toLowerCase();
  const known = TICKER_UNIVERSES as Record<string, readonly string[]>;
  if (known[u]) return [...known[u]!];
  if (u === "vn30" && known.vn30) return [...known.vn30];
  return [...(known.default ?? [])];
}

async function handleMovers(kind: string, universe: string) {
  const tickers = resolveUniverse(universe);
  const digests = (await mapLimit(tickers, 8, miniDigest)).filter((d) => d.changePct != null);
  const names = await nameIndex().catch(() => [] as NameEntry[]);
  const nameMap = new Map(names.map((n) => [n.ticker, n.name]));

  let sorted: MiniDigest[];
  if (kind === "losers") sorted = digests.sort((a, b) => (a.changePct ?? 0) - (b.changePct ?? 0));
  else if (kind === "active") sorted = digests.sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0));
  else sorted = digests.sort((a, b) => (b.changePct ?? 0) - (a.changePct ?? 0));

  const rows = sorted.slice(0, 12).map((d) => ({
    ticker: d.ticker,
    name: nameMap.get(d.ticker),
    last: d.last,
    change_pct: d.changePct,
    ret_1w_pct: null,
    ret_1m_pct: null,
    spark: d.spark,
  }));
  return { kind, universe, rows };
}

async function handleWatchlist() {
  const tickers = ["VCB", "FPT", "HPG", "VNM", "VHM", "VIC", "MWG", "GAS", "MBB", "MSN"];
  const digests = await mapLimit(tickers, 8, miniDigest);
  const names = await nameIndex().catch(() => [] as NameEntry[]);
  const nameMap = new Map(names.map((n) => [n.ticker, n.name]));
  const rows = digests.map((d) => ({
    ticker: d.ticker,
    name: nameMap.get(d.ticker),
    last: d.last,
    change_abs: d.changeAbs,
    change_pct: d.changePct,
    spark: d.spark,
  }));
  return { title: "Watchlist", rows };
}

// ---------------------------------------------------------------------------
// User watchlists (persistent) & portfolios
// ---------------------------------------------------------------------------

/** Build WatchRow-shaped rows ({ticker,name,last,change_abs,change_pct,spark}). */
async function watchRowsFor(tickers: string[]) {
  const digests = await mapLimit(tickers, 8, miniDigest);
  const names = await nameIndex().catch(() => [] as NameEntry[]);
  const nameMap = new Map(names.map((n) => [n.ticker, n.name]));
  return digests.map((d) => ({
    ticker: d.ticker,
    name: nameMap.get(d.ticker),
    last: d.last,
    change_abs: d.changeAbs,
    change_pct: d.changePct,
    spark: d.spark,
  }));
}

async function handleWatchlistDetail(id: number) {
  const meta = getWatchlistMeta(id);
  if (!meta) throw new HttpError(404, `watchlist ${id} not found`);
  const rows = meta.tickers.length ? await watchRowsFor(meta.tickers) : [];
  return { id: meta.id, name: meta.name, rows };
}

async function handlePortfolioResponse(id: number) {
  const meta = getPortfolio(id);
  if (!meta) throw new HttpError(404, `portfolio ${id} not found`);
  const holdings = getHoldings(id);
  if (!holdings.length) {
    return {
      id: meta.id,
      name: meta.name,
      holdings: [] as unknown[],
      totals: {
        marketValueVnd: 0,
        costBasisVnd: 0,
        gainVnd: 0,
        gainPct: null,
        dayChangeVnd: 0,
        dayChangePct: null,
      },
    };
  }

  const distinct = [...new Set(holdings.map((h) => h.ticker))];
  const digests = await mapLimit(distinct, 8, miniDigest);
  const digestMap = new Map(digests.map((d) => [d.ticker, d]));
  const names = await nameIndex().catch(() => [] as NameEntry[]);
  const nameMap = new Map(names.map((n) => [n.ticker, n.name]));

  // First pass: per-holding raw values (market value drives the weight denominator).
  const computed = holdings.map((h) => {
    const d = digestMap.get(h.ticker);
    const last = d?.last ?? null;
    const changeAbs = d?.changeAbs ?? null;
    const marketValueVnd = last != null ? h.quantity * last * 1000 : null;
    const costBasisVnd = h.quantity * h.avgCostVnd;
    const gainVnd = marketValueVnd != null ? marketValueVnd - costBasisVnd : null;
    const gainPct = gainVnd != null && costBasisVnd > 0 ? (gainVnd / costBasisVnd) * 100 : null;
    const dayChangeVnd = changeAbs != null ? h.quantity * changeAbs * 1000 : null;
    return { h, d, last, marketValueVnd, costBasisVnd, gainVnd, gainPct, dayChangeVnd };
  });

  const totalMV = computed.reduce((s, c) => s + (c.marketValueVnd ?? 0), 0);

  const holdingRows = computed.map((c) => ({
    id: c.h.id,
    ticker: c.h.ticker,
    name: nameMap.get(c.h.ticker),
    quantity: c.h.quantity,
    avgCostVnd: c.h.avgCostVnd,
    last: c.last == null ? null : round(c.last, 2),
    change_pct: c.d?.changePct ?? null,
    marketValueVnd: c.marketValueVnd == null ? null : round(c.marketValueVnd, 0),
    costBasisVnd: round(c.costBasisVnd, 0)!,
    gainVnd: c.gainVnd == null ? null : round(c.gainVnd, 0),
    gainPct: round(c.gainPct, 2),
    dayChangeVnd: c.dayChangeVnd == null ? null : round(c.dayChangeVnd, 0),
    weightPct:
      c.marketValueVnd != null && totalMV > 0 ? round((c.marketValueVnd / totalMV) * 100, 2) : null,
    spark: c.d?.spark ?? [],
  }));

  const totalCost = computed.reduce((s, c) => s + c.costBasisVnd, 0);
  const totalGain = computed.reduce((s, c) => s + (c.gainVnd ?? 0), 0);
  const totalDayChange = computed.reduce((s, c) => s + (c.dayChangeVnd ?? 0), 0);
  const prevMV = totalMV - totalDayChange;

  const totals = {
    marketValueVnd: round(totalMV, 0),
    costBasisVnd: round(totalCost, 0)!,
    gainVnd: round(totalGain, 0),
    gainPct: totalCost > 0 ? round((totalGain / totalCost) * 100, 2) : null,
    dayChangeVnd: round(totalDayChange, 0),
    dayChangePct: prevMV > 0 ? round((totalDayChange / prevMV) * 100, 2) : null,
  };

  return { id: meta.id, name: meta.name, holdings: holdingRows, totals };
}

async function latestRatio(ticker: string, code: string): Promise<number | null> {
  const arr = await getRatio(ticker, code, 1).catch(() => []);
  return arr[0]?.value ?? null;
}

async function handleQuote(ticker: string) {
  const [quote, bars, intradayBars, fund] = await Promise.all([
    getQuote(ticker).catch(() => null),
    dailyBars(ticker, 400).catch(() => [] as Bar[]),
    cached(`web:last:${ticker}:${Math.floor(nowSec() / 60)}`, 60, () =>
      getStockOhlcv(ticker, "1", nowSec() - 3 * DAY, nowSec()).catch(() => [] as Bar[]),
    ),
    fundamentalsBundle(ticker),
  ]);

  const latestDaily = bars[bars.length - 1];
  const lastIntraday = intradayBars.length ? intradayBars[intradayBars.length - 1]!.close : null;
  const last = lastIntraday ?? latestDaily?.close ?? null;
  const ref = ssiBoard(quote?.ref) ?? bars[bars.length - 2]?.close ?? null;

  const highs = bars.map((b) => b.high);
  const lows = bars.map((b) => b.low);
  const vols = bars.slice(-60).map((b) => b.volume);

  const { session, isOpen } = marketSession();

  return {
    ticker,
    exchange: quote?.exchange ?? null,
    nameVi: quote?.companyNameVi ?? fund.company.nameVi ?? null,
    nameEn: quote?.companyNameEn ?? fund.company.nameEn ?? null,
    currency: "VND" as const,
    priceScale: 1000,
    ref: ref == null ? null : round(ref, 2),
    ceiling: ssiBoard(quote?.ceiling),
    floor: ssiBoard(quote?.floor),
    last: last == null ? null : round(last, 2),
    change_abs: last != null && ref != null ? round(last - ref, 3) : null,
    change_pct: last != null && ref != null ? round(pct(last, ref), 2) : null,
    session,
    isOpen,
    stats: {
      open: latestDaily ? round(latestDaily.open, 2) : null,
      high: latestDaily ? round(latestDaily.high, 2) : null,
      low: latestDaily ? round(latestDaily.low, 2) : null,
      volume: latestDaily?.volume ?? null,
      avg_vol: vols.length ? Math.round(vols.reduce((a, b) => a + b, 0) / vols.length) : null,
      market_cap_vnd: fund.marketCap,
      pe: fund.pe,
      pb: fund.pb,
      ps: fund.ps,
      eps_thousand_vnd: fund.eps,
      bvps_thousand_vnd: fund.bvps,
      roe_pct: fund.roe,
      roa_pct: fund.roa,
      dividend_yield_pct: fund.divYield,
      shares_outstanding: fund.shares,
      foreign_ownership_pct: fund.foreignOwn,
      week52_high: highs.length ? round(Math.max(...highs), 2) : null,
      week52_low: lows.length ? round(Math.min(...lows), 2) : null,
    },
  };
}

interface FundBundle {
  company: { nameVi?: string; nameEn?: string; floor?: string; website?: string; summary?: string; intro?: string; sector?: string };
  marketCap: number | null;
  pe: number | null;
  pb: number | null;
  ps: number | null;
  eps: number | null;
  bvps: number | null;
  roe: number | null;
  roa: number | null;
  divYield: number | null;
  shares: number | null;
  foreignOwn: number | null;
}

async function fundamentalsBundle(ticker: string): Promise<FundBundle> {
  return cached(`web:fund:${ticker}:${Math.floor(nowSec() / (6 * 3600))}`, 6 * 3600, async () => {
    const [pe, pb, ps, divYield, marketCap, shares, foreignOwn, profile, intro, cafef] = await Promise.all([
      latestRatio(ticker, RATIOS.PE),
      latestRatio(ticker, RATIOS.PB),
      latestRatio(ticker, RATIOS.PS),
      latestRatio(ticker, RATIOS.DIV_YIELD),
      latestRatio(ticker, RATIOS.MARKETCAP),
      latestRatio(ticker, RATIOS.SHARES_OUTSTANDING),
      latestRatio(ticker, RATIOS.FOREIGN_OWNERSHIP),
      getCompanyProfile(ticker).catch(() => null),
      getCompanyIntro(ticker).catch(() => null),
      getFinancialRatios(ticker, "QUY", 1).catch(() => []),
    ]);
    const latestCafef: Record<string, number> = {};
    for (const v of cafef[0]?.Value ?? []) latestCafef[v.Code] = v.Value;
    return {
      company: {
        nameVi: profile?.vnName,
        nameEn: profile?.enName,
        floor: profile?.floor,
        website: profile?.website,
        summary: profile?.vnSummary?.slice(0, 800),
        intro: intro?.Intro?.slice(0, 800),
        sector: intro?.CategoryName as string | undefined,
      },
      marketCap: round(marketCap, 0),
      pe: round(pe, 2),
      pb: round(pb, 2),
      ps: round(ps, 2),
      eps: latestCafef.EPS ?? null,
      bvps: latestCafef.BV ?? null,
      roe: latestCafef.ROE ?? null,
      roa: latestCafef.ROA ?? null,
      divYield: round(divYield, 2),
      shares: round(shares, 0),
      foreignOwn: round(foreignOwn, 2),
    };
  });
}

async function handleOhlcv(ticker: string, range: RangeKey) {
  const plan = rangeToPlan(range);
  const to = nowSec();
  const bucket = plan.intraday ? Math.floor(to / 120) : new Date(to * 1000).toISOString().slice(0, 10);
  const key = `web:ohlcv:${ticker}:${range}:${bucket}`;
  let bars = await cached(key, plan.intraday ? 120 : 600, () =>
    getStockOhlcv(ticker, plan.resolution, plan.fromSec, to),
  );
  if (range === "1D") bars = lastSessionOnly(bars);
  if (range === "5D") {
    // keep only the last 5 distinct trading days
    const days = new Set<string>();
    for (let k = bars.length - 1; k >= 0; k--) {
      days.add(new Date(bars[k]!.time * 1000).toISOString().slice(0, 10));
      if (days.size > 5) {
        bars = bars.slice(k + 1);
        break;
      }
    }
  }
  const prevClose =
    range === "1D" || range === "5D"
      ? ssiBoard((await getQuote(ticker).catch(() => null))?.ref) ?? bars[0]?.open ?? null
      : bars[0]?.close ?? null;
  return { ticker, range, resolution: plan.resolution, intraday: plan.intraday, prevClose, bars };
}

async function handleIndicators(ticker: string, range: RangeKey) {
  const { bars } = await handleOhlcv(ticker, range);
  return { ticker, range, ...computeIndicators(bars) };
}

async function handleNews(ticker: string) {
  const items = await cached(`web:news:${ticker}:${Math.floor(nowSec() / 900)}`, 900, async () => {
    const raw = await getTickerNews(ticker, 0, 15, 1).catch(() => []);
    return raw
      .map((n) => ({
        title: n.Title,
        url: n.LinkDetail ? absUrl(n.LinkDetail) : n.Url,
        publishedAt: parseDate(n.PublishDate ?? n.DeployDate),
        source: n.Source || "CafeF",
        snippet: n.SubTitle?.slice(0, 240),
        type: "news",
      }))
      .filter((n) => n.title);
  });
  return { ticker, items };
}

function absUrl(path?: string): string | undefined {
  if (!path) return undefined;
  if (/^https?:\/\//.test(path)) return path;
  return `https://cafef.vn${path.startsWith("/") ? "" : "/"}${path}`;
}

function parseDate(input?: string): string | undefined {
  if (!input) return undefined;
  const m = /\/Date\((\d+)\)\//.exec(input);
  if (m) return new Date(Number(m[1])).toISOString();
  const d = new Date(input);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

async function handleMarketNews() {
  const seeds = ["VCB", "FPT", "VIC", "HPG", "VNM", "MWG"];
  const items = await cached(`web:marketnews:${Math.floor(nowSec() / 900)}`, 900, async () => {
    const all = await mapLimit(seeds, 4, (t) => getTickerNews(t, 0, 6, 1).catch(() => []));
    const flat = all.flat();
    const seen = new Set<string>();
    const out = flat
      .map((n) => ({
        title: n.Title,
        url: n.LinkDetail ? absUrl(n.LinkDetail) : n.Url,
        publishedAt: parseDate(n.PublishDate ?? n.DeployDate),
        source: n.Source || "CafeF",
        snippet: n.SubTitle?.slice(0, 200),
        type: "market",
      }))
      .filter((n) => {
        if (!n.title || seen.has(n.title)) return false;
        seen.add(n.title);
        return true;
      });
    out.sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
    return out.slice(0, 14);
  });
  return { items };
}

const SECTOR_PEERS: Record<string, string[]> = {
  banks: ["VCB", "BID", "CTG", "TCB", "MBB", "ACB", "VPB", "STB", "HDB"],
  bluechip: ["VCB", "FPT", "HPG", "VNM", "VHM", "VIC", "MWG", "GAS"],
};

async function handleAbout(ticker: string) {
  const fund = await fundamentalsBundle(ticker);
  let peers: string[];
  if (SECTOR_PEERS.banks.includes(ticker)) peers = SECTOR_PEERS.banks;
  else peers = SECTOR_PEERS.bluechip;
  peers = peers.filter((t) => t !== ticker).slice(0, 6);

  const digests = await mapLimit(peers, 6, miniDigest);
  const names = await nameIndex().catch(() => [] as NameEntry[]);
  const nameMap = new Map(names.map((n) => [n.ticker, n.name]));
  const related = digests.map((d) => ({
    ticker: d.ticker,
    name: nameMap.get(d.ticker),
    last: d.last,
    change_pct: d.changePct,
    spark: d.spark,
  }));

  return {
    ticker,
    company: {
      nameVi: fund.company.nameVi,
      nameEn: fund.company.nameEn,
      floor: fund.company.floor,
      website: fund.company.website,
      summary: fund.company.summary,
      intro: fund.company.intro,
      sector: fund.company.sector,
    },
    related,
  };
}

async function handleSearch(q: string) {
  const query = q.trim().toUpperCase();
  if (!query) return { query: q, results: [] };
  const idx = await nameIndex().catch(() => [] as NameEntry[]);
  const starts = idx.filter((e) => e.ticker.startsWith(query));
  const nameHits = idx.filter(
    (e) => !e.ticker.startsWith(query) && e.name.toUpperCase().includes(query),
  );
  const results = [...starts, ...nameHits].slice(0, 12).map((e) => ({
    ticker: e.ticker,
    name: e.name,
    exchange: e.exchange,
  }));
  return { query: q, results };
}

// ---------------------------------------------------------------------------
// Financials (quarterly / annual key metrics from CafeF)
// ---------------------------------------------------------------------------

const CAFEF_METRICS: { key: string; code: string; label: string; unit: "kVND" | "%" | "x" }[] = [
  { key: "eps", code: "EPS", label: "EPS", unit: "kVND" },
  { key: "bvps", code: "BV", label: "BVPS", unit: "kVND" },
  { key: "roe", code: "ROE", label: "ROE", unit: "%" },
  { key: "roa", code: "ROA", label: "ROA", unit: "%" },
  { key: "ros", code: "ROS", label: "Net margin", unit: "%" },
  { key: "grossMargin", code: "GOS", label: "Gross margin", unit: "%" },
  { key: "debtToAssets", code: "DAR", label: "Debt / Assets", unit: "%" },
  { key: "pe", code: "PE", label: "P/E", unit: "x" },
];

async function handleFinancials(ticker: string, period: string) {
  const reportType = period === "annual" ? "NAM" : "QUY";
  const buckets = await cached(
    `web:fin:${ticker}:${reportType}:${Math.floor(nowSec() / (6 * 3600))}`,
    6 * 3600,
    () => getFinancialRatios(ticker, reportType, 8).catch(() => []),
  );
  // CafeF returns newest-first; reverse to oldest→newest for charts/tables.
  // NB: CafeF's ratios dataset is annual (Quater is 0), so we label by year and
  // only prefix a quarter when CafeF actually reports one (1–4).
  const ordered = [...buckets].reverse();
  const hasQuarter = (q: number | undefined): q is number => q != null && q >= 1 && q <= 4;
  const columns = ordered.map((b) => ({
    label: hasQuarter(b.Quater) ? `Q${b.Quater} ${b.Year ?? ""}`.trim() : `${b.Year ?? ""}`,
    year: b.Year ?? null,
    quarter: hasQuarter(b.Quater) ? b.Quater : null,
  }));
  const flat = ordered.map((b) => {
    const m: Record<string, number> = {};
    for (const v of b.Value ?? []) m[v.Code] = v.Value;
    return m;
  });
  const metrics = CAFEF_METRICS.map((def) => ({
    key: def.key,
    label: def.label,
    unit: def.unit,
    values: flat.map((m) =>
      m[def.code] != null && Number.isFinite(m[def.code]) ? round(m[def.code], 2) : null,
    ),
  })).filter((metric) => metric.values.some((v) => v != null));
  return { ticker, period: reportType === "NAM" ? "annual" : "quarterly", columns, metrics };
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

function sendJson(res: http.ServerResponse, status: number, body: unknown) {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "cache-control": "no-store",
  });
  res.end(text);
}

function upperTicker(raw: string): string {
  return decodeURIComponent(raw).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);
}

/** Parse a numeric path id, throwing a 400 if it isn't a finite number. */
function numId(raw: string | undefined, label = "id"): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new HttpError(400, `invalid ${label}`);
  return n;
}

function reqName(body: BodyObj): string {
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) throw new HttpError(400, "name required");
  return name;
}

/** Run a store call, mapping its input-validation Errors to HTTP 400. */
function validate<T>(fn: () => T): T {
  try {
    return fn();
  } catch (err) {
    if (err instanceof HttpError) throw err;
    throw new HttpError(400, err instanceof Error ? err.message : "invalid input");
  }
}

type BodyObj = Record<string, unknown>;

async function routeWatchlists(
  arg: string | undefined,
  sub: string | undefined,
  subArg: string | undefined,
  method: string,
  body: BodyObj,
): Promise<unknown> {
  // Collection: /api/watchlists
  if (!arg) {
    if (method === "GET") return { watchlists: listWatchlists() };
    if (method === "POST") return createWatchlist(reqName(body));
    throw new HttpError(405, `method not allowed: ${method}`);
  }

  const id = numId(arg, "watchlist id");

  // Items sub-resource: /api/watchlists/:id/items[/:ticker]
  if (sub === "items") {
    if (!subArg) {
      if (method === "POST") {
        const meta = validate(() => addWatchlistItem(id, String(body.ticker ?? "")));
        if (!meta) throw new HttpError(404, `watchlist ${id} not found`);
        return meta;
      }
      throw new HttpError(405, `method not allowed: ${method}`);
    }
    if (method === "DELETE") {
      const meta = validate(() => removeWatchlistItem(id, upperTicker(subArg)));
      if (!meta) throw new HttpError(404, `watchlist ${id} not found`);
      return meta;
    }
    throw new HttpError(405, `method not allowed: ${method}`);
  }

  // Single list: /api/watchlists/:id
  if (method === "GET") return handleWatchlistDetail(id);
  if (method === "PATCH") {
    const meta = renameWatchlist(id, reqName(body));
    if (!meta) throw new HttpError(404, `watchlist ${id} not found`);
    return meta;
  }
  if (method === "DELETE") {
    deleteWatchlist(id);
    return { ok: true };
  }
  throw new HttpError(405, `method not allowed: ${method}`);
}

async function routePortfolios(
  arg: string | undefined,
  sub: string | undefined,
  method: string,
  body: BodyObj,
): Promise<unknown> {
  // Collection: /api/portfolios
  if (!arg) {
    if (method === "GET") return { portfolios: listPortfolios() };
    if (method === "POST") return createPortfolio(reqName(body));
    throw new HttpError(405, `method not allowed: ${method}`);
  }

  const id = numId(arg, "portfolio id");

  // Holdings sub-resource: /api/portfolios/:id/holdings
  if (sub === "holdings") {
    if (method === "POST") {
      if (!getPortfolio(id)) throw new HttpError(404, `portfolio ${id} not found`);
      validate(() =>
        addHolding(id, {
          ticker: String(body.ticker ?? ""),
          quantity: Number(body.quantity),
          avgCostVnd: Number(body.avgCostVnd),
        }),
      );
      return { ok: true };
    }
    throw new HttpError(405, `method not allowed: ${method}`);
  }

  // Single portfolio: /api/portfolios/:id
  if (method === "GET") return handlePortfolioResponse(id);
  if (method === "PATCH") {
    const meta = renamePortfolio(id, reqName(body));
    if (!meta) throw new HttpError(404, `portfolio ${id} not found`);
    return meta;
  }
  if (method === "DELETE") {
    deletePortfolio(id);
    return { ok: true };
  }
  throw new HttpError(405, `method not allowed: ${method}`);
}

async function routeHoldings(
  arg: string | undefined,
  method: string,
  body: BodyObj,
): Promise<unknown> {
  const id = numId(arg, "holding id");
  if (method === "PATCH") {
    const patch: { quantity?: number; avgCostVnd?: number } = {};
    if (body.quantity !== undefined) patch.quantity = Number(body.quantity);
    if (body.avgCostVnd !== undefined) patch.avgCostVnd = Number(body.avgCostVnd);
    validate(() => updateHolding(id, patch));
    return { ok: true };
  }
  if (method === "DELETE") {
    deleteHolding(id);
    return { ok: true };
  }
  throw new HttpError(405, `method not allowed: ${method}`);
}

async function route(url: URL, method: string, body: BodyObj): Promise<unknown> {
  const parts = url.pathname.replace(/^\/api\/?/, "").split("/").filter(Boolean);
  const [head, arg, sub, subArg] = parts;

  switch (head) {
    case undefined:
    case "health":
      return { ok: true, service: "azoth-web", time: new Date().toISOString() };
    case "indices":
      return handleIndices();
    case "movers":
      return handleMovers(url.searchParams.get("kind") ?? "gainers", url.searchParams.get("universe") ?? "vn30");
    case "watchlist":
      return handleWatchlist();
    case "watchlists":
      return routeWatchlists(arg, sub, subArg, method, body);
    case "portfolios":
      return routePortfolios(arg, sub, method, body);
    case "holdings":
      return routeHoldings(arg, method, body);
    case "market-news":
      return handleMarketNews();
    case "search":
      return handleSearch(url.searchParams.get("q") ?? "");
    case "quote":
      if (!arg) throw new HttpError(400, "ticker required");
      return handleQuote(upperTicker(arg));
    case "ohlcv":
      if (!arg) throw new HttpError(400, "ticker required");
      return handleOhlcv(upperTicker(arg), (url.searchParams.get("range") as RangeKey) ?? "6M");
    case "indicators":
      if (!arg) throw new HttpError(400, "ticker required");
      return handleIndicators(upperTicker(arg), (url.searchParams.get("range") as RangeKey) ?? "6M");
    case "news":
      if (!arg) throw new HttpError(400, "ticker required");
      return handleNews(upperTicker(arg));
    case "about":
      if (!arg) throw new HttpError(400, "ticker required");
      return handleAbout(upperTicker(arg));
    case "financials":
      if (!arg) throw new HttpError(400, "ticker required");
      return handleFinancials(upperTicker(arg), url.searchParams.get("period") ?? "quarterly");
    default:
      throw new HttpError(404, `unknown endpoint: ${url.pathname}`);
  }
}

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** Read and JSON-parse a request body; tolerate an empty body (→ {}). */
async function readBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};
  const parsed = JSON.parse(raw);
  return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS",
      "access-control-allow-headers": "content-type,accept",
    });
    res.end();
    return;
  }
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  if (!url.pathname.startsWith("/api")) {
    sendJson(res, 404, { error: "not found" });
    return;
  }
  const method = (req.method ?? "GET").toUpperCase();
  const started = Date.now();
  try {
    let body: Record<string, unknown> = {};
    if (method === "POST" || method === "PATCH" || method === "PUT" || method === "DELETE") {
      try {
        body = await readBody(req);
      } catch {
        throw new HttpError(400, "invalid JSON body");
      }
    }
    const result = await route(url, method, body);
    sendJson(res, 200, result);
    console.log(`${method} ${url.pathname}${url.search} → 200 (${Date.now() - started}ms)`);
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500;
    const message = err instanceof Error ? err.message : "internal error";
    sendJson(res, status, { error: message });
    console.error(`${method} ${url.pathname}${url.search} → ${status}: ${message}`);
  }
});

// Open the cache DB eagerly so disk errors surface at startup, then ensure the
// web persistence tables (watchlists / portfolios) exist and are seeded.
try {
  getDb();
  ensureWebSchema();
} catch (err) {
  console.error("Failed to open cache DB / init web schema:", err);
}

server.listen(PORT, () => {
  console.log(`Azoth Finance data server on http://localhost:${PORT}`);
});
