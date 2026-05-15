import { ipcMain } from "electron";
import {
  ActivateProjectReq,
  AbortTurnReq,
  ArchiveSessionReq,
  ConsentRespondReq,
  CreateProjectReq,
  DeleteProjectReq,
  HealthProbeReq,
  ListSessionsReq,
  ResumeSessionReq,
  RestoreSessionReq,
  SaveConfigReq,
  SendPromptReq,
  SlashCommandReq,
  StartSessionReq,
  type ChatRecord,
  type IpcChannelMap,
  type SessionDescriptor,
} from "../shared/ipc.js";
import {
  createProject,
  deleteProject,
  getProject,
  isOnboarded,
  listProjects,
  setActiveProject,
  setOnboarded,
} from "./projects.js";
import { activateProject } from "./projectContext.js";
import { respondConsent } from "./consent.js";
import { sendStream } from "./streamBus.js";
import {
  resumeSession,
  startNewSession,
  recentSessions,
  runTurn,
} from "@azoth/core/agent/orchestrator.js";
import {
  archiveSession,
  listSessions,
  readSessionRecords,
  restoreArchivedSession,
  type SessionIndexEntry,
  type SessionRecord,
} from "@azoth/core/runtime/sessionStore.js";
import { loadConfig, saveConfig, updateConfig, type Config } from "@azoth/core/config/loader.js";
import { collectHealth } from "@azoth/core/runtime/health.js";

const activeTurns = new Map<string, { controller: AbortController; stopTail: () => void }>();

function toDescriptor(entry: SessionIndexEntry): SessionDescriptor {
  return {
    id: entry.id,
    sdkSessionId: entry.sdkSessionId,
    title: entry.title,
    cwd: entry.cwd,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    model: entry.model,
    autonomy: entry.autonomy,
  };
}

function toRecord(r: SessionRecord): ChatRecord {
  return {
    type: r.type,
    timestamp: r.timestamp,
    sessionId: r.sessionId,
    text: r.text,
    toolName: r.toolName,
    toolUseId: r.toolUseId,
    toolInput: r.toolInput,
    sdkSessionId: r.sdkSessionId,
    usage: r.usage,
    costUsd: r.costUsd,
    model: r.model,
    autonomy: r.autonomy,
    title: r.title,
  };
}

function sendRecord(turnId: string, record: ChatRecord): void {
  sendStream({
    kind: "turn:record",
    turnId,
    sessionId: record.sessionId,
    record,
  });
}

function sendLiveBlockEvent(turnId: string, sessionId: string, message: unknown): void {
  if ((message as { type?: string }).type !== "stream_event") return;
  const ev = (message as { event?: any }).event;
  if (ev?.type === "content_block_start") {
    const cb = ev.content_block;
    const blockType =
      cb?.type === "thinking"
        ? "thinking"
        : cb?.type === "text"
          ? "assistant"
          : cb?.type === "tool_use"
            ? "tool_use"
            : undefined;
    if (!blockType) return;
    sendStream({
      kind: "turn:block_start",
      turnId,
      sessionId,
      blockType,
      toolName: cb?.name,
      toolUseId: cb?.id,
      timestamp: Date.now(),
    });
  } else if (ev?.type === "content_block_delta") {
    const d = ev.delta;
    const delta =
      d?.type === "thinking_delta"
        ? d.thinking
        : d?.type === "text_delta"
          ? d.text
          : d?.type === "input_json_delta"
            ? d.partial_json
            : undefined;
    if (!delta) return;
    sendStream({
      kind: "turn:block_delta",
      turnId,
      sessionId,
      delta,
    });
  } else if (ev?.type === "content_block_stop" || ev?.type === "message_stop") {
    sendStream({
      kind: "turn:block_stop",
      turnId,
      sessionId,
    });
  }
}

function activateProjectById(id: string) {
  const project = getProject(id);
  if (!project) throw new Error(`Unknown project: ${id}`);
  activateProject(project);
  return project;
}

type Handler<K extends keyof IpcChannelMap> = (
  req: IpcChannelMap[K]["req"],
) => Promise<IpcChannelMap[K]["res"]> | IpcChannelMap[K]["res"];

function register<K extends keyof IpcChannelMap>(channel: K, handler: Handler<K>): void {
  ipcMain.handle(channel, async (_evt, raw) => handler(raw));
}

export function registerIpcHandlers(): void {
  register("project:list", () => listProjects());

  register("project:create", (raw) => {
    const req = CreateProjectReq.parse(raw);
    return createProject(req);
  });

  register("project:delete", (raw) => {
    const req = DeleteProjectReq.parse(raw);
    deleteProject(req.id);
    return { ok: true as const };
  });

  register("project:activate", (raw) => {
    const req = ActivateProjectReq.parse(raw);
    const project = setActiveProject(req.id);
    activateProject(project);
    return project;
  });

  register("session:list", (raw) => {
    const req = ListSessionsReq.parse(raw);
    const project = activateProjectById(req.projectId);
    return listSessions(project.rootPath).map(toDescriptor);
  });

  register("session:start", (raw) => {
    const req = StartSessionReq.parse(raw);
    const project = activateProjectById(req.projectId);
    const entry = startNewSession(req.title, project.rootPath);
    return toDescriptor(entry);
  });

  register("session:resume", (raw) => {
    const req = ResumeSessionReq.parse(raw);
    const project = activateProjectById(req.projectId);
    const entry = resumeSession(req.sessionId, project.rootPath);
    if (!entry) throw new Error(`Session not found: ${req.sessionId}`);
    const records = readSessionRecords(entry.id, project.rootPath).map(toRecord);
    return { session: toDescriptor(entry), records };
  });

  register("session:archive", (raw) => {
    const req = ArchiveSessionReq.parse(raw);
    const project = activateProjectById(req.projectId);
    archiveSession(req.sessionId, project.rootPath);
    return { ok: true as const };
  });

  register("session:restore", (raw) => {
    const req = RestoreSessionReq.parse(raw);
    const project = activateProjectById(req.projectId);
    const entry = restoreArchivedSession(req.session, project.rootPath);
    return toDescriptor(entry);
  });

  register("turn:send", (raw) => {
    const req = SendPromptReq.parse(raw);
    const project = activateProjectById(req.projectId);
    const session = resumeSession(req.sessionId, project.rootPath);
    if (!session) throw new Error(`Session not found: ${req.sessionId}`);
    const controller = new AbortController();
    let streamedRecordCount = readSessionRecords(req.sessionId, project.rootPath).length;

    const drainRecords = () => {
      const records = readSessionRecords(req.sessionId, project.rootPath).map(toRecord);
      for (const record of records.slice(streamedRecordCount)) {
        sendRecord(req.turnId, record);
      }
      streamedRecordCount = records.length;
    };

    activeTurns.set(req.turnId, { controller, stopTail: () => undefined });

    void (async () => {
      try {
        let usage: ChatRecord["usage"] | undefined;
        let costUsd: number | undefined;
        let sdkSessionId: string | undefined;
        for await (const message of runTurn(req.prompt, {
          signal: controller.signal,
          sessionId: req.sessionId,
          cwd: project.rootPath,
        })) {
          drainRecords();
          sendLiveBlockEvent(req.turnId, req.sessionId, message);
          if ((message as { type?: string }).type === "result") {
            const r = message as {
              session_id?: string;
              total_cost_usd?: number;
              usage?: {
                input_tokens?: number;
                output_tokens?: number;
                cache_read_input_tokens?: number;
                cache_creation_input_tokens?: number;
              };
            };
            sdkSessionId = r.session_id;
            costUsd = r.total_cost_usd;
            usage = {
              inputTokens: r.usage?.input_tokens,
              outputTokens: r.usage?.output_tokens,
              cacheReadTokens: r.usage?.cache_read_input_tokens,
              cacheCreationTokens: r.usage?.cache_creation_input_tokens,
            };
          }
        }
        drainRecords();
        sendStream({
          kind: "turn:done",
          turnId: req.turnId,
          sessionId: req.sessionId,
          usage,
          costUsd,
          sdkSessionId,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        sendStream({
          kind: "turn:error",
          turnId: req.turnId,
          sessionId: req.sessionId,
          message,
        });
      } finally {
        activeTurns.delete(req.turnId);
      }
    })();

    return { ok: true as const };
  });

  register("turn:abort", (raw) => {
    const req = AbortTurnReq.parse(raw);
    const entry = activeTurns.get(req.turnId);
    if (!entry) return { ok: false };
    entry.controller.abort();
    return { ok: true };
  });

  register("slash:run", async (raw) => {
    const req = SlashCommandReq.parse(raw);
    activateProjectById(req.projectId);
    switch (req.name) {
      case "sessions": {
        const project = getProject(req.projectId);
        const list = recentSessions(20, project?.rootPath)
          .map((s) => `${s.id.slice(0, 8)}  ${s.title}`)
          .join("\n");
        return { ok: true as const, text: list || "(no sessions)" };
      }
      case "health": {
        const report = await collectHealth({ probeProviders: req.args?.includes("--probe") });
        return { ok: true as const, text: JSON.stringify(report, null, 2) };
      }
      case "new": {
        startNewSession();
        return { ok: true as const };
      }
      default:
        return { ok: true as const };
    }
  });

  register("config:get", () => loadConfig() as unknown);

  register("config:save", (raw) => {
    const req = SaveConfigReq.parse(raw);
    if (Object.keys(req.patch).length === 0) return loadConfig() as unknown;
    return updateConfig(req.patch as Partial<Config>) as unknown;
  });

  register("broker:state", async () => {
    // Best-effort; broker state is exposed via a tool, but a direct read is useful.
    const cfg = loadConfig();
    return { broker: cfg.broker, autonomy: cfg.autonomy };
  });

  register("health:probe", async (raw) => {
    const req = HealthProbeReq.parse(raw);
    return collectHealth({ probeProviders: req.probe });
  });

  register("consent:respond", (raw) => {
    const req = ConsentRespondReq.parse(raw);
    respondConsent(req.id, req.approved);
    return { ok: true as const };
  });

  register("onboarding:status", () => ({ onboarded: isOnboarded() }));

  register("onboarding:complete", () => {
    setOnboarded(true);
    return { ok: true as const };
  });
}

export function abortAllTurns(): void {
  for (const { controller, stopTail } of activeTurns.values()) {
    controller.abort();
    stopTail();
  }
  activeTurns.clear();
}

// Silence unused saveConfig warning while keeping the import explicit.
void saveConfig;
