#!/usr/bin/env node
/**
 * Phase 6 team-driven backtest. Replays the watchlist week-by-week (Friday
 * closes), runs Azoth's structured analyst/research/trader/risk/portfolio team
 * on discovered candidates, converts final team decisions into paper-broker
 * orders, and writes a JSON report under ~/.azoth/logs/backtests/.
 *
 *   pnpm tsx src/cli/agent-backtest.ts \
 *     --start=2025-01-01 --end=2025-04-30 \
 *     --profile=vn-equity@v0 [--initial-cash=1000000000]
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
    profileRef: "vn-equity@v0",
    initialCash: 1_000_000_000,
  };
  for (const a of argv) {
    const m = /^--([\w-]+)=(.+)$/.exec(a);
    if (!m) continue;
    const [, k, v] = m;
    if (k === "start") out.start = v!;
    if (k === "end") out.end = v!;
    if (k === "profile") out.profileRef = v!;
    if (k === "initial-cash") out.initialCash = Number(v);
    if (k === "max-candidates") out.maxCandidates = Number(v);
  }
  if (!out.start || !out.end) {
    throw new Error("--start=YYYY-MM-DD and --end=YYYY-MM-DD are required");
  }
  return out;
}

const CYAN = "\x1b[36m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const summary = await runBacktestSession(args, {
    onStart: ({ runId, profile, brokerName, fridays, universe }) => {
      console.log(`Azoth backtest (team-driven, dynamic watchlist)`);
      console.log(`  run_id=${runId}  profile=${profile.id}@v${profile.version}  broker=${brokerName}`);
      console.log(`  ${args.start} → ${args.end}`);
      console.log(`  discovery universe: ${universe.length} tickers (team analyzes ${args.maxCandidates ?? 3}/week)`);
      console.log(`  initial cash: ${(args.initialCash / 1e6).toFixed(0)}M VND\n`);
      console.log(`Replaying ${fridays.length} weekly closes...\n`);
    },
    onTurnStart: ({ dateIso }) => {
      console.log(`\n${CYAN}── ${dateIso} ─────────────────────────────${RESET}`);
    },
    onTeamEvent: (ev, { ticker }) => {
      if (ev.type === "role_start") {
        const tag = ev.round != null ? `${ev.role}#${ev.round}` : ev.role;
        console.log(`${DIM}[${ticker}] ${tag} ...${RESET}`);
      } else if (ev.type === "role_tool") {
        console.log(`${DIM}[${ticker}] tool: ${ev.tool}${RESET}`);
      } else if (ev.type === "role_end") {
        const tag = ev.round != null ? `${ev.role}#${ev.round}` : ev.role;
        const o = ev.output as Record<string, unknown>;
        const summary =
          "score" in o
            ? `score=${Number(o.score).toFixed(2)}`
            : "rating" in o
              ? `${o.rating} size=${(Number(o.sizingPct ?? 0) * 100).toFixed(1)}%`
              : "approved" in o
                ? `approved=${o.approved}`
                : "thesis" in o
                  ? String(o.thesis).slice(0, 72)
                  : "ok";
        console.log(`${DIM}[${ticker}] ✓ ${tag} → ${summary}${RESET}`);
      }
    },
    onOrder: (order) => {
      const px = order.filledPrice != null ? ` @ ${order.filledPrice.toFixed(2)}` : "";
      const reason = order.rejectReason ? ` (${order.rejectReason})` : "";
      console.log(`  order ${order.status}: ${order.side} ${order.quantity} ${order.ticker}${px}${reason}`);
    },
    onTurnError: (err) => {
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
  console.log(`  trades rejected: ${summary.rejectedTrades}`);
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
  const rejectedRows = db
    .prepare("SELECT * FROM broker_orders WHERE status = 'REJECTED' AND broker LIKE ? ORDER BY created_at")
    .all(`paper-bt-${summary.runId.slice(0, 8)}`);

  const outDir = resolve(azothPaths().logs, "backtests");
  mkdirSync(outDir, { recursive: true });
  const reportPath = resolve(outDir, `backtest-${summary.runId}.json`);
  writeFileSync(
    reportPath,
    JSON.stringify({ ...summary, equity: equityRows, trades: tradeRows, rejectedOrders: rejectedRows }, null, 2),
  );
  console.log(`  report: ${reportPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
