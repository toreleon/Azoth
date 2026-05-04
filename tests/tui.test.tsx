import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import React from "react";
import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { render } from "ink-testing-library";
import { App } from "../src/tui/App.js";
import { sparkline } from "../src/tui/lib/sparkline.js";
import { vnColor, pctColor } from "../src/tui/lib/colors.js";
import { classifySession } from "../src/tui/lib/marketSession.js";
import { formatBigVnd, formatPct, formatPrice } from "../src/tui/lib/format.js";
import { getDb } from "../src/storage/db.js";
import { appendSessionRecord, createSession, latestSession, readSessionRecords } from "../src/runtime/sessionStore.js";
import { resetConfigCacheForTests, updateConfig } from "../src/config/loader.js";
import { resetBrokerCache } from "../src/broker/index.js";

const runnerMocks = vi.hoisted(() => ({
  runTeamAnalysis: vi.fn(),
  runTeamQuestion: vi.fn(),
  runBacktestSession: vi.fn(),
}));

vi.mock("../src/agent/team/index.js", () => ({
  runTeamAnalysis: runnerMocks.runTeamAnalysis,
  runTeamQuestion: runnerMocks.runTeamQuestion,
}));

vi.mock("../src/agent/backtestRunner.js", () => ({
  runBacktestSession: runnerMocks.runBacktestSession,
}));

beforeAll(() => {
  process.env.AZOTH_HOME = mkdtempSync(join(tmpdir(), "azoth-tui-"));
  process.env.VNSTOCK_DB = join(process.env.AZOTH_HOME, "test.db");
  process.env.ANTHROPIC_API_KEY ??= "test-key";
  getDb();
});

beforeEach(() => {
  runnerMocks.runTeamAnalysis.mockReset();
  runnerMocks.runTeamQuestion.mockReset();
  runnerMocks.runBacktestSession.mockReset();
  resetConfigCacheForTests();
  updateConfig({ autonomy: "advisory", broker: "paper" });
  resetBrokerCache();
});

function strip(s: string) {
  return s.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "");
}

async function tick(ms = 80) {
  await new Promise((r) => setTimeout(r, ms));
}

async function type(stdin: { write: (s: string) => void }, s: string) {
  stdin.write(s);
  await tick();
  stdin.write("\r");
  await tick();
}

describe("Azoth TUI", () => {
  it("boots into chat mode", async () => {
    const { lastFrame, unmount } = render(<App />);
    await tick();
    const out = strip(lastFrame() ?? "");
    expect(out).toContain("VN-stock copilot");
    expect(out).toContain("Tips for getting started");
    expect(out).toContain("advisory");
    unmount();
  });

  it("opens with a fresh chat session", async () => {
    const previous = createSession({ title: "previous" });
    appendSessionRecord(previous.id, {
      type: "user",
      timestamp: Date.now(),
      sessionId: previous.id,
      cwd: process.cwd(),
      text: "old session text should not appear",
    });

    const { lastFrame, unmount } = render(<App />);
    await tick();
    const out = strip(lastFrame() ?? "");
    expect(out).not.toContain("old session text should not appear");
    expect(out).toContain("Tips for getting started");
    unmount();
  });

  it("does not pin a dashboard grid above chat", async () => {
    const { lastFrame, unmount } = render(<App />);
    await tick();
    const out = strip(lastFrame() ?? "");
    expect(out).not.toMatch(/INDICES|TOP GAINERS|TOP LOSERS|FOREIGN FLOW/);
    unmount();
  });

  it("/journal prints rows inline in chat", async () => {
    const { lastFrame, stdin, unmount } = render(<App />);
    await tick();
    await type(stdin, "/journal decisions 5");
    const out = strip(lastFrame() ?? "");
    expect(out).toContain("DECISIONS");
    unmount();
  });

  it("/backtest help prints usage in chat", async () => {
    const { lastFrame, stdin, unmount } = render(<App />);
    await tick();
    await type(stdin, "/backtest help");
    const out = strip(lastFrame() ?? "");
    expect(out).toContain("/backtest");
    expect(out).toContain("[YYYY-MM-DD start]");
    unmount();
  });

  it("/autonomy persists mode and updates the UI", async () => {
    const { lastFrame, stdin, unmount } = render(<App />);
    await tick();
    await type(stdin, "/autonomy confirm");
    const out = strip(lastFrame() ?? "");
    expect(out).toContain("Autonomy set to confirm");
    expect(out).toContain("confirm");
    unmount();
  });

  it("/health prints local runtime checks", async () => {
    const { lastFrame, stdin, unmount } = render(<App />);
    await tick();
    await type(stdin, "/health");
    await tick();
    const out = strip(lastFrame() ?? "");
    expect(out).toContain("Health:");
    expect(out).toContain("api_key:");
    expect(out).toContain("database:");
    expect(out).toContain("data_provider:");
    unmount();
  });

  it("/team <message> streams the team chat flow as a plain response", async () => {
    runnerMocks.runTeamQuestion.mockImplementationOnce(async (question: string, opts: any) => {
      opts.emit?.({ type: "role_start", role: "bull", round: 1 });
      opts.emit?.({
        type: "role_tool",
        role: "bull",
        tool: "WebSearch",
        input: JSON.stringify({ query: "Vietnam banks credit growth May 2026" }),
        toolUseId: "tool-1",
      });
      opts.emit?.({
        type: "role_tool_result",
        role: "bull",
        tool: "WebSearch",
        toolUseId: "tool-1",
        content: "Search result: credit growth target remains supportive for banks.",
      });
      opts.emit?.({
        type: "role_end",
        role: "bull",
        round: 1,
        output: { thesis: "Constructive bank exposure case", keyPoints: ["credit growth"] },
      });
      opts.emit?.({ type: "role_start", role: "risk" });
      opts.emit?.({
        type: "role_end",
        role: "risk",
        output: { approved: true, adjustedSizingPct: 0.03, concerns: [], notes: "" },
      });
      return {
        state: {
          runId: "team-run-12345678",
          question,
          asOfDateIso: "2026-05-04",
          research: [],
        },
        decision: {
          question,
          asOfDateIso: "2026-05-04",
          teamRunId: "team-run-12345678",
          answer: "Add selectively; keep sizing modest until confirmation.",
          recommendation: "Selective Overweight",
          keyReasons: ["Banks benefit from credit growth"],
          risks: ["Asset quality can lag"],
          nextActions: ["Compare VCB and TCB"],
        },
      };
    });

    const { lastFrame, stdin, unmount } = render(<App />);
    await tick();
    await type(stdin, "/team Should we add more bank exposure this week?");
    await tick();

    const out = strip(lastFrame() ?? "");
    expect(runnerMocks.runTeamQuestion).toHaveBeenCalledWith(
      "Should we add more bank exposure this week?",
      expect.objectContaining({ emit: expect.any(Function) }),
    );
    expect(out).toContain("/team Should we add more bank exposure this week?");
    expect(out).toContain("bull#1");
    expect(out).toContain("WebSearch: Vietnam banks credit growth May 2026");
    expect(out).toContain("WebSearch result received: Search result: credit growth target");
    expect(out).toContain("risk");
    expect(out).not.toContain("TEAM QUESTION");
    expect(out).toContain("Recommendation:");
    expect(out).toContain("Selective Overweight");
    expect(out).toContain("Add selectively");
    const session = latestSession();
    const records = session ? readSessionRecords(session.id) : [];
    expect(records).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "user", text: "/team Should we add more bank exposure this week?" }),
        expect.objectContaining({ type: "assistant", text: expect.stringContaining("Recommendation: Selective Overweight") }),
      ]),
    );
    unmount();
  });

  it("/analyze streams the team analysis as a plain response", async () => {
    runnerMocks.runTeamAnalysis.mockImplementationOnce(async (_input: any, opts: any) => {
      opts.emit?.({ type: "role_start", role: "technical" });
      opts.emit?.({
        type: "role_tool",
        role: "technical",
        tool: "WebSearch",
        input: JSON.stringify({ query: "FPT Vietnam stock latest earnings" }),
        toolUseId: "tool-2",
      });
      opts.emit?.({
        type: "role_tool_result",
        role: "technical",
        tool: "WebSearch",
        toolUseId: "tool-2",
        content: "Search result: FPT earnings were resilient.",
      });
      opts.emit?.({
        type: "role_end",
        role: "technical",
        output: { summary: "trend improving", score: 0.35, detail: {} },
      });
      return {
        state: {
          runId: "team-run-87654321",
          ticker: "FPT",
          asOfDateIso: "2026-05-04",
          analysts: [{ role: "technical", summary: "trend improving", score: 0.35, detail: {} }],
          research: [],
          risk: { approved: true, adjustedSizingPct: 0.04, concerns: [], notes: "" },
        },
        decision: {
          ticker: "FPT",
          rating: "Overweight",
          sizingPct: 0.04,
          rationale: "Momentum and fundamentals justify a modest overweight.",
          exitPlan: "Cut if trend breaks.",
          teamRunId: "team-run-87654321",
          journalId: 12,
        },
      };
    });

    const { lastFrame, stdin, unmount } = render(<App />);
    await tick();
    await type(stdin, "/analyze FPT --rounds 1");
    await tick();

    const out = strip(lastFrame() ?? "");
    expect(runnerMocks.runTeamAnalysis).toHaveBeenCalledWith(
      { ticker: "FPT", debateRounds: 1, asOfDateIso: undefined },
      expect.objectContaining({ emit: expect.any(Function) }),
    );
    expect(out).toContain("/analyze FPT");
    expect(out).toContain("technical");
    expect(out).toContain("WebSearch: FPT Vietnam stock latest earnings");
    expect(out).toContain("WebSearch result received: Search result: FPT earnings");
    expect(out).not.toContain("TEAM FPT");
    expect(out).toContain("Final: Overweight 4.0% FPT");
    expect(out).toContain("Momentum and fundamentals");
    unmount();
  });

  it("/backtest streams the backtest flow as a plain response", async () => {
    runnerMocks.runBacktestSession.mockImplementationOnce(async (_opts: any, cb: any) => {
      cb.onStart?.({
        runId: "bt-run-12345678",
        profile: { id: "vn-equity", version: 0 },
        brokerName: "paper-bt-test",
        fridays: [1, 2],
        universe: ["HPG", "VCB", "FPT"],
      });
      cb.onTurnStart?.({ asOf: 1, dateIso: "2025-01-03" });
      cb.onTeamEvent?.({ type: "role_start", role: "technical" }, { asOf: 1, dateIso: "2025-01-03", ticker: "HPG" });
      cb.onTeamEvent?.({
        type: "role_tool",
        role: "technical",
        tool: "WebSearch",
        input: JSON.stringify({ query: "HPG steel demand Vietnam 2025" }),
        toolUseId: "tool-3",
      }, { asOf: 1, dateIso: "2025-01-03", ticker: "HPG" });
      cb.onTeamEvent?.({
        type: "role_tool_result",
        role: "technical",
        tool: "WebSearch",
        toolUseId: "tool-3",
        content: "Search result: steel demand stayed mixed.",
      }, { asOf: 1, dateIso: "2025-01-03", ticker: "HPG" });
      cb.onTeamEvent?.({
        type: "role_end",
        role: "technical",
        output: { summary: "momentum improving", score: 0.4, detail: {} },
      }, { asOf: 1, dateIso: "2025-01-03", ticker: "HPG" });
      cb.onTeamEvent?.({
        type: "role_end",
        role: "portfolio",
        output: { rating: "Overweight", sizingPct: 0.05, rationale: "team decision" },
      }, { asOf: 1, dateIso: "2025-01-03", ticker: "HPG" });
      cb.onOrder?.({
        id: "order-1",
        broker: "paper-bt-test",
        ticker: "HPG",
        side: "BUY",
        type: "MARKET",
        quantity: 1000,
        limitPrice: null,
        status: "FILLED",
        rejectReason: null,
        createdAt: 1,
        filledAt: 1,
        filledPrice: 28.5,
        filledQty: 1000,
        notes: "team Overweight",
      }, {
        asOf: 1,
        dateIso: "2025-01-03",
        decision: {
          ticker: "HPG",
          rating: "Overweight",
          sizingPct: 0.05,
          rationale: "team decision",
          teamRunId: "team-run",
        },
      });
      cb.onEquity?.({
        asOf: 1,
        dateIso: "2025-01-03",
        cashVnd: 900_000_000,
        mtmVnd: 1_010_000_000,
        benchmarkMtmVnd: 1_005_000_000,
      });
      return {
        runId: "bt-run-12345678",
        profileRef: "vn-equity@v0",
        start: "2025-01-03",
        end: "2025-01-10",
        initialCash: 1_000_000_000,
        finalMtm: 1_010_000_000,
        finalBench: 1_005_000_000,
        totalReturn: 1,
        benchReturn: 0.5,
        maxDD: 0,
        totalCost: 0.0025,
        totalInTokens: 10,
        totalOutTokens: 20,
        weeks: 1,
        trades: 2,
        rejectedTrades: 0,
        reportPath: null,
      };
    });

    const { lastFrame, stdin, unmount } = render(<App />);
    await tick();
    await type(stdin, "/backtest 2025-01-03 2025-01-10 1000000000");
    await tick();

    expect(runnerMocks.runBacktestSession).toHaveBeenCalledWith(
      {
        profileRef: "vn-equity@v0",
        start: "2025-01-03",
        end: "2025-01-10",
        initialCash: 1_000_000_000,
        maxCandidates: undefined,
      },
      expect.objectContaining({
        signal: expect.any(AbortSignal),
        onStart: expect.any(Function),
        onTurnStart: expect.any(Function),
        onTeamEvent: expect.any(Function),
        onOrder: expect.any(Function),
        onEquity: expect.any(Function),
      }),
    );
    const out = strip(lastFrame() ?? "");
    expect(out).toContain("/backtest 2025-01-03");
    expect(out).toContain("Ready");
    expect(out).toContain("3 tickers");
    expect(out).toContain("team analyzes 3/week");
    expect(out).toContain("team analysis");
    expect(out).toContain("[HPG]");
    expect(out).toContain("technical WebSearch: HPG steel demand Vietnam 2025");
    expect(out).toContain("technical WebSearch result received: Search result: steel demand");
    expect(out).toContain("technical");
    expect(out).toContain("portfolio");
    expect(out).toContain("order FILLED");
    expect(out).not.toContain("BACKTEST  2025");
    expect(out).toContain("Backtest 2025");
    expect(out).toContain("trades");
    expect(out).toContain("+1.00%");
    unmount();
  });

  it("typing / shows the slash command suggest", async () => {
    const { lastFrame, stdin, unmount } = render(<App />);
    await tick();
    stdin.write("/");
    await tick();
    const out = strip(lastFrame() ?? "");
    expect(out).toContain("/team");
    expect(out).toContain("/analyze");
    expect(out).toContain("/backtest");
    expect(out).toContain("/journal");
    expect(out).not.toContain("/chart");
    expect(out).not.toContain("/alerts");
    expect(out).toContain("Tab to complete");
    unmount();
  });

  it("typing /tea filters to /team", async () => {
    const { lastFrame, stdin, unmount } = render(<App />);
    await tick();
    stdin.write("/tea");
    await tick();
    const out = strip(lastFrame() ?? "");
    expect(out).toContain("/team");
    expect(out).toContain("Run multi-agent debate");
    unmount();
  });

  it("/journal renders as a bordered card", async () => {
    const { lastFrame, stdin, unmount } = render(<App />);
    await tick();
    await type(stdin, "/journal decisions 5");
    const out = strip(lastFrame() ?? "");
    expect(out).toContain("DECISIONS");
    // Panel uses round borders; assert at least one border glyph appears with the card.
    expect(out).toMatch(/[╭╮╰╯─│]/);
    unmount();
  });

  it("/help prints local slash command help", async () => {
    const { lastFrame, stdin, unmount } = render(<App />);
    await tick();
    await type(stdin, "/help");
    const out = strip(lastFrame() ?? "");
    expect(out).toContain("/team <message>");
    expect(out).toContain("/analyze <ticker>");
    expect(out).toContain("/journal [decisions|orders|fills|alerts]");
    unmount();
  });

  it("bottom status shows team, autonomy, hint", async () => {
    const { lastFrame, unmount } = render(<App />);
    await tick();
    const out = strip(lastFrame() ?? "");
    expect(out).toContain("team");
    expect(out).toContain("advisory");
    expect(out).toMatch(/Ctrl\+A|Ctrl\+C|\/backtest/);
    unmount();
  });
});

describe("TUI lib helpers", () => {
  it("vnColor follows VN convention", () => {
    expect(vnColor(100, 100, 110, 90)).toBe("yellow");
    expect(vnColor(110, 100, 110, 90)).toBe("magenta");
    expect(vnColor(90, 100, 110, 90)).toBe("cyan");
    expect(vnColor(105, 100, 110, 90)).toBe("green");
    expect(vnColor(95, 100, 110, 90)).toBe("red");
  });

  it("pctColor", () => {
    expect(pctColor(0)).toBe("yellow");
    expect(pctColor(1)).toBe("green");
    expect(pctColor(-1)).toBe("red");
  });

  it("sparkline", () => {
    expect(sparkline([1, 2, 3, 4, 5])).toHaveLength(5);
    expect(sparkline([])).toBe("");
    expect(sparkline([5, 5, 5])).toMatch(/^.{3}$/);
  });

  it("formatters", () => {
    expect(formatBigVnd(1.5e9)).toBe("1.50B");
    expect(formatBigVnd(2.3e6)).toBe("2.3M");
    expect(formatPct(3.14)).toBe("+3.14%");
    expect(formatPct(-1.2)).toBe("-1.20%");
    expect(formatPrice(28.5)).toBe("28.50");
    expect(formatPrice(null)).toBe("—");
  });

  it("market session classifier", () => {
    expect(classifySession(Date.UTC(2026, 4, 4, 3, 0, 0) / 1000).label).toBe("morning");
    expect(classifySession(Date.UTC(2026, 4, 4, 5, 0, 0) / 1000).label).toBe("lunch");
    expect(classifySession(Date.UTC(2026, 4, 4, 7, 0, 0) / 1000).label).toBe("afternoon");
    expect(classifySession(Date.UTC(2026, 4, 2, 7, 0, 0) / 1000).label).toBe("weekend");
  });
});
