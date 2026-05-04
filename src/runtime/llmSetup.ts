import { loadConfig } from "../config/loader.js";

export function hasLlmEnvironment(): boolean {
  const cfg = loadConfig();
  if (!cfg.llm.api_key.trim()) return false;
  if (cfg.llm.provider === "compatible" && !cfg.llm.base_url.trim()) return false;
  return true;
}

