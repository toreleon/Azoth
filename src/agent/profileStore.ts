/**
 * Profile persistence: load/save AgentProfile rows in `agent_profiles`, plus
 * one-time seeding from `seeds/profiles/*.json` on first use.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { getDb } from "../storage/db.js";
import {
  type AgentProfile,
  parseProfileRef,
  profileRef,
  validateProfile,
} from "./profile.js";

const SEEDS_DIR = resolve("seeds/profiles");

let seeded = false;

export function ensureProfilesSeeded(): void {
  if (seeded) return;
  seeded = true;
  if (!existsSync(SEEDS_DIR)) return;
  const db = getDb();
  const files = readdirSync(SEEDS_DIR).filter((f) => f.endsWith(".json"));
  const insert = db.prepare(
    `INSERT OR IGNORE INTO agent_profiles (id, version, parent_ver, profile_json, created_at)
     VALUES (?, ?, ?, ?, ?)`,
  );
  for (const f of files) {
    try {
      const raw = JSON.parse(readFileSync(resolve(SEEDS_DIR, f), "utf8"));
      const profile = validateProfile(raw);
      insert.run(
        profile.id,
        profile.version,
        profile.parentVersion ?? null,
        JSON.stringify(profile),
        profile.createdAt,
      );
    } catch (err) {
      console.warn(`[profile-seed] skipped ${f}: ${(err as Error).message}`);
    }
  }
}

export function loadProfile(ref: string): AgentProfile {
  ensureProfilesSeeded();
  const { id, version } = parseProfileRef(ref);
  const db = getDb();
  const row = db
    .prepare("SELECT profile_json FROM agent_profiles WHERE id = ? AND version = ?")
    .get(id, version) as { profile_json: string } | undefined;
  if (!row) throw new Error(`profile not found: ${ref}`);
  return validateProfile(JSON.parse(row.profile_json));
}

export function saveProfile(profile: AgentProfile): string {
  const db = getDb();
  db.prepare(
    `INSERT OR REPLACE INTO agent_profiles (id, version, parent_ver, profile_json, created_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(
    profile.id,
    profile.version,
    profile.parentVersion ?? null,
    JSON.stringify(profile),
    profile.createdAt,
  );
  return profileRef(profile);
}

export function listProfileRefs(id?: string): string[] {
  ensureProfilesSeeded();
  const db = getDb();
  const rows = (id
    ? db.prepare("SELECT id, version FROM agent_profiles WHERE id = ? ORDER BY version DESC").all(id)
    : db.prepare("SELECT id, version FROM agent_profiles ORDER BY id, version DESC").all()) as {
    id: string;
    version: number;
  }[];
  return rows.map((r) => `${r.id}@v${r.version}`);
}

export function latestProfileRef(id: string): string | undefined {
  ensureProfilesSeeded();
  const db = getDb();
  const row = db
    .prepare("SELECT version FROM agent_profiles WHERE id = ? ORDER BY version DESC LIMIT 1")
    .get(id) as { version: number } | undefined;
  return row ? `${id}@v${row.version}` : undefined;
}
