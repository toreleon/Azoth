import { describe, expect, it } from "vitest";
import {
  type AgentProfile,
  applyProfileDiff,
  parseProfileRef,
  profileRef,
  renderProfilePrompt,
  validateProfile,
} from "../src/agent/profile.js";

const baseProfile: AgentProfile = {
  id: "vn-equity",
  version: 0,
  personaText: "Balanced VN swing trader.",
  rules: ["rule one", "rule two"],
  params: {
    maxPositionPct: 0.15,
    stopLossPct: 0.08,
    cashFloorPct: 0.1,
    maxNames: 5,
    minHoldingWeeks: 1,
    maxDrawdownFloor: 0.15,
    preferredUniverse: "default",
    discoveryCriterion: "momentum",
  },
  regimePlaybook: { trend_up: "lean in" },
  notes: ["T+2.5"],
  createdAt: 1714608000,
};

describe("profile ref parsing", () => {
  it("round-trips id@vN", () => {
    expect(profileRef(baseProfile)).toBe("vn-equity@v0");
    expect(parseProfileRef("vn-equity@v3")).toEqual({ id: "vn-equity", version: 3 });
  });

  it("rejects malformed refs", () => {
    expect(() => parseProfileRef("vn-equity")).toThrow(/bad profile ref/);
    expect(() => parseProfileRef("vn-equity@3")).toThrow(/bad profile ref/);
  });
});

describe("renderProfilePrompt", () => {
  it("is deterministic and surfaces hard params", () => {
    const a = renderProfilePrompt(baseProfile);
    const b = renderProfilePrompt(baseProfile);
    expect(a).toBe(b);
    expect(a).toContain("Strategy profile: vn-equity@v0");
    expect(a).toContain("Max position size: 15%");
    expect(a).toContain("Stop loss: cut a position down 8%");
    expect(a).toContain("Drawdown floor: 15%");
    expect(a).toContain("[trend_up]");
    expect(a).toContain("rule one");
  });
});

describe("applyProfileDiff", () => {
  it("bumps version and tracks parent", () => {
    const next = applyProfileDiff(baseProfile, { addRules: ["rule three"] });
    expect(next.version).toBe(1);
    expect(next.parentVersion).toBe(0);
    expect(next.rules).toEqual(["rule one", "rule two", "rule three"]);
  });

  it("removes rules by index then appends new ones", () => {
    const next = applyProfileDiff(baseProfile, {
      removeRuleIndices: [0],
      addRules: ["fresh rule"],
    });
    expect(next.rules).toEqual(["rule two", "fresh rule"]);
  });

  it("clamps param deltas to safe bounds", () => {
    const next = applyProfileDiff(baseProfile, {
      paramDeltas: { maxPositionPct: 5, stopLossPct: -1, maxNames: 3 },
    });
    expect(next.params.maxPositionPct).toBeLessThanOrEqual(0.5);
    expect(next.params.stopLossPct).toBeGreaterThanOrEqual(0.03);
    expect(next.params.maxNames).toBe(8);
  });

  it("ignores unknown param keys", () => {
    const next = applyProfileDiff(baseProfile, { paramDeltas: { bogus: 99 } });
    expect(next.params).toEqual(baseProfile.params);
  });

  it("caps cumulative rule count at 20", () => {
    const fat = { ...baseProfile, rules: Array.from({ length: 19 }, (_, i) => `r${i}`) };
    const next = applyProfileDiff(fat, { addRules: ["a", "b"] });
    expect(next.rules).toHaveLength(20);
  });

  it("rewrites persona text when provided", () => {
    const next = applyProfileDiff(baseProfile, { personaTextRewrite: "More defensive." });
    expect(next.personaText).toBe("More defensive.");
  });

  it("upserts regime playbook entries", () => {
    const next = applyProfileDiff(baseProfile, {
      regimeUpsert: { chop: "tighten stops", trend_up: "lean in harder" },
    });
    expect(next.regimePlaybook.chop).toBe("tighten stops");
    expect(next.regimePlaybook.trend_up).toBe("lean in harder");
  });

  it("output is itself a valid profile", () => {
    const next = applyProfileDiff(baseProfile, { addNotes: ["new lesson"] });
    expect(() => validateProfile(next)).not.toThrow();
  });
});
