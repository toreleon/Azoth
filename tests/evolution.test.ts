import { describe, expect, it } from "vitest";
import {
  computeFitness,
  computeMetrics,
  DEFAULT_FITNESS,
  profileComplexity,
  randomMutate,
  selectSurvivors,
  type ScoredMember,
} from "../src/agent/evolution.js";
import type { AgentProfile } from "../src/agent/profile.js";

const baseProfile: AgentProfile = {
  id: "vn-equity",
  version: 0,
  personaText: "Balanced VN swing trader.",
  rules: ["a", "b", "c"],
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
  regimePlaybook: {},
  notes: ["lesson 1", "lesson 2"],
  createdAt: 0,
};

describe("computeMetrics", () => {
  it("returns zeros on empty equity", () => {
    const m = computeMetrics(1_000_000_000, [], 0);
    expect(m.weeks).toBe(0);
    expect(m.sharpe).toBe(0);
    expect(m.maxDd).toBe(0);
    expect(m.totalReturn).toBe(0);
  });

  it("computes positive Sharpe and zero drawdown for monotonic up curve", () => {
    const equity = [1, 2, 3, 4, 5].map((x, i) => ({
      mtmVnd: 1_000_000_000 * (1 + 0.01 * (i + 1)),
      benchmarkMtmVnd: 1_000_000_000,
    }));
    const m = computeMetrics(1_000_000_000, equity, 0);
    expect(m.totalReturn).toBeCloseTo(0.05, 4);
    expect(m.sharpe).toBeGreaterThan(0);
    expect(m.maxDd).toBeCloseTo(0, 6);
  });

  it("captures drawdown on a peak-then-trough curve", () => {
    const equity = [1.10, 1.20, 1.05, 1.00, 1.08].map((x) => ({
      mtmVnd: 1_000_000_000 * x,
      benchmarkMtmVnd: 1_000_000_000,
    }));
    const m = computeMetrics(1_000_000_000, equity, 0);
    // peak 1.20 → trough 1.00 → 16.67% dd
    expect(m.maxDd).toBeCloseTo(1 / 6, 3);
  });

  it("turnover = filled notional / initial cash", () => {
    const equity = [{ mtmVnd: 1_000_000_000, benchmarkMtmVnd: 1_000_000_000 }];
    const m = computeMetrics(1_000_000_000, equity, 500_000_000);
    expect(m.turnover).toBeCloseTo(0.5, 6);
  });
});

describe("computeFitness", () => {
  it("matches a hand-computed example", () => {
    const m = {
      weeks: 26,
      totalReturn: 0.10,
      benchReturn: 0.05,
      alpha: 0.05,
      sharpe: 1.5,
      maxDd: 0.20,
      turnover: 2.0,
    };
    const fitness = computeFitness(baseProfile, m, DEFAULT_FITNESS);
    // sharpe 1.5
    //   − 2.0 × max(0, 0.20 − 0.15) = 0.10
    //   − 0.05 × 2.0 = 0.10
    //   − 0.001 × (3+2) = 0.005
    expect(fitness).toBeCloseTo(1.5 - 0.10 - 0.10 - 0.005, 6);
  });

  it("does not penalize drawdown below the floor", () => {
    const m = { weeks: 10, totalReturn: 0, benchReturn: 0, alpha: 0, sharpe: 1.0, maxDd: 0.10, turnover: 0 };
    const fitness = computeFitness(baseProfile, m);
    expect(fitness).toBeCloseTo(1.0 - 0.001 * profileComplexity(baseProfile), 6);
  });
});

describe("randomMutate", () => {
  function deterministicRng(seed: number) {
    let s = seed;
    return () => {
      s = (s * 9301 + 49297) % 233280;
      return s / 233280;
    };
  }

  it("produces a valid child with bumped version and parent lineage", () => {
    const child = randomMutate(baseProfile, deterministicRng(42));
    expect(child.version).toBe(1);
    expect(child.parentVersion).toBe(0);
    expect(child.id).toBe(baseProfile.id);
  });

  it("only touches numeric param fields", () => {
    const child = randomMutate(baseProfile, deterministicRng(1));
    expect(child.params.preferredUniverse).toBe(baseProfile.params.preferredUniverse);
    expect(child.params.discoveryCriterion).toBe(baseProfile.params.discoveryCriterion);
    expect(child.rules).toEqual(baseProfile.rules);
  });

  it("respects param bounds even with extreme rng", () => {
    let last = baseProfile;
    for (let i = 0; i < 50; i++) last = randomMutate(last, deterministicRng(i));
    expect(last.params.maxPositionPct).toBeGreaterThanOrEqual(0.05);
    expect(last.params.maxPositionPct).toBeLessThanOrEqual(0.5);
    expect(last.params.maxDrawdownFloor).toBeGreaterThanOrEqual(0.05);
    expect(last.params.maxDrawdownFloor).toBeLessThanOrEqual(0.4);
  });
});

describe("selectSurvivors", () => {
  function mkMember(version: number, train: number, val: number): ScoredMember {
    return { profile: { ...baseProfile, version }, trainFitness: train, valFitness: val };
  }

  it("ranks by val fitness penalized by train-val gap", () => {
    const members = [
      mkMember(1, 1.0, 0.9),  // small gap, val=0.9
      mkMember(2, 2.0, 0.5),  // big gap, val=0.5 → penalized 0.5 - 0.5*1.5 = -0.25
      mkMember(3, 0.6, 0.6),  // stable, val=0.6
    ];
    const top = selectSurvivors(members, 2);
    expect(top.map((m) => m.profile.version)).toEqual([1, 3]);
  });

  it("drops curve-fit profiles that exceed stabilityGap", () => {
    const members = [
      mkMember(1, 5.0, 0.1),  // train≫val: dropped from stable pool
      mkMember(2, 0.4, 0.4),
      mkMember(3, 0.3, 0.3),
    ];
    const top = selectSurvivors(members, 2, { stabilityGap: 1.0 });
    expect(top.map((m) => m.profile.version).sort()).toEqual([2, 3]);
  });

  it("backfills from unstable tail rather than returning fewer than k", () => {
    const members = [mkMember(1, 5.0, 0.1), mkMember(2, 5.0, 0.0)];
    const top = selectSurvivors(members, 2, { stabilityGap: 1.0 });
    expect(top).toHaveLength(2);
  });
});
