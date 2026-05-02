#!/usr/bin/env node
/**
 * Phase 6 agent-driven backtest. Replays the watchlist week-by-week (Friday
 * closes), letting the LLM agent decide BUY/SELL/HOLD each week using a
 * lookahead-clamped tool subset. Records turns, equity, and trades to SQLite
 * and writes a JSON report under ~/.azoth/logs/backtests/.
 *
 *   pnpm tsx src/cli/agent-backtest.ts \
 *     --start=2025-01-01 --end=2025-04-30 \
 *     --persona=balanced [--initial-cash=1000000000]
 */
import "../runtime/bootstrap.js";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { runBacktestSession, type BacktestOptions } from "../agent/backtestRunner.js";
import { getDb } from "../storage/db.js";
import { azothPaths } from "../runtime/paths.js";

function parseArgs(argv: string[]): BacktestOptions {
  const out: BacktestOptions = {
    start: "",
    end: "",
    persona: "balanced",
    initialCash: 1_000_000_000,
  };
  for (const a of argv) {
    const m = /^--([\w-]+)=(.+)$/.exec(a);
    if (!m) continue;
    const [, k, v] = m;
    if (k === "start") out.start = v!;
    if (k === "end") out.end = v!;
    if (k === "persona") out.persona = v!;
    if (k === "initial-cash") out.initialCash = Number(v);
  }
  if (!out.start || !out.end) {
    throw new Error("--start=YYYY-MM-DD and --end=YYYY-MM-DD are required");
  }
  return out;
}

const DIM = "\x1b[2m";
const ITALIC = "\x1b[3m";
const CYAN = "\x1b[36m";
const RESET = "\x1b[0m";

type StreamMode = "idle" | "thinking" | "text";

function setMode(state: { mode: StreamMode; thinkingHeaderShown: boolean }, next: "thinking" | "text") {
  if (state.mode === next) return;
  if (state.mode !== "idle") process.stdout.write("\n");
  if (next === "thinking" && !state.thinkingHeaderShown) {
    process.stdout.write(`${DIM}${ITALIC}[thinking]${RESET}${DIM} `);
    state.thinkingHeaderShown = true;
  } else if (next === "thinking") {
    process.stdout.write(`${DIM} `);
  }
  state.mode = next;
}

function endStreamLine(state: { mode: StreamMode; thinkingHeaderShown: boolean }) {
  if (state.mode === "thinking") process.stdout.write(RESET);
  if (state.mode !== "idle") process.stdout.write("\n");
  state.mode = "idle";
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const state = { mode: "idle" as StreamMode, thinkingHeaderShown: false };

  const summary = await runBacktestSession(args, {
    onStart: ({ runId, persona, brokerName, fridays, universe }) => {
      console.log(`Azoth backtest (agent-driven, dynamic watchlist)`);
      console.log(`  run_id=${runId}  persona=${persona.id}  broker=${brokerName}`);
      console.log(`  ${args.start} → ${args.end}`);
      console.log(`  discovery universe: ${universe.length} tickers (agent picks 5–10/week)`);
      console.log(`  initial cash: ${(args.initialCash / 1e6).toFixed(0)}M VND\n`);
      console.log(`Replaying ${fridays.length} weekly closes...\n`);
    },
    onTurnStart: ({ dateIso }) => {
      state.thinkingHeaderShown = false;
      console.log(`\n${CYAN}── ${dateIso} ─────────────────────────────${RESET}`);
    },
    onStreamEvent: (m: any) => {
      if (m.type === "stream_event") {
        const ev = m.event;
        if (ev?.type === "content_block_start") {
          const cb = ev.content_block;
          if (cb?.type === "thinking") setMode(state, "thinking");
          else if (cb?.type === "text") setMode(state, "text");
          else if (cb?.type === "tool_use") {
            endStreamLine(state);
            process.stdout.write(`${DIM}[tool: ${cb.name}]${RESET}\n`);
          }
        } else if (ev?.type === "content_block_delta") {
          const d = ev.delta;
          if (d?.type === "thinking_delta" && d.thinking) {
            setMode(state, "thinking");
            process.stdout.write(d.thinking);
          } else if (d?.type === "text_delta" && d.text) {
            setMode(state, "text");
            process.stdout.write(d.text);
          }
        } else if (ev?.type === "content_block_stop" || ev?.type === "message_stop") {
          endStreamLine(state);
        }
      } else if (m.type === "result") {
        endStreamLine(state);
      }
    },
    onTurnError: (err) => {
      endStreamLine(state);
      console.error(`  turn error: ${err.message}`);
    },
    onEquity: ({ cashVnd, mtmVnd, benchmarkMtmVnd }) => {
      console.log(
        `\n${DIM}  cash=${(cashVnd / 1e6).toFixed(0)}M  mtm=${(mtmVnd / 1e6).toFixed(0)}M  vnindex=${(benchmarkMtmVnd / 1e6).toFixed(0)}M${RESET}`,
      );
    },
  });

  console.log("");
  console.log("=== Summary ===");
  console.log(`  weeks: ${summary.weeks}`);
  console.log(`  trades filled: ${summary.trades}`);
  console.log(`  final mtm: ${(summary.finalMtm / 1e6).toFixed(2)}M VND  (return ${summary.totalReturn.toFixed(2)}%)`);
  console.log(`  vnindex b&h: ${(summary.finalBench / 1e6).toFixed(2)}M VND  (return ${summary.benchReturn.toFixed(2)}%)`);
  console.log(`  alpha: ${(summary.totalReturn - summary.benchReturn).toFixed(2)}%`);
  console.log(`  max drawdown: ${(summary.maxDD * 100).toFixed(2)}%`);
  console.log(`  llm: in=${summary.totalInTokens} out=${summary.totalOutTokens} cost=$${summary.totalCost.toFixed(4)}`);

  const db = getDb();
  const equityRows = db
    .prepare("SELECT as_of, cash_vnd, mtm_vnd, benchmark_mtm_vnd FROM backtest_equity WHERE run_id = ? ORDER BY as_of")
    .all(summary.runId);
  const tradeRows = db
    .prepare("SELECT * FROM broker_orders WHERE status = 'FILLED' AND broker LIKE ? ORDER BY created_at")
    .all(`paper-bt-${summary.runId.slice(0, 8)}`);

  const outDir = resolve(azothPaths().logs, "backtests");
  mkdirSync(outDir, { recursive: true });
  const reportPath = resolve(outDir, `backtest-${summary.runId}.json`);
  writeFileSync(
    reportPath,
    JSON.stringify({ ...summary, equity: equityRows, trades: tradeRows }, null, 2),
  );
  console.log(`  report: ${reportPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
