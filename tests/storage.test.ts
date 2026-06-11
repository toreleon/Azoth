import { describe, expect, it, beforeEach, vi, afterEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Mock the environment variable to ensure we use a test DB.
const TMP_DB = join(mkdtempSync(join(tmpdir(), "azoth-team-")), "azoth.db");
process.env.AZOTH_DB_PATH = TMP_DB;

import { getDb } from "../src/storage/db.js";
import { recordTeamRunStart } from "../src/agent/team/storage.js";

describe("recordTeamRunStart", () => {
  beforeEach(() => {
    try {
      const db = getDb();
      const tableExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='team_runs'").get();
      if (tableExists) {
        db.exec("DELETE FROM team_runs");
      }
    } catch (e) {
      // Ignore
    }
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should record a new team run start", () => {
    vi.setSystemTime(new Date("2025-01-01T12:00:00Z"));

    const runId = "test-run-1";
    const ticker = "fpt";
    const asOfDateIso = "2023-10-26T12:00:00Z";

    recordTeamRunStart(runId, ticker, asOfDateIso);

    const db = getDb();
    const runs = db.prepare("SELECT * FROM team_runs WHERE id = ?").all(runId) as any[];

    expect(runs).toHaveLength(1);
    expect(runs[0].id).toBe(runId);
    expect(runs[0].ticker).toBe("FPT"); // Should be upper cased
    expect(runs[0].as_of_date).toBe(asOfDateIso);
    expect(runs[0].created_at).toBe(Math.floor(Date.now() / 1000));
  });

  it("should throw an error on duplicate run ID", () => {
    const runId = "test-run-dup";
    const ticker = "HBG";
    const asOfDateIso = "2023-10-26T12:00:00Z";

    recordTeamRunStart(runId, ticker, asOfDateIso);

    expect(() => recordTeamRunStart(runId, ticker, asOfDateIso)).toThrowError(/UNIQUE constraint failed: team_runs.id/);
  });
});
