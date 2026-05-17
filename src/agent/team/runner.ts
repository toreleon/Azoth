import { query, type Options } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { resolveClaudeCodeExecutable } from "../claudeCodeExecutable.js";
import { spawnTrackedClaudeCodeProcess } from "../claudeProcess.js";
import { loadConfig } from "../../config/loader.js";
import { allowedToolIds, buildRoleMcpServer } from "./tools.js";
import type { RoleName, RoleUsage, TeamEvent } from "./state.js";

export interface RoleRunOptions<T> {
  role: RoleName;
  systemPrompt: string;
  userPrompt: string;
  schema: z.ZodSchema<T>;
  round?: number;
  emit: (ev: TeamEvent) => void;
  modelOverride?: string;
  allowWebSearch?: boolean;
  signal?: AbortSignal;
}

interface RawResult {
  text: string;
  toolCount: number;
  usage: RoleUsage;
  sessionId?: string;
}

const DEEP_THINK_ROLES: ReadonlySet<RoleName> = new Set(["researchManager", "portfolio"]);
const WEB_SEARCH_TOOL = "WebSearch";

function modelForRole(role: RoleName, modelOverride?: string): string {
  const cfg = loadConfig();
  if (modelOverride) return modelOverride;
  if (DEEP_THINK_ROLES.has(role)) {
    return cfg.team.deep_model ?? cfg.model;
  }
  return cfg.team.quick_model ?? cfg.model;
}

function buildOptions(
  role: RoleName,
  systemPrompt: string,
  modelOverride?: string,
  allowWebSearch = true,
): Options {
  const mcpName = `azoth-${role}`;
  const allowed = allowedToolIds(role);
  const tools = allowWebSearch ? [WEB_SEARCH_TOOL] : [];
  const allowedTools = allowWebSearch ? [WEB_SEARCH_TOOL, ...allowed] : allowed;
  const pathToClaudeCodeExecutable = resolveClaudeCodeExecutable();
  const opts: Options = {
    model: modelForRole(role, modelOverride),
    systemPrompt,
    ...(pathToClaudeCodeExecutable ? { pathToClaudeCodeExecutable } : {}),
    spawnClaudeCodeProcess: spawnTrackedClaudeCodeProcess,
    includePartialMessages: true,
    // Keep Claude Code built-ins locked down while intentionally exposing
    // WebSearch for supplemental current context.
    tools,
    mcpServers: { [mcpName]: buildRoleMcpServer(role) },
    allowedTools,
    permissionMode: "bypassPermissions",
    allowDangerouslySkipPermissions: true,
  };
  return opts;
}

function abortControllerFromSignal(signal: AbortSignal | undefined): AbortController {
  const ctrl = new AbortController();
  if (signal?.aborted) ctrl.abort(signal.reason);
  else signal?.addEventListener("abort", () => ctrl.abort(signal.reason), { once: true });
  return ctrl;
}

export async function runRole<T>(opts: RoleRunOptions<T>): Promise<{ output: T; raw: RawResult }> {
  const { role, systemPrompt, userPrompt, schema, round, emit, modelOverride, allowWebSearch, signal } = opts;
  if (signal?.aborted) throw new Error("aborted");
  emit({ type: "role_start", role, round });

  const sdkOpts = buildOptions(role, systemPrompt, modelOverride, allowWebSearch);
  sdkOpts.abortController = abortControllerFromSignal(signal);
  const stream = query({ prompt: userPrompt, options: sdkOpts });

  let text = "";
  let currentText = "";
  let currentTool: { tool: string; toolUseId?: string; input: string } | null = null;
  const toolsById = new Map<string, string>();
  let toolCount = 0;
  const usage: RoleUsage = {};
  let sessionId: string | undefined;

  for await (const message of stream) {
    if (signal?.aborted) throw new Error("aborted");
    if (message.type === "stream_event") {
      const ev = (message as { event: any }).event;
      if (ev?.type === "content_block_start") {
        const cb = ev.content_block;
        if (cb?.type === "tool_use") {
          toolCount++;
          currentTool = { tool: cb.name ?? "?", toolUseId: cb.id, input: "" };
        } else if (cb?.type === "text") {
          currentText = "";
        }
      } else if (ev?.type === "content_block_delta") {
        const d = ev.delta;
        if (d?.type === "text_delta" && d.text) {
          text += d.text;
          currentText += d.text;
          emit({ type: "role_delta", role, text: d.text });
        } else if (d?.type === "input_json_delta" && d.partial_json && currentTool) {
          currentTool.input += d.partial_json;
        }
      } else if (ev?.type === "content_block_stop" && currentTool) {
        if (currentTool.toolUseId) toolsById.set(currentTool.toolUseId, currentTool.tool);
        emit({
          type: "role_tool",
          role,
          tool: currentTool.tool,
          input: currentTool.input || undefined,
          toolUseId: currentTool.toolUseId,
        });
        currentTool = null;
      }
    } else if (message.type === "user") {
      const content = (message as any).message?.content;
      if (Array.isArray(content)) {
        for (const c of content) {
          if (c?.type === "tool_result") {
            const resultText = typeof c.content === "string"
              ? c.content
              : Array.isArray(c.content)
                ? c.content.map((x: any) => x?.text ?? "").join("")
                : JSON.stringify(c.content);
            const toolUseId = c.tool_use_id as string | undefined;
            emit({
              type: "role_tool_result",
              role,
              toolUseId,
              tool: toolUseId ? toolsById.get(toolUseId) : undefined,
              content: resultText.slice(0, 4000),
            });
          }
        }
      }
    } else if (message.type === "system" && (message as { subtype?: string }).subtype === "init") {
      const sid = (message as { session_id?: string }).session_id;
      if (sid) sessionId = sid;
    } else if (message.type === "assistant") {
      const finalText = extractAssistantText((message as any).message?.content);
      const trimmedText = text.trim();
      const trimmedFinalText = finalText.trim();
      if (trimmedFinalText && !trimmedText) text = trimmedFinalText;
      else if (trimmedFinalText && trimmedFinalText.includes(trimmedText)) text = trimmedFinalText;
      else if (trimmedFinalText && !trimmedText.includes(trimmedFinalText)) text += trimmedFinalText;
    } else if (message.type === "result") {
      const r = message as unknown as {
        session_id?: string;
        total_cost_usd?: number;
        usage?: {
          input_tokens?: number;
          output_tokens?: number;
          cache_read_input_tokens?: number;
          cache_creation_input_tokens?: number;
        };
      };
      if (r.session_id) sessionId = r.session_id;
      usage.inputTokens = r.usage?.input_tokens;
      usage.outputTokens = r.usage?.output_tokens;
      usage.cacheReadTokens = r.usage?.cache_read_input_tokens;
      usage.cacheCreationTokens = r.usage?.cache_creation_input_tokens;
      usage.costUsd = r.total_cost_usd;
    }
  }

  let parsed: T;
  try {
    const json = extractJson(text);
    parsed = schema.parse(json);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const raw = text.trim() ? text.trim().slice(0, 500) : "(empty)";
    throw new Error(`role=${role} produced invalid JSON output: ${msg}\nraw: ${raw}`);
  }
  emit({ type: "role_end", role, round, output: parsed, usage });
  return {
    output: parsed,
    raw: { text, toolCount, usage, sessionId },
  };
}

function extractAssistantText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((item) => {
      if (typeof item === "string") return item;
      if (item && typeof item === "object" && "type" in item && (item as { type?: string }).type === "text") {
        return (item as { text?: string }).text ?? "";
      }
      return "";
    })
    .join("");
}

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  // Try direct parse first.
  try {
    return JSON.parse(trimmed);
  } catch {
    /* fall through */
  }
  // Strip ``` fences.
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced && fenced[1]) {
    try {
      return JSON.parse(fenced[1].trim());
    } catch {
      /* fall through */
    }
  }
  // Find first `{` and matching `}` (best-effort balanced).
  const start = trimmed.indexOf("{");
  if (start >= 0) {
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < trimmed.length; i++) {
      const c = trimmed[i];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (c === "\\") {
        escaped = true;
        continue;
      }
      if (c === "\"") {
        inString = !inString;
        continue;
      }
      if (inString) continue;
      if (c === "{") depth++;
      else if (c === "}") {
        depth--;
        if (depth === 0) {
          const slice = trimmed.slice(start, i + 1);
          try {
            return JSON.parse(slice);
          } catch {
            break;
          }
        }
      }
    }
  }
  throw new Error("no JSON object found in role output");
}
