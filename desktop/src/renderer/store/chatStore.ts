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
  activeSessionId: string | null;
  recordsBySession: Record<string, ChatRecord[]>;
  liveRecordsBySession: Record<string, ChatRecord[]>;
  streaming: boolean;
  activeTurnId: string | null;
  cumulative: { tokens: number; costUsd: number };
  consent: ConsentRequest | null;
  onboarded: boolean;
  config: unknown;

  setProjects(projects: Project[], activeId: string | null): void;
  setActiveProject(id: string): void;
  setSessions(sessions: SessionDescriptor[]): void;
  setActiveSession(id: string | null): void;
  setRecords(sessionId: string, records: ChatRecord[]): void;
  appendRecord(sessionId: string, record: ChatRecord): void;
  startStreaming(turnId: string): void;
  stopStreaming(): void;
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
  activeSessionId: null,
  recordsBySession: {},
  liveRecordsBySession: {},
  streaming: false,
  activeTurnId: null,
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
      activeSessionId: null,
      recordsBySession: {},
      liveRecordsBySession: {},
    }),
  setSessions: (sessions) => set({ sessions }),
  setActiveSession: (id) => set({ activeSessionId: id }),
  setRecords: (sessionId, records) =>
    set((state) => ({
      recordsBySession: { ...state.recordsBySession, [sessionId]: records },
      liveRecordsBySession: { ...state.liveRecordsBySession, [sessionId]: [] },
    })),
  appendRecord: (sessionId, record) =>
    set((state) => {
      const existing = state.recordsBySession[sessionId] ?? [];
      return {
        recordsBySession: { ...state.recordsBySession, [sessionId]: [...existing, record] },
      };
    }),
  startStreaming: (turnId) => set({ streaming: true, activeTurnId: turnId }),
  stopStreaming: () => set({ streaming: false, activeTurnId: null }),
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
          return {
            streaming: false,
            activeTurnId: null,
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
          return {
            streaming: false,
            activeTurnId: null,
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
  if (!["assistant", "thinking", "tool_use"].includes(record.type)) return live;
  const idx = live.findIndex((candidate) => {
    if (candidate.type !== record.type) return false;
    if (record.type === "tool_use" && record.toolUseId) {
      return candidate.toolUseId === record.toolUseId;
    }
    return true;
  });
  if (idx < 0) return live;
  return [...live.slice(0, idx), ...live.slice(idx + 1)];
}
