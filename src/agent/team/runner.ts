import { query, type Options } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
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
}

interface RawResult {
  text: string;
  toolCount: number;
  usage: RoleUsage;
  sessionId?: string;
}

function buildOptions(role: RoleName, systemPrompt: string, modelOverride?: string): Options {
  const cfg = loadConfig();
  const mcpName = `azoth-${role}`;
  const allowed = allowedToolIds(role);
  const opts: Options = {
    model: modelOverride ?? cfg.model,
    systemPrompt,
    includePartialMessages: true,
    mcpServers: { [mcpName]: buildRoleMcpServer(role) },
    allowedTools: allowed,
  };
  return opts;
}

export async function runRole<T>(opts: RoleRunOptions<T>): Promise<{ output: T; raw: RawResult }> {
  const { role, systemPrompt, userPrompt, schema, round, emit, modelOverride } = opts;
  emit({ type: "role_start", role, round });

  const sdkOpts = buildOptions(role, systemPrompt, modelOverride);
  const stream = query({ prompt: userPrompt, options: sdkOpts });

  let text = "";
  let currentText = "";
  let toolCount = 0;
  const usage: RoleUsage = {};
  let sessionId: string | undefined;

  for await (const message of stream) {
    if (message.type === "stream_event") {
      const ev = (message as { event: any }).event;
      if (ev?.type === "content_block_start") {
        const cb = ev.content_block;
        if (cb?.type === "tool_use") {
          toolCount++;
          emit({ type: "role_tool", role, tool: cb.name ?? "?" });
        } else if (cb?.type === "text") {
          currentText = "";
        }
      } else if (ev?.type === "content_block_delta") {
        const d = ev.delta;
        if (d?.type === "text_delta" && d.text) {
          text += d.text;
          currentText += d.text;
          emit({ type: "role_delta", role, text: d.text });
        }
      }
    } else if (message.type === "system" && (message as { subtype?: string }).subtype === "init") {
      const sid = (message as { session_id?: string }).session_id;
      if (sid) sessionId = sid;
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

  const json = extractJson(text);
  let parsed: T;
  try {
    parsed = schema.parse(json);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`role=${role} produced invalid JSON output: ${msg}\nraw: ${text.slice(0, 500)}`);
  }
  emit({ type: "role_end", role, round, output: parsed, usage });
  return {
    output: parsed,
    raw: { text, toolCount, usage, sessionId },
  };
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
    for (let i = start; i < trimmed.length; i++) {
      const c = trimmed[i];
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
