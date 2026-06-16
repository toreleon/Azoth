import { nowSec } from "@azoth/core/agent/clock.js";
import { getCompanyIntro, getScreenerSnapshot } from "@azoth/core/data/sources/cafef.js";
import { getIndexOhlcv, getStockOhlcv, type Bar, type Resolution } from "@azoth/core/data/sources/dnsePublic.js";
import { getQuote } from "@azoth/core/data/sources/ssiIboard.js";
import { getCompanyProfile } from "@azoth/core/data/sources/vndirectFinfo.js";
import { MarketAssetReq, MarketHeatmapReq, MarketOverviewReq, type MarketIndexOverview } from "../../shared/ipc.js";
import type { IpcRegister } from "./register.js";

const MARKET_INDICES = [
  { symbol: "VNINDEX", name: "VN-Index", exchange: "HOSE" },
  { symbol: "VN30", name: "VN30", exchange: "HOSE" },
  { symbol: "HNX", name: "HNX-Index", exchange: "HNX" },
  { symbol: "UPCOM", name: "UPCoM-Index", exchange: "UPCoM" },
];

const MARKET_INDEX_SYMBOLS = new Map(MARKET_INDICES.map((index) => [index.symbol, index]));
let marketHeatmapCache:
  | { expiresAt: number; value: { updatedAt: number; assets: MarketIndexOverview[] } }
  | undefined;

function lookbackDaysForMarket(resolution: Resolution, bars: number): number {
  if (resolution === "1D") return bars * 2;
  if (resolution === "1W") return bars * 14;
  if (resolution === "1M") return bars * 60;
  return Math.max(3, Math.ceil(bars / 50));
}

function compactMarketBar(bar: Bar) {
  return {
    t: bar.time,
    o: roundMarketNumber(bar.open),
    h: roundMarketNumber(bar.high),
    l: roundMarketNumber(bar.low),
    c: roundMarketNumber(bar.close),
    v: Math.round(bar.volume),
  };
}

function roundMarketNumber(value: number): number {
  return Math.round(value * 100) / 100;
}

function marketLine(
  bars: Bar[],
  values: number[],
): Array<{ t: number; value: number }> {
  return values.map((value, idx) => ({
    t: bars[bars.length - values.length + idx]!.time,
    value: roundMarketNumber(value),
  }));
}

function sma(values: number[], period: number): number[] {
  if (values.length < period) return [];
  const out: number[] = [];
  let sum = values.slice(0, period).reduce((acc, value) => acc + value, 0);
  out.push(sum / period);
  for (let i = period; i < values.length; i++) {
    sum += values[i]! - values[i - period]!;
    out.push(sum / period);
  }
  return out;
}

function ema(values: number[], period: number): number[] {
  if (values.length < period) return [];
  const out: number[] = [];
  const k = 2 / (period + 1);
  let prev = values.slice(0, period).reduce((acc, value) => acc + value, 0) / period;
  out.push(prev);
  for (let i = period; i < values.length; i++) {
    prev = values[i]! * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}

function rma(values: number[], period: number): number[] {
  if (values.length < period) return [];
  const out: number[] = [];
  let prev = values.slice(0, period).reduce((acc, value) => acc + value, 0) / period;
  out.push(prev);
  for (let i = period; i < values.length; i++) {
    prev = (prev * (period - 1) + values[i]!) / period;
    out.push(prev);
  }
  return out;
}

function buildMarketSignals(rawBars: Bar[]) {
  const closes = rawBars.map((bar) => bar.close);
  const sma20 = sma(closes, 20);
  const ema20 = ema(closes, 20);
  const rma14 = rma(closes, 14);
  const latestClose = closes.at(-1);
  const latestRma = rma14.at(-1);
  const prevRma = rma14.at(-2);
  const slope = latestRma != null && prevRma != null ? latestRma - prevRma : 0;
  const nextClose =
    latestClose != null ? roundMarketNumber(latestClose + slope) : undefined;
  const changePct =
    latestClose && nextClose != null
      ? roundMarketNumber(((nextClose - latestClose) / latestClose) * 100)
      : undefined;
  const direction = !changePct || Math.abs(changePct) < 0.05
    ? "flat"
    : changePct > 0
      ? "up"
      : "down";
  const distanceFromRma =
    latestClose && latestRma ? Math.abs((latestClose - latestRma) / latestClose) * 100 : 0;
  const confidence =
    Math.abs(changePct ?? 0) > 0.8 && distanceFromRma > 1.5
      ? "high"
      : Math.abs(changePct ?? 0) > 0.25
        ? "medium"
        : "low";

  return {
    overlays: {
      sma20: marketLine(rawBars, sma20),
      ema20: marketLine(rawBars, ema20),
      rma14: marketLine(rawBars, rma14),
    },
    forecast: {
      method: "RMA14 slope projection",
      nextClose,
      changePct,
      direction,
      confidence,
    },
  } satisfies Pick<MarketIndexOverview, "overlays" | "forecast">;
}

function inferMarketKind(symbol: string): "index" | "stock" {
  return MARKET_INDEX_SYMBOLS.has(symbol) ? "index" : "stock";
}

function parseCafefTimestamp(input: string | undefined): number | undefined {
  if (!input) return undefined;
  const match = /\/Date\((\d+)\)\//.exec(input);
  if (match?.[1]) return Math.floor(Number(match[1]) / 1000);
  const parsed = Date.parse(input);
  return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : undefined;
}

function normalizeExchange(value: string | undefined): string {
  const exchange = (value ?? "VN").trim();
  if (/^hsx$/i.test(exchange)) return "HOSE";
  if (/^upcom$/i.test(exchange)) return "UPCoM";
  return exchange.toUpperCase();
}

async function loadMarketHeatmap(includeIndexes: boolean): Promise<{ updatedAt: number; assets: MarketIndexOverview[] }> {
  const now = Date.now();
  if (marketHeatmapCache && marketHeatmapCache.expiresAt > now) {
    return includeIndexes
      ? marketHeatmapCache.value
      : {
          ...marketHeatmapCache.value,
          assets: marketHeatmapCache.value.assets.filter((asset) => asset.kind !== "index"),
        };
  }

  const snapshot = await getScreenerSnapshot();
  const stocks = snapshot.items
    .filter((item) => /^[A-Z0-9]{3,12}$/.test(item.Symbol))
    .map((item): MarketIndexOverview => {
      const latestClose = item.Price != null ? roundMarketNumber(item.Price) : undefined;
      const changePct = item.ChangePrice != null ? roundMarketNumber(item.ChangePrice) : undefined;
      const previousClose =
        latestClose != null && changePct != null && changePct !== -100
          ? roundMarketNumber(latestClose / (1 + changePct / 100))
          : undefined;
      const change =
        latestClose != null && previousClose != null
          ? roundMarketNumber(latestClose - previousClose)
          : undefined;
      return {
        symbol: item.Symbol.toUpperCase(),
        name: item.FullName ?? item.Symbol.toUpperCase(),
        exchange: normalizeExchange(item.CenterName),
        kind: "stock",
        industry: snapshot.categories[item.ParentCategoryId ?? 0] ?? "Unclassified",
        latestClose,
        previousClose,
        change,
        changePct,
        volume: item.ChangeVolume != null ? Math.max(0, Math.round(Math.abs(item.ChangeVolume))) : undefined,
        marketCap: item.VonHoa != null ? roundMarketNumber(item.VonHoa) : undefined,
        updatedAt: parseCafefTimestamp(item.UpdatedDate),
        bars: [],
      };
    });

  const value = {
    updatedAt: nowSec(),
    assets: includeIndexes
      ? [
          ...MARKET_INDICES.map((index): MarketIndexOverview => ({
            ...index,
            kind: "index",
            industry: "Market indexes",
            bars: [],
          })),
          ...stocks,
        ]
      : stocks,
  };
  marketHeatmapCache = { expiresAt: now + 60_000, value };
  return value;
}

async function loadIndexOverview(
  index: (typeof MARKET_INDICES)[number],
  resolution: Resolution,
  bars: number,
): Promise<MarketIndexOverview> {
  const to = nowSec();
  const from = to - lookbackDaysForMarket(resolution, bars) * 86400;
  try {
    const rawBars = (await getIndexOhlcv(index.symbol, resolution, from, to)).slice(-bars);
    const signals = buildMarketSignals(rawBars);
    const latest = rawBars[rawBars.length - 1];
    const previous = rawBars[rawBars.length - 2] ?? rawBars[0];
    const change =
      latest && previous ? roundMarketNumber(latest.close - previous.close) : undefined;
    const changePct =
      latest && previous?.close
        ? roundMarketNumber(((latest.close - previous.close) / previous.close) * 100)
        : undefined;
    return {
      ...index,
      kind: "index",
      industry: "Market indexes",
      latestClose: latest ? roundMarketNumber(latest.close) : undefined,
      previousClose: previous ? roundMarketNumber(previous.close) : undefined,
      change,
      changePct,
      high: rawBars.length
        ? roundMarketNumber(Math.max(...rawBars.map((bar) => bar.high)))
        : undefined,
      low: rawBars.length
        ? roundMarketNumber(Math.min(...rawBars.map((bar) => bar.low)))
        : undefined,
      volume: rawBars.reduce((sum, bar) => sum + Math.round(bar.volume), 0),
      updatedAt: latest?.time,
      bars: rawBars.map(compactMarketBar),
      ...signals,
    };
  } catch (err) {
    return {
      ...index,
      kind: "index",
      industry: "Market indexes",
      bars: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function loadMarketAsset(
  symbolInput: string,
  kindInput: "stock" | "index" | undefined,
  resolution: Resolution,
  bars: number,
): Promise<MarketIndexOverview> {
  const symbol = symbolInput.trim().toUpperCase();
  const kind = kindInput ?? inferMarketKind(symbol);
  const indexMeta = MARKET_INDEX_SYMBOLS.get(symbol);
  const to = nowSec();
  const from = to - lookbackDaysForMarket(resolution, bars) * 86400;
  try {
    const rawBars = (
      kind === "index"
        ? await getIndexOhlcv(symbol, resolution, from, to)
        : await getStockOhlcv(symbol, resolution, from, to)
    ).slice(-bars);
    const [quote, profile, intro] = kind === "stock"
      ? await Promise.all([
          getQuote(symbol).catch(() => null),
          getCompanyProfile(symbol).catch(() => null),
          getCompanyIntro(symbol).catch(() => null),
        ])
      : [null, null, null] as const;
    const latest = rawBars[rawBars.length - 1];
    const previous = rawBars[rawBars.length - 2] ?? rawBars[0];
    const latestClose = quote?.matchedPrice ?? latest?.close;
    const previousClose = quote?.ref || previous?.close;
    const change =
      latestClose != null && previousClose != null
        ? roundMarketNumber(latestClose - previousClose)
        : undefined;
    const changePct =
      latestClose != null && previousClose
        ? roundMarketNumber(((latestClose - previousClose) / previousClose) * 100)
        : undefined;
    return {
      symbol,
      name: indexMeta?.name ?? quote?.companyNameEn ?? profile?.enName ?? profile?.vnName ?? symbol,
      exchange: indexMeta?.exchange ?? quote?.exchange ?? profile?.floor ?? "VN",
      kind,
      industry: indexMeta ? "Market indexes" : intro?.CategoryName ?? "Unclassified",
      intro: intro?.Intro && intro.Intro.trim() ? intro.Intro.trim() : undefined,
      website: intro?.Web && intro.Web.trim() ? intro.Web.trim() : undefined,
      latestClose: latestClose != null ? roundMarketNumber(latestClose) : undefined,
      previousClose: previousClose != null ? roundMarketNumber(previousClose) : undefined,
      change,
      changePct,
      high: rawBars.length
        ? roundMarketNumber(Math.max(...rawBars.map((bar) => bar.high)))
        : undefined,
      low: rawBars.length
        ? roundMarketNumber(Math.min(...rawBars.map((bar) => bar.low)))
        : undefined,
      volume: rawBars.reduce((sum, bar) => sum + Math.round(bar.volume), 0),
      updatedAt: latest?.time,
      bars: rawBars.map(compactMarketBar),
      ...buildMarketSignals(rawBars),
      quote: quote
        ? {
            bestBid: quote.bestBid,
            bestOffer: quote.bestOffer,
            matchedVolume: quote.matchedVolume,
            session: quote.session,
            tradingStatus: quote.tradingStatus,
          }
        : undefined,
    };
  } catch (err) {
    return {
      symbol,
      name: indexMeta?.name ?? symbol,
      exchange: indexMeta?.exchange ?? "VN",
      kind,
      industry: indexMeta ? "Market indexes" : "Unclassified",
      bars: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}


export function registerMarketHandlers(register: IpcRegister): void {
  register("market:overview", async (raw) => {
    const req = MarketOverviewReq.parse(raw);
    const resolution = (req?.resolution ?? "1D") as Resolution;
    const bars = req?.bars ?? 90;
    const indices = await Promise.all(
      MARKET_INDICES.map((index) => loadIndexOverview(index, resolution, bars)),
    );
    return {
      updatedAt: nowSec(),
      indices,
    };
  });

  register("market:asset", async (raw) => {
    const req = MarketAssetReq.parse(raw);
    return loadMarketAsset(
      req.symbol,
      req.kind,
      req.resolution as Resolution,
      req.bars,
    );
  });

  register("market:heatmap", async (raw) => {
    const req = MarketHeatmapReq.parse(raw);
    return loadMarketHeatmap(req?.includeIndexes ?? true);
  });


}
