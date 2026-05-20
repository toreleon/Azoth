import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resetConfigCacheForTests } from "../src/config/loader.js";

const mocks = vi.hoisted(() => ({
  placeOrder: vi.fn(),
  cancelOrder: vi.fn(),
  listOrders: vi.fn(),
  snapshot: vi.fn(),
  accountHistory: vi.fn(),
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

vi.mock("../src/risk/vnMarketSession.js", () => ({
  checkVnMarketSession: vi.fn(() => ({ open: true, ictTime: "2026-05-14 10:00", session: "morning" })),
}));

vi.mock("../src/broker/index.js", () => ({
  getBroker: () => ({
    name: "paper",
    placeOrder: mocks.placeOrder,
    cancelOrder: mocks.cancelOrder,
    listOrders: mocks.listOrders,
    snapshot: mocks.snapshot,
    accountHistory: mocks.accountHistory,
  }),
}));

let tmp: string;

function writeConfig(autonomy: "manual" | "auto", maxOrderNotionalVnd: number) {
  const configPath = process.env.AZOTH_CONFIG;
  if (!configPath) throw new Error("AZOTH_CONFIG must be set for order confirmation tests");
  writeFileSync(configPath, [
    `autonomy: ${autonomy}`,
    "model: test-model",
    "broker: paper",
    "risk:",
    "  max_position_pct: 0.15",
    "  max_daily_loss_pct: 0.03",
    `  max_order_notional_vnd: ${maxOrderNotionalVnd}`,
    "  ticker_whitelist: []",
    "  allow_margin: false",
    "",
  ].join("\n"));
  resetConfigCacheForTests();
}

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "azoth-order-confirm-"));
  process.env.AZOTH_CONFIG = join(tmp, "config.yaml");
  writeConfig("manual", 1);
  mocks.placeOrder.mockReset();
  mocks.cancelOrder.mockReset();
  mocks.listOrders.mockReset();
  mocks.snapshot.mockReset();
  mocks.accountHistory.mockReset();
  mocks.question.mockReset();
  mocks.question.mockResolvedValue("y");
  mocks.snapshot.mockResolvedValue({ broker: "paper", cashVnd: 1_000_000_000, positions: [] });
  mocks.placeOrder.mockResolvedValue({
    id: "order-1",
    broker: "paper",
    ticker: "FPT",
    side: "BUY",
    type: "MARKET",
    quantity: 100,
    limitPrice: null,
    status: "FILLED",
    rejectReason: null,
    createdAt: 1,
    filledAt: 1,
    filledPrice: 30,
    filledQty: 100,
    notes: null,
  });
  mocks.cancelOrder.mockResolvedValue({
    id: "order-1",
    broker: "paper",
    ticker: "FPT",
    side: "BUY",
    type: "LIMIT",
    quantity: 100,
    limitPrice: 30,
    status: "CANCELLED",
    rejectReason: null,
    createdAt: 1,
    filledAt: null,
    filledPrice: null,
    filledQty: null,
    notes: null,
  });
  mocks.listOrders.mockResolvedValue([]);
  mocks.accountHistory.mockResolvedValue({
    broker: "paper",
    fromDate: "2026-01-01",
    toDate: "2026-05-14",
    subAccounts: [],
    orders: [],
    fills: [],
    transactions: [],
    rights: [],
  });
});

afterEach(() => {
  resetConfigCacheForTests();
  delete process.env.AZOTH_CONFIG;
  rmSync(tmp, { recursive: true, force: true });
});

describe("manual order flow", () => {
  it("asks for broker consent before guardrails or submitting", async () => {
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
    expect(mocks.question).toHaveBeenCalledTimes(1);
    expect(mocks.question.mock.calls[0]![0]).toContain("Allow tool call: place_order");
    expect(mocks.placeOrder).not.toHaveBeenCalled();
  });

  it("does not contact the broker when the user declines a place_order", async () => {
    writeConfig("manual", 1_000_000_000);
    mocks.question.mockResolvedValue("n");
    const { placeOrderTool } = await import("../src/tools/order.js");

    const result = await (placeOrderTool as unknown as {
      handler: (input: unknown) => Promise<{ content: Array<{ text: string }> }>;
    }).handler({
      ticker: "FPT",
      side: "BUY",
      type: "MARKET",
      quantity: 100,
    });

    const body = JSON.parse(result.content[0]!.text) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toBe("user_declined");
    expect(mocks.snapshot).not.toHaveBeenCalled();
    expect(mocks.placeOrder).not.toHaveBeenCalled();
  });

  it("does not prompt in auto mode before placing an approved order", async () => {
    writeConfig("auto", 1_000_000_000);
    const { placeOrderTool } = await import("../src/tools/order.js");

    const result = await (placeOrderTool as unknown as {
      handler: (input: unknown) => Promise<{ content: Array<{ text: string }> }>;
    }).handler({
      ticker: "FPT",
      side: "BUY",
      type: "MARKET",
      quantity: 100,
    });

    const body = JSON.parse(result.content[0]!.text) as { ok: boolean; order: { id: string } };
    expect(body.ok).toBe(true);
    expect(body.order.id).toBe("order-1");
    expect(mocks.question).not.toHaveBeenCalled();
    expect(mocks.snapshot).toHaveBeenCalled();
    expect(mocks.placeOrder).toHaveBeenCalled();
  });

  it("prompts before cancel_order", async () => {
    const { cancelOrderTool } = await import("../src/tools/order.js");
    const result = await (cancelOrderTool as unknown as {
      handler: (input: unknown) => Promise<{ content: Array<{ text: string }> }>;
    }).handler({ id: "order-1" });

    const body = JSON.parse(result.content[0]!.text) as { ok: boolean; order: { status: string } };
    expect(body.ok).toBe(true);
    expect(body.order.status).toBe("CANCELLED");
    expect(mocks.question.mock.calls[0]![0]).toContain("Allow tool call: cancel_order");
    expect(mocks.cancelOrder).toHaveBeenCalledWith("order-1");
  });

  it("prompts before broker read tools", async () => {
    const { listOrdersTool, brokerStateTool } = await import("../src/tools/order.js");
    const { accountHistoryTool } = await import("../src/tools/accountHistory.js");

    await (listOrdersTool as unknown as {
      handler: (input: unknown) => Promise<{ content: Array<{ text: string }> }>;
    }).handler({ limit: 5 });
    await (brokerStateTool as unknown as {
      handler: (input: unknown) => Promise<{ content: Array<{ text: string }> }>;
    }).handler({});
    await (accountHistoryTool as unknown as {
      handler: (input: unknown) => Promise<{ content: Array<{ text: string }> }>;
    }).handler({ kind: "all", from_date: "2026-01-01", to_date: "2026-05-14", limit: 5 });

    expect(mocks.question).toHaveBeenCalledTimes(3);
    expect(mocks.question.mock.calls[0]![0]).toContain("Allow tool call: list_orders");
    expect(mocks.question.mock.calls[1]![0]).toContain("Allow tool call: broker_state");
    expect(mocks.question.mock.calls[2]![0]).toContain("Allow tool call: account_history");
    expect(mocks.listOrders).toHaveBeenCalled();
    expect(mocks.snapshot).toHaveBeenCalled();
    expect(mocks.accountHistory).toHaveBeenCalledWith({
      fromDate: "2026-01-01",
      toDate: "2026-05-14",
      ticker: undefined,
      limit: 5,
    });
  });
});
