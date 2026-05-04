import { loadConfig } from "../config/loader.js";

export interface LlmVerificationInput {
  provider: "anthropic" | "compatible";
  apiKey: string;
  baseUrl: string;
  model: string;
}

interface ModelListResponse {
  data?: Array<{ id?: unknown; name?: unknown; model?: unknown }>;
  models?: Array<{ id?: unknown; name?: unknown; model?: unknown } | string>;
}

export function hasLlmEnvironment(): boolean {
  const cfg = loadConfig();
  if (!cfg.llm.api_key.trim()) return false;
  if (cfg.llm.provider === "compatible" && !cfg.llm.base_url.trim()) return false;
  return true;
}

function modelsUrl(input: LlmVerificationInput): string {
  const base = input.provider === "compatible"
    ? input.baseUrl.trim()
    : "https://api.anthropic.com";
  const url = new URL(base.endsWith("/") ? base : `${base}/`);
  const trimmedPath = url.pathname.replace(/\/+$/, "");
  url.pathname = trimmedPath.endsWith("/v1") || trimmedPath === "/v1"
    ? `${trimmedPath}/models`
    : `${trimmedPath}/v1/models`;
  return url.toString();
}

function modelIds(payload: ModelListResponse): string[] {
  const rows = payload.data ?? payload.models ?? [];
  return rows.flatMap((row) => {
    if (typeof row === "string") return [row];
    const id = row.id ?? row.name ?? row.model;
    return typeof id === "string" ? [id] : [];
  });
}

function describeFetchError(message: unknown): string {
  if (message instanceof Error) return message.message;
  return String(message || "Unknown /models verification error");
}

export async function verifyLlmEnvironment(input: LlmVerificationInput): Promise<void> {
  const apiKey = input.apiKey.trim();
  const baseUrl = input.baseUrl.trim();
  const model = input.model.trim();
  if (!apiKey) throw new Error("API key is required");
  if (input.provider === "compatible" && !baseUrl) {
    throw new Error("Base URL is required for Anthropic-compatible providers");
  }
  if (!model) throw new Error("Model is required");

  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort("LLM /models verification timed out"), 30_000);
  try {
    const res = await fetch(modelsUrl(input), {
      method: "GET",
      signal: ctrl.signal,
      headers: {
        "accept": "application/json",
        "anthropic-version": "2023-06-01",
        "x-api-key": apiKey,
        "authorization": `Bearer ${apiKey}`,
      },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`/models failed: HTTP ${res.status}${body ? ` ${body.slice(0, 180)}` : ""}`);
    }
    const payload = await res.json() as ModelListResponse;
    const ids = modelIds(payload);
    if (!ids.length) {
      throw new Error("/models returned no model ids");
    }
    if (!ids.includes(model)) {
      throw new Error(`Model '${model}' was not found in /models (${ids.slice(0, 8).join(", ")})`);
    }
  } catch (e) {
    throw new Error(describeFetchError(e));
  } finally {
    clearTimeout(timeout);
  }
}
