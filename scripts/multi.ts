import "dotenv/config";
import { runTurn } from "../src/agent/orchestrator.js";

async function ask(prompt: string) {
  console.log(`\n>>> ${prompt}\n`);
  let answer = "";
  for await (const m of runTurn(prompt)) {
    if (m.type === "stream_event") {
      const ev = (m as { event: { delta?: { type?: string; text?: string } } }).event;
      if (ev.delta?.type === "text_delta" && ev.delta.text) {
        process.stdout.write(ev.delta.text);
        answer += ev.delta.text;
      }
    } else if (m.type === "result") {
      const r = m as unknown as { session_id?: string };
      console.log(`\n[session=${r.session_id}]`);
    }
  }
  return answer;
}

await ask("Remember this number: 4271. Just confirm in one short sentence.");
await ask("What number did I just ask you to remember? Reply with just the number.");
