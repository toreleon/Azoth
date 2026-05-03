#!/usr/bin/env node
import { runTeamQuestion } from "../agent/team/index.js";
import type { TeamEvent } from "../agent/team/state.js";

function usage(): never {
  console.error('Usage: pnpm team <message...> [--model MODEL]');
  process.exit(2);
}

function parseArgs(argv: string[]): { message: string; model?: string } {
  const args = argv.slice(2);
  if (args.length === 0) usage();
  const parts: string[] = [];
  let model: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === "--model") {
      model = args[++i];
    } else if (a.startsWith("--model=")) {
      model = a.slice("--model=".length);
    } else {
      parts.push(a);
    }
  }
  const message = parts.join(" ").trim();
  if (!message) usage();
  return { message, model };
}

function emit(ev: TeamEvent): void {
  switch (ev.type) {
    case "run_start":
      process.stdout.write(`▶ team run ${ev.runId.slice(0, 8)}\n`);
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
      process.stdout.write(`  ✓ ${tag} → ${summarize(ev.output)}\n`);
      break;
    }
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
    if ("thesis" in o) return String(o.thesis).slice(0, 80);
    if ("approved" in o) {
      return `approved=${o.approved} adj=${(Number(o.adjustedSizingPct ?? 0) * 100).toFixed(1)}%`;
    }
    if ("recommendation" in o) return String(o.recommendation).slice(0, 80);
    if ("answer" in o) return String(o.answer).slice(0, 80);
  }
  return JSON.stringify(output).slice(0, 80);
}

async function main() {
  const { message, model } = parseArgs(process.argv);
  try {
    const { decision } = await runTeamQuestion(message, {
      emit,
      modelOverride: model,
    });
    process.stdout.write(
      `\n=== TEAM: ${decision.recommendation} (${decision.teamRunId.slice(0, 8)}) ===\n` +
        `${decision.answer}\n` +
        (decision.keyReasons.length ? `Reasons:\n- ${decision.keyReasons.join("\n- ")}\n` : "") +
        (decision.risks.length ? `Risks:\n- ${decision.risks.join("\n- ")}\n` : "") +
        (decision.nextActions.length ? `Next:\n- ${decision.nextActions.join("\n- ")}\n` : ""),
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`error: ${msg}\n`);
    process.exit(1);
  }
}

main();
