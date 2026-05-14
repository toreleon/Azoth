import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const TMP_DB = join(mkdtempSync(join(tmpdir(), "azoth-team-")), "azoth.db");

vi.setConfig({ testTimeout: 15_000 });

// Sequenced fake SDK responses, role by role.
const ROLE_SCRIPTS: Array<{ role: string; payload: unknown }> = [];

function pushResponse(role: string, payload: unknown) {
  ROLE_SCRIPTS.push({ role, payload });
}

// Mock the SDK before any imports of team modules.
vi.mock("@anthropic-ai/claude-agent-sdk", async () => {
  return {
    tool: (name: string, _desc: string, _schema: unknown, handler: unknown) => ({
      name,
      handler,
      __isTool: true,
    }),
    createSdkMcpServer: (cfg: { name: string; tools: unknown[] }) => ({
      __mcp: cfg.name,
      tools: cfg.tools,
    }),
    query: ({ prompt, options }: { prompt: string; options: { systemPrompt?: string; allowedTools?: string[] } }) => {
      const next = ROLE_SCRIPTS.shift();
      if (!next) {
        throw new Error("no scripted response left for query()");
      }
      observedRoleOrder.push({ role: next.role, allowedTools: options.allowedTools ?? [], prompt });
      const text = JSON.stringify(next.payload);
      const messages = [
        {
          type: "stream_event",
          event: { type: "content_block_start", content_block: { type: "text" } },
        },
        {
          type: "stream_event",
          event: { type: "content_block_delta", delta: { type: "text_delta", text } },
        },
        {
          type: "stream_event",
          event: { type: "content_block_stop" },
        },
        {
          type: "result",
          session_id: `sess-${next.role}`,
          total_cost_usd: 0.001,
          usage: { input_tokens: 10, output_tokens: 20, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
        },
      ];
      async function* gen() {
        for (const m of messages) yield m;
      }
      return gen();
    },
  };
});

const observedRoleOrder: Array<{ role: string; allowedTools: string[]; prompt: string }> = [];

beforeEach(() => {
  process.env.AZOTH_DB = TMP_DB;
  process.env.AZOTH_CONFIG = join(__dirname, "fixtures", "config.team.yaml");
  ROLE_SCRIPTS.length = 0;
  observedRoleOrder.length = 0;
});

afterEach(() => {
  vi.resetModules();
});

describe("runTeamAnalysis", () => {
  it("renders Vietnamese instructions for user-facing analyst and PM prompts", async () => {
    const viConfig = join(mkdtempSync(join(tmpdir(), "azoth-team-vi-")), "config.yaml");
    writeFileSync(
      viConfig,
      [
        "autonomy: advisory",
        "model: claude-sonnet-4-6",
        "team:",
        "  quick_model: claude-haiku-4-6",
        "  deep_model: claude-sonnet-4-6",
        "  output_language: vi",
        "broker: paper",
        "risk:",
        "  max_position_pct: 0.15",
        "  max_daily_loss_pct: 0.03",
        "  max_order_notional_vnd: 50000000",
        "  ticker_whitelist: []",
        "  allow_margin: false",
        "",
      ].join("\n"),
    );
    process.env.AZOTH_CONFIG = viConfig;
    const { resetConfigCacheForTests } = await import("../src/config/loader.js");
    resetConfigCacheForTests();
    const { technicalPrompt, bullPrompt, portfolioPrompt } = await import("../src/agent/team/prompts.js");

    const analyst = technicalPrompt("VCB", "2025-05-02");
    expect(analyst).toContain("Write the user-facing summary, rationale, and narrative fields in Vietnamese");

    const debate = bullPrompt("VCB", "2025-05-02", 1, [], []);
    expect(debate).not.toContain("Vietnamese");

    const pm = portfolioPrompt(
      "VCB",
      "2025-05-02",
      [],
      [],
      { rating: "Hold", sizingPct: 0, rationale: "neutral" },
      { approved: true, adjustedSizingPct: 0, concerns: [], notes: "" },
    );
    expect(pm).toContain("Write the user-facing summary, rationale, and narrative fields in Vietnamese");
  });

  it("runs analysts → debate → trader → risk → portfolio in order and records team outputs", async () => {
    pushResponse("technical", { summary: "uptrend with RSI 62", score: 0.4, detail: { rsi: 62 } });
    pushResponse("fundamentals", { summary: "P/E 12, ROE 18", score: 0.3, detail: { pe: 12 } });
    pushResponse("news", { summary: "no negative catalysts", score: 0.1, detail: {} });
    pushResponse("sentiment", { summary: "foreign buying steady", score: 0.2, detail: {} });
    pushResponse("bull", { thesis: "buy on momentum", keyPoints: ["RSI", "earnings"] });
    pushResponse("bear", { thesis: "wait for pullback", keyPoints: ["macro"] });
    pushResponse("bull", { thesis: "still buy", keyPoints: ["entry low"] });
    pushResponse("bear", { thesis: "still cautious", keyPoints: ["overhead"] });
    pushResponse("researchManager", {
      recommendation: "Overweight",
      rationale: "Bull case is stronger but entry discipline matters.",
      strategic_actions: "Build gradually around the proposed band and cap exposure.",
    });
    pushResponse("trader", {
      rating: "Buy",
      sizingPct: 0.05,
      entryBand: { low: 28, high: 30 },
      exitPlan: "stop 27, target 33",
      rationale: "consensus bullish",
    });
    pushResponse("risk", {
      approved: true,
      adjustedSizingPct: 0.04,
      concerns: ["concentration"],
      notes: "trim 1pp",
    });
    pushResponse("portfolio", {
      rating: "Overweight",
      sizingPct: 0.04,
      exitPlan: "stop 27, target 33",
      rationale:
        "Technical (+0.40), fundamentals (+0.30), news (+0.10), sentiment (+0.20). Bull case prevails after debate. Risk approves at 4%.",
    });

    const { runTeamAnalysis } = await import("../src/agent/team/index.js");
    const { getDb } = await import("../src/storage/db.js");

    const events: Array<{ type: string; role?: string; round?: number }> = [];
    const { state, decision } = await runTeamAnalysis(
      { ticker: "FPT", asOfDateIso: "2025-05-02" },
      {
        emit: (ev) => events.push({ type: ev.type, ...("role" in ev ? { role: ev.role } : {}), ...("round" in ev ? { round: ev.round } : {}) }),
      },
    );

    // Role start ordering: 4 analysts (any order, parallel), then bull/bear x2, trader, risk, portfolio.
    const roleStarts = events.filter((e) => e.type === "role_start").map((e) => `${e.role}#${e.round ?? ""}`);
    expect(new Set(roleStarts.slice(0, 4))).toEqual(
      new Set(["technical#", "fundamentals#", "news#", "sentiment#"]),
    );
    expect(roleStarts.slice(4)).toEqual([
      "bull#1",
      "bear#1",
      "bull#2",
      "bear#2",
      "researchManager#",
      "trader#",
      "risk#",
      "portfolio#",
    ]);

    // Final decision matches portfolio output.
    expect(decision.rating).toBe("Overweight");
    expect(decision.sizingPct).toBeCloseTo(0.04, 5);
    expect(state.analysts).toHaveLength(4);
    expect(state.research).toHaveLength(4);
    expect(state.researchPlan?.recommendation).toBe("Overweight");

    const db = getDb();
    const runs = db
      .prepare("SELECT ticker, final_action, final_rating FROM team_runs WHERE id = ?")
      .all(state.runId) as Array<{ ticker: string; final_action: string; final_rating: string }>;
    expect(runs).toHaveLength(1);
    expect(runs[0]!.ticker).toBe("FPT");
    expect(runs[0]!.final_action).toBe("BUY");
    expect(runs[0]!.final_rating).toBe("Overweight");

    const roleRows = db
      .prepare("SELECT role FROM team_role_outputs WHERE run_id = ?")
      .all(state.runId) as Array<{ role: string }>;
    expect(roleRows.length).toBe(4 + 2 * 2 + 4); // analysts + debate + manager/trader/risk/portfolio
  });

  it("passes the Research Manager plan, not the raw debate transcript, to the trader", async () => {
    pushResponse("technical", { summary: "uptrend", score: 0.2, detail: {} });
    pushResponse("fundamentals", { summary: "quality", score: 0.2, detail: {} });
    pushResponse("news", { summary: "quiet", score: 0, detail: {} });
    pushResponse("sentiment", { summary: "stable", score: 0.1, detail: {} });
    pushResponse("bull", { thesis: "raw bull debate marker", keyPoints: ["growth"] });
    pushResponse("bear", { thesis: "raw bear debate marker", keyPoints: ["valuation"] });
    pushResponse("researchManager", {
      recommendation: "Hold",
      rationale: "plan rationale marker",
      strategic_actions: "plan action marker",
    });
    pushResponse("trader", { rating: "Hold", sizingPct: 0, rationale: "follow plan" });
    pushResponse("risk", { approved: true, adjustedSizingPct: 0, concerns: [], notes: "" });
    pushResponse("portfolio", {
      rating: "Hold",
      sizingPct: 0,
      rationale: "All four dimensions neutral; research manager plan says hold.",
    });

    const { runTeamAnalysis } = await import("../src/agent/team/index.js");
    await runTeamAnalysis({ ticker: "VCB", asOfDateIso: "2025-05-02", debateRounds: 1 });

    const trader = observedRoleOrder.find((r) => r.role === "trader");
    expect(trader?.prompt).toContain("Research Manager plan:");
    expect(trader?.prompt).toContain("Recommendation: Hold");
    expect(trader?.prompt).toContain("plan rationale marker");
    expect(trader?.prompt).toContain("plan action marker");
    expect(trader?.prompt).not.toContain("raw bull debate marker");
    expect(trader?.prompt).not.toContain("raw bear debate marker");
  });

  it("scopes allowed tools per role (analysts cannot place orders, researchers have none)", async () => {
    pushResponse("technical", { summary: "x", score: 0, detail: {} });
    pushResponse("fundamentals", { summary: "x", score: 0, detail: {} });
    pushResponse("news", { summary: "x", score: 0, detail: {} });
    pushResponse("sentiment", { summary: "x", score: 0, detail: {} });
    pushResponse("bull", { thesis: "y", keyPoints: [] });
    pushResponse("bear", { thesis: "y", keyPoints: [] });
    pushResponse("researchManager", {
      recommendation: "Hold",
      rationale: "balanced",
      strategic_actions: "wait",
    });
    pushResponse("trader", { rating: "Hold", sizingPct: 0, rationale: "neutral consensus" });
    pushResponse("risk", { approved: true, adjustedSizingPct: 0, concerns: [], notes: "" });
    pushResponse("portfolio", {
      rating: "Hold",
      sizingPct: 0,
      rationale: "All four dimensions neutral; bull/bear inconclusive. Hold.",
    });

    const { runTeamAnalysis } = await import("../src/agent/team/index.js");
    await runTeamAnalysis({ ticker: "VCB", asOfDateIso: "2025-05-02", debateRounds: 1 });

    // Find the technical role's allowed-tool set.
    const technical = observedRoleOrder.find((r) => r.role === "technical");
    expect(technical).toBeDefined();
    expect(technical!.allowedTools.some((t) => t.includes("place_order"))).toBe(false);
    expect(technical!.allowedTools.some((t) => t.includes("technical_indicators"))).toBe(true);
    expect(technical!.allowedTools).toContain("WebSearch");

    const bull = observedRoleOrder.find((r) => r.role === "bull");
    expect(bull!.allowedTools).toEqual(["WebSearch"]);
    const researchManager = observedRoleOrder.find((r) => r.role === "researchManager");
    expect(researchManager!.allowedTools).toEqual(["WebSearch"]);
  });

  it("downgrades bullish directional ratings to HOLD when risk rejects", async () => {
    pushResponse("technical", { summary: "x", score: 0, detail: {} });
    pushResponse("fundamentals", { summary: "x", score: 0, detail: {} });
    pushResponse("news", { summary: "x", score: 0, detail: {} });
    pushResponse("sentiment", { summary: "x", score: 0, detail: {} });
    pushResponse("bull", { thesis: "y", keyPoints: [] });
    pushResponse("bear", { thesis: "y", keyPoints: [] });
    pushResponse("researchManager", {
      recommendation: "Buy",
      rationale: "bull wins",
      strategic_actions: "buy cautiously",
    });
    pushResponse("trader", { rating: "Buy", sizingPct: 0.1, rationale: "bullish" });
    pushResponse("risk", { approved: false, adjustedSizingPct: 0, concerns: ["over limit"], notes: "veto" });
    pushResponse("portfolio", {
      rating: "Buy",
      sizingPct: 0.1,
      rationale:
        "Despite risk rejection the PM tries to ship — the runner must override this to HOLD.",
    });

    const { runTeamAnalysis } = await import("../src/agent/team/index.js");
    const { decision } = await runTeamAnalysis(
      { ticker: "HPG", asOfDateIso: "2025-05-02", debateRounds: 1 },
    );
    expect(decision.rating).toBe("Hold");
  });

  it("normalizes percent-like sizing outputs to NAV fractions", async () => {
    pushResponse("technical", { summary: "x", score: 0, detail: {} });
    pushResponse("fundamentals", { summary: "x", score: 0, detail: {} });
    pushResponse("news", { summary: "x", score: 0, detail: {} });
    pushResponse("sentiment", { summary: "x", score: 0, detail: {} });
    pushResponse("bull", { thesis: "y", keyPoints: [] });
    pushResponse("bear", { thesis: "y", keyPoints: [] });
    pushResponse("researchManager", {
      recommendation: "Overweight",
      rationale: "constructive",
      strategic_actions: "build gradually",
    });
    pushResponse("trader", { rating: "Overweight", sizingPct: 4, rationale: "target 4 percent NAV" });
    pushResponse("risk", { approved: true, adjustedSizingPct: 3, concerns: ["trim size"], notes: "cap at 3%" });
    pushResponse("portfolio", {
      rating: "Overweight",
      sizingPct: 3,
      rationale: "All four dimensions support a modest overweight after risk trims sizing.",
    });

    const { runTeamAnalysis } = await import("../src/agent/team/index.js");
    const { state, decision } = await runTeamAnalysis(
      { ticker: "HPG", asOfDateIso: "2025-05-02", debateRounds: 1 },
    );

    expect(state.trader?.sizingPct).toBeCloseTo(0.04, 5);
    expect(state.risk?.adjustedSizingPct).toBeCloseTo(0.03, 5);
    expect(decision.sizingPct).toBeCloseTo(0.03, 5);
  });

  it("accepts null trader entry bands for no-entry decisions", async () => {
    pushResponse("technical", { summary: "x", score: -0.2, detail: {} });
    pushResponse("fundamentals", { summary: "x", score: -0.1, detail: {} });
    pushResponse("news", { summary: "x", score: 0, detail: {} });
    pushResponse("sentiment", { summary: "x", score: 0, detail: {} });
    pushResponse("bull", { thesis: "weak hold", keyPoints: [] });
    pushResponse("bear", { thesis: "avoid", keyPoints: [] });
    pushResponse("researchManager", {
      recommendation: "Underweight",
      rationale: "bear case is stronger",
      strategic_actions: "avoid new entry",
    });
    pushResponse("trader", {
      rating: "Underweight",
      sizingPct: 0,
      entryBand: { low: null, high: null },
      rationale: "no attractive entry",
    });
    pushResponse("risk", { approved: true, adjustedSizingPct: 0, concerns: [], notes: "" });
    pushResponse("portfolio", {
      rating: "Underweight",
      sizingPct: 0,
      rationale: "All four dimensions argue against initiating a position.",
    });

    const { runTeamAnalysis } = await import("../src/agent/team/index.js");
    const { state, decision } = await runTeamAnalysis(
      { ticker: "STB", asOfDateIso: "2025-01-10", debateRounds: 1 },
    );

    expect(state.trader?.entryBand).toBeUndefined();
    expect(decision.rating).toBe("Underweight");
  });

  it("downgrades bearish directional ratings to HOLD when risk rejects", async () => {
    pushResponse("technical", { summary: "x", score: 0, detail: {} });
    pushResponse("fundamentals", { summary: "x", score: 0, detail: {} });
    pushResponse("news", { summary: "x", score: 0, detail: {} });
    pushResponse("sentiment", { summary: "x", score: 0, detail: {} });
    pushResponse("bull", { thesis: "y", keyPoints: [] });
    pushResponse("bear", { thesis: "y", keyPoints: [] });
    pushResponse("researchManager", {
      recommendation: "Underweight",
      rationale: "bear wins",
      strategic_actions: "trim cautiously",
    });
    pushResponse("trader", { rating: "Underweight", sizingPct: 0.05, rationale: "cautious" });
    pushResponse("risk", { approved: false, adjustedSizingPct: 0, concerns: ["illiquid"], notes: "veto" });
    pushResponse("portfolio", {
      rating: "Underweight",
      sizingPct: 0.05,
      rationale: "Runner must override rejected bearish directional ratings to Hold.",
    });

    const { runTeamAnalysis } = await import("../src/agent/team/index.js");
    const { decision } = await runTeamAnalysis(
      { ticker: "MSN", asOfDateIso: "2025-05-02", debateRounds: 1 },
    );
    expect(decision.rating).toBe("Hold");
  });
});
