#!/usr/bin/env node
import "dotenv/config";
import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { runTurn } from "./agent/orchestrator.js";
import { loadConfig } from "./config/loader.js";
import { getDb } from "./storage/db.js";

function printAssistantContent(content: unknown) {
  if (!Array.isArray(content)) {
    process.stdout.write(String(content) + "\n");
    return;
  }
  for (const block of content as Array<{ type: string; text?: string; name?: string }>) {
    if (block.type === "text" && block.text) {
      process.stdout.write(block.text + "\n");
    } else if (block.type === "tool_use" && block.name) {
      process.stdout.write(`  [tool: ${block.name}]\n`);
    }
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
  for (;;) {
    const userInput = (await rl.question("you> ")).trim();
    if (!userInput) break;
    process.stdout.write("\n");
    try {
      for await (const message of runTurn(userInput)) {
        if (message.type === "assistant") {
          printAssistantContent(message.message.content);
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
