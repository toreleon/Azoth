import { ipcMain, Notification } from "electron";
import {
  ActivateProjectReq,
  AbortTurnReq,
  ArchiveSessionReq,
  ConsentRespondReq,
  CreateProjectReq,
  DeleteProjectReq,
  HealthProbeReq,
  ListModelsReq,
  ListSessionsReq,
  ResumeSessionReq,
  RestoreSessionReq,
  SaveConfigReq,
  SaveDesktopSettingsReq,
  SendPromptReq,
  SlashCommandReq,
  StartSessionReq,
  type ChatRecord,
  type IpcChannelMap,
  type SessionDescriptor,
  type TeamUiEvent,
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
  appendSessionRecord,
  listSessions,
  readSessionRecords,
  restoreArchivedSession,
  type SessionIndexEntry,
  type SessionRecord,
} from "@azoth/core/runtime/sessionStore.js";
import { loadConfig, updateConfig, type Config } from "@azoth/core/config/loader.js";
import { registerMarketHandlers } from "./ipc/marketHandlers.js";
import { registerPortfolioHandlers } from "./ipc/portfolioHandlers.js";
import type { Handler } from "./ipc/register.js";
import { collectHealth, renderHealth } from "@azoth/core/runtime/health.js";
import { azothPaths } from "@azoth/core/runtime/paths.js";
import { listLlmModels } from "@azoth/core/runtime/llmSetup.js";
import { abortActiveTeamRuns } from "@azoth/core/tools/team.js";
import {
  subscribeTeamToolEvents,
  type TeamToolEvent,
  withTeamToolEventContext,
} from "@azoth/core/agent/team/toolEventBus.js";
import { getDesktopSettings, saveDesktopSettings } from "./appSettings.js";
import { SLASH_COMMANDS } from "../shared/slashCommands.js";

const activeTurns = new Map<string, { controller: AbortController; sessionId: string }>();
const abortedTurns = new Set<string>();

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

function maybeNotifyOrderResult(record: ChatRecord, records: ChatRecord[]): void {
  if (record.type !== "tool_result" || !record.toolUseId || !record.text) return;
  const settings = getDesktopSettings();
  if (!settings.showNotifications || !settings.notifyOnOrderFill || !Notification.isSupported()) return;

  const tool = records.find(
    (candidate) => candidate.type === "tool_use" && candidate.toolUseId === record.toolUseId,
  );
  if (tool?.toolName !== "place_order" && tool?.toolName !== "cancel_order") return;

  try {
    const parsed = JSON.parse(record.text) as {
      order?: {
        status?: string;
        side?: string;
        quantity?: number;
        ticker?: string;
        rejectReason?: string | null;
      };
      error?: string;
    };
    const status = parsed.order?.status;
    if (!status || !["FILLED", "REJECTED", "CANCELLED"].includes(status)) return;
    const order = parsed.order;
    if (!order) return;
    const detail = [order.side, order.quantity, order.ticker].filter(Boolean).join(" ");
    const body = status === "REJECTED" && (order.rejectReason || parsed.error)
      ? `${detail} - ${order.rejectReason ?? parsed.error}`
      : detail;
    new Notification({
      title: `Order ${status.toLowerCase()}`,
      body,
    }).show();
  } catch {
    // Tool output is best-effort JSON; ignore non-order payloads.
  }
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

function compactText(value: string | undefined, limit = 120): string {
  if (!value) return "";
  const oneLine = value.replace(/\s+/g, " ").trim();
  if (oneLine.length <= limit) return oneLine;
  return `${oneLine.slice(0, limit - 3)}...`;
}

function toTeamUiEvent(event: TeamToolEvent): TeamUiEvent | null {
  const ev = event.event;
  switch (ev.type) {
    case "run_start":
      return {
        type: "run_start",
        teamTool: event.tool,
        runId: ev.runId,
        ticker: ev.ticker,
      };
    case "role_start":
      return {
        type: "role_start",
        teamTool: event.tool,
        role: ev.role,
        round: ev.round,
      };
    case "role_tool": {
      const input = compactText(ev.input);
      return {
        type: "role_tool",
        teamTool: event.tool,
        role: ev.role,
        subtool: ev.tool,
        detail: input,
      };
    }
    case "role_tool_result":
      return {
        type: "role_tool_result",
        teamTool: event.tool,
        role: ev.role,
        subtool: ev.tool,
      };
    case "role_end":
      return {
        type: "role_end",
        teamTool: event.tool,
        role: ev.role,
        round: ev.round,
      };
    case "final":
      return {
        type: "final",
        teamTool: event.tool,
        ticker: ev.decision.ticker,
        rating: ev.decision.rating,
        sizingPct: ev.decision.sizingPct,
      };
    case "error":
      return {
        type: "error",
        teamTool: event.tool,
        role: ev.role,
        message: compactText(ev.message, 240),
      };
    case "role_delta":
      return null;
    default:
      return null;
  }
}

function activateProjectById(id: string) {
  const project = getProject(id);
  if (!project) throw new Error(`Unknown project: ${id}`);
  activateProject(project);
  return project;
}

function renderAbout(): string {
  const cfg = loadConfig();
  const paths = azothPaths();
  return [
    "Azoth Desktop",
    `config: ${paths.config}`,
    `database: ${paths.db}`,
    `sessions: ${paths.projects}`,
    `provider: ${cfg.llm.provider}`,
    `model: ${cfg.model}`,
    `broker: ${cfg.broker}`,
    `autonomy: ${cfg.autonomy}`,
  ].join("\n");
}

function renderHelp(): string {
  return SLASH_COMMANDS
    .map((c) => `/${c.name}${c.args ? ` ${c.args}` : ""} - ${c.description}`)
    .join("\n");
}

function persistLocalSlashTurn(
  sessionId: string | undefined,
  cwd: string,
  prompt: string,
  response: string,
): void {
  if (!sessionId) return;
  const cfg = loadConfig();
  appendSessionRecord(sessionId, {
    type: "user",
    timestamp: Date.now(),
    sessionId,
    cwd,
    text: prompt,
    model: cfg.model,
    autonomy: cfg.autonomy,
  }, cwd);
  appendSessionRecord(sessionId, {
    type: "assistant",
    timestamp: Date.now(),
    sessionId,
    cwd,
    text: response,
    model: cfg.model,
    autonomy: cfg.autonomy,
  }, cwd);
}

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
        maybeNotifyOrderResult(record, records);
      }
      streamedRecordCount = records.length;
    };

    activeTurns.set(req.turnId, { controller, sessionId: req.sessionId });

    void (async () => {
      const unsubscribeTeamEvents = subscribeTeamToolEvents((event) => {
        if (abortedTurns.has(req.turnId) || controller.signal.aborted) return;
        if (event.contextId && event.contextId !== req.turnId) return;
        if (!event.contextId && activeTurns.size > 1) return;
        const teamEvent = toTeamUiEvent(event);
        if (!teamEvent) return;
        sendStream({
          kind: "team:event",
          turnId: req.turnId,
          sessionId: req.sessionId,
          event: teamEvent,
        });
      });
      try {
        let usage: ChatRecord["usage"] | undefined;
        let costUsd: number | undefined;
        let sdkSessionId: string | undefined;
        await withTeamToolEventContext(req.turnId, async () => {
          for await (const message of runTurn(req.prompt, {
            signal: controller.signal,
            sessionId: req.sessionId,
            cwd: project.rootPath,
            displayPrompt: req.displayPrompt,
          })) {
            if (controller.signal.aborted) break;
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
        });
        if (abortedTurns.has(req.turnId)) return;
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
        if (abortedTurns.has(req.turnId) || controller.signal.aborted) return;
        const message = err instanceof Error ? err.message : String(err);
        sendStream({
          kind: "turn:error",
          turnId: req.turnId,
          sessionId: req.sessionId,
          message,
        });
      } finally {
        unsubscribeTeamEvents();
        activeTurns.delete(req.turnId);
        abortedTurns.delete(req.turnId);
      }
    })();

    return { ok: true as const };
  });

  register("turn:abort", (raw) => {
    const req = AbortTurnReq.parse(raw);
    const entry = activeTurns.get(req.turnId);
    if (!entry) return { ok: false };
    abortedTurns.add(req.turnId);
    abortActiveTeamRuns();
    entry.controller.abort();
    sendStream({
      kind: "turn:done",
      turnId: req.turnId,
      sessionId: entry.sessionId,
    });
    return { ok: true };
  });

  register("slash:run", async (raw) => {
    const req = SlashCommandReq.parse(raw);
    const project = activateProjectById(req.projectId);
    const name = req.name.toLowerCase();
    const args = req.args?.trim() ?? "";
    let text: string;
    switch (name) {
      case "sessions": {
        const list = recentSessions(20, project.rootPath)
          .map((s) => {
            const date = new Date(s.updatedAt).toISOString().slice(0, 16).replace("T", " ");
            return `${s.id.slice(0, 8)}  ${date}  ${s.title}`;
          })
          .join("\n");
        text = list || "No saved sessions for this project.";
        break;
      }
      case "health": {
        const report = await collectHealth({ probeProviders: args.includes("--probe") });
        text = renderHealth(report);
        break;
      }
      case "autonomy": {
        const mode = args.split(/\s+/)[0];
        if (!mode) {
          text = `Current autonomy mode: ${loadConfig().autonomy}`;
          break;
        }
        if (!["manual", "auto"].includes(mode)) {
          text = "Usage: /autonomy <manual|auto>";
          break;
        }
        const next = updateConfig({ autonomy: mode as Config["autonomy"] });
        text = `Autonomy mode set to ${next.autonomy}.`;
        break;
      }
      case "about":
        text = renderAbout();
        break;
      case "help":
        text = renderHelp();
        break;
      case "team":
        text = "Usage: /team <message>";
        break;
      case "quote":
        text = "Usage: /quote <ticker>";
        break;
      case "new": {
        startNewSession(undefined, project.rootPath);
        text = "Started a fresh session.";
        break;
      }
      default:
        text = `Unknown command: /${req.name}. Type /help for available commands.`;
        break;
    }
    persistLocalSlashTurn(req.sessionId, project.rootPath, `/${name}${args ? ` ${args}` : ""}`, text);
    return { ok: true as const, text };
  });

  register("config:get", () => loadConfig() as unknown);

  register("config:save", (raw) => {
    const req = SaveConfigReq.parse(raw);
    if (Object.keys(req.patch).length === 0) return loadConfig() as unknown;
    return updateConfig(req.patch as Partial<Config>) as unknown;
  });

  register("models:list", async (raw) => {
    const req = ListModelsReq.parse(raw);
    const cfg = loadConfig();
    const provider = req?.provider ?? cfg.llm.provider;
    const apiKey = req?.apiKey ?? cfg.llm.api_key;
    const baseUrl = req?.baseUrl ?? cfg.llm.base_url;
    try {
      const models = await listLlmModels({ provider, apiKey, baseUrl });
      return { models };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { models: [], error: message };
    }
  });

  register("app-settings:get", () => getDesktopSettings());

  register("app-settings:save", (raw) => {
    const req = SaveDesktopSettingsReq.parse(raw);
    return saveDesktopSettings(req.patch);
  });

  register("broker:state", async () => {
    // Best-effort; broker state is exposed via a tool, but a direct read is useful.
    const cfg = loadConfig();
    return { broker: cfg.broker, autonomy: cfg.autonomy };
  });

  registerPortfolioHandlers(register);

  register("health:probe", async (raw) => {
    const req = HealthProbeReq.parse(raw);
    return collectHealth({ probeProviders: req.probe });
  });

  registerMarketHandlers(register);

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
  for (const [turnId, { controller, sessionId }] of activeTurns.entries()) {
    abortedTurns.add(turnId);
    abortActiveTeamRuns();
    controller.abort();
    sendStream({ kind: "turn:done", turnId, sessionId });
  }
  activeTurns.clear();
}
