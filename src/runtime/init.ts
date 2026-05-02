import { existsSync, writeFileSync } from "node:fs";
import { ensureAzothDirs } from "./paths.js";
import { DEFAULT_CONFIG_YAML, DEFAULT_ENV_EXAMPLE } from "./defaultConfig.js";

export function initializeAzothRuntime(): void {
  const paths = ensureAzothDirs();
  if (!existsSync(paths.config)) {
    writeFileSync(paths.config, DEFAULT_CONFIG_YAML, { encoding: "utf8", mode: 0o600 });
  }
  if (!existsSync(paths.envExample)) {
    writeFileSync(paths.envExample, DEFAULT_ENV_EXAMPLE, { encoding: "utf8", mode: 0o600 });
  }
}
