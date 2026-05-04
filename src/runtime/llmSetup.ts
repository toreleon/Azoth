import { query, type Options } from "@anthropic-ai/claude-agent-sdk";
import { loadConfig } from "../config/loader.js";

export interface LlmVerificationInput {
  provider: "anthropic" | "compatible";
  apiKey: string;
  baseUrl: string;
  model: string;
}

export function hasLlmEnvironment(): boolean {
  const cfg = loadConfig();
  if (!cfg.llm.api_key.trim()) return false;
  if (cfg.llm.provider === "compatible" && !cfg.llm.base_url.trim()) return false;
  return true;
}

function verificationEnv(input: LlmVerificationInput): Options["env"] {
  return {
    ...process.env,
    ANTHROPIC_API_KEY: input.apiKey.trim(),
    ANTHROPIC_BASE_URL: input.provider === "compatible" ? input.baseUrl.trim() : undefined,
  };
}

function describeSdkError(message: unknown): string {
  if (message instanceof Error) return message.message;
  return String(message || "Unknown LLM verification error");
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

  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort("LLM verification timed out"), 30_000);
  try {
    const stream = query({
      prompt: "Reply with exactly: OK",
      options: {
        model,
        systemPrompt: "You are a health-check endpoint. Reply with exactly OK.",
        tools: [],
        allowedTools: [],
        maxTurns: 1,
        maxBudgetUsd: 0.02,
        permissionMode: "dontAsk",
        persistSession: false,
        abortController,
        env: verificationEnv(input),
      },
    });
    let resultError: string | undefined;
    for await (const message of stream) {
      if (message.type === "assistant" && message.error) {
        resultError = message.error;
      } else if (message.type === "result") {
        if (message.subtype !== "success" || message.is_error) {
          throw new Error(resultError ?? `Verification failed: ${message.subtype}`);
        }
        return;
      }
    }
    throw new Error("Verification failed: provider returned no result");
  } catch (e) {
    throw new Error(describeSdkError(e));
  } finally {
    clearTimeout(timeout);
  }
}
