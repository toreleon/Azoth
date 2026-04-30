#!/usr/bin/env node
import "dotenv/config";
import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { runTurn } from "./agent/orchestrator.js";
import { loadConfig } from "./config/loader.js";
import { getDb } from "./storage/db.js";

const DIM = "\x1b[2m";
const ITALIC = "\x1b[3m";
const RESET = "\x1b[0m";

type StreamState = {
  mode: "idle" | "thinking" | "text";
  thinkingHeaderShown: boolean;
};

function setMode(state: StreamState, next: "thinking" | "text") {
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

function endStreamLine(state: StreamState) {
  if (state.mode === "thinking") process.stdout.write(RESET);
  if (state.mode !== "idle") process.stdout.write("\n");
  state.mode = "idle";
}

function handleStreamEvent(state: StreamState, ev: any) {
  // Anthropic RawMessageStreamEvent: content_block_start / _delta / _stop
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
  } else if (ev?.type === "content_block_stop") {
    endStreamLine(state);
  } else if (ev?.type === "message_stop") {
    endStreamLine(state);
  }
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY is not set. Copy .env.example to .env and fill it in.");
    process.exit(1);
  }
  const cfg = loadConfig();
  getDb(); // initialize schema
  console.log(`VNStockAgent — autonomy=${cfg.autonomy}, model=${cfg.model}`);
  console.log(`Watchlist: ${cfg.watchlist.join(", ")}`);
  console.log("Type a question. Empty line or Ctrl+C to exit.\n");

  const rl = readline.createInterface({ input, output });
  let stdinClosed = false;
  rl.on("close", () => {
    stdinClosed = true;
  });
  for (;;) {
    if (stdinClosed) break;
    let userInput: string;
    try {
      userInput = (await rl.question("you> ")).trim();
    } catch {
      break;
    }
    if (!userInput) break;
    process.stdout.write("\n");
    const state: StreamState = { mode: "idle", thinkingHeaderShown: false };
    try {
      for await (const message of runTurn(userInput)) {
        if (message.type === "stream_event") {
          handleStreamEvent(state, (message as { event: unknown }).event);
        } else if (message.type === "assistant") {
          // final assistant message — already streamed; just emit tool_use markers we missed
          endStreamLine(state);
        } else if (message.type === "result") {
          const r = message as unknown as {
            total_cost_usd?: number;
            num_turns?: number;
            usage?: { input_tokens?: number; output_tokens?: number };
          };
          const cost = r.total_cost_usd?.toFixed(4) ?? "?";
          console.log(
            `\n  (turns=${r.num_turns ?? "?"}, in=${r.usage?.input_tokens ?? "?"}, out=${r.usage?.output_tokens ?? "?"}, cost=$${cost})\n`,
          );
        }
      }
    } catch (err) {
      console.error(`error: ${(err as Error).message}\n`);
    }
  }
  rl.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
