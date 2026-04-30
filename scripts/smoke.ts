import "dotenv/config";
import { runTurn } from "../src/agent/orchestrator.js";

const prompt = process.argv.slice(2).join(" ") || "Say hi in one short sentence.";
console.log(`prompt: ${prompt}\n---`);

let count = 0;
for await (const m of runTurn(prompt)) {
  count++;
  // Print every message type + a short preview so we can see what z.ai returns.
  const tag = (m as { type?: string }).type ?? "?";
  if (tag === "stream_event") {
    const ev = (m as { event: { type?: string; delta?: { type?: string; text?: string; thinking?: string } } }).event;
    const dt = ev.delta?.text ?? ev.delta?.thinking ?? "";
    console.log(`[${tag}] ${ev.type} ${ev.delta?.type ?? ""} ${dt.slice(0, 80)}`);
  } else if (tag === "assistant") {
    console.log(`[assistant]`, JSON.stringify((m as { message: unknown }).message).slice(0, 300));
  } else if (tag === "result") {
    console.log(`[result]`, JSON.stringify(m).slice(0, 600));
  } else {
    console.log(`[${tag}]`, JSON.stringify(m).slice(0, 200));
  }
}
console.log(`---\ntotal messages: ${count}`);
