import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { azothPaths, ensureAzothDirs } from "./paths.js";

export interface LlmEnvironmentInput {
  apiKey: string;
  baseUrl?: string;
}

function upsertEnvLine(lines: string[], key: string, value: string): string[] {
  const next = [...lines];
  const idx = next.findIndex((line) => line.trimStart().startsWith(`${key}=`));
  const rendered = `${key}=${value}`;
  if (idx >= 0) next[idx] = rendered;
  else next.push(rendered);
  return next;
}

export function hasLlmEnvironment(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}

export function saveLlmEnvironment(input: LlmEnvironmentInput): string {
  const apiKey = input.apiKey.trim();
  if (!apiKey) throw new Error("API key is required");

  const paths = ensureAzothDirs();
  const existing = existsSync(paths.env) ? readFileSync(paths.env, "utf8") : "# Azoth environment\n";
  let lines = existing.split(/\r?\n/).filter((line, idx, arr) => idx < arr.length - 1 || line.length > 0);

  lines = upsertEnvLine(lines, "ANTHROPIC_API_KEY", apiKey);
  if (input.baseUrl?.trim()) lines = upsertEnvLine(lines, "ANTHROPIC_BASE_URL", input.baseUrl.trim());

  writeFileSync(paths.env, `${lines.join("\n")}\n`, { encoding: "utf8", mode: 0o600 });
  process.env.ANTHROPIC_API_KEY = apiKey;
  if (input.baseUrl?.trim()) process.env.ANTHROPIC_BASE_URL = input.baseUrl.trim();
  return paths.env;
}

