import { ipcMain, Notification } from "electron";
import {
  ActivateProjectReq,
  AbortTurnReq,
  ArchiveSessionReq,
  ConsentRespondReq,
  CreateProjectReq,
  DeleteProjectReq,
  HealthProbeReq,
  MarketAssetReq,
  MarketHeatmapReq,
  ListModelsReq,
  MarketOverviewReq,
  PortfolioCancelOrderReq,
  PortfolioHistoryReq,
  PortfolioOrdersReq,
  PortfolioPlaceOrderReq,
  PortfolioSnapshotReq,
  type BrokerOrderUi,
  type PortfolioHistoryRes,
  type PortfolioPlaceOrderRes,
  type PortfolioSnapshot,
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
  type MarketIndexOverview,
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
import {
  getIndexOhlcv,
  getStockOhlcv,
  type Bar,
  type Resolution,
} from "@azoth/core/data/sources/dnsePublic.js";
import { getQuote } from "@azoth/core/data/sources/ssiIboard.js";
import { getCompanyProfile } from "@azoth/core/data/sources/vndirectFinfo.js";
import { getCompanyIntro, getScreenerSnapshot } from "@azoth/core/data/sources/cafef.js";
import { nowSec } from "@azoth/core/agent/clock.js";
import { getBroker } from "@azoth/core/broker/index.js";
import { shapeBrokerPortfolio } from "@azoth/core/tools/portfolio.js";
import { placeOrderWithGuards } from "@azoth/core/tools/order.js";
import type { Order, PlaceOrderInput } from "@azoth/core/broker/types.js";

const activeTurns = new Map<string, { controller: AbortController; sessionId: string }>();
const abortedTurns = new Set<string>();

const MARKET_INDICES = [
  { symbol: "VNINDEX", name: "VN-Index", exchange: "HOSE" },
  { symbol: "VN30", name: "VN30", exchange: "HOSE" },
  { symbol: "HNX", name: "HNX-Index", exchange: "HNX" },
  { symbol: "UPCOM", name: "UPCoM-Index", exchange: "UPCoM" },
];

const MARKET_INDEX_SYMBOLS = new Map(MARKET_INDICES.map((index) => [index.symbol, index]));
let marketHeatmapCache:
  | { expiresAt: number; value: { updatedAt: number; assets: MarketIndexOverview[] } }
  | undefined;

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

function lookbackDaysForMarket(resolution: Resolution, bars: number): number {
  if (resolution === "1D") return bars * 2;
  if (resolution === "1W") return bars * 14;
  if (resolution === "1M") return bars * 60;
  return Math.max(3, Math.ceil(bars / 50));
}

function compactMarketBar(bar: Bar) {
  return {
    t: bar.time,
    o: roundMarketNumber(bar.open),
    h: roundMarketNumber(bar.high),
    l: roundMarketNumber(bar.low),
    c: roundMarketNumber(bar.close),
    v: Math.round(bar.volume),
  };
}

function roundMarketNumber(value: number): number {
  return Math.round(value * 100) / 100;
}

function marketLine(
  bars: Bar[],
  values: number[],
): Array<{ t: number; value: number }> {
  return values.map((value, idx) => ({
    t: bars[bars.length - values.length + idx]!.time,
    value: roundMarketNumber(value),
  }));
}

function sma(values: number[], period: number): number[] {
  if (values.length < period) return [];
  const out: number[] = [];
  let sum = values.slice(0, period).reduce((acc, value) => acc + value, 0);
  out.push(sum / period);
  for (let i = period; i < values.length; i++) {
    sum += values[i]! - values[i - period]!;
    out.push(sum / period);
  }
  return out;
}

function ema(values: number[], period: number): number[] {
  if (values.length < period) return [];
  const out: number[] = [];
  const k = 2 / (period + 1);
  let prev = values.slice(0, period).reduce((acc, value) => acc + value, 0) / period;
  out.push(prev);
  for (let i = period; i < values.length; i++) {
    prev = values[i]! * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}

function rma(values: number[], period: number): number[] {
  if (values.length < period) return [];
  const out: number[] = [];
  let prev = values.slice(0, period).reduce((acc, value) => acc + value, 0) / period;
  out.push(prev);
  for (let i = period; i < values.length; i++) {
    prev = (prev * (period - 1) + values[i]!) / period;
    out.push(prev);
  }
  return out;
}

function buildMarketSignals(rawBars: Bar[]) {
  const closes = rawBars.map((bar) => bar.close);
  const sma20 = sma(closes, 20);
  const ema20 = ema(closes, 20);
  const rma14 = rma(closes, 14);
  const latestClose = closes.at(-1);
  const latestRma = rma14.at(-1);
  const prevRma = rma14.at(-2);
  const slope = latestRma != null && prevRma != null ? latestRma - prevRma : 0;
  const nextClose =
    latestClose != null ? roundMarketNumber(latestClose + slope) : undefined;
  const changePct =
    latestClose && nextClose != null
      ? roundMarketNumber(((nextClose - latestClose) / latestClose) * 100)
      : undefined;
  const direction = !changePct || Math.abs(changePct) < 0.05
    ? "flat"
    : changePct > 0
      ? "up"
      : "down";
  const distanceFromRma =
    latestClose && latestRma ? Math.abs((latestClose - latestRma) / latestClose) * 100 : 0;
  const confidence =
    Math.abs(changePct ?? 0) > 0.8 && distanceFromRma > 1.5
      ? "high"
      : Math.abs(changePct ?? 0) > 0.25
        ? "medium"
        : "low";

  return {
    overlays: {
      sma20: marketLine(rawBars, sma20),
      ema20: marketLine(rawBars, ema20),
      rma14: marketLine(rawBars, rma14),
    },
    forecast: {
      method: "RMA14 slope projection",
      nextClose,
      changePct,
      direction,
      confidence,
    },
  } satisfies Pick<MarketIndexOverview, "overlays" | "forecast">;
}

function inferMarketKind(symbol: string): "index" | "stock" {
  return MARKET_INDEX_SYMBOLS.has(symbol) ? "index" : "stock";
}

function parseCafefTimestamp(input: string | undefined): number | undefined {
  if (!input) return undefined;
  const match = /\/Date\((\d+)\)\//.exec(input);
  if (match?.[1]) return Math.floor(Number(match[1]) / 1000);
  const parsed = Date.parse(input);
  return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : undefined;
}

function normalizeExchange(value: string | undefined): string {
  const exchange = (value ?? "VN").trim();
  if (/^hsx$/i.test(exchange)) return "HOSE";
  if (/^upcom$/i.test(exchange)) return "UPCoM";
  return exchange.toUpperCase();
}

async function loadMarketHeatmap(includeIndexes: boolean): Promise<{ updatedAt: number; assets: MarketIndexOverview[] }> {
  const now = Date.now();
  if (marketHeatmapCache && marketHeatmapCache.expiresAt > now) {
    return includeIndexes
      ? marketHeatmapCache.value
      : {
          ...marketHeatmapCache.value,
          assets: marketHeatmapCache.value.assets.filter((asset) => asset.kind !== "index"),
        };
  }

  const snapshot = await getScreenerSnapshot();
  const stocks = snapshot.items
    .filter((item) => /^[A-Z0-9]{3,12}$/.test(item.Symbol))
    .map((item): MarketIndexOverview => {
      const latestClose = item.Price != null ? roundMarketNumber(item.Price) : undefined;
      const changePct = item.ChangePrice != null ? roundMarketNumber(item.ChangePrice) : undefined;
      const previousClose =
        latestClose != null && changePct != null && changePct !== -100
          ? roundMarketNumber(latestClose / (1 + changePct / 100))
          : undefined;
      const change =
        latestClose != null && previousClose != null
          ? roundMarketNumber(latestClose - previousClose)
          : undefined;
      return {
        symbol: item.Symbol.toUpperCase(),
        name: item.FullName ?? item.Symbol.toUpperCase(),
        exchange: normalizeExchange(item.CenterName),
        kind: "stock",
        industry: snapshot.categories[item.ParentCategoryId ?? 0] ?? "Unclassified",
        latestClose,
        previousClose,
        change,
        changePct,
        volume: item.ChangeVolume != null ? Math.max(0, Math.round(Math.abs(item.ChangeVolume))) : undefined,
        marketCap: item.VonHoa != null ? roundMarketNumber(item.VonHoa) : undefined,
        updatedAt: parseCafefTimestamp(item.UpdatedDate),
        bars: [],
      };
    });

  const value = {
    updatedAt: nowSec(),
    assets: includeIndexes
      ? [
          ...MARKET_INDICES.map((index): MarketIndexOverview => ({
            ...index,
            kind: "index",
            industry: "Market indexes",
            bars: [],
          })),
          ...stocks,
        ]
      : stocks,
  };
  marketHeatmapCache = { expiresAt: now + 60_000, value };
  return value;
}

async function loadIndexOverview(
  index: (typeof MARKET_INDICES)[number],
  resolution: Resolution,
  bars: number,
): Promise<MarketIndexOverview> {
  const to = nowSec();
  const from = to - lookbackDaysForMarket(resolution, bars) * 86400;
  try {
    const rawBars = (await getIndexOhlcv(index.symbol, resolution, from, to)).slice(-bars);
    const signals = buildMarketSignals(rawBars);
    const latest = rawBars[rawBars.length - 1];
    const previous = rawBars[rawBars.length - 2] ?? rawBars[0];
    const change =
      latest && previous ? roundMarketNumber(latest.close - previous.close) : undefined;
    const changePct =
      latest && previous?.close
        ? roundMarketNumber(((latest.close - previous.close) / previous.close) * 100)
        : undefined;
    return {
      ...index,
      kind: "index",
      industry: "Market indexes",
      latestClose: latest ? roundMarketNumber(latest.close) : undefined,
      previousClose: previous ? roundMarketNumber(previous.close) : undefined,
      change,
      changePct,
      high: rawBars.length
        ? roundMarketNumber(Math.max(...rawBars.map((bar) => bar.high)))
        : undefined,
      low: rawBars.length
        ? roundMarketNumber(Math.min(...rawBars.map((bar) => bar.low)))
        : undefined,
      volume: rawBars.reduce((sum, bar) => sum + Math.round(bar.volume), 0),
      updatedAt: latest?.time,
      bars: rawBars.map(compactMarketBar),
      ...signals,
    };
  } catch (err) {
    return {
      ...index,
      kind: "index",
      industry: "Market indexes",
      bars: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function loadMarketAsset(
  symbolInput: string,
  kindInput: "stock" | "index" | undefined,
  resolution: Resolution,
  bars: number,
): Promise<MarketIndexOverview> {
  const symbol = symbolInput.trim().toUpperCase();
  const kind = kindInput ?? inferMarketKind(symbol);
  const indexMeta = MARKET_INDEX_SYMBOLS.get(symbol);
  const to = nowSec();
  const from = to - lookbackDaysForMarket(resolution, bars) * 86400;
  try {
    const rawBars = (
      kind === "index"
        ? await getIndexOhlcv(symbol, resolution, from, to)
        : await getStockOhlcv(symbol, resolution, from, to)
    ).slice(-bars);
    const [quote, profile, intro] = kind === "stock"
      ? await Promise.all([
          getQuote(symbol).catch(() => null),
          getCompanyProfile(symbol).catch(() => null),
          getCompanyIntro(symbol).catch(() => null),
        ])
      : [null, null, null] as const;
    const latest = rawBars[rawBars.length - 1];
    const previous = rawBars[rawBars.length - 2] ?? rawBars[0];
    const latestClose = quote?.matchedPrice ?? latest?.close;
    const previousClose = quote?.ref || previous?.close;
    const change =
      latestClose != null && previousClose != null
        ? roundMarketNumber(latestClose - previousClose)
        : undefined;
    const changePct =
      latestClose != null && previousClose
        ? roundMarketNumber(((latestClose - previousClose) / previousClose) * 100)
        : undefined;
    return {
      symbol,
      name: indexMeta?.name ?? quote?.companyNameEn ?? profile?.enName ?? profile?.vnName ?? symbol,
      exchange: indexMeta?.exchange ?? quote?.exchange ?? profile?.floor ?? "VN",
      kind,
      industry: indexMeta ? "Market indexes" : intro?.CategoryName ?? "Unclassified",
      intro: intro?.Intro && intro.Intro.trim() ? intro.Intro.trim() : undefined,
      website: intro?.Web && intro.Web.trim() ? intro.Web.trim() : undefined,
      latestClose: latestClose != null ? roundMarketNumber(latestClose) : undefined,
      previousClose: previousClose != null ? roundMarketNumber(previousClose) : undefined,
      change,
      changePct,
      high: rawBars.length
        ? roundMarketNumber(Math.max(...rawBars.map((bar) => bar.high)))
        : undefined,
      low: rawBars.length
        ? roundMarketNumber(Math.min(...rawBars.map((bar) => bar.low)))
        : undefined,
      volume: rawBars.reduce((sum, bar) => sum + Math.round(bar.volume), 0),
      updatedAt: latest?.time,
      bars: rawBars.map(compactMarketBar),
      ...buildMarketSignals(rawBars),
      quote: quote
        ? {
            bestBid: quote.bestBid,
            bestOffer: quote.bestOffer,
            matchedVolume: quote.matchedVolume,
            session: quote.session,
            tradingStatus: quote.tradingStatus,
          }
        : undefined,
    };
  } catch (err) {
    return {
      symbol,
      name: indexMeta?.name ?? symbol,
      exchange: indexMeta?.exchange ?? "VN",
      kind,
      industry: indexMeta ? "Market indexes" : "Unclassified",
      bars: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
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

  async function lastCloseThousandVnd(ticker: string): Promise<number | null> {
    const to = nowSec();
    const from = to - 14 * 86400;
    const bars = await getStockOhlcv(ticker, "1D", from, to).catch(() => [] as Bar[]);
    return bars.length ? bars[bars.length - 1]!.close : null;
  }

  function toOrderUi(o: Order): BrokerOrderUi {
    return {
      id: o.id,
      broker: o.broker,
      ticker: o.ticker,
      side: o.side,
      type: o.type,
      quantity: o.quantity,
      limitPrice: o.limitPrice,
      status: o.status,
      rejectReason: o.rejectReason,
      createdAt: o.createdAt,
      filledAt: o.filledAt,
      filledPrice: o.filledPrice,
      filledQty: o.filledQty,
      notes: o.notes,
    };
  }

  register("portfolio:snapshot", async () => {
    const broker = getBroker();
    const snap = await broker.snapshot();
    const shaped = await shapeBrokerPortfolio(snap, lastCloseThousandVnd);
    return shaped as unknown as PortfolioSnapshot;
  });

  register("portfolio:orders", async (raw) => {
    const req = PortfolioOrdersReq.parse(raw);
    const broker = getBroker();
    const orders = await broker.listOrders({
      ticker: req?.ticker,
      status: req?.status,
      limit: req?.limit ?? 50,
    });
    return { orders: orders.map(toOrderUi) };
  });

  register("portfolio:history", async (raw) => {
    const req = PortfolioHistoryReq.parse(raw);
    const broker = getBroker();
    if (!broker.accountHistory) {
      const res: PortfolioHistoryRes = {
        supported: false,
        broker: broker.name,
        reason: `Broker "${broker.name}" does not support account history.`,
      };
      return res;
    }
    const history = await broker.accountHistory({
      fromDate: req.fromDate,
      toDate: req.toDate,
      ticker: req.ticker?.toUpperCase(),
      limit: req.limit,
    });
    const kind = req.kind;
    const filtered = {
      orders: kind === "all" || kind === "orders" ? history.orders : [],
      fills: kind === "all" || kind === "orders" || kind === "fills" ? history.fills : [],
      transactions: kind === "all" || kind === "transactions" ? history.transactions : [],
      rights: kind === "all" || kind === "rights" ? history.rights : [],
    };
    const res: PortfolioHistoryRes = {
      supported: true,
      broker: history.broker,
      fromDate: history.fromDate,
      toDate: history.toDate,
      subAccounts: history.subAccounts,
      ...filtered,
      unavailable: history.unavailable,
    };
    return res;
  });

  register("portfolio:placeOrder", async (raw) => {
    const req = PortfolioPlaceOrderReq.parse(raw);
    const input: PlaceOrderInput = {
      ticker: req.ticker.toUpperCase(),
      side: req.side,
      type: req.type,
      quantity: req.quantity,
      limitPrice: req.limitPrice,
      notes: req.notes,
    };
    try {
      const result = await placeOrderWithGuards(input);
      if (!result.ok) {
        const res: PortfolioPlaceOrderRes =
          result.error === "no_reference_price"
            ? {
                ok: false,
                error: "no_reference_price",
                message: `No reference price available for ${result.ticker}.`,
              }
            : {
                ok: false,
                error: "guardrail_blocked",
                reasons: result.reasons,
                order: result.order ? toOrderUi(result.order) : undefined,
              };
        return res;
      }
      const okRes: PortfolioPlaceOrderRes = { ok: true, order: toOrderUi(result.order) };
      return okRes;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const res: PortfolioPlaceOrderRes = { ok: false, error: "broker_error", message };
      return res;
    }
  });

  register("portfolio:cancelOrder", async (raw) => {
    const req = PortfolioCancelOrderReq.parse(raw);
    const broker = getBroker();
    const order = await broker.cancelOrder(req.id);
    return { ok: order.status === "CANCELLED", order: toOrderUi(order) };
  });

  register("health:probe", async (raw) => {
    const req = HealthProbeReq.parse(raw);
    return collectHealth({ probeProviders: req.probe });
  });

  register("market:overview", async (raw) => {
    const req = MarketOverviewReq.parse(raw);
    const resolution = (req?.resolution ?? "1D") as Resolution;
    const bars = req?.bars ?? 90;
    const indices = await Promise.all(
      MARKET_INDICES.map((index) => loadIndexOverview(index, resolution, bars)),
    );
    return {
      updatedAt: nowSec(),
      indices,
    };
  });

  register("market:asset", async (raw) => {
    const req = MarketAssetReq.parse(raw);
    return loadMarketAsset(
      req.symbol,
      req.kind,
      req.resolution as Resolution,
      req.bars,
    );
  });

  register("market:heatmap", async (raw) => {
    const req = MarketHeatmapReq.parse(raw);
    return loadMarketHeatmap(req?.includeIndexes ?? true);
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
  for (const [turnId, { controller, sessionId }] of activeTurns.entries()) {
    abortedTurns.add(turnId);
    abortActiveTeamRuns();
    controller.abort();
    sendStream({ kind: "turn:done", turnId, sessionId });
  }
  activeTurns.clear();
}
