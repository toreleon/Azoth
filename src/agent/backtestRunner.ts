import { randomUUID } from "node:crypto";
import { loadConfig } from "../config/loader.js";
import { getDb } from "../storage/db.js";
import { getBacktestBroker } from "../broker/index.js";
import { getStockOhlcv, getIndexOhlcv, type Bar } from "../data/sources/dnsePublic.js";
import { type AgentProfile, profileRef } from "./profile.js";
import { loadProfile } from "./profileStore.js";
import { DISCOVERY_UNIVERSE, discoverTickers } from "../tools/discover.js";
import { setActiveAsOf } from "./clock.js";
import { runTeamAnalysis } from "./team/index.js";
import type { FinalDecision, TeamEvent } from "./team/state.js";
import { checkOrder } from "../risk/guardrails.js";
import type { BrokerPosition, Order, PlaceOrderInput } from "../broker/types.js";

export interface BacktestOptions {
  start: string;
  end: string;
  /** Profile reference in `<id>@v<n>` form, e.g. "vn-equity@v0". */
  profileRef: string;
  initialCash: number;
  /** Number of discovered names to run through the full team each week. */
  maxCandidates?: number;
}

export interface EquityPayload {
  asOf: number;
  dateIso: string;
  cashVnd: number;
  mtmVnd: number;
  benchmarkMtmVnd: number;
}

export interface SummaryPayload {
  runId: string;
  profileRef: string;
  start: string;
  end: string;
  initialCash: number;
  finalMtm: number;
  finalBench: number;
  totalReturn: number;
  benchReturn: number;
  maxDD: number;
  totalCost: number;
  totalInTokens: number;
  totalOutTokens: number;
  weeks: number;
  trades: number;
  rejectedTrades: number;
  reportPath: string | null;
}

export interface BacktestCallbacks {
  onStart?: (info: { runId: string; profile: AgentProfile; brokerName: string; fridays: number[]; universe: string[] }) => void;
  onTurnStart?: (info: { asOf: number; dateIso: string }) => void;
  onTeamEvent?: (ev: TeamEvent, ctx: { asOf: number; dateIso: string; ticker: string }) => void;
  onOrder?: (order: Order, ctx: { asOf: number; dateIso: string; decision: FinalDecision }) => void;
  onEquity?: (eq: EquityPayload) => void;
  onTurnError?: (err: Error, ctx: { asOf: number; dateIso: string }) => void;
  onComplete?: (summary: SummaryPayload) => void;
  signal?: AbortSignal;
}

function isoSec(d: string): number {
  const t = Date.parse(`${d}T15:00:00+07:00`);
  if (Number.isNaN(t)) throw new Error(`bad date: ${d}`);
  return Math.floor(t / 1000);
}

function dateOf(epochSec: number): string {
  return new Date(epochSec * 1000).toISOString().slice(0, 10);
}

function fridayCloses(vnindexBars: Bar[], startSec: number, endSec: number): number[] {
  const out: number[] = [];
  for (const b of vnindexBars) {
    if (b.time < startSec || b.time > endSec) continue;
    const d = new Date(b.time * 1000);
    const ict = new Date(d.getTime() + 7 * 3600 * 1000);
    if (ict.getUTCDay() === 5) out.push(b.time);
  }
  return out;
}

function lotRound(qty: number): number {
  return Math.floor(qty / 100) * 100;
}

function positionValue(p: BrokerPosition, price: number | null): number {
  return (price ?? p.avgCost) * p.quantity * 1000;
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new Error("aborted");
}

async function markToMarket(
  broker: Awaited<ReturnType<typeof getBacktestBroker>>,
  priceAt: (ticker: string) => number | null,
): Promise<number> {
  const snap = await broker.snapshot();
  return snap.positions.reduce(
    (sum, p) => sum + positionValue(p, priceAt(p.ticker)),
    snap.cashVnd,
  );
}

async function recordGuardrailReject(
  broker: Awaited<ReturnType<typeof getBacktestBroker>>,
  input: PlaceOrderInput,
  reasons: string[],
): Promise<Order> {
  const reason = `guardrail_blocked: ${reasons.join("; ")}`;
  return broker.recordRejectedOrder
    ? broker.recordRejectedOrder(input, reason)
    : broker.placeOrder(input);
}

async function submitOrder(
  broker: Awaited<ReturnType<typeof getBacktestBroker>>,
  input: PlaceOrderInput,
  refPrice: number,
): Promise<Order> {
  const guard = await checkOrder(broker, input, refPrice);
  if (!guard.ok) return recordGuardrailReject(broker, input, guard.reasons);
  return broker.placeOrder(input);
}

async function applyTeamDecision(args: {
  broker: Awaited<ReturnType<typeof getBacktestBroker>>;
  decision: FinalDecision;
  equityVnd: number;
  price: number | null;
  maxPositionPct: number;
  freezeBuys: boolean;
}): Promise<Order | null> {
  const { broker, decision, equityVnd, price, maxPositionPct, freezeBuys } = args;
  if (price == null || equityVnd <= 0) return null;

  const snap = await broker.snapshot();
  const current = snap.positions.find((p) => p.ticker === decision.ticker);
  const currentQty = current?.quantity ?? 0;
  const currentValue = currentQty * price * 1000;
  const requestedPct = Math.max(0, Math.min(decision.sizingPct, maxPositionPct));
  const targetValue =
    decision.rating === "Sell"
      ? 0
      : decision.rating === "Underweight"
        ? Math.min(currentValue, requestedPct * equityVnd)
        : decision.rating === "Hold"
          ? currentValue
          : requestedPct * equityVnd;

  const deltaValue = targetValue - currentValue;
  if ((decision.rating === "Buy" || decision.rating === "Overweight") && freezeBuys) {
    return recordGuardrailReject(
      broker,
      {
        ticker: decision.ticker,
        side: "BUY",
        type: "MARKET",
        quantity: 100,
        notes: "team backtest buy blocked by defensive freeze",
      },
      ["drawdown circuit breaker active: BUY orders are frozen this turn"],
    );
  }

  if (deltaValue > price * 1000 * 100) {
    const qty = lotRound(deltaValue / (price * 1000));
    if (qty <= 0) return null;
    return submitOrder(
      broker,
      {
        ticker: decision.ticker,
        side: "BUY",
        type: "MARKET",
        quantity: qty,
        notes: `team ${decision.rating}: ${(decision.sizingPct * 100).toFixed(1)}% target`,
      },
      price,
    );
  }

  if (deltaValue < -price * 1000 * 100 && currentQty > 0) {
    const qty = Math.min(currentQty, lotRound(Math.abs(deltaValue) / (price * 1000)));
    if (qty <= 0) return null;
    return submitOrder(
      broker,
      {
        ticker: decision.ticker,
        side: "SELL",
        type: "MARKET",
        quantity: qty,
        notes: `team ${decision.rating}: reduce to ${(requestedPct * 100).toFixed(1)}% target`,
      },
      price,
    );
  }

  return null;
}

export async function runBacktestSession(
  opts: BacktestOptions,
  cb: BacktestCallbacks = {},
): Promise<SummaryPayload> {
  const cfg = loadConfig();
  const profile = loadProfile(opts.profileRef);
  const ref = profileRef(profile);
  const universe = [...DISCOVERY_UNIVERSE];
  const db = getDb();
  const maxCandidates = Math.max(1, Math.min(opts.maxCandidates ?? 3, profile.params.maxNames, 5));

  const startSec = isoSec(opts.start);
  const endSec = isoSec(opts.end);
  if (endSec <= startSec) throw new Error("end must be after start");

  const runId = randomUUID();
  const brokerName = `paper-bt-${runId.slice(0, 8)}`;
  const broker = getBacktestBroker(brokerName, opts.initialCash);
  broker.reset(opts.initialCash);

  const fetchFrom = startSec - 90 * 86400;
  const fetchTo = endSec + 7 * 86400;
  const bars: Record<string, Bar[]> = {};
  for (const t of universe) {
    bars[t] = await getStockOhlcv(t, "1D", fetchFrom, fetchTo);
    if (cb.signal?.aborted) throw new Error("aborted");
  }
  const vnindex = await getIndexOhlcv("VNINDEX", "1D", fetchFrom, fetchTo);

  const fridays = fridayCloses(vnindex, startSec, endSec);
  if (fridays.length === 0) throw new Error("no Friday trading days in range");

  cb.onStart?.({ runId, profile, brokerName, fridays, universe });

  db.prepare(
    `INSERT INTO backtest_runs
       (id, persona, start_date, end_date, cadence, initial_cash_vnd, config_json, created_at)
     VALUES (?, ?, ?, ?, 'weekly', ?, ?, ?)`,
  ).run(
    runId,
    ref,
    startSec,
    endSec,
    opts.initialCash,
    JSON.stringify({ universe, model: cfg.model, broker: brokerName, profileRef: ref, engine: "team", maxCandidates }),
    Math.floor(Date.now() / 1000),
  );

  const vnindexAt = (asOf: number): number | null => {
    const series = vnindex.filter((b) => b.time <= asOf);
    return series.length ? series[series.length - 1]!.close : null;
  };
  const vnindexBaseline = vnindexAt(fridays[0]!);
  if (vnindexBaseline == null) throw new Error("no VNINDEX data at first Friday");

  let peakMtm = opts.initialCash;
  let freezeBuys = false;

  try {
    for (const asOf of fridays) {
      throwIfAborted(cb.signal);
      const dateIso = dateOf(asOf);
      const priceOverride = (sym: string): number | null => {
        const series = bars[sym]?.filter((b) => b.time <= asOf) ?? [];
        return series.length ? series[series.length - 1]!.close : null;
      };
      broker.setPriceOverride(priceOverride);
      cb.onTurnStart?.({ asOf, dateIso });

      const prompt = `Team backtest ${dateIso}: discover ${profile.params.discoveryCriterion}/${profile.params.preferredUniverse}, analyze candidates, execute broker orders from final decisions.`;
      let response = "";
      let inTokens = 0;
      let outTokens = 0;
      let costUsd = 0;

      try {
        setActiveAsOf({ asOfSec: asOf, brokerName, freezeBuys });
        const discovery = await discoverTickers({
          criterion: profile.params.discoveryCriterion,
          universe: profile.params.preferredUniverse,
          limit: maxCandidates,
        });
        const held = (await broker.snapshot()).positions.map((p) => p.ticker);
        const tickers = Array.from(
          new Set([...held, ...discovery.candidates.map((c) => c.ticker)]),
        ).slice(0, maxCandidates);

        const decisions: FinalDecision[] = [];
        for (const ticker of tickers) {
          throwIfAborted(cb.signal);
          const result = await runTeamAnalysis(
            { ticker, asOfDateIso: dateIso, debateRounds: 1 },
            {
              allowWebSearch: false,
              signal: cb.signal,
              emit: (ev) => {
                cb.onTeamEvent?.(ev, { asOf, dateIso, ticker });
                if (ev.type === "role_end") {
                  const usage = ev.usage ?? {};
                  inTokens += usage.inputTokens ?? 0;
                  outTokens += usage.outputTokens ?? 0;
                  costUsd += usage.costUsd ?? 0;
                }
              },
            },
          );
          throwIfAborted(cb.signal);
          decisions.push(result.decision);
          response += `[${ticker}] ${result.decision.rating} ${(result.decision.sizingPct * 100).toFixed(1)}%: ${result.decision.rationale}\n`;

          const equity = await markToMarket(broker, priceOverride);
          const order = await applyTeamDecision({
            broker,
            decision: result.decision,
            equityVnd: equity,
            price: priceOverride(ticker),
            maxPositionPct: Math.min(profile.params.maxPositionPct, cfg.risk.max_position_pct),
            freezeBuys,
          });
          if (order) cb.onOrder?.(order, { asOf, dateIso, decision: result.decision });
        }
      } catch (err) {
        if ((err as Error).message === "aborted") throw err;
        cb.onTurnError?.(err as Error, { asOf, dateIso });
      } finally {
        setActiveAsOf(null);
      }

      db.prepare(
        `INSERT OR REPLACE INTO backtest_turns
           (run_id, as_of, session_id, prompt, response, in_tokens, out_tokens, cost_usd,
            cache_read_tokens, cache_creation_tokens)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(runId, asOf, null, prompt, response, inTokens, outTokens, costUsd, 0, 0);

      const snap = await broker.snapshot();
      let mtm = snap.cashVnd;
      for (const p of snap.positions) {
        const px = priceOverride(p.ticker);
        if (px != null) mtm += px * p.quantity * 1000;
      }
      const idxNow = vnindexAt(asOf) ?? vnindexBaseline;
      const benchmarkMtm = opts.initialCash * (idxNow / vnindexBaseline);

      db.prepare(
        `INSERT OR REPLACE INTO backtest_equity
           (run_id, as_of, cash_vnd, mtm_vnd, benchmark_mtm_vnd)
         VALUES (?, ?, ?, ?, ?)`,
      ).run(runId, asOf, snap.cashVnd, mtm, benchmarkMtm);

      cb.onEquity?.({ asOf, dateIso, cashVnd: snap.cashVnd, mtmVnd: mtm, benchmarkMtmVnd: benchmarkMtm });

      peakMtm = Math.max(peakMtm, mtm);
      const drawdown = 1 - mtm / peakMtm;
      freezeBuys = drawdown > profile.params.maxDrawdownFloor;
    }
  } finally {
    broker.setPriceOverride(null);
    setActiveAsOf(null);
    db.prepare("UPDATE backtest_runs SET finished_at = ? WHERE id = ?").run(
      Math.floor(Date.now() / 1000),
      runId,
    );
  }

  const equityRows = db
    .prepare("SELECT as_of, mtm_vnd, benchmark_mtm_vnd FROM backtest_equity WHERE run_id = ? ORDER BY as_of")
    .all(runId) as { as_of: number; mtm_vnd: number; benchmark_mtm_vnd: number }[];
  const turnRows = db
    .prepare("SELECT in_tokens, out_tokens, cost_usd FROM backtest_turns WHERE run_id = ?")
    .all(runId) as { in_tokens: number; out_tokens: number; cost_usd: number }[];
  const orderRows = db
    .prepare("SELECT * FROM broker_orders WHERE broker = ? AND status = 'FILLED' ORDER BY created_at")
    .all(brokerName) as Array<{ ticker: string; side: string; filled_price: number; filled_qty: number; created_at: number }>;
  const rejectedOrderRows = db
    .prepare("SELECT * FROM broker_orders WHERE broker = ? AND status = 'REJECTED' ORDER BY created_at")
    .all(brokerName) as Array<{ ticker: string; side: string; quantity: number; reject_reason: string | null; created_at: number }>;

  const last = equityRows[equityRows.length - 1];
  const finalMtm = last?.mtm_vnd ?? opts.initialCash;
  const finalBench = last?.benchmark_mtm_vnd ?? opts.initialCash;
  const totalReturn = (finalMtm / opts.initialCash - 1) * 100;
  const benchReturn = (finalBench / opts.initialCash - 1) * 100;
  let runningPeak = opts.initialCash;
  const maxDD = equityRows.reduce((mn, r) => {
    runningPeak = Math.max(runningPeak, r.mtm_vnd);
    return Math.min(mn, r.mtm_vnd / runningPeak - 1);
  }, 0);
  const totalCost = turnRows.reduce((s, r) => s + (r.cost_usd ?? 0), 0);
  const totalIn = turnRows.reduce((s, r) => s + (r.in_tokens ?? 0), 0);
  const totalOut = turnRows.reduce((s, r) => s + (r.out_tokens ?? 0), 0);

  const summary: SummaryPayload = {
    runId,
    profileRef: ref,
    start: opts.start,
    end: opts.end,
    initialCash: opts.initialCash,
    finalMtm,
    finalBench,
    totalReturn,
    benchReturn,
    maxDD,
    totalCost,
    totalInTokens: totalIn,
    totalOutTokens: totalOut,
    weeks: equityRows.length,
    trades: orderRows.length,
    rejectedTrades: rejectedOrderRows.length,
    reportPath: null,
  };
  cb.onComplete?.(summary);
  return summary;
}
