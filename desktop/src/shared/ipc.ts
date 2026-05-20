import { z } from "zod";

// -- Project descriptors ----------------------------------------------------

export interface Project {
  id: string;
  name: string;
  rootPath: string;
  createdAt: number;
  isDefault?: boolean;
}

export interface SessionDescriptor {
  id: string;
  sdkSessionId?: string;
  title: string;
  cwd: string;
  createdAt: number;
  updatedAt: number;
  model?: string;
  autonomy?: string;
}

export interface ChatRecord {
  type:
    | "session_start"
    | "user"
    | "assistant"
    | "thinking"
    | "tool_use"
    | "tool_result"
    | "result"
    | "error"
    | "system";
  timestamp: number;
  sessionId: string;
  text?: string;
  toolName?: string;
  toolUseId?: string;
  toolInput?: string;
  sdkSessionId?: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    cacheReadTokens?: number;
    cacheCreationTokens?: number;
  };
  costUsd?: number;
  model?: string;
  autonomy?: string;
  title?: string;
}

export type TeamToolKind = "team_question" | "team_analyze";

export interface TeamUiEvent {
  type:
    | "run_start"
    | "role_start"
    | "role_tool"
    | "role_tool_result"
    | "role_end"
    | "final"
    | "error";
  teamTool: TeamToolKind;
  runId?: string;
  ticker?: string;
  role?: string;
  round?: number;
  subtool?: string;
  detail?: string;
  rating?: string;
  sizingPct?: number;
  message?: string;
}

export interface HealthRow {
  name: string;
  ok: boolean;
  detail: string;
}

export interface HealthReport {
  ok: boolean;
  rows: HealthRow[];
}

export interface MarketBar {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

export interface MarketIndexOverview {
  symbol: string;
  name: string;
  exchange: string;
  kind?: "index" | "stock";
  industry?: string;
  intro?: string;
  website?: string;
  latestClose?: number;
  previousClose?: number;
  change?: number;
  changePct?: number;
  high?: number;
  low?: number;
  volume?: number;
  marketCap?: number;
  updatedAt?: number;
  bars: MarketBar[];
  overlays?: {
    sma20?: Array<{ t: number; value: number }>;
    ema20?: Array<{ t: number; value: number }>;
    rma14?: Array<{ t: number; value: number }>;
  };
  forecast?: {
    method: string;
    nextClose?: number;
    changePct?: number;
    direction: "up" | "down" | "flat";
    confidence: "low" | "medium" | "high";
  };
  quote?: {
    bestBid?: number;
    bestOffer?: number;
    matchedVolume?: number;
    session?: string;
    tradingStatus?: string;
  };
  error?: string;
}

export interface MarketOverview {
  updatedAt: number;
  indices: MarketIndexOverview[];
}

export interface MarketHeatmap {
  updatedAt: number;
  assets: MarketIndexOverview[];
}

// -- Portfolio types --------------------------------------------------------

export type OrderSide = "BUY" | "SELL";
export type OrderType = "MARKET" | "LIMIT";
export type OrderStatusUi = "PENDING" | "FILLED" | "CANCELLED" | "REJECTED";

export interface PortfolioPosition {
  ticker: string;
  quantity: number;
  sub_account_id: string | null;
  custody_code: string | null;
  avg_cost_thousand_vnd: number;
  last_close_thousand_vnd: number | null;
  cost_basis_vnd: number;
  market_value_vnd: number | null;
  unrealized_pnl_vnd: number | null;
  unrealized_pnl_pct: number | null;
}

export interface PortfolioSubAccount {
  id: string;
  type?: string;
  cashVnd: number;
  blockedCashVnd?: number;
  totalCashVnd?: number;
  label?: string;
}

export interface PortfolioSnapshot {
  broker: string;
  cash_vnd: number;
  total_equity_vnd: number;
  margin_used_vnd: number;
  sub_accounts: PortfolioSubAccount[];
  positions: PortfolioPosition[];
  totals: {
    cost_basis_vnd: number;
    market_value_vnd: number;
    unrealized_pnl_vnd: number;
  };
}

export interface BrokerOrderUi {
  id: string;
  broker: string;
  ticker: string;
  side: OrderSide;
  type: OrderType;
  quantity: number;
  limitPrice: number | null;
  status: OrderStatusUi;
  rejectReason: string | null;
  createdAt: number;
  filledAt: number | null;
  filledPrice: number | null;
  filledQty: number | null;
  notes: string | null;
}

export interface BrokerHistoryOrderUi {
  id: string;
  subAccountId?: string;
  ticker: string;
  side: OrderSide;
  type: string;
  status: string;
  orderDate: string | null;
  quantity: number;
  limitPriceThousandVnd: number | null;
  filledQty: number;
  filledPriceThousandVnd: number | null;
  feeVnd?: number;
  taxVnd?: number;
}

export interface BrokerHistoryFillUi {
  orderId: string;
  subAccountId?: string;
  ticker: string;
  side: OrderSide;
  tradeDate: string | null;
  quantity: number;
  priceThousandVnd: number | null;
  grossValueVnd: number | null;
  feeVnd?: number;
  taxVnd?: number;
}

export interface BrokerCashTransactionUi {
  id: string;
  subAccountId?: string;
  transactionDate: string | null;
  businessDate: string | null;
  type?: string;
  flow?: string;
  status?: string;
  amountVnd: number;
  title?: string;
  description?: string;
  code?: string;
}

export interface BrokerRightEventUi {
  id: string;
  subAccountId?: string;
  ticker: string;
  type?: string;
  status?: string;
  reportDate: string | null;
  startDate?: string | null;
  endDate?: string | null;
  finishDate?: string | null;
  ratio?: string;
  ownedShares?: number;
  waitingShares?: number;
  amountVnd?: number;
  priceVnd?: number;
  maxRegisterQuantity?: number;
  registeredQuantity?: number;
}

export interface PortfolioHistory {
  supported: true;
  broker: string;
  fromDate: string;
  toDate: string;
  subAccounts: PortfolioSubAccount[];
  orders: BrokerHistoryOrderUi[];
  fills: BrokerHistoryFillUi[];
  transactions: BrokerCashTransactionUi[];
  rights: BrokerRightEventUi[];
  unavailable?: { source: string; subAccountId?: string; error: string }[];
}

export interface PortfolioHistoryUnsupported {
  supported: false;
  broker: string;
  reason: string;
}

export type PortfolioHistoryRes = PortfolioHistory | PortfolioHistoryUnsupported;

export type PortfolioPlaceOrderRes =
  | { ok: true; order: BrokerOrderUi }
  | { ok: false; error: "no_reference_price" | "guardrail_blocked" | "broker_error"; reasons?: string[]; message?: string; order?: BrokerOrderUi };

export interface DesktopSettings {
  launchAtLogin: boolean;
  hideOnClose: boolean;
  showNotifications: boolean;
  notifyOnOrderFill: boolean;
  appearance: "light" | "dark" | "system";
}

// -- Request schemas --------------------------------------------------------

export const StartSessionReq = z.object({
  projectId: z.string(),
  title: z.string().optional(),
});

export const ResumeSessionReq = z.object({
  projectId: z.string(),
  sessionId: z.string(),
});

export const ArchiveSessionReq = z.object({
  projectId: z.string(),
  sessionId: z.string(),
});

export const RestoreSessionReq = z.object({
  projectId: z.string(),
  session: z.object({
    id: z.string(),
    sdkSessionId: z.string().optional(),
    title: z.string(),
    cwd: z.string(),
    createdAt: z.number(),
    updatedAt: z.number(),
    model: z.string().optional(),
    autonomy: z.string().optional(),
  }),
});

export const ListSessionsReq = z.object({
  projectId: z.string(),
});

export const SendPromptReq = z.object({
  projectId: z.string(),
  sessionId: z.string(),
  prompt: z.string(),
  displayPrompt: z.string().optional(),
  turnId: z.string(),
});

export const AbortTurnReq = z.object({
  turnId: z.string(),
});

export const SlashCommandReq = z.object({
  projectId: z.string(),
  sessionId: z.string().optional(),
  name: z.string(),
  args: z.string().optional(),
});

export const SaveConfigReq = z.object({
  patch: z.record(z.unknown()),
});

export const SaveDesktopSettingsReq = z.object({
  patch: z.object({
    launchAtLogin: z.boolean().optional(),
    hideOnClose: z.boolean().optional(),
    showNotifications: z.boolean().optional(),
    notifyOnOrderFill: z.boolean().optional(),
    appearance: z.enum(["light", "dark", "system"]).optional(),
  }),
});

export const ListModelsReq = z
  .object({
    provider: z.enum(["anthropic", "compatible"]).optional(),
    apiKey: z.string().optional(),
    baseUrl: z.string().optional(),
  })
  .optional();

export const HealthProbeReq = z.object({
  probe: z.boolean().default(false),
});

export const MarketOverviewReq = z
  .object({
    resolution: z.enum(["1", "5", "15", "30", "1H", "1D", "1W", "1M"]).default("1D"),
    bars: z.number().int().min(20).max(240).default(90),
  })
  .optional();

export const MarketAssetReq = z.object({
  symbol: z.string().min(1).max(12),
  kind: z.enum(["stock", "index"]).optional(),
  resolution: z.enum(["1", "5", "15", "30", "1H", "1D", "1W", "1M"]).default("1D"),
  bars: z.number().int().min(20).max(240).default(120),
});

export const MarketHeatmapReq = z
  .object({
    includeIndexes: z.boolean().default(true),
  })
  .optional();

export const PortfolioSnapshotReq = z.object({}).optional();

export const PortfolioOrdersReq = z
  .object({
    ticker: z.string().optional(),
    status: z.enum(["PENDING", "FILLED", "CANCELLED", "REJECTED"]).optional(),
    limit: z.number().int().min(1).max(200).default(50),
  })
  .optional();

export const PortfolioHistoryReq = z.object({
  kind: z.enum(["all", "orders", "fills", "transactions", "rights"]).default("all"),
  fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  ticker: z.string().optional(),
  limit: z.number().int().min(1).max(500).default(100),
});

export const PortfolioPlaceOrderReq = z.object({
  ticker: z.string().min(1),
  side: z.enum(["BUY", "SELL"]),
  type: z.enum(["MARKET", "LIMIT"]).default("MARKET"),
  quantity: z.number().int().positive(),
  limitPrice: z.number().positive().optional(),
  notes: z.string().optional(),
});

export const PortfolioCancelOrderReq = z.object({
  id: z.string().min(1),
});

export const CreateProjectReq = z.object({
  name: z.string().min(1),
  rootPath: z.string().optional(),
});

export const DeleteProjectReq = z.object({
  id: z.string(),
});

export const ConsentRespondReq = z.object({
  id: z.string(),
  approved: z.boolean(),
});

export const ActivateProjectReq = z.object({
  id: z.string(),
});

// -- Channel map ------------------------------------------------------------

export interface IpcChannelMap {
  "session:start": { req: z.infer<typeof StartSessionReq>; res: SessionDescriptor };
  "session:resume": {
    req: z.infer<typeof ResumeSessionReq>;
    res: { session: SessionDescriptor; records: ChatRecord[] };
  };
  "session:archive": { req: z.infer<typeof ArchiveSessionReq>; res: { ok: true } };
  "session:restore": { req: z.infer<typeof RestoreSessionReq>; res: SessionDescriptor };
  "session:list": { req: z.infer<typeof ListSessionsReq>; res: SessionDescriptor[] };
  "turn:send": { req: z.infer<typeof SendPromptReq>; res: { ok: true } };
  "turn:abort": { req: z.infer<typeof AbortTurnReq>; res: { ok: boolean } };
  "slash:run": { req: z.infer<typeof SlashCommandReq>; res: { ok: true; text?: string } };
  "config:get": { req: undefined; res: unknown };
  "config:save": { req: z.infer<typeof SaveConfigReq>; res: unknown };
  "models:list": {
    req: z.infer<typeof ListModelsReq>;
    res: { models: string[]; error?: string };
  };
  "app-settings:get": { req: undefined; res: DesktopSettings };
  "app-settings:save": { req: z.infer<typeof SaveDesktopSettingsReq>; res: DesktopSettings };
  "broker:state": { req: undefined; res: unknown };
  "portfolio:snapshot": { req: z.infer<typeof PortfolioSnapshotReq>; res: PortfolioSnapshot };
  "portfolio:orders": { req: z.infer<typeof PortfolioOrdersReq>; res: { orders: BrokerOrderUi[] } };
  "portfolio:history": { req: z.infer<typeof PortfolioHistoryReq>; res: PortfolioHistoryRes };
  "portfolio:placeOrder": { req: z.infer<typeof PortfolioPlaceOrderReq>; res: PortfolioPlaceOrderRes };
  "portfolio:cancelOrder": { req: z.infer<typeof PortfolioCancelOrderReq>; res: { ok: boolean; order: BrokerOrderUi } };
  "health:probe": { req: z.infer<typeof HealthProbeReq>; res: HealthReport };
  "market:overview": { req: z.infer<typeof MarketOverviewReq>; res: MarketOverview };
  "market:asset": { req: z.infer<typeof MarketAssetReq>; res: MarketIndexOverview };
  "market:heatmap": { req: z.infer<typeof MarketHeatmapReq>; res: MarketHeatmap };
  "project:list": { req: undefined; res: { projects: Project[]; activeId: string | null } };
  "project:create": { req: z.infer<typeof CreateProjectReq>; res: Project };
  "project:delete": { req: z.infer<typeof DeleteProjectReq>; res: { ok: true } };
  "project:activate": { req: z.infer<typeof ActivateProjectReq>; res: Project };
  "consent:respond": { req: z.infer<typeof ConsentRespondReq>; res: { ok: true } };
  "onboarding:status": { req: undefined; res: { onboarded: boolean } };
  "onboarding:complete": { req: undefined; res: { ok: true } };
}

export type IpcChannel = keyof IpcChannelMap;

// -- Streaming push events --------------------------------------------------

export type StreamEvent =
  | {
      kind: "turn:block_start";
      turnId: string;
      sessionId: string;
      blockType: "thinking" | "assistant" | "tool_use" | "user";
      toolName?: string;
      toolUseId?: string;
      timestamp: number;
    }
  | {
      kind: "turn:block_delta";
      turnId: string;
      sessionId: string;
      delta: string;
    }
  | {
      kind: "turn:block_stop"; turnId: string; sessionId: string }
  | {
      kind: "turn:record";
      turnId: string;
      sessionId: string;
      record: ChatRecord;
    }
  | {
      kind: "turn:done";
      turnId: string;
      sessionId: string;
      usage?: ChatRecord["usage"];
      costUsd?: number;
      sdkSessionId?: string;
    }
  | { kind: "turn:error"; turnId: string; sessionId: string; message: string }
  | {
      kind: "team:event";
      turnId: string;
      sessionId: string;
      event: TeamUiEvent;
    }
  | {
      kind: "consent:request";
      id: string;
      action: string;
      detail: string;
      broker: string;
      autonomy: string;
    };

export const STREAM_CHANNEL = "azoth:stream";
