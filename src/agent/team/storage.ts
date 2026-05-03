import { getDb } from "../../storage/db.js";
import type {
  AnalystReport,
  FinalDecision,
  ResearchReport,
  RiskReview,
  RoleName,
  RoleUsage,
  TraderDecision,
} from "./state.js";

/**
 * Schema is created lazily here (rather than in schema.sql) so the team
 * tables ship with the team module — easier to remove if the user later
 * decides to rip the feature out.
 */
function ensureTeamTables(): void {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS team_runs (
      id              TEXT PRIMARY KEY,
      ticker          TEXT NOT NULL,
      as_of_date      TEXT NOT NULL,
      created_at      INTEGER NOT NULL,
      finished_at     INTEGER,
      final_action    TEXT,
      final_sizing    REAL,
      final_rationale TEXT,
      decision_id     INTEGER
    );

    CREATE TABLE IF NOT EXISTS team_role_outputs (
      run_id          TEXT NOT NULL,
      role            TEXT NOT NULL,
      round           INTEGER NOT NULL DEFAULT 0,
      output_json     TEXT NOT NULL,
      input_tokens    INTEGER,
      output_tokens   INTEGER,
      cache_read      INTEGER,
      cache_creation  INTEGER,
      cost_usd        REAL,
      created_at      INTEGER NOT NULL,
      PRIMARY KEY (run_id, role, round)
    );

    CREATE INDEX IF NOT EXISTS team_runs_ticker_idx ON team_runs(ticker, created_at);
  `);
}

export function recordTeamRunStart(runId: string, ticker: string, asOfDateIso: string): void {
  ensureTeamTables();
  const db = getDb();
  db.prepare(
    `INSERT INTO team_runs (id, ticker, as_of_date, created_at)
     VALUES (?, ?, ?, ?)`,
  ).run(runId, ticker.toUpperCase(), asOfDateIso, Math.floor(Date.now() / 1000));
}

export function recordRoleOutput(
  runId: string,
  role: RoleName,
  round: number,
  output: unknown,
  usage: RoleUsage | undefined,
): void {
  ensureTeamTables();
  const db = getDb();
  db.prepare(
    `INSERT OR REPLACE INTO team_role_outputs
       (run_id, role, round, output_json, input_tokens, output_tokens,
        cache_read, cache_creation, cost_usd, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    runId,
    role,
    round,
    JSON.stringify(output),
    usage?.inputTokens ?? null,
    usage?.outputTokens ?? null,
    usage?.cacheReadTokens ?? null,
    usage?.cacheCreationTokens ?? null,
    usage?.costUsd ?? null,
    Math.floor(Date.now() / 1000),
  );
}

export interface FinalizeArgs {
  runId: string;
  ticker: string;
  asOfDateIso: string;
  analysts: AnalystReport[];
  research: ResearchReport[];
  trader: TraderDecision;
  risk: RiskReview;
  final: { action: FinalDecision["action"]; sizingPct: number; rationale: string; exitPlan?: string };
}

export function finalizeTeamRun(args: FinalizeArgs): FinalDecision {
  ensureTeamTables();
  const db = getDb();
  const now = Math.floor(Date.now() / 1000);
  const info = db
    .prepare(
      `INSERT INTO decisions (created_at, ticker, action, rationale, exit_plan, source_run)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      now,
      args.ticker.toUpperCase(),
      args.final.action,
      args.final.rationale,
      args.final.exitPlan ?? null,
      args.runId,
    );
  const decisionId = Number(info.lastInsertRowid);
  db.prepare(
    `UPDATE team_runs
       SET finished_at = ?,
           final_action = ?,
           final_sizing = ?,
           final_rationale = ?,
           decision_id = ?
     WHERE id = ?`,
  ).run(now, args.final.action, args.final.sizingPct, args.final.rationale, decisionId, args.runId);
  return {
    ticker: args.ticker.toUpperCase(),
    action: args.final.action,
    sizingPct: args.final.sizingPct,
    rationale: args.final.rationale,
    exitPlan: args.final.exitPlan,
    journalId: decisionId,
    teamRunId: args.runId,
  };
}
