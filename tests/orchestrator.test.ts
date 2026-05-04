import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

vi.mock("@anthropic-ai/claude-agent-sdk", () => ({
  tool: (name: string, _desc: string, _schema: unknown, handler: unknown) => ({
    name,
    handler,
  }),
  createSdkMcpServer: (cfg: { name: string; tools: Array<{ name?: string }> }) => cfg,
  query: vi.fn(),
}));

let tmp: string;

beforeEach(async () => {
  tmp = mkdtempSync(join(tmpdir(), "azoth-orchestrator-"));
  process.env.AZOTH_CONFIG = join(tmp, "config.yaml");
  writeFileSync(
    process.env.AZOTH_CONFIG,
    [
      "autonomy: advisory",
      "model: test-model",
      "team:",
      "  quick_model: test-quick",
      "  deep_model: test-deep",
      "  output_language: en",
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
  const { resetConfigCacheForTests } = await import("../src/config/loader.js");
  resetConfigCacheForTests();
});

afterEach(async () => {
  const { resetConfigCacheForTests } = await import("../src/config/loader.js");
  resetConfigCacheForTests();
  delete process.env.AZOTH_CONFIG;
  vi.resetModules();
});

describe("outer agent team delegation", () => {
  it("exposes team tools to normal chat", async () => {
    const { buildOptions, buildSystemPrompt } = await import("../src/agent/orchestrator.js");

    const prompt = buildSystemPrompt();
    expect(prompt).toContain("team_question");
    expect(prompt).toContain("team_analyze");
    expect(prompt).toContain("wait for that team tool to finish");
    expect(prompt).toContain("Do not call duplicate market/fundamental/news/technical tools in parallel");
    expect(prompt).toContain("Formal settlement");
    expect(prompt).toContain("T+2");
    expect(prompt).toContain("Never call this a formal T+2.5 cycle");

    const opts = buildOptions();
    expect(opts.allowedTools).toContain("mcp__azoth__team_question");
    expect(opts.allowedTools).toContain("mcp__azoth__team_analyze");

    const server = opts.mcpServers?.azoth as unknown as { tools: Array<{ name?: string }> };
    expect(server.tools.map((t) => t.name)).toEqual(
      expect.arrayContaining(["team_question", "team_analyze"]),
    );
  });
});
