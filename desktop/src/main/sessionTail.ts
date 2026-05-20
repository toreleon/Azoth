import { existsSync, statSync, createReadStream, watch, type FSWatcher } from "node:fs";
import { sessionFile } from "@azoth/core/runtime/sessionStore.js";
import type { ChatRecord, StreamEvent } from "../shared/ipc.js";
import { sendStream } from "./streamBus.js";

interface TailHandle {
  stop(): void;
}

interface ActiveTail {
  sessionId: string;
  turnId: string;
  offset: number;
  buffer: string;
  watcher: FSWatcher | null;
  reading: boolean;
  closed: boolean;
}

function recordToEvent(turnId: string, record: ChatRecord): StreamEvent | null {
  switch (record.type) {
    case "thinking":
    case "assistant":
      return {
        kind: "turn:record",
        turnId,
        sessionId: record.sessionId,
        record,
      };
    case "tool_use":
    case "tool_result":
    case "user":
    case "system":
      return {
        kind: "turn:record",
        turnId,
        sessionId: record.sessionId,
        record,
      };
    case "result":
      return {
        kind: "turn:record",
        turnId,
        sessionId: record.sessionId,
        record,
      };
    default:
      return null;
  }
}

async function drain(state: ActiveTail, path: string): Promise<void> {
  if (state.reading) return;
  state.reading = true;
  try {
    if (!existsSync(path)) return;
    const size = statSync(path).size;
    if (size <= state.offset) return;
    await new Promise<void>((resolve, reject) => {
      const stream = createReadStream(path, {
        start: state.offset,
        end: size - 1,
        encoding: "utf8",
      });
      stream.on("data", (chunk) => {
        state.buffer += chunk;
      });
      stream.on("error", reject);
      stream.on("end", () => {
        state.offset = size;
        let nl = state.buffer.indexOf("\n");
        while (nl !== -1) {
          const line = state.buffer.slice(0, nl).trim();
          state.buffer = state.buffer.slice(nl + 1);
          if (line) {
            try {
              const record = JSON.parse(line) as ChatRecord;
              const ev = recordToEvent(state.turnId, record);
              if (ev) sendStream(ev);
            } catch {
              // ignore malformed line
            }
          }
          nl = state.buffer.indexOf("\n");
        }
        resolve();
      });
    });
  } finally {
    state.reading = false;
  }
}

export function tailSession(opts: {
  sessionId: string;
  turnId: string;
  cwd: string;
}): TailHandle {
  const path = sessionFile(opts.sessionId, opts.cwd);
  const state: ActiveTail = {
    sessionId: opts.sessionId,
    turnId: opts.turnId,
    offset: existsSync(path) ? statSync(path).size : 0,
    buffer: "",
    watcher: null,
    reading: false,
    closed: false,
  };
  try {
    state.watcher = watch(path, { persistent: false }, () => {
      void drain(state, path);
    });
  } catch {
    // file may not exist yet; fallback handled below
  }
  const interval = setInterval(() => {
    void drain(state, path);
  }, 80);
  return {
    stop() {
      clearInterval(interval);
      try {
        state.watcher?.close();
      } catch {
        /* noop */
      }
      // Final drain.
      void drain(state, path).finally(() => {
        state.closed = true;
      });
    },
  };
}
