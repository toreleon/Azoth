import { create } from "zustand";
import type {
  ChatRecord,
  Project,
  SessionDescriptor,
  StreamEvent,
} from "../../shared/ipc.js";

export interface ConsentRequest {
  id: string;
  action: string;
  detail: string;
  broker: string;
  autonomy: string;
}

export interface TurnStats {
  usage?: ChatRecord["usage"];
  costUsd?: number;
}

interface ChatState {
  projects: Project[];
  activeProjectId: string | null;
  sessions: SessionDescriptor[];
  archivedSessionIds: string[];
  activeSessionId: string | null;
  recordsBySession: Record<string, ChatRecord[]>;
  liveRecordsBySession: Record<string, ChatRecord[]>;
  activeTurnsBySession: Record<string, string>;
  cumulative: { tokens: number; costUsd: number };
  consent: ConsentRequest | null;
  onboarded: boolean;
  config: unknown;

  setProjects(projects: Project[], activeId: string | null): void;
  setActiveProject(id: string): void;
  setSessions(sessions: SessionDescriptor[]): void;
  archiveSession(id: string): void;
  restoreArchivedSession(id: string): void;
  setActiveSession(id: string | null): void;
  setRecords(sessionId: string, records: ChatRecord[]): void;
  appendRecord(sessionId: string, record: ChatRecord): void;
  startStreaming(sessionId: string, turnId: string): void;
  stopStreaming(sessionId?: string): void;
  addUsage(stats: TurnStats): void;
  setConsent(c: ConsentRequest | null): void;
  setOnboarded(value: boolean): void;
  setConfig(cfg: unknown): void;

  applyStreamEvent(event: StreamEvent): void;
}

export const useChatStore = create<ChatState>((set) => ({
  projects: [],
  activeProjectId: null,
  sessions: [],
  archivedSessionIds: [],
  activeSessionId: null,
  recordsBySession: {},
  liveRecordsBySession: {},
  activeTurnsBySession: {},
  cumulative: { tokens: 0, costUsd: 0 },
  consent: null,
  onboarded: false,
  config: null,

  setProjects: (projects, activeId) =>
    set({ projects, activeProjectId: activeId ?? projects[0]?.id ?? null }),
  setActiveProject: (id) =>
    set({
      activeProjectId: id,
      sessions: [],
      archivedSessionIds: [],
      activeSessionId: null,
      recordsBySession: {},
      liveRecordsBySession: {},
      activeTurnsBySession: {},
    }),
  setSessions: (sessions) =>
    set((state) => ({
      sessions: sessions.filter((session) => !state.archivedSessionIds.includes(session.id)),
    })),
  archiveSession: (id) =>
    set((state) => {
      const archivedSessionIds = state.archivedSessionIds.includes(id)
        ? state.archivedSessionIds
        : [...state.archivedSessionIds, id];
      const sessions = state.sessions.filter((session) => session.id !== id);
      const activeSessionId = state.activeSessionId === id ? null : state.activeSessionId;
      const { [id]: _records, ...recordsBySession } = state.recordsBySession;
      const { [id]: _live, ...liveRecordsBySession } = state.liveRecordsBySession;
      const { [id]: _turn, ...activeTurnsBySession } = state.activeTurnsBySession;
      return {
        archivedSessionIds,
        sessions,
        activeSessionId,
        recordsBySession,
        liveRecordsBySession,
        activeTurnsBySession,
      };
    }),
  restoreArchivedSession: (id) =>
    set((state) => ({
      archivedSessionIds: state.archivedSessionIds.filter((archivedId) => archivedId !== id),
    })),
  setActiveSession: (id) => set({ activeSessionId: id }),
  setRecords: (sessionId, records) =>
    set((state) => ({
      recordsBySession: { ...state.recordsBySession, [sessionId]: normalizeToolResults(records) },
      liveRecordsBySession: { ...state.liveRecordsBySession, [sessionId]: [] },
    })),
  appendRecord: (sessionId, record) =>
    set((state) => {
      const existing = state.recordsBySession[sessionId] ?? [];
      return {
        recordsBySession: { ...state.recordsBySession, [sessionId]: [...existing, record] },
      };
    }),
  startStreaming: (sessionId, turnId) =>
    set((state) => ({
      activeTurnsBySession: { ...state.activeTurnsBySession, [sessionId]: turnId },
    })),
  stopStreaming: (sessionId) =>
    set((state) => {
      if (!sessionId) return { activeTurnsBySession: {} };
      const { [sessionId]: _removed, ...activeTurnsBySession } = state.activeTurnsBySession;
      return { activeTurnsBySession };
    }),
  addUsage: (stats) =>
    set((state) => ({
      cumulative: {
        tokens:
          state.cumulative.tokens +
          (stats.usage?.inputTokens ?? 0) +
          (stats.usage?.outputTokens ?? 0),
        costUsd: state.cumulative.costUsd + (stats.costUsd ?? 0),
      },
    })),
  setConsent: (consent) => set({ consent }),
  setOnboarded: (onboarded) => set({ onboarded }),
  setConfig: (config) => set({ config }),

  applyStreamEvent: (event) =>
    set((state) => {
      switch (event.kind) {
        case "turn:record": {
          const sid = event.sessionId;
          const existing = state.recordsBySession[sid] ?? [];
          const live = state.liveRecordsBySession[sid] ?? [];
          if (event.record.type === "tool_result") {
            const nextRecords = attachToolResult(existing, event.record);
            const nextLive = removeMatchingLiveRecord(live, event.record);
            return {
              recordsBySession: { ...state.recordsBySession, [sid]: nextRecords },
              liveRecordsBySession: { ...state.liveRecordsBySession, [sid]: nextLive },
            };
          }
          const last = existing[existing.length - 1];
          if (
            event.record.type === "user" &&
            last?.type === "user" &&
            last.text === event.record.text
          ) {
            return {};
          }
          const nextLive = removeMatchingLiveRecord(live, event.record);
          return {
            recordsBySession: { ...state.recordsBySession, [sid]: [...existing, event.record] },
            liveRecordsBySession: { ...state.liveRecordsBySession, [sid]: nextLive },
          };
        }
        case "turn:block_start": {
          const sid = event.sessionId;
          const live = state.liveRecordsBySession[sid] ?? [];
          const record: ChatRecord = {
            type: event.blockType,
            timestamp: event.timestamp,
            sessionId: sid,
            text: "",
            toolName: event.toolName,
            toolUseId: event.toolUseId,
            toolInput: "",
          };
          return {
            liveRecordsBySession: {
              ...state.liveRecordsBySession,
              [sid]: [...live, record],
            },
          };
        }
        case "turn:block_delta": {
          const sid = event.sessionId;
          const live = state.liveRecordsBySession[sid] ?? [];
          if (live.length === 0) return {};
          const idx = live.length - 1;
          const current = live[idx]!;
          const next =
            current.type === "tool_use"
              ? { ...current, toolInput: `${current.toolInput ?? ""}${event.delta}` }
              : { ...current, text: `${current.text ?? ""}${event.delta}` };
          return {
            liveRecordsBySession: {
              ...state.liveRecordsBySession,
              [sid]: [...live.slice(0, idx), next],
            },
          };
        }
        case "turn:block_stop":
          return {};
        case "turn:done": {
          const { [event.sessionId]: _cleared, ...remainingLive } = state.liveRecordsBySession;
          const { [event.sessionId]: activeTurnId, ...activeTurnsBySession } = state.activeTurnsBySession;
          const nextTurns =
            activeTurnId == null || activeTurnId === event.turnId
              ? activeTurnsBySession
              : state.activeTurnsBySession;
          return {
            activeTurnsBySession: nextTurns,
            liveRecordsBySession: remainingLive,
            cumulative: {
              tokens:
                state.cumulative.tokens +
                (event.usage?.inputTokens ?? 0) +
                (event.usage?.outputTokens ?? 0),
              costUsd: state.cumulative.costUsd + (event.costUsd ?? 0),
            },
          };
        }
        case "turn:error":
          const { [event.sessionId]: failedTurnId, ...remainingTurns } = state.activeTurnsBySession;
          const nextActiveTurns =
            failedTurnId == null || failedTurnId === event.turnId
              ? remainingTurns
              : state.activeTurnsBySession;
          return {
            activeTurnsBySession: nextActiveTurns,
            liveRecordsBySession: {
              ...state.liveRecordsBySession,
              [event.sessionId]: [],
            },
            recordsBySession: {
              ...state.recordsBySession,
              [event.sessionId]: [
                ...(state.recordsBySession[event.sessionId] ?? []),
                {
                  type: "error",
                  timestamp: Date.now(),
                  sessionId: event.sessionId,
                  text: event.message,
                },
              ],
            },
          };
        case "consent:request":
          return {
            consent: {
              id: event.id,
              action: event.action,
              detail: event.detail,
              broker: event.broker,
              autonomy: event.autonomy,
            },
          };
        default:
          return {};
      }
    }),
}));

function removeMatchingLiveRecord(live: ChatRecord[], record: ChatRecord): ChatRecord[] {
  const recordType = record.type === "tool_result" ? "tool_use" : record.type;
  if (!["assistant", "thinking", "tool_use"].includes(recordType)) return live;
  const idx = live.findIndex((candidate) => {
    if (candidate.type !== recordType) return false;
    if (record.toolUseId) {
      return candidate.toolUseId === record.toolUseId;
    }
    return true;
  });
  if (idx < 0) return live;
  return [...live.slice(0, idx), ...live.slice(idx + 1)];
}

function attachToolResult(existing: ChatRecord[], result: ChatRecord): ChatRecord[] {
  if (!result.toolUseId) return [...existing, result];
  const idx = existing.findIndex(
    (record) => record.type === "tool_use" && record.toolUseId === result.toolUseId,
  );
  if (idx < 0) return [...existing, result];
  const toolUse = existing[idx]!;
  const updated: ChatRecord = {
    ...toolUse,
    text: result.text,
    toolName: toolUse.toolName ?? result.toolName,
  };
  return [...existing.slice(0, idx), updated, ...existing.slice(idx + 1)];
}

function normalizeToolResults(records: ChatRecord[]): ChatRecord[] {
  return records.reduce<ChatRecord[]>((acc, record) => {
    if (record.type === "tool_result") return attachToolResult(acc, record);
    acc.push(record);
    return acc;
  }, []);
}
