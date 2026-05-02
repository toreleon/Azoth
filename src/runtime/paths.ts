import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";

export interface AzothPaths {
  home: string;
  projects: string;
  sessions: string;
  logs: string;
  cache: string;
  config: string;
  env: string;
  envExample: string;
  db: string;
}

export function azothHome(): string {
  return resolve(process.env.AZOTH_HOME ?? `${homedir()}/.azoth`);
}

export function azothPaths(): AzothPaths {
  const home = azothHome();
  return {
    home,
    projects: resolve(home, "projects"),
    sessions: resolve(home, "sessions"),
    logs: resolve(home, "logs"),
    cache: resolve(home, "cache"),
    config: resolve(home, "config.yaml"),
    env: resolve(home, ".env"),
    envExample: resolve(home, ".env.example"),
    db: resolve(home, "azoth.db"),
  };
}

export function ensureAzothDirs(): AzothPaths {
  const paths = azothPaths();
  for (const dir of [
    paths.home,
    paths.projects,
    paths.sessions,
    paths.logs,
    paths.cache,
  ]) {
    mkdirSync(dir, { recursive: true });
  }
  return paths;
}

export function encodeProjectKey(cwd = process.cwd()): string {
  const full = resolve(cwd);
  const encoded = full.replace(/[^A-Za-z0-9._-]+/g, "-");
  return encoded.startsWith("-") ? encoded : `-${encoded}`;
}

export function projectDir(cwd = process.cwd()): string {
  const paths = ensureAzothDirs();
  const dir = resolve(paths.projects, encodeProjectKey(cwd));
  mkdirSync(dir, { recursive: true });
  return dir;
}
