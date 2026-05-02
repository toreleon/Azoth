#!/usr/bin/env node
/**
 * Phase 4 backtest runner — sanity-checks the PaperBroker with a deterministic
 * RSI mean-reversion strategy over the watchlist. This intentionally does NOT
 * use the LLM (which would be slow + expensive); it verifies the
 * data + broker + accounting pipeline.
 *
 *   pnpm tsx src/cli/backtest.ts [--days=180] [--rsi-buy=30] [--rsi-sell=70] [--lots=2]
 */
import "../runtime/bootstrap.js";
import { RSI } from "technicalindicators";
import { loadConfig } from "../config/loader.js";
import { getDb } from "../storage/db.js";
import { PaperBroker } from "../broker/paper.js";
import { getStockOhlcv, type Bar } from "../data/sources/dnsePublic.js";

interface Args {
  days: number;
  rsiBuy: number;
  rsiSell: number;
  lots: number;
  initialCash: number;
}

function parseArgs(argv: string[]): Args {
  const out: Args = {
    days: 180,
    rsiBuy: 30,
    rsiSell: 70,
    lots: 2, // 2 * 100 = 200 shares per trade
    initialCash: 1_000_000_000,
  };
  for (const a of argv) {
    const m = /^--([\w-]+)=(.+)$/.exec(a);
    if (!m) continue;
    const [, k, v] = m;
    const n = Number(v);
    if (k === "days") out.days = n;
    if (k === "rsi-buy") out.rsiBuy = n;
    if (k === "rsi-sell") out.rsiSell = n;
    if (k === "lots") out.lots = n;
    if (k === "initial-cash") out.initialCash = n;
  }
  return out;
}

interface Trade {
  time: string;
  ticker: string;
  side: "BUY" | "SELL";
  price: number;
  qty: number;
  pnl?: number;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cfg = loadConfig();
  getDb();

  console.log("Azoth backtest");
  console.log(`  watchlist: ${cfg.watchlist.join(", ")}`);
  console.log(
    `  days=${args.days}  rsi_buy=${args.rsiBuy}  rsi_sell=${args.rsiSell}  qty/trade=${args.lots * 100}  init_cash=${(args.initialCash / 1e6).toFixed(0)}M VND`,
  );

  const broker = new PaperBroker(args.initialCash);
  broker.reset(args.initialCash);

  const to = Math.floor(Date.now() / 1000);
  const from = to - args.days * 86400;

  // Pre-fetch all OHLCV
  const bars: Record<string, Bar[]> = {};
  for (const t of cfg.watchlist) {
    bars[t] = await getStockOhlcv(t, "1D", from, to);
  }

  // Build aligned timeline (union of all timestamps)
  const allTimes = new Set<number>();
  for (const t of cfg.watchlist) for (const b of bars[t]!) allTimes.add(b.time);
  const timeline = [...allTimes].sort((a, b) => a - b);

  const trades: Trade[] = [];
  const realized: Record<string, number> = {};

  for (let i = 14; i < timeline.length; i++) {
    const day = timeline[i]!;
    const dayIso = new Date(day * 1000).toISOString().slice(0, 10);
    for (const t of cfg.watchlist) {
      const series = bars[t]!.filter((b) => b.time <= day);
      if (series.length < 20) continue;
      const closes = series.map((b) => b.close);
      const rsi = RSI.calculate({ values: closes, period: 14 });
      const latestRsi = rsi[rsi.length - 1];
      if (latestRsi == null) continue;
      const px = closes[closes.length - 1]!;
      broker.setPriceOverride((sym) => (sym === t ? px : null));

      const snap = await broker.snapshot();
      const pos = snap.positions.find((p) => p.ticker === t);

      if (latestRsi < args.rsiBuy && !pos) {
        const order = await broker.placeOrder({
          ticker: t,
          side: "BUY",
          type: "MARKET",
          quantity: args.lots * 100,
        });
        if (order.status === "FILLED") {
          trades.push({
            time: dayIso,
            ticker: t,
            side: "BUY",
            price: order.filledPrice!,
            qty: order.filledQty!,
          });
        }
      } else if (latestRsi > args.rsiSell && pos) {
        const order = await broker.placeOrder({
          ticker: t,
          side: "SELL",
          type: "MARKET",
          quantity: pos.quantity,
        });
        if (order.status === "FILLED") {
          const pnl =
            (order.filledPrice! - pos.avgCost) * order.filledQty! * 1000;
          realized[t] = (realized[t] ?? 0) + pnl;
          trades.push({
            time: dayIso,
            ticker: t,
            side: "SELL",
            price: order.filledPrice!,
            qty: order.filledQty!,
            pnl,
          });
        }
      }
    }
  }

  broker.setPriceOverride(null);

  // Final mark-to-market using each ticker's last bar in window
  const finalSnap = await broker.snapshot();
  let mtmVnd = finalSnap.cashVnd;
  for (const p of finalSnap.positions) {
    const last = bars[p.ticker]?.[bars[p.ticker]!.length - 1];
    if (last) mtmVnd += last.close * p.quantity * 1000;
  }
  const realizedTotal = Object.values(realized).reduce((a, b) => a + b, 0);
  const wins = trades.filter((t) => (t.pnl ?? 0) > 0).length;
  const sells = trades.filter((t) => t.side === "SELL").length;
  const winRate = sells > 0 ? wins / sells : 0;

  console.log("");
  console.log("Trades:");
  for (const t of trades) {
    const pnlStr =
      t.pnl != null ? ` pnl=${(t.pnl / 1e6).toFixed(2)}M VND` : "";
    console.log(
      `  ${t.time}  ${t.side}  ${t.ticker}  ${t.qty} @ ${t.price.toFixed(2)}${pnlStr}`,
    );
  }
  console.log("");
  console.log("Open positions at end:");
  for (const p of finalSnap.positions) {
    const last = bars[p.ticker]?.[bars[p.ticker]!.length - 1];
    const unreal = last
      ? (last.close - p.avgCost) * p.quantity * 1000
      : null;
    console.log(
      `  ${p.ticker}  qty=${p.quantity}  avg_cost=${p.avgCost.toFixed(2)}  last=${last?.close ?? "?"}  unreal=${unreal != null ? (unreal / 1e6).toFixed(2) + "M" : "?"}`,
    );
  }
  console.log("");
  console.log(`Cash: ${(finalSnap.cashVnd / 1e6).toFixed(0)}M VND`);
  console.log(`Realized P&L: ${(realizedTotal / 1e6).toFixed(2)}M VND`);
  console.log(`Mark-to-market portfolio: ${(mtmVnd / 1e6).toFixed(2)}M VND`);
  console.log(
    `Total return: ${(((mtmVnd - args.initialCash) / args.initialCash) * 100).toFixed(2)}%  (vs initial ${(args.initialCash / 1e6).toFixed(0)}M VND)`,
  );
  console.log(
    `Trades: ${trades.length}  closed: ${sells}  win rate: ${(winRate * 100).toFixed(1)}%`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
