import { existsSync, rmSync, writeFileSync } from "node:fs";
import { ensureAzothDirs } from "./paths.js";
import { DEFAULT_CONFIG_YAML } from "./defaultConfig.js";

export function initializeAzothRuntime(): void {
  const paths = ensureAzothDirs();
  if (!existsSync(paths.config)) {
    writeFileSync(paths.config, DEFAULT_CONFIG_YAML, { encoding: "utf8", mode: 0o600 });
  }
  for (const stale of [".env", ".env.example"]) {
    const path = `${paths.home}/${stale}`;
    if (existsSync(path)) rmSync(path, { force: true });
  }
}
