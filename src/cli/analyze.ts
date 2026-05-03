#!/usr/bin/env node
import { runTeamAnalysis } from "../agent/team/index.js";
import type { TeamEvent } from "../agent/team/state.js";

function usage(): never {
  console.error("Usage: pnpm analyze <TICKER> [--rounds N] [--as-of YYYY-MM-DD]");
  process.exit(2);
}

function parseArgs(argv: string[]): { ticker: string; rounds?: number; asOf?: string } {
  const args = argv.slice(2);
  if (args.length === 0) usage();
  let ticker: string | undefined;
  let rounds: number | undefined;
  let asOf: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === "--rounds") {
      rounds = Number(args[++i]);
    } else if (a === "--as-of") {
      asOf = args[++i];
    } else if (!a.startsWith("-")) {
      ticker = a;
    }
  }
  if (!ticker) usage();
  return { ticker: ticker!, rounds, asOf };
}

function emit(ev: TeamEvent): void {
  switch (ev.type) {
    case "run_start":
      process.stdout.write(`▶ team run ${ev.runId.slice(0, 8)} on ${ev.ticker}\n`);
      break;
    case "role_start": {
      const tag = ev.round != null ? `${ev.role}#${ev.round}` : ev.role;
      process.stdout.write(`  · ${tag} ...\n`);
      break;
    }
    case "role_tool":
      process.stdout.write(`     [${ev.role}] ${ev.tool}${formatToolInput(ev.input)}\n`);
      break;
    case "role_tool_result":
      process.stdout.write(`     [${ev.role}] ${ev.tool ?? "tool"} result: ${formatToolResult(ev.content)}\n`);
      break;
    case "role_end": {
      const tag = ev.round != null ? `${ev.role}#${ev.round}` : ev.role;
      const summary = summarize(ev.output);
      process.stdout.write(`  ✓ ${tag} → ${summary}\n`);
      break;
    }
    case "final":
      process.stdout.write(
        `\n=== FINAL: ${ev.decision.rating} ${ev.decision.ticker} ` +
          `size=${(ev.decision.sizingPct * 100).toFixed(1)}% ` +
          `(journal #${ev.decision.journalId}) ===\n` +
          `${ev.decision.rationale}\n` +
          (ev.decision.exitPlan ? `Exit: ${ev.decision.exitPlan}\n` : ""),
      );
      break;
    case "error":
      process.stderr.write(`✗ ${ev.role ?? "team"}: ${ev.message}\n`);
      break;
  }
}

function formatToolInput(input?: string): string {
  if (!input) return "";
  try {
    const parsed = JSON.parse(input) as Record<string, unknown>;
    const query = parsed.query ?? parsed.q ?? parsed.search_query ?? parsed.url;
    if (query != null) return `: ${String(query)}`;
  } catch {
    // Fall back to raw streamed JSON.
  }
  return `: ${input.replace(/\s+/g, " ").trim()}`;
}

function formatToolResult(content: string): string {
  return content.replace(/\s+/g, " ").trim().slice(0, 900);
}

function summarize(output: unknown): string {
  if (output && typeof output === "object") {
    const o = output as Record<string, unknown>;
    if ("score" in o && "summary" in o) {
      return `score=${Number(o.score).toFixed(2)} — ${String(o.summary).slice(0, 80)}`;
    }
    if ("rating" in o && "sizingPct" in o) {
      return `${o.rating} size=${(Number(o.sizingPct) * 100).toFixed(1)}%`;
    }
    if ("approved" in o) {
      return `approved=${o.approved} adj=${(Number(o.adjustedSizingPct) * 100).toFixed(1)}%`;
    }
    if ("thesis" in o) {
      return String(o.thesis).slice(0, 80);
    }
  }
  return JSON.stringify(output).slice(0, 80);
}

async function main() {
  const { ticker, rounds, asOf } = parseArgs(process.argv);
  try {
    const { decision } = await runTeamAnalysis(
      { ticker, debateRounds: rounds, asOfDateIso: asOf },
      { emit },
    );
    process.exit(decision.rating === "Buy" || decision.rating === "Sell" ? 0 : 0);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`error: ${msg}\n`);
    process.exit(1);
  }
}

main();
