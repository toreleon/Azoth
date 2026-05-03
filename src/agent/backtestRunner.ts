import { randomUUID } from "node:crypto";
import { loadConfig } from "../config/loader.js";
import { getDb } from "../storage/db.js";
import { getBacktestBroker } from "../broker/index.js";
import { getStockOhlcv, getIndexOhlcv, type Bar } from "../data/sources/dnsePublic.js";
import { runBacktestTurn } from "./orchestrator.js";
import { type AgentProfile, profileRef } from "./profile.js";
import { loadProfile } from "./profileStore.js";
import { loadTurnMemory } from "./memory.js";
import { DISCOVERY_UNIVERSE } from "../tools/discover.js";
import { getCacheStats, resetCacheStats } from "../data/cache.js";
import { replayOrRecord } from "./llmReplayCache.js";

export interface BacktestOptions {
  start: string;
  end: string;
  /** Profile reference in `<id>@v<n>` form, e.g. "vn-equity@v0". */
  profileRef: string;
  initialCash: number;
}

export interface TurnResultPayload {
  asOf: number;
  dateIso: string;
  prompt: string;
  response: string;
  sessionId: string | undefined;
  inTokens: number;
  outTokens: number;
  costUsd: number;
  toolCalls: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  cacheHits: number;
  cacheMisses: number;
  inflightCollapses: number;
  llmReplayHit: boolean;
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
  reportPath: string | null;
}

export interface BacktestCallbacks {
  onStart?: (info: { runId: string; profile: AgentProfile; brokerName: string; fridays: number[]; universe: string[] }) => void;
  onTurnStart?: (info: { asOf: number; dateIso: string }) => void;
  onStreamEvent?: (ev: unknown) => void;
  onTurnEnd?: (turn: TurnResultPayload) => void;
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

interface ResultMessage {
  type: "result";
  session_id?: string;
  total_cost_usd?: number;
  num_turns?: number;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
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
    JSON.stringify({ universe, model: cfg.model, broker: brokerName, profileRef: ref }),
    Math.floor(Date.now() / 1000),
  );

  const vnindexAt = (asOf: number): number | null => {
    const series = vnindex.filter((b) => b.time <= asOf);
    return series.length ? series[series.length - 1]!.close : null;
  };
  const vnindexBaseline = vnindexAt(fridays[0]!);
  if (vnindexBaseline == null) throw new Error("no VNINDEX data at first Friday");

  let resume: string | undefined;
  let peakMtm = opts.initialCash;
  let freezeBuys = false;

  for (const asOf of fridays) {
    if (cb.signal?.aborted) break;
    const dateIso = dateOf(asOf);
    const priceOverride = (sym: string): number | null => {
      const series = bars[sym]?.filter((b) => b.time <= asOf) ?? [];
      return series.length ? series[series.length - 1]!.close : null;
    };
    broker.setPriceOverride(priceOverride);

    const prompt = [
      `Today is ${dateIso}. It is a Friday close.`,
      `Step 1: call broker_state to see your current portfolio.`,
      `Step 2: call discover_tickers (criterion of your choosing per your strategy) to build THIS WEEK's watchlist of 5–10 candidates.`,
      `Step 3: drill into the top candidates with technical_indicators.`,
      `Step 4: journal each decision and place orders for high-conviction trades. Also re-evaluate any existing holdings — sell, trim, or hold.`,
    ].join(" ");

    cb.onTurnStart?.({ asOf, dateIso });

    let response = "";
    let sessionId: string | undefined;
    let inTokens = 0;
    let outTokens = 0;
    let costUsd = 0;
    let toolCalls = 0;
    let cacheReadTokens = 0;
    let cacheCreationTokens = 0;

    resetCacheStats();
    const memory = loadTurnMemory(profile.id, asOf, [profile.params.discoveryCriterion]);
    const extras = { memory, defensiveFreeze: freezeBuys };
    const memHash = memory.long.length + memory.mid.length;
    const replayKey = `bt|${cfg.model}|${ref}|${dateIso}|${resume ?? "0"}|${freezeBuys ? "F" : "_"}|${memHash}|${prompt}`;
    const stream = replayOrRecord(replayKey, cfg.model, prompt, () =>
      runBacktestTurn(prompt, {
        profile,
        asOfStore: { asOfSec: asOf, brokerName, freezeBuys },
        asOfDateIso: dateIso,
        resume,
        extras,
      }),
    );

    try {
      for await (const m of stream) {
        if (cb.signal?.aborted) break;
        cb.onStreamEvent?.(m);
        if (m.type === "stream_event") {
          const ev = (m as { event: any }).event;
          if (ev?.type === "content_block_start" && ev.content_block?.type === "tool_use") {
            toolCalls++;
          } else if (ev?.type === "content_block_delta") {
            const d = ev.delta;
            if (d?.type === "text_delta" && d.text) response += d.text;
          }
        } else if (m.type === "result") {
          const r = m as unknown as ResultMessage;
          sessionId = r.session_id;
          inTokens = r.usage?.input_tokens ?? 0;
          outTokens = r.usage?.output_tokens ?? 0;
          costUsd = r.total_cost_usd ?? 0;
          cacheReadTokens = r.usage?.cache_read_input_tokens ?? 0;
          cacheCreationTokens = r.usage?.cache_creation_input_tokens ?? 0;
        } else if (m.type === "system" && (m as { subtype?: string }).subtype === "init") {
          const sid = (m as { session_id?: string }).session_id;
          if (sid && !sessionId) sessionId = sid;
        }
      }
    } catch (err) {
      cb.onTurnError?.(err as Error, { asOf, dateIso });
    }

    if (sessionId) resume = sessionId;

    db.prepare(
      `INSERT OR REPLACE INTO backtest_turns
         (run_id, as_of, session_id, prompt, response, in_tokens, out_tokens, cost_usd,
          cache_read_tokens, cache_creation_tokens)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      runId,
      asOf,
      sessionId ?? null,
      prompt,
      response,
      inTokens,
      outTokens,
      costUsd,
      cacheReadTokens,
      cacheCreationTokens,
    );

    const cs = getCacheStats();
    cb.onTurnEnd?.({
      asOf,
      dateIso,
      prompt,
      response,
      sessionId,
      inTokens,
      outTokens,
      costUsd,
      toolCalls,
      cacheReadTokens,
      cacheCreationTokens,
      cacheHits: cs.hits,
      cacheMisses: cs.misses,
      inflightCollapses: cs.inflight_collapses,
      llmReplayHit: stream.replayed === true,
    });

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

  broker.setPriceOverride(null);
  db.prepare("UPDATE backtest_runs SET finished_at = ? WHERE id = ?").run(
    Math.floor(Date.now() / 1000),
    runId,
  );

  const equityRows = db
    .prepare("SELECT as_of, mtm_vnd, benchmark_mtm_vnd FROM backtest_equity WHERE run_id = ? ORDER BY as_of")
    .all(runId) as { as_of: number; mtm_vnd: number; benchmark_mtm_vnd: number }[];
  const turnRows = db
    .prepare("SELECT in_tokens, out_tokens, cost_usd FROM backtest_turns WHERE run_id = ?")
    .all(runId) as { in_tokens: number; out_tokens: number; cost_usd: number }[];
  const orderRows = db
    .prepare("SELECT * FROM broker_orders WHERE broker = ? AND status = 'FILLED' ORDER BY created_at")
    .all(brokerName) as Array<{ ticker: string; side: string; filled_price: number; filled_qty: number; created_at: number }>;

  const last = equityRows[equityRows.length - 1];
  const finalMtm = last?.mtm_vnd ?? opts.initialCash;
  const finalBench = last?.benchmark_mtm_vnd ?? opts.initialCash;
  const totalReturn = (finalMtm / opts.initialCash - 1) * 100;
  const benchReturn = (finalBench / opts.initialCash - 1) * 100;
  const peak = equityRows.reduce((m, r) => Math.max(m, r.mtm_vnd), opts.initialCash);
  const maxDD =
    equityRows.length === 0
      ? 0
      : equityRows.reduce((mn, r) => Math.min(mn, r.mtm_vnd / peak - 1), 0);
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
    reportPath: null,
  };
  cb.onComplete?.(summary);
  return summary;
}
