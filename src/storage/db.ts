import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ensureAzothDirs } from "../runtime/paths.js";
import { SCHEMA_SQL } from "./schemaDef.js";

let db: Database.Database | null = null;
const moduleDir = dirname(fileURLToPath(import.meta.url));

export function getDb(): Database.Database {
  if (db) return db;
  const paths = ensureAzothDirs();
  const path = process.env.AZOTH_DB ?? paths.db;
  db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  const schema = readSchema();
  db.exec(schema);
  migrate(db);
  return db;
}

function readSchema(): string {
  try {
    return readFileSync(resolve(moduleDir, "schema.sql"), "utf8");
  } catch {
    return SCHEMA_SQL;
  }
}

function migrate(d: Database.Database) {
  const backtestCols = d.prepare("PRAGMA table_info(backtest_turns)").all() as { name: string }[];
  const haveBacktest = new Set(backtestCols.map((c) => c.name));
  if (!haveBacktest.has("cache_read_tokens")) {
    d.exec("ALTER TABLE backtest_turns ADD COLUMN cache_read_tokens INTEGER DEFAULT 0");
  }
  if (!haveBacktest.has("cache_creation_tokens")) {
    d.exec("ALTER TABLE backtest_turns ADD COLUMN cache_creation_tokens INTEGER DEFAULT 0");
  }

  const decisionCols = d.prepare("PRAGMA table_info(decisions)").all() as { name: string }[];
  const haveDecisions = new Set(decisionCols.map((c) => c.name));
  if (!haveDecisions.has("rating")) {
    d.exec("ALTER TABLE decisions ADD COLUMN rating TEXT");
  }

  const teamRunCols = d.prepare("PRAGMA table_info(team_runs)").all() as { name: string }[];
  const haveTeamRuns = new Set(teamRunCols.map((c) => c.name));
  if (teamRunCols.length > 0 && !haveTeamRuns.has("final_rating")) {
    d.exec("ALTER TABLE team_runs ADD COLUMN final_rating TEXT");
  }
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
