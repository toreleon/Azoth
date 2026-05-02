import { useCallback, useEffect, useRef, useState } from "react";
import {
  readActiveSessionRecords,
  recentSessions,
  resetSession,
  resumeLatestSession,
  resumeSession,
  runTurn,
  startNewSession,
} from "../../agent/orchestrator.js";
import type { SessionIndexEntry, SessionRecord } from "../../runtime/sessionStore.js";

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
  newSession: () => void;
  resumeLatest: () => void;
  resumeById: (id: string) => void;
  listSessions: () => SessionIndexEntry[];
  systemMessage: (text: string) => void;
}

let blockSeq = 0;
function nextId() {
  blockSeq += 1;
  return `b${blockSeq}`;
}

function blocksFromRecords(records: SessionRecord[]): ChatBlock[] {
  const blocks: ChatBlock[] = [];
  for (const r of records) {
    if (r.type === "user" && r.text) {
      blocks.push({ id: nextId(), role: "user", text: r.text });
    } else if (r.type === "assistant" && r.text) {
      blocks.push({ id: nextId(), role: "text", text: r.text });
    } else if (r.type === "thinking" && r.text) {
      blocks.push({ id: nextId(), role: "thinking", text: r.text });
    } else if (r.type === "tool_use") {
      blocks.push({
        id: nextId(),
        role: "tool_use",
        text: "",
        toolName: r.toolName,
        toolUseId: r.toolUseId,
        toolInput: r.toolInput,
      });
    } else if (r.type === "tool_result") {
      blocks.push({
        id: nextId(),
        role: "tool_result",
        text: r.text ?? "",
        toolUseId: r.toolUseId,
      });
    } else if (r.type === "system" && r.text) {
      blocks.push({ id: nextId(), role: "system", text: r.text });
    }
  }
  return blocks;
}

function statsFromRecords(records: SessionRecord[]): TurnStats {
  return records.reduce<TurnStats>((acc, r) => {
    if (r.type !== "result") return acc;
    return {
      inTokens: acc.inTokens + (r.usage?.inputTokens ?? 0),
      outTokens: acc.outTokens + (r.usage?.outputTokens ?? 0),
      costUsd: acc.costUsd + (r.costUsd ?? 0),
      sessionId: r.sdkSessionId ?? acc.sessionId,
    };
  }, { inTokens: 0, outTokens: 0, costUsd: 0 });
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

  useEffect(() => {
    const records = readActiveSessionRecords();
    if (records.length === 0) return;
    const restored = blocksFromRecords(records);
    blocksRef.current = restored;
    setBlocks(restored);
    setCumulative(statsFromRecords(records));
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

  const addSystem = useCallback((text: string) => {
    append({ id: nextId(), role: "system", text });
  }, []);

  const newSession = useCallback(() => {
    abortRef.current = true;
    const session = startNewSession();
    blocksRef.current = [];
    dirtyRef.current = false;
    setBlocks([]);
    setCumulative({ inTokens: 0, outTokens: 0, costUsd: 0 });
    addSystem(`Started new session ${session.id.slice(0, 8)}.`);
  }, [addSystem]);

  const resumeLatest = useCallback(() => {
    abortRef.current = true;
    const session = resumeLatestSession();
    if (!session) {
      addSystem("No previous sessions found.");
      return;
    }
    const records = readActiveSessionRecords();
    const restored = blocksFromRecords(records);
    blocksRef.current = restored;
    setBlocks(restored);
    setCumulative(statsFromRecords(records));
    addSystem(`Resumed session ${session.id.slice(0, 8)}.`);
  }, [addSystem]);

  const resumeById = useCallback((id: string) => {
    abortRef.current = true;
    const session = resumeSession(id);
    if (!session) {
      addSystem(`Session not found: ${id}`);
      return;
    }
    const records = readActiveSessionRecords();
    const restored = blocksFromRecords(records);
    blocksRef.current = restored;
    setBlocks(restored);
    setCumulative(statsFromRecords(records));
    addSystem(`Resumed session ${session.id.slice(0, 8)}.`);
  }, [addSystem]);

  const listSessions = useCallback(() => recentSessions(10), []);

  return { blocks, streaming, cumulative, send, abort, reset, newSession, resumeLatest, resumeById, listSessions, systemMessage: addSystem };
}
