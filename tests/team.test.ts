import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const TMP_DB = join(mkdtempSync(join(tmpdir(), "azoth-team-")), "azoth.db");

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
    query: ({ options }: { prompt: string; options: { systemPrompt?: string; allowedTools?: string[] } }) => {
      const next = ROLE_SCRIPTS.shift();
      if (!next) {
        throw new Error("no scripted response left for query()");
      }
      observedRoleOrder.push({ role: next.role, allowedTools: options.allowedTools ?? [] });
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

const observedRoleOrder: Array<{ role: string; allowedTools: string[] }> = [];

beforeEach(() => {
  process.env.VNSTOCK_DB = TMP_DB;
  process.env.VNSTOCK_CONFIG = join(__dirname, "fixtures", "config.team.yaml");
  ROLE_SCRIPTS.length = 0;
  observedRoleOrder.length = 0;
});

afterEach(() => {
  vi.resetModules();
});

describe("runTeamAnalysis", () => {
  it("runs analysts → debate → trader → risk → portfolio in order and writes a journal entry", async () => {
    pushResponse("technical", { summary: "uptrend with RSI 62", score: 0.4, detail: { rsi: 62 } });
    pushResponse("fundamentals", { summary: "P/E 12, ROE 18", score: 0.3, detail: { pe: 12 } });
    pushResponse("news", { summary: "no negative catalysts", score: 0.1, detail: {} });
    pushResponse("sentiment", { summary: "foreign buying steady", score: 0.2, detail: {} });
    pushResponse("bull", { thesis: "buy on momentum", keyPoints: ["RSI", "earnings"] });
    pushResponse("bear", { thesis: "wait for pullback", keyPoints: ["macro"] });
    pushResponse("bull", { thesis: "still buy", keyPoints: ["entry low"] });
    pushResponse("bear", { thesis: "still cautious", keyPoints: ["overhead"] });
    pushResponse("trader", {
      action: "BUY",
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
      action: "BUY",
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
      "trader#",
      "risk#",
      "portfolio#",
    ]);

    // Final decision matches portfolio output, persisted to decisions.
    expect(decision.action).toBe("BUY");
    expect(decision.sizingPct).toBeCloseTo(0.04, 5);
    expect(decision.journalId).toBeTypeOf("number");
    expect(state.analysts).toHaveLength(4);
    expect(state.research).toHaveLength(4);

    const db = getDb();
    const rows = db
      .prepare("SELECT ticker, action, source_run FROM decisions WHERE source_run = ?")
      .all(state.runId) as Array<{ ticker: string; action: string; source_run: string }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.ticker).toBe("FPT");
    expect(rows[0]!.action).toBe("BUY");

    const roleRows = db
      .prepare("SELECT role FROM team_role_outputs WHERE run_id = ?")
      .all(state.runId) as Array<{ role: string }>;
    expect(roleRows.length).toBe(4 + 2 * 2 + 3); // analysts + debate + trader/risk/portfolio
  });

  it("scopes allowed tools per role (analysts cannot place orders, researchers have none)", async () => {
    pushResponse("technical", { summary: "x", score: 0, detail: {} });
    pushResponse("fundamentals", { summary: "x", score: 0, detail: {} });
    pushResponse("news", { summary: "x", score: 0, detail: {} });
    pushResponse("sentiment", { summary: "x", score: 0, detail: {} });
    pushResponse("bull", { thesis: "y", keyPoints: [] });
    pushResponse("bear", { thesis: "y", keyPoints: [] });
    pushResponse("trader", { action: "HOLD", sizingPct: 0, rationale: "neutral consensus" });
    pushResponse("risk", { approved: true, adjustedSizingPct: 0, concerns: [], notes: "" });
    pushResponse("portfolio", {
      action: "HOLD",
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

    const bull = observedRoleOrder.find((r) => r.role === "bull");
    expect(bull!.allowedTools).toEqual([]);
  });

  it("downgrades BUY to HOLD when risk rejects", async () => {
    pushResponse("technical", { summary: "x", score: 0, detail: {} });
    pushResponse("fundamentals", { summary: "x", score: 0, detail: {} });
    pushResponse("news", { summary: "x", score: 0, detail: {} });
    pushResponse("sentiment", { summary: "x", score: 0, detail: {} });
    pushResponse("bull", { thesis: "y", keyPoints: [] });
    pushResponse("bear", { thesis: "y", keyPoints: [] });
    pushResponse("trader", { action: "BUY", sizingPct: 0.1, rationale: "bullish" });
    pushResponse("risk", { approved: false, adjustedSizingPct: 0, concerns: ["over limit"], notes: "veto" });
    pushResponse("portfolio", {
      action: "BUY",
      sizingPct: 0.1,
      rationale:
        "Despite risk rejection the PM tries to ship — the runner must override this to HOLD.",
    });

    const { runTeamAnalysis } = await import("../src/agent/team/index.js");
    const { decision } = await runTeamAnalysis(
      { ticker: "HPG", asOfDateIso: "2025-05-02", debateRounds: 1 },
    );
    expect(decision.action).toBe("HOLD");
  });
});
