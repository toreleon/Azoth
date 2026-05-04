import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { appendFileSync, mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { projectDir } from "./paths.js";

export type SessionRecordType =
  | "session_start"
  | "user"
  | "assistant"
  | "thinking"
  | "tool_use"
  | "tool_result"
  | "result"
  | "system";

export interface SessionRecord {
  type: SessionRecordType;
  timestamp: number;
  sessionId: string;
  cwd: string;
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

export interface SessionIndexEntry {
  id: string;
  sdkSessionId?: string;
  title: string;
  cwd: string;
  createdAt: number;
  updatedAt: number;
  model?: string;
  autonomy?: string;
}

export interface ActiveSession {
  id: string;
  sdkSessionId?: string;
  cwd: string;
  updatedAt: number;
}

let lastTimestamp = 0;

export function sessionPaths(cwd = process.cwd()) {
  const dir = projectDir(cwd);
  return {
    dir,
    index: resolve(dir, "sessions-index.json"),
    active: resolve(dir, "active-session.json"),
  };
}

export function sessionFile(id: string, cwd = process.cwd()): string {
  return resolve(sessionPaths(cwd).dir, `${id}.jsonl`);
}

function now() {
  const current = Date.now();
  lastTimestamp = Math.max(current, lastTimestamp + 1);
  return lastTimestamp;
}

function readJson<T>(path: string, fallback: T): T {
  try {
    if (!existsSync(path)) return fallback;
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return fallback;
  }
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function listSessions(cwd = process.cwd()): SessionIndexEntry[] {
  const { index } = sessionPaths(cwd);
  const rows = readJson<SessionIndexEntry[]>(index, []);
  return rows.slice().sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getActiveSession(cwd = process.cwd()): ActiveSession | undefined {
  const active = readJson<ActiveSession | null>(sessionPaths(cwd).active, null);
  return active ?? undefined;
}

export function findSession(idOrPrefix: string, cwd = process.cwd()): SessionIndexEntry | undefined {
  const sessions = listSessions(cwd);
  return sessions.find((s) => s.id === idOrPrefix)
    ?? sessions.find((s) => s.id.startsWith(idOrPrefix))
    ?? sessions.find((s) => s.sdkSessionId === idOrPrefix)
    ?? sessions.find((s) => s.sdkSessionId?.startsWith(idOrPrefix));
}

export function latestSession(cwd = process.cwd()): SessionIndexEntry | undefined {
  return listSessions(cwd)[0];
}

export function createSession(meta: {
  cwd?: string;
  title?: string;
  model?: string;
  autonomy?: string;
} = {}): SessionIndexEntry {
  const cwd = meta.cwd ?? process.cwd();
  const id = randomUUID();
  const createdAt = now();
  const entry: SessionIndexEntry = {
    id,
    title: meta.title ?? "Untitled session",
    cwd,
    createdAt,
    updatedAt: createdAt,
    model: meta.model,
    autonomy: meta.autonomy,
  };
  mkdirSync(sessionPaths(cwd).dir, { recursive: true });
  writeFileSync(sessionFile(id, cwd), "", { encoding: "utf8", flag: "wx" });
  upsertSession(entry, cwd);
  setActiveSession({ id, cwd, updatedAt: createdAt }, cwd);
  appendSessionRecord(id, {
    type: "session_start",
    timestamp: createdAt,
    sessionId: id,
    cwd,
    title: entry.title,
    model: meta.model,
    autonomy: meta.autonomy,
  }, cwd);
  return entry;
}

export function upsertSession(entry: SessionIndexEntry, cwd = process.cwd()): void {
  const paths = sessionPaths(cwd);
  const rows = listSessions(cwd).filter((s) => s.id !== entry.id);
  rows.push(entry);
  writeJson(paths.index, rows.sort((a, b) => b.updatedAt - a.updatedAt));
}

export function setActiveSession(active: ActiveSession, cwd = process.cwd()): void {
  writeJson(sessionPaths(cwd).active, active);
}

export function touchSession(
  id: string,
  updates: Partial<Pick<SessionIndexEntry, "sdkSessionId" | "title" | "model" | "autonomy">> = {},
  cwd = process.cwd(),
): void {
  const sessions = listSessions(cwd);
  const entry = sessions.find((s) => s.id === id);
  if (!entry) return;
  const updated: SessionIndexEntry = { ...entry, ...updates, updatedAt: now() };
  upsertSession(updated, cwd);
  setActiveSession({ id, sdkSessionId: updated.sdkSessionId, cwd, updatedAt: updated.updatedAt }, cwd);
}

export function appendSessionRecord(id: string, record: SessionRecord, cwd = process.cwd()): void {
  appendFileSync(sessionFile(id, cwd), `${JSON.stringify(record)}\n`, "utf8");
  touchSession(id, {}, cwd);
}

export function readSessionRecords(id: string, cwd = process.cwd()): SessionRecord[] {
  const path = sessionFile(id, cwd);
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as SessionRecord);
}

export function activateSession(id: string, cwd = process.cwd()): SessionIndexEntry | undefined {
  const entry = findSession(id, cwd);
  if (!entry) return undefined;
  const updated = { ...entry, updatedAt: now() };
  upsertSession(updated, cwd);
  setActiveSession({ id: updated.id, sdkSessionId: updated.sdkSessionId, cwd, updatedAt: updated.updatedAt }, cwd);
  return updated;
}
