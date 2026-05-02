import { useCallback, useEffect, useRef, useState } from "react";
import { runTurn, resetSession } from "../../agent/orchestrator.js";

const FLUSH_INTERVAL_MS = 80; // ~12fps; halves Ink tree-diff rate vs 50ms while still feeling live

export type ChatRole = "user" | "thinking" | "text" | "tool_use" | "tool_result" | "system" | "error";

export interface ChatBlock {
  id: string;
  role: ChatRole;
  text: string;
  toolName?: string;
  toolInput?: string;
  toolUseId?: string;
}

export interface TurnStats {
  inTokens: number;
  outTokens: number;
  costUsd: number;
  sessionId?: string;
}

export interface AgentStreamState {
  blocks: ChatBlock[];
  streaming: boolean;
  cumulative: TurnStats;
  send: (prompt: string) => Promise<void>;
  abort: () => void;
  reset: () => void;
}

let blockSeq = 0;
function nextId() {
  blockSeq += 1;
  return `b${blockSeq}`;
}

export function useAgentStream(): AgentStreamState {
  const [blocks, setBlocks] = useState<ChatBlock[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [cumulative, setCumulative] = useState<TurnStats>({ inTokens: 0, outTokens: 0, costUsd: 0 });
  const abortRef = useRef(false);

  // Coalesce stream-delta writes: write to a ref-mirror of the blocks array
  // and flush to React state on a fixed cadence so per-token deltas don't
  // each trigger a full Ink re-render.
  const blocksRef = useRef<ChatBlock[]>([]);
  const dirtyRef = useRef(false);
  const flushTimer = useRef<NodeJS.Timeout | null>(null);

  const scheduleFlush = () => {
    if (flushTimer.current != null) return;
    flushTimer.current = setTimeout(() => {
      flushTimer.current = null;
      if (!dirtyRef.current) return;
      dirtyRef.current = false;
      setBlocks(blocksRef.current.slice());
    }, FLUSH_INTERVAL_MS);
  };

  const flushNow = () => {
    if (flushTimer.current != null) {
      clearTimeout(flushTimer.current);
      flushTimer.current = null;
    }
    if (dirtyRef.current) {
      dirtyRef.current = false;
      setBlocks(blocksRef.current.slice());
    }
  };

  useEffect(() => () => {
    if (flushTimer.current != null) clearTimeout(flushTimer.current);
  }, []);

  // Structural changes (new block boundary) must be visible immediately
  // so the next delta lands on the right row.
  const append = (b: ChatBlock) => {
    blocksRef.current = [...blocksRef.current, b];
    dirtyRef.current = true;
    flushNow();
  };

  // Delta updates are mutated in place on the ref and flushed on a timer.
  const updateLast = (role: ChatRole, mut: (b: ChatBlock) => ChatBlock) => {
    const arr = blocksRef.current;
    for (let i = arr.length - 1; i >= 0; i--) {
      if (arr[i]!.role === role) {
        arr[i] = mut(arr[i]!);
        dirtyRef.current = true;
        scheduleFlush();
        return;
      }
    }
  };

  const send = useCallback(async (prompt: string) => {
    if (!prompt.trim()) return;
    abortRef.current = false;
    setStreaming(true);
    append({ id: nextId(), role: "user", text: prompt });

    let currentRole: "thinking" | "text" | null = null;

    try {
      for await (const m of runTurn(prompt)) {
        if (abortRef.current) break;
        if (m.type === "stream_event") {
          const ev = (m as { event: any }).event;
          if (ev?.type === "content_block_start") {
            const cb = ev.content_block;
            if (cb?.type === "thinking") {
              currentRole = "thinking";
              append({ id: nextId(), role: "thinking", text: "" });
            } else if (cb?.type === "text") {
              currentRole = "text";
              append({ id: nextId(), role: "text", text: "" });
            } else if (cb?.type === "tool_use") {
              currentRole = null;
              append({
                id: nextId(),
                role: "tool_use",
                text: "",
                toolName: cb.name,
                toolUseId: cb.id,
              });
            }
          } else if (ev?.type === "content_block_delta") {
            const d = ev.delta;
            if (d?.type === "thinking_delta" && d.thinking) {
              updateLast("thinking", (b) => ({ ...b, text: b.text + d.thinking }));
            } else if (d?.type === "text_delta" && d.text) {
              updateLast("text", (b) => ({ ...b, text: b.text + d.text }));
            } else if (d?.type === "input_json_delta" && d.partial_json) {
              updateLast("tool_use", (b) => ({ ...b, toolInput: (b.toolInput ?? "") + d.partial_json }));
            }
          } else if (ev?.type === "content_block_stop") {
            currentRole = null;
          }
        } else if (m.type === "user") {
          const content = (m as any).message?.content;
          if (Array.isArray(content)) {
            for (const c of content) {
              if (c?.type === "tool_result") {
                const text = typeof c.content === "string"
                  ? c.content
                  : Array.isArray(c.content)
                    ? c.content.map((x: any) => x?.text ?? "").join("")
                    : JSON.stringify(c.content);
                append({
                  id: nextId(),
                  role: "tool_result",
                  text: text.slice(0, 800),
                  toolUseId: c.tool_use_id,
                });
              }
            }
          }
        } else if (m.type === "result") {
          const r = m as unknown as {
            session_id?: string;
            total_cost_usd?: number;
            usage?: { input_tokens?: number; output_tokens?: number };
          };
          setCumulative((prev) => ({
            inTokens: prev.inTokens + (r.usage?.input_tokens ?? 0),
            outTokens: prev.outTokens + (r.usage?.output_tokens ?? 0),
            costUsd: prev.costUsd + (r.total_cost_usd ?? 0),
            sessionId: r.session_id ?? prev.sessionId,
          }));
        }
      }
    } catch (err) {
      append({ id: nextId(), role: "error", text: (err as Error).message });
    } finally {
      flushNow();
      setStreaming(false);
      currentRole = null;
    }
  }, []);

  const abort = useCallback(() => {
    abortRef.current = true;
  }, []);

  const reset = useCallback(() => {
    abortRef.current = true;
    resetSession();
    blocksRef.current = [];
    dirtyRef.current = false;
    if (flushTimer.current != null) {
      clearTimeout(flushTimer.current);
      flushTimer.current = null;
    }
    setBlocks([]);
    setCumulative({ inTokens: 0, outTokens: 0, costUsd: 0 });
  }, []);

  return { blocks, streaming, cumulative, send, abort, reset };
}
