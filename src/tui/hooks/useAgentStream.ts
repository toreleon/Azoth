import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  readActiveSessionRecords,
  recentSessions,
  recordLocalTurn,
  resetSession,
  resumeLatestSession,
  resumeSession,
  runTurn,
  startNewSession,
} from "../../agent/orchestrator.js";
import type { SessionIndexEntry, SessionRecord } from "../../runtime/sessionStore.js";

const FLUSH_INTERVAL_MS = 33; // ~30fps active-block coalescing; committed blocks bypass this and go straight to <Static>.

export type ChatRole = "user" | "thinking" | "text" | "tool_use" | "tool_result" | "system" | "error" | "card";

export interface ChatBlock {
  id: string;
  role: ChatRole;
  text: string;
  toolName?: string;
  toolInput?: string;
  toolUseId?: string;
  node?: ReactNode;
}

export interface TurnStats {
  inTokens: number;
  outTokens: number;
  costUsd: number;
  sessionId?: string;
}

export interface AgentStreamState {
  // Committed blocks: append-only. Render via Ink's <Static> to write each
  // block to terminal scrollback exactly once and avoid full-region repaints.
  committed: ChatBlock[];
  // The in-flight streaming block (thinking/text/tool_use). Mutates rapidly;
  // render in the dynamic region only. Null between blocks and when idle.
  active: ChatBlock | null;
  streaming: boolean;
  cumulative: TurnStats;
  send: (prompt: string) => Promise<void>;
  beginLocalResponse: (prompt?: string) => void;
  appendLocalResponse: (text: string) => void;
  finishLocalResponse: () => void;
  abort: () => void;
  reset: () => void;
  newSession: () => void;
  resumeLatest: () => void;
  resumeById: (id: string) => void;
  listSessions: () => SessionIndexEntry[];
  systemMessage: (text: string) => void;
  appendCard: (node: ReactNode) => void;
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

interface View {
  committed: ChatBlock[];
  active: ChatBlock | null;
}

export function useAgentStream(): AgentStreamState {
  // Single state object so transitions like "finalize active → committed"
  // are one setState instead of three. Multiple setStates per microtask
  // were causing Ink's reconciler to throw "Should not already be working".
  const [view, setView] = useState<View>({ committed: [], active: null });
  const [streaming, setStreaming] = useState(false);
  const [cumulative, setCumulative] = useState<TurnStats>({ inTokens: 0, outTokens: 0, costUsd: 0 });
  const abortRef = useRef(false);
  const localPromptRef = useRef<string | undefined>(undefined);
  const localTextRef = useRef("");

  // Coalesce active-block delta writes: mutate a ref mirror and flush to
  // React state on a fixed cadence so per-token deltas don't each trigger a
  // re-render. Committed blocks bypass this — they're appended synchronously
  // and rendered via <Static>, which writes them to scrollback exactly once.
  const activeRef = useRef<ChatBlock | null>(null);
  const activeDirty = useRef(false);
  const flushTimer = useRef<NodeJS.Timeout | null>(null);

  const flushActiveState = () => {
    activeDirty.current = false;
    const snap = activeRef.current ? { ...activeRef.current } : null;
    setView((v) => (v.active === snap ? v : { ...v, active: snap }));
  };

  const scheduleFlush = () => {
    if (flushTimer.current != null) return;
    flushTimer.current = setTimeout(() => {
      flushTimer.current = null;
      if (!activeDirty.current) return;
      flushActiveState();
    }, FLUSH_INTERVAL_MS);
  };

  const cancelFlushTimer = () => {
    if (flushTimer.current != null) {
      clearTimeout(flushTimer.current);
      flushTimer.current = null;
    }
  };

  useEffect(() => () => cancelFlushTimer(), []);

  useEffect(() => {
    startNewSession();
  }, []);

  // Append a finalized block straight to the committed list. <Static> in the
  // consumer renders and forgets it — no further repaints for this block.
  const appendCommitted = (b: ChatBlock) => {
    setView((v) => ({ ...v, committed: [...v.committed, b] }));
  };

  // Move whatever is in `active` into the committed list and clear active —
  // single setState so Ink commits both transitions in one render.
  const finalizeActive = () => {
    cancelFlushTimer();
    const cur = activeRef.current;
    if (!cur) {
      activeDirty.current = false;
      return;
    }
    activeRef.current = null;
    activeDirty.current = false;
    setView((v) => ({ committed: [...v.committed, cur], active: null }));
  };

  // Start a new active block. Any prior active block is finalized first so it
  // commits to scrollback before the next one begins.
  const startActive = (b: ChatBlock) => {
    cancelFlushTimer();
    const prior = activeRef.current;
    activeRef.current = b;
    activeDirty.current = false;
    setView((v) => ({
      committed: prior ? [...v.committed, prior] : v.committed,
      active: b,
    }));
  };

  // Delta update on the active block. Mutates the ref and flushes on a timer.
  const updateActive = (mut: (b: ChatBlock) => ChatBlock) => {
    if (!activeRef.current) return;
    activeRef.current = mut(activeRef.current);
    activeDirty.current = true;
    scheduleFlush();
  };

  const send = useCallback(async (prompt: string) => {
    if (!prompt.trim()) return;
    abortRef.current = false;
    setStreaming(true);
    appendCommitted({ id: nextId(), role: "user", text: prompt });

    try {
      for await (const m of runTurn(prompt)) {
        if (abortRef.current) break;
        if (m.type === "stream_event") {
          const ev = (m as { event: any }).event;
          if (ev?.type === "content_block_start") {
            const cb = ev.content_block;
            if (cb?.type === "thinking") {
              startActive({ id: nextId(), role: "thinking", text: "" });
            } else if (cb?.type === "text") {
              startActive({ id: nextId(), role: "text", text: "" });
            } else if (cb?.type === "tool_use") {
              startActive({
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
              updateActive((b) => (b.role === "thinking" ? { ...b, text: b.text + d.thinking } : b));
            } else if (d?.type === "text_delta" && d.text) {
              updateActive((b) => (b.role === "text" ? { ...b, text: b.text + d.text } : b));
            } else if (d?.type === "input_json_delta" && d.partial_json) {
              updateActive((b) => (b.role === "tool_use" ? { ...b, toolInput: (b.toolInput ?? "") + d.partial_json } : b));
            }
          } else if (ev?.type === "content_block_stop") {
            finalizeActive();
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
                appendCommitted({
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
      finalizeActive();
      appendCommitted({ id: nextId(), role: "error", text: (err as Error).message });
    } finally {
      finalizeActive();
      setStreaming(false);
    }
  }, []);

  const beginLocalResponse = useCallback((prompt?: string) => {
    abortRef.current = false;
    localPromptRef.current = prompt;
    localTextRef.current = "";
    setStreaming(true);
    if (prompt?.trim()) appendCommitted({ id: nextId(), role: "user", text: prompt });
    startActive({ id: nextId(), role: "text", text: "" });
  }, []);

  const appendLocalResponse = useCallback((text: string) => {
    localTextRef.current += text;
    updateActive((b) => (b.role === "text" ? { ...b, text: b.text + text } : b));
  }, []);

  const finishLocalResponse = useCallback(() => {
    const prompt = localPromptRef.current;
    const text = localTextRef.current.trim();
    if (prompt?.trim() && text) recordLocalTurn(prompt, text);
    localPromptRef.current = undefined;
    localTextRef.current = "";
    finalizeActive();
    setStreaming(false);
  }, []);

  const abort = useCallback(() => {
    abortRef.current = true;
  }, []);

  const clearAll = () => {
    activeRef.current = null;
    activeDirty.current = false;
    cancelFlushTimer();
    setView({ committed: [], active: null });
  };

  const reset = useCallback(() => {
    abortRef.current = true;
    resetSession();
    clearAll();
    setCumulative({ inTokens: 0, outTokens: 0, costUsd: 0 });
  }, []);

  const addSystem = useCallback((text: string) => {
    appendCommitted({ id: nextId(), role: "system", text });
  }, []);

  const addCard = useCallback((node: ReactNode) => {
    appendCommitted({ id: nextId(), role: "card", text: "", node });
  }, []);

  const newSession = useCallback(() => {
    abortRef.current = true;
    const session = startNewSession();
    clearAll();
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
    activeRef.current = null;
    activeDirty.current = false;
    cancelFlushTimer();
    setView({ committed: blocksFromRecords(records), active: null });
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
    activeRef.current = null;
    activeDirty.current = false;
    cancelFlushTimer();
    setView({ committed: blocksFromRecords(records), active: null });
    setCumulative(statsFromRecords(records));
    addSystem(`Resumed session ${session.id.slice(0, 8)}.`);
  }, [addSystem]);

  const listSessions = useCallback(() => recentSessions(10), []);

  return {
    committed: view.committed,
    active: view.active,
    streaming,
    cumulative,
    send,
    beginLocalResponse,
    appendLocalResponse,
    finishLocalResponse,
    abort,
    reset,
    newSession,
    resumeLatest,
    resumeById,
    listSessions,
    systemMessage: addSystem,
    appendCard: addCard,
  };
}
