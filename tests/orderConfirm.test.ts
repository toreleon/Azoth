import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resetConfigCacheForTests } from "../src/config/loader.js";

const mocks = vi.hoisted(() => ({
  placeOrder: vi.fn(),
  question: vi.fn(),
}));

vi.mock("@anthropic-ai/claude-agent-sdk", () => ({
  tool: (name: string, _desc: string, _schema: unknown, handler: unknown) => ({ name, handler }),
}));

vi.mock("node:readline/promises", () => ({
  createInterface: () => ({
    question: mocks.question,
    close: vi.fn(),
  }),
}));

vi.mock("../src/data/sources/dnsePublic.js", () => ({
  getStockOhlcv: vi.fn(async () => [{ time: 1, open: 30, high: 30, low: 30, close: 30, volume: 1000 }]),
}));

vi.mock("../src/broker/index.js", () => ({
  getBroker: () => ({
    name: "paper",
    placeOrder: mocks.placeOrder,
    cancelOrder: vi.fn(),
    listOrders: vi.fn(),
    snapshot: vi.fn(async () => ({ broker: "paper", cashVnd: 1_000_000_000, positions: [] })),
  }),
}));

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "azoth-order-confirm-"));
  process.env.VNSTOCK_CONFIG = join(tmp, "config.yaml");
  writeFileSync(process.env.VNSTOCK_CONFIG, [
    "autonomy: confirm",
    "model: test-model",
    "broker: paper",
    "risk:",
    "  max_position_pct: 0.15",
    "  max_daily_loss_pct: 0.03",
    "  max_order_notional_vnd: 1",
    "  ticker_whitelist: []",
    "  allow_margin: false",
    "",
  ].join("\n"));
  resetConfigCacheForTests();
  mocks.placeOrder.mockReset();
  mocks.question.mockReset();
});

afterEach(() => {
  resetConfigCacheForTests();
  delete process.env.VNSTOCK_CONFIG;
  rmSync(tmp, { recursive: true, force: true });
});

describe("confirm order flow", () => {
  it("runs guardrails before prompting or submitting", async () => {
    const { placeOrderTool } = await import("../src/tools/order.js");
    const result = await (placeOrderTool as unknown as {
      handler: (input: unknown) => Promise<{ content: Array<{ text: string }> }>;
    }).handler({
      ticker: "FPT",
      side: "BUY",
      type: "MARKET",
      quantity: 100,
    });

    const body = JSON.parse(result.content[0]!.text) as { ok: boolean; error: string; reasons: string[] };
    expect(body.ok).toBe(false);
    expect(body.error).toBe("guardrail_blocked");
    expect(body.reasons.join(" ")).toContain("exceeds max");
    expect(mocks.question).not.toHaveBeenCalled();
    expect(mocks.placeOrder).not.toHaveBeenCalled();
  });
});

