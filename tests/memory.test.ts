import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { closeDb } from "../src/storage/db.js";
import { resetConfigCacheForTests } from "../src/config/loader.js";
import {
  loadTurnMemory,
  recordMemory,
  renderMemoryPrompt,
  retrieveMemory,
} from "../src/agent/memory.js";

const DAY = 86400;

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "azoth-memory-"));
  process.env.AZOTH_HOME = tmp;
  delete process.env.VNSTOCK_DB;
  resetConfigCacheForTests();
  closeDb();
});

afterEach(() => {
  resetConfigCacheForTests();
  closeDb();
  delete process.env.AZOTH_HOME;
  delete process.env.VNSTOCK_DB;
  rmSync(tmp, { recursive: true, force: true });
});

describe("agent memory", () => {
  it("ignores entries dated after asOfSec (no lookahead)", () => {
    const profile = "vn-equity";
    const past = 1_700_000_000;
    recordMemory(profile, "long", past, "old lesson", 0.8);
    recordMemory(profile, "long", past + 30 * DAY, "future lesson", 0.9);
    const out = retrieveMemory(profile, "long", { asOfSec: past + 7 * DAY });
    expect(out.map((e) => e.content)).toEqual(["old lesson"]);
  });

  it("ranks by importance × recency × keyword match", () => {
    const p = "vn-equity";
    const t = 1_700_000_000;
    recordMemory(p, "mid", t - 60 * DAY, "stale momentum note", 0.5);
    recordMemory(p, "mid", t - 1 * DAY, "fresh chop note", 0.5);
    recordMemory(p, "mid", t - 30 * DAY, "momentum lesson", 0.9);
    const out = retrieveMemory(p, "mid", {
      asOfSec: t,
      queryTerms: ["momentum"],
      k: 3,
    });
    expect(out[0]!.content).toBe("momentum lesson");
  });

  it("renders both layers with headers", () => {
    const p = "vn-equity";
    const t = 1_700_000_000;
    recordMemory(p, "long", t - DAY, "settlement is T+2.5", 0.9);
    recordMemory(p, "mid", t - DAY, "VNINDEX in chop regime", 0.7);
    const mem = loadTurnMemory(p, t);
    const text = renderMemoryPrompt(mem);
    expect(text).toContain("Lessons (long-term):");
    expect(text).toContain("settlement is T+2.5");
    expect(text).toContain("Recent observations (mid-term):");
    expect(text).toContain("chop regime");
  });

  it("returns empty render when no entries", () => {
    expect(renderMemoryPrompt({ mid: [], long: [] })).toBe("");
  });
});
