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

export interface HealthRow {
  name: string;
  ok: boolean;
  detail: string;
}

export interface HealthReport {
  ok: boolean;
  rows: HealthRow[];
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

export const ListSessionsReq = z.object({
  projectId: z.string(),
});

export const SendPromptReq = z.object({
  projectId: z.string(),
  sessionId: z.string(),
  prompt: z.string(),
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

export const HealthProbeReq = z.object({
  probe: z.boolean().default(false),
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
  "session:list": { req: z.infer<typeof ListSessionsReq>; res: SessionDescriptor[] };
  "turn:send": { req: z.infer<typeof SendPromptReq>; res: { ok: true } };
  "turn:abort": { req: z.infer<typeof AbortTurnReq>; res: { ok: boolean } };
  "slash:run": { req: z.infer<typeof SlashCommandReq>; res: { ok: true; text?: string } };
  "config:get": { req: undefined; res: unknown };
  "config:save": { req: z.infer<typeof SaveConfigReq>; res: unknown };
  "broker:state": { req: undefined; res: unknown };
  "health:probe": { req: z.infer<typeof HealthProbeReq>; res: HealthReport };
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
      kind: "consent:request";
      id: string;
      action: string;
      detail: string;
      broker: string;
      autonomy: string;
    };

export const STREAM_CHANNEL = "azoth:stream";
