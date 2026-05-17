import { create } from "zustand";
import type {
  ChatRecord,
  DesktopSettings,
  Project,
  SessionDescriptor,
  StreamEvent,
  TeamToolKind,
  TeamUiEvent,
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

export type TeamRunStatus = "running" | "done" | "error";
export type TeamRoleStatus = "running" | "done" | "error";

export interface TeamRoleView {
  key: string;
  role: string;
  round?: number;
  status: TeamRoleStatus;
  toolCount: number;
  resultCount: number;
  lastTool?: string;
  detail?: string;
}

export interface TeamRunView {
  key: string;
  turnId: string;
  sessionId: string;
  tool: TeamToolKind;
  status: TeamRunStatus;
  title: string;
  ticker?: string;
  runId?: string;
  rating?: string;
  sizingPct?: number;
  message?: string;
  startedAt: number;
  updatedAt: number;
  roles: TeamRoleView[];
}

interface ChatState {
  projects: Project[];
  activeProjectId: string | null;
  sessions: SessionDescriptor[];
  archivedSessionIds: string[];
  activeSessionId: string | null;
  recordsBySession: Record<string, ChatRecord[]>;
  liveRecordsBySession: Record<string, ChatRecord[]>;
  teamRunsBySession: Record<string, TeamRunView[]>;
  activeTurnsBySession: Record<string, string>;
  cumulative: { tokens: number; costUsd: number };
  consent: ConsentRequest | null;
  onboarded: boolean;
  config: unknown;
  appSettings: DesktopSettings | null;

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
  setAppSettings(settings: DesktopSettings): void;

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
  teamRunsBySession: {},
  activeTurnsBySession: {},
  cumulative: { tokens: 0, costUsd: 0 },
  consent: null,
  onboarded: false,
  config: null,
  appSettings: null,

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
      teamRunsBySession: {},
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
      const { [id]: _teamRuns, ...teamRunsBySession } = state.teamRunsBySession;
      const { [id]: _turn, ...activeTurnsBySession } = state.activeTurnsBySession;
      return {
        archivedSessionIds,
        sessions,
        activeSessionId,
        recordsBySession,
        liveRecordsBySession,
        teamRunsBySession,
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
      teamRunsBySession: { ...state.teamRunsBySession, [sessionId]: [] },
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
  setAppSettings: (appSettings) => set({ appSettings }),

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
        case "team:event":
          return applyTeamEvent(state, event);
        case "turn:done": {
          const { [event.sessionId]: _cleared, ...remainingLive } = state.liveRecordsBySession;
          const { [event.sessionId]: activeTurnId, ...activeTurnsBySession } = state.activeTurnsBySession;
          const nextTeamRuns = removeTeamRunsForTurn(
            state.teamRunsBySession,
            event.sessionId,
            event.turnId,
          );
          const nextTurns =
            activeTurnId == null || activeTurnId === event.turnId
              ? activeTurnsBySession
              : state.activeTurnsBySession;
          return {
            activeTurnsBySession: nextTurns,
            liveRecordsBySession: remainingLive,
            teamRunsBySession: nextTeamRuns,
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
          const errorTeamRuns = removeTeamRunsForTurn(
            state.teamRunsBySession,
            event.sessionId,
            event.turnId,
          );
          const nextActiveTurns =
            failedTurnId == null || failedTurnId === event.turnId
              ? remainingTurns
              : state.activeTurnsBySession;
          return {
            activeTurnsBySession: nextActiveTurns,
            teamRunsBySession: errorTeamRuns,
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

function applyTeamEvent(
  state: ChatState,
  event: Extract<StreamEvent, { kind: "team:event" }>,
): Partial<ChatState> {
  const sid = event.sessionId;
  const teamEvent = event.event;
  const runKey = `${event.turnId}:${teamEvent.teamTool}`;
  const runs = state.teamRunsBySession[sid] ?? [];
  const idx = runs.findIndex((run) => run.key === runKey);
  const now = Date.now();
  let run: TeamRunView =
    idx >= 0
      ? { ...runs[idx]!, roles: [...runs[idx]!.roles], updatedAt: now }
      : {
          key: runKey,
          turnId: event.turnId,
          sessionId: sid,
          tool: teamEvent.teamTool,
          status: "running",
          title: teamEvent.teamTool === "team_analyze" ? "Team Analyze" : "Team Question",
          startedAt: now,
          updatedAt: now,
          roles: [],
        };

  switch (teamEvent.type) {
    case "run_start":
      run = {
        ...run,
        status: "running",
        runId: teamEvent.runId ?? run.runId,
        ticker: teamEvent.ticker ?? run.ticker,
      };
      break;
    case "role_start":
      run = upsertTeamRole(run, teamEvent, (role) => ({
        ...role,
        status: "running",
      }));
      break;
    case "role_tool":
      run = upsertTeamRole(run, teamEvent, (role) => ({
        ...role,
        status: "running",
        toolCount: role.toolCount + 1,
        lastTool: teamEvent.subtool ?? role.lastTool,
        detail: teamEvent.detail ?? role.detail,
      }));
      break;
    case "role_tool_result":
      run = upsertTeamRole(run, teamEvent, (role) => ({
        ...role,
        status: "running",
        resultCount: role.resultCount + 1,
        lastTool: teamEvent.subtool ?? role.lastTool,
      }));
      break;
    case "role_end":
      run = upsertTeamRole(run, teamEvent, (role) => ({
        ...role,
        status: "done",
      }));
      break;
    case "final":
      run = {
        ...run,
        status: "done",
        ticker: teamEvent.ticker ?? run.ticker,
        rating: teamEvent.rating ?? run.rating,
        sizingPct: teamEvent.sizingPct ?? run.sizingPct,
      };
      break;
    case "error":
      run = {
        ...run,
        status: "error",
        message: teamEvent.message ?? run.message,
      };
      if (teamEvent.role) {
        run = upsertTeamRole(run, teamEvent, (role) => ({
          ...role,
          status: "error",
          detail: teamEvent.message ?? role.detail,
        }));
      }
      break;
    default:
      break;
  }

  const nextRuns = idx >= 0 ? [...runs.slice(0, idx), run, ...runs.slice(idx + 1)] : [...runs, run];
  return {
    teamRunsBySession: {
      ...state.teamRunsBySession,
      [sid]: nextRuns,
    },
  };
}

function upsertTeamRole(
  run: TeamRunView,
  event: TeamUiEvent,
  update: (role: TeamRoleView) => TeamRoleView,
): TeamRunView {
  if (!event.role) return run;
  const idx = findTeamRoleIndex(run.roles, event.role, event.round);
  const role =
    idx >= 0
      ? run.roles[idx]!
      : {
          key: `${event.role}:${event.round ?? "latest"}`,
          role: event.role,
          round: event.round,
          status: "running" as const,
          toolCount: 0,
          resultCount: 0,
        };
  const nextRole = update(role);
  const roles = idx >= 0
    ? [...run.roles.slice(0, idx), nextRole, ...run.roles.slice(idx + 1)]
    : [...run.roles, nextRole];
  return { ...run, roles };
}

function findTeamRoleIndex(roles: TeamRoleView[], role: string, round: number | undefined): number {
  if (round != null) {
    const exact = roles.findIndex((item) => item.role === role && item.round === round);
    if (exact >= 0) return exact;
  }
  for (let i = roles.length - 1; i >= 0; i--) {
    const item = roles[i]!;
    if (item.role === role && item.status === "running") return i;
  }
  for (let i = roles.length - 1; i >= 0; i--) {
    if (roles[i]!.role === role) return i;
  }
  return -1;
}

function removeTeamRunsForTurn(
  teamRunsBySession: Record<string, TeamRunView[]>,
  sessionId: string,
  turnId: string,
): Record<string, TeamRunView[]> {
  const runs = teamRunsBySession[sessionId] ?? [];
  if (runs.length === 0) return teamRunsBySession;
  return {
    ...teamRunsBySession,
    [sessionId]: runs.filter((run) => run.turnId !== turnId),
  };
}

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
