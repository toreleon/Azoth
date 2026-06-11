import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import React from "react";
import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { render } from "ink-testing-library";
import { App, previousWeekRange } from "../src/tui/App.js";
import { LlmSetup } from "../src/tui/components/LlmSetup.js";
import { sparkline } from "../src/tui/lib/sparkline.js";
import { vnColor, pctColor } from "../src/tui/lib/colors.js";
import { classifySession } from "../src/tui/lib/marketSession.js";
import { formatBigVnd, formatPct, formatPrice } from "../src/tui/lib/format.js";
import { sessionColor } from "../src/tui/lib/theme.js";
import { getDb } from "../src/storage/db.js";
import { appendSessionRecord, createSession, latestSession, readSessionRecords } from "../src/runtime/sessionStore.js";
import { loadConfig, resetConfigCacheForTests, updateConfig } from "../src/config/loader.js";
import { resetBrokerCache } from "../src/broker/index.js";
import { emitTeamToolEvent } from "../src/agent/team/toolEventBus.js";
import { requireBrokerConsent } from "../src/tools/brokerConsent.js";

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
  BACKTEST_DEFAULT_INTERVAL: "30m",
  runBacktestSession: runnerMocks.runBacktestSession,
}));

beforeAll(() => {
  process.env.AZOTH_HOME = mkdtempSync(join(tmpdir(), "azoth-tui-"));
  process.env.AZOTH_DB = join(process.env.AZOTH_HOME, "test.db");
  getDb();
});

beforeEach(() => {
  runnerMocks.runTeamAnalysis.mockReset();
  runnerMocks.runTeamQuestion.mockReset();
  runnerMocks.runBacktestSession.mockReset();
  resetConfigCacheForTests();
  updateConfig({
    autonomy: "advisory",
    broker: "paper",
    llm: { provider: "anthropic", api_key: "test-key", base_url: "" },
  });
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

async function enter(stdin: { write: (s: string) => void }) {
  stdin.write("\r");
  await tick();
}

describe("Azoth TUI", () => {
  it("boots into chat mode", async () => {
    const { lastFrame, unmount } = render(<App />);
    await tick();
    const out = strip(lastFrame() ?? "");
    expect(out).toContain("Azoth copilot");
    expect(out).toContain("Tips for getting started");
    expect(out).toContain("advisory");
    unmount();
  });

  it("collects first-time LLM setup and writes Azoth config", async () => {
    const prevHome = process.env.AZOTH_HOME;
    const prevDb = process.env.AZOTH_DB;
    const prevKey = process.env.ANTHROPIC_API_KEY;
    const prevBaseUrl = process.env.ANTHROPIC_BASE_URL;
    const setupHome = mkdtempSync(join(tmpdir(), "azoth-setup-"));
    process.env.AZOTH_HOME = setupHome;
    delete process.env.AZOTH_DB;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_BASE_URL;
    resetConfigCacheForTests();

    let unmount: (() => void) | undefined;
    try {
      const completed = vi.fn();
      const verify = vi.fn().mockResolvedValue(undefined);
      const rendered = render(<LlmSetup onComplete={completed} verify={verify} />);
      unmount = rendered.unmount;
      await tick();
      expect(strip(rendered.lastFrame() ?? "")).toContain("Azoth first-time LLM setup");
      expect(strip(rendered.lastFrame() ?? "")).toContain("Select provider");
      expect(strip(rendered.lastFrame() ?? "")).toContain("Anthropic API key");

      await enter(rendered.stdin);
      await type(rendered.stdin, "sk-test-setup");
      await type(rendered.stdin, "glm-5.1");

      const configText = readFileSync(join(setupHome, "config.yaml"), "utf8");
      expect(configText).toContain("api_key: sk-test-setup");
      expect(configText).toContain("base_url: \"\"");
      expect(verify).toHaveBeenCalledWith({
        provider: "anthropic",
        apiKey: "sk-test-setup",
        baseUrl: "",
        model: "glm-5.1",
      });
      expect(strip(rendered.lastFrame() ?? "")).toContain("LLM environment saved");

      await enter(rendered.stdin);
      expect(completed).toHaveBeenCalled();
    } finally {
      unmount?.();
      if (prevHome === undefined) delete process.env.AZOTH_HOME;
      else process.env.AZOTH_HOME = prevHome;
      if (prevDb === undefined) delete process.env.AZOTH_DB;
      else process.env.AZOTH_DB = prevDb;
      if (prevKey === undefined) delete process.env.ANTHROPIC_API_KEY;
      else process.env.ANTHROPIC_API_KEY = prevKey;
      if (prevBaseUrl === undefined) delete process.env.ANTHROPIC_BASE_URL;
      else process.env.ANTHROPIC_BASE_URL = prevBaseUrl;
      resetConfigCacheForTests();
    }
  });

  it("collects base URL for Anthropic-compatible provider setup", async () => {
    const prevHome = process.env.AZOTH_HOME;
    const prevDb = process.env.AZOTH_DB;
    const prevKey = process.env.ANTHROPIC_API_KEY;
    const prevBaseUrl = process.env.ANTHROPIC_BASE_URL;
    const setupHome = mkdtempSync(join(tmpdir(), "azoth-compatible-"));
    process.env.AZOTH_HOME = setupHome;
    delete process.env.AZOTH_DB;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_BASE_URL;
    resetConfigCacheForTests();

    let unmount: (() => void) | undefined;
    try {
      const completed = vi.fn();
      const verify = vi.fn().mockResolvedValue(undefined);
      const rendered = render(<LlmSetup onComplete={completed} verify={verify} />);
      unmount = rendered.unmount;
      await tick();

      rendered.stdin.write("2");
      await tick();
      expect(strip(rendered.lastFrame() ?? "")).toContain("Custom endpoint base URL");
      await type(rendered.stdin, "https://open.bigmodel.cn/api/anthropic");
      await type(rendered.stdin, "zai-key");
      await type(rendered.stdin, "glm-5.1");

      const configText = readFileSync(join(setupHome, "config.yaml"), "utf8");
      expect(configText).toContain("provider: compatible");
      expect(configText).toContain("api_key: zai-key");
      expect(configText).toContain("base_url: https://open.bigmodel.cn/api/anthropic");
      expect(verify).toHaveBeenCalledWith({
        provider: "compatible",
        apiKey: "zai-key",
        baseUrl: "https://open.bigmodel.cn/api/anthropic",
        model: "glm-5.1",
      });
      expect(strip(rendered.lastFrame() ?? "")).toContain("Anthropic-compatible provider");
      expect(strip(rendered.lastFrame() ?? "")).toContain("https://open.bigmodel.cn/api/anthropic");

      await enter(rendered.stdin);
      expect(completed).toHaveBeenCalled();
    } finally {
      unmount?.();
      if (prevHome === undefined) delete process.env.AZOTH_HOME;
      else process.env.AZOTH_HOME = prevHome;
      if (prevDb === undefined) delete process.env.AZOTH_DB;
      else process.env.AZOTH_DB = prevDb;
      if (prevKey === undefined) delete process.env.ANTHROPIC_API_KEY;
      else process.env.ANTHROPIC_API_KEY = prevKey;
      if (prevBaseUrl === undefined) delete process.env.ANTHROPIC_BASE_URL;
      else process.env.ANTHROPIC_BASE_URL = prevBaseUrl;
      resetConfigCacheForTests();
    }
  });

  it("does not save LLM config when verification fails", async () => {
    const prevHome = process.env.AZOTH_HOME;
    const prevDb = process.env.AZOTH_DB;
    const setupHome = mkdtempSync(join(tmpdir(), "azoth-verify-fail-"));
    process.env.AZOTH_HOME = setupHome;
    delete process.env.AZOTH_DB;
    resetConfigCacheForTests();

    let unmount: (() => void) | undefined;
    try {
      const rendered = render(
        <LlmSetup onComplete={() => {}} verify={vi.fn().mockRejectedValue(new Error("bad endpoint"))} />,
      );
      unmount = rendered.unmount;
      await tick();

      rendered.stdin.write("2");
      await tick();
      await type(rendered.stdin, "https://bad.example/api/anthropic");
      await type(rendered.stdin, "bad-key");
      await type(rendered.stdin, "glm-5.1");

      const out = strip(rendered.lastFrame() ?? "");
      expect(out).toContain("bad endpoint");
      expect(out).toContain("Model");
      expect(readFileSync(join(setupHome, "config.yaml"), "utf8")).toContain("api_key: \"\"");
    } finally {
      unmount?.();
      if (prevHome === undefined) delete process.env.AZOTH_HOME;
      else process.env.AZOTH_HOME = prevHome;
      if (prevDb === undefined) delete process.env.AZOTH_DB;
      else process.env.AZOTH_DB = prevDb;
      resetConfigCacheForTests();
    }
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

  it("/backtest help prints usage in chat", async () => {
    const { lastFrame, stdin, unmount } = render(<App />);
    await tick();
    await type(stdin, "/backtest help");
    const out = strip(lastFrame() ?? "");
    expect(out).toContain("/backtest");
    expect(out).toContain("[YYYY-MM-DD start]");
    expect(out).toContain("previous calendar week");
    unmount();
  });

  it("computes the previous calendar week for default backtests", () => {
    expect(previousWeekRange(new Date(2026, 4, 4))).toEqual({
      start: "2026-04-27",
      end: "2026-05-03",
    });
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

  it("/setup-llm reopens LLM setup after first-time setup", async () => {
    const verify = vi.fn().mockResolvedValue(undefined);
    const { lastFrame, stdin, unmount } = render(<App verifyLlm={verify} />);
    await tick();
    await type(stdin, "/setup-llm");
    expect(strip(lastFrame() ?? "")).toContain("Azoth first-time LLM setup");
    expect(strip(lastFrame() ?? "")).toContain("Select provider");

    await enter(stdin);
    await type(stdin, "sk-updated");
    await type(stdin, "glm-5.1-updated");

    const saved = strip(lastFrame() ?? "");
    expect(saved).toContain("LLM environment saved.");
    expect(saved).toContain("glm-5.1-updated");

    await enter(stdin);
    const cfg = loadConfig();
    expect(cfg.llm.provider).toBe("anthropic");
    expect(cfg.llm.api_key).toBe("sk-updated");
    expect(cfg.model).toBe("glm-5.1-updated");
    expect(verify).toHaveBeenCalledWith({
      provider: "anthropic",
      apiKey: "sk-updated",
      baseUrl: "",
      model: "glm-5.1-updated",
    });
    expect(strip(lastFrame() ?? "")).toContain("LLM setup saved");
    unmount();
  });

  it("/setup-llm asks for API key when reconfiguring a compatible provider", async () => {
    updateConfig({
      model: "old-model",
      llm: {
        provider: "compatible",
        api_key: "old-key",
        base_url: "https://provider.example.com/api/anthropic",
      },
    });
    const verify = vi.fn().mockResolvedValue(undefined);
    const { lastFrame, stdin, unmount } = render(<App verifyLlm={verify} />);
    await tick();
    await type(stdin, "/setup-llm");
    expect(strip(lastFrame() ?? "")).toContain("Select provider");

    await enter(stdin);
    expect(strip(lastFrame() ?? "")).toContain("Custom endpoint base URL");
    await enter(stdin);
    expect(strip(lastFrame() ?? "")).toContain("API key for Anthropic-compatible provider");

    await type(stdin, "new-key");
    await type(stdin, "new-compatible-model");

    await enter(stdin);
    const cfg = loadConfig();
    expect(cfg.llm.provider).toBe("compatible");
    expect(cfg.llm.api_key).toBe("new-key");
    expect(cfg.llm.base_url).toBe("https://provider.example.com/api/anthropic");
    expect(cfg.model).toBe("new-compatible-model");
    unmount();
  });

  it("/setup-fhsc collects FHSC config and switches broker", async () => {
    const { lastFrame, stdin, unmount } = render(<App />);
    await tick();
    await type(stdin, "/setup-fhsc");
    expect(strip(lastFrame() ?? "")).toContain("FHSC broker setup");
    expect(strip(lastFrame() ?? "")).toContain("Authentication method");

    await type(stdin, "2");
    await type(stdin, "123456");
    await type(stdin, "fhsc-key");
    await type(stdin, "fhsc-secret");
    await enter(stdin);
    await enter(stdin);

    const saved = strip(lastFrame() ?? "");
    expect(saved).toContain("FHSC broker saved.");
    expect(saved).toContain("123456");
    expect(saved).toContain("https://api.vinasecurities.com");

    await enter(stdin);
    const cfg = loadConfig();
    expect(cfg.broker).toBe("fhsc");
    expect(cfg.fhsc.sub_account_id).toBe("123456");
    expect(cfg.fhsc.api_key).toBe("fhsc-key");
    expect(cfg.fhsc.api_secret).toBe("fhsc-secret");
    expect(cfg.fhsc.access_token).toBe("");
    expect(cfg.fhsc.access_key).toBe("");
    expect(cfg.fhsc.device_id).toBe("");
    expect(cfg.fhsc.user_id).toBe("");
    expect(cfg.fhsc.cust_id).toBe("");
    expect(cfg.fhsc.base_url).toBe("https://api.vinasecurities.com");
    expect(strip(lastFrame() ?? "")).toContain("FHSC setup saved");
    unmount();
  });

  it("/health prints local runtime checks", async () => {
    const { lastFrame, stdin, unmount } = render(<App />);
    await tick();
    await type(stdin, "/health");
    await tick();
    const out = strip(lastFrame() ?? "");
    expect(out).toContain("Health:");
    expect(out).toContain("llm:");
    expect(out).toContain("database:");
    expect(out).toContain("data_provider:");
    unmount();
  });

  it("renders broker consent as a selectable TUI prompt", async () => {
    const { lastFrame, stdin, unmount } = render(<App />);
    await tick();

    const decision = requireBrokerConsent("portfolio_list", "read cash, positions, and exposure");
    await tick();
    let out = strip(lastFrame() ?? "");
    expect(out).toContain("Allow broker action?");
    expect(out).toContain("Yes, allow once");
    expect(out).toContain("No, deny");
    expect(out).toContain("↑/↓ select");
    expect(out).toContain("› No, deny");

    stdin.write("\u001B[A");
    await tick();
    out = strip(lastFrame() ?? "");
    expect(out).toContain("› Yes, allow once");
    await enter(stdin);
    await expect(decision).resolves.toBe(true);
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

  it("collapses automatic MCP team events to subagent status and final summary", async () => {
    const { lastFrame, unmount } = render(<App />);
    await tick();
    emitTeamToolEvent({
      tool: "team_analyze",
      event: { type: "run_start", runId: "team-run-12345678", ticker: "FPT" },
    });
    emitTeamToolEvent({
      tool: "team_analyze",
      event: { type: "role_start", role: "technical" },
    });
    emitTeamToolEvent({
      tool: "team_analyze",
      event: {
        type: "role_tool",
        role: "technical",
        tool: "market_quote",
        input: JSON.stringify({ ticker: "FPT" }),
      },
    });
    emitTeamToolEvent({
      tool: "team_analyze",
      event: {
        type: "role_tool_result",
        role: "technical",
        tool: "market_quote",
        content: "very noisy raw quote payload",
      },
    });
    emitTeamToolEvent({
      tool: "team_analyze",
      event: {
        type: "role_end",
        role: "technical",
        output: { score: 0.2, summary: "base building but no confirmed breakout" },
      },
    });
    emitTeamToolEvent({
      tool: "team_analyze",
      event: {
        type: "final",
        decision: {
          ticker: "FPT",
          rating: "Hold",
          sizingPct: 0,
          rationale: "Wait for confirmation",
          teamRunId: "team-run-12345678",
          asOfDateIso: "2026-05-04",
        },
      },
    });
    await tick();

    const out = strip(lastFrame() ?? "");
    expect(out).toContain("analyze subagents finished");
    expect(out).toContain("analyze technical");
    expect(out).toContain("final: Hold");
    expect(out).not.toContain("very noisy raw quote payload");
    expect(out).not.toContain("market_quote");
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
        strategy: "team-default",
        brokerName: "paper-bt-test",
        interval: "1h",
        turns: [1, 2],
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
        strategy: "team-default",
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
        interval: "1h",
        intervals: 1,
        sessions: 1,
        weeks: 1,
        trades: 2,
        rejectedTrades: 0,
        reportPath: null,
      };
    });

    const { lastFrame, stdin, unmount } = render(<App />);
    await tick();
    await type(stdin, "/backtest 2025-01-03 2025-01-10 1000000000 --interval 1h");
    await tick();

    expect(runnerMocks.runBacktestSession).toHaveBeenCalledWith(
      {
        start: "2025-01-03",
        end: "2025-01-10",
        initialCash: 1_000_000_000,
        interval: "1h",
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
    expect(out).toContain("1h intervals");
    expect(out).toContain("team analyzes 3/interval");
    expect(out).toContain("interval analysis");
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

  it("/backtest defaults to the previous week when no dates are supplied", async () => {
    runnerMocks.runBacktestSession.mockImplementationOnce(async (opts: any, cb: any) => {
      cb.onStart?.({
        runId: "bt-run-default",
        strategy: "team-default",
        brokerName: "paper-bt-test",
        interval: "30m",
        turns: [1],
        fridays: [1],
        universe: ["HPG"],
      });
      return {
        runId: "bt-run-default",
        strategy: "team-default",
        start: opts.start,
        end: opts.end,
        initialCash: opts.initialCash,
        finalMtm: opts.initialCash,
        finalBench: opts.initialCash,
        totalReturn: 0,
        benchReturn: 0,
        maxDD: 0,
        totalCost: 0,
        totalInTokens: 0,
        totalOutTokens: 0,
        interval: "30m",
        intervals: 0,
        sessions: 0,
        weeks: 0,
        trades: 0,
        rejectedTrades: 0,
        reportPath: null,
      };
    });

    const expected = previousWeekRange();
    const { stdin, unmount } = render(<App />);
    await tick();
    await type(stdin, "/backtest");
    await tick();

    expect(runnerMocks.runBacktestSession).toHaveBeenCalledWith(
      expect.objectContaining({
        start: expected.start,
        end: expected.end,
        initialCash: 1_000_000_000,
        interval: "30m",
      }),
      expect.any(Object),
    );
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
    expect(out).not.toContain("/journal");
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

  it("/help prints local slash command help", async () => {
    const { lastFrame, stdin, unmount } = render(<App />);
    await tick();
    await type(stdin, "/help");
    const out = strip(lastFrame() ?? "");
    expect(out).toContain("/team <message>");
    expect(out).toContain("/analyze <ticker>");
    expect(out).not.toContain("/journal");
    expect(out).toContain("/about");
    unmount();
  });

  it("/about prints version and runtime context", async () => {
    const { lastFrame, stdin, unmount } = render(<App />);
    await tick();
    await type(stdin, "/about");
    const out = strip(lastFrame() ?? "");
    expect(out).toMatch(/Azoth 0\.1\.\d+/);
    expect(out).toContain("Runtime:");
    expect(out).toContain("Database:");
    expect(out).toContain("Broker: paper");
    expect(out).toContain("Autonomy: advisory");
    expect(out).toContain("Roadmap: ROADMAP.md");
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

  it("sessionColor", () => {
    expect(sessionColor("morning")).toBe("green");
    expect(sessionColor("afternoon")).toBe("green");
    expect(sessionColor("atc")).toBe("yellow");
    expect(sessionColor("lunch")).toBe("yellow");
    expect(sessionColor("closed")).toBe("gray");
  });
});
