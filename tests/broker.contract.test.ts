/**
 * Broker contract tests. The same scenarios run against any Broker.
 * PaperBroker runs by default. DNSEBroker runs only when:
 *    DNSE_TEST_LIVE=1
 *    DNSE_USERNAME / DNSE_PASSWORD / DNSE_ACCOUNT_NO / DNSE_LOAN_PACKAGE_ID set
 *    AZOTH_LIVE_TRADING=1
 *  For DNSE the live test is read-only (snapshot, listOrders) — it does NOT
 *  place orders.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { unlinkSync, existsSync } from "node:fs";
import { PaperBroker } from "../src/broker/paper.js";
import { DNSEBroker } from "../src/broker/dnse.js";
import type { Broker } from "../src/broker/types.js";

const TEST_DB = ".test-broker.db";
process.env.AZOTH_DB = TEST_DB;

beforeAll(() => {
  if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
});

afterAll(() => {
  if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
});

describe("PaperBroker contract", () => {
  const broker = new PaperBroker(500_000_000);
  broker.reset(500_000_000);
  broker.setPriceOverride(() => 30.0);

  it("rejects sub-lot quantities", async () => {
    const o = await broker.placeOrder({
      ticker: "HPG",
      side: "BUY",
      type: "MARKET",
      quantity: 50,
    });
    expect(o.status).toBe("REJECTED");
    expect(o.rejectReason).toMatch(/lot size/i);
  });

  it("fills a market BUY at last close + slippage and updates cash", async () => {
    const before = await broker.snapshot();
    const o = await broker.placeOrder({
      ticker: "HPG",
      side: "BUY",
      type: "MARKET",
      quantity: 100,
    });
    expect(o.status).toBe("FILLED");
    expect(o.filledPrice).toBeGreaterThan(30);
    const after = await broker.snapshot();
    expect(after.cashVnd).toBeLessThan(before.cashVnd);
    expect(after.positions.find((p) => p.ticker === "HPG")?.quantity).toBe(100);
  });

  it("queues LIMIT below market as PENDING and cancels it", async () => {
    const o = await broker.placeOrder({
      ticker: "VCB",
      side: "BUY",
      type: "LIMIT",
      quantity: 100,
      limitPrice: 1, // far below
    });
    expect(o.status).toBe("PENDING");
    const c = await broker.cancelOrder(o.id);
    expect(c.status).toBe("CANCELLED");
  });

  it("realizes P&L on round-trip SELL", async () => {
    broker.setPriceOverride(() => 33.0);
    const before = await broker.snapshot();
    const o = await broker.placeOrder({
      ticker: "HPG",
      side: "SELL",
      type: "MARKET",
      quantity: 100,
    });
    expect(o.status).toBe("FILLED");
    const after = await broker.snapshot();
    expect(after.cashVnd).toBeGreaterThan(before.cashVnd);
    expect(after.positions.find((p) => p.ticker === "HPG")).toBeUndefined();
  });

  it("rejects oversell", async () => {
    const o = await broker.placeOrder({
      ticker: "HPG",
      side: "SELL",
      type: "MARKET",
      quantity: 100,
    });
    expect(o.status).toBe("REJECTED");
    expect(o.rejectReason).toMatch(/insufficient/i);
  });

  it("can persist guardrail-blocked backtest attempts as rejected orders", async () => {
    const o = await broker.recordRejectedOrder!({
      ticker: "BID",
      side: "BUY",
      type: "MARKET",
      quantity: 2600,
    }, "guardrail_blocked: order notional exceeds max");
    expect(o.status).toBe("REJECTED");
    expect(o.rejectReason).toContain("guardrail_blocked");
    const rows = await broker.listOrders({ status: "REJECTED", limit: 10 });
    expect(rows.some((r) => r.id === o.id)).toBe(true);
  });

  it("listOrders returns recent orders most-recent first", async () => {
    const orders = await broker.listOrders({ limit: 10 });
    expect(orders.length).toBeGreaterThan(0);
    for (let i = 1; i < orders.length; i++) {
      expect(orders[i - 1]!.createdAt).toBeGreaterThanOrEqual(orders[i]!.createdAt);
    }
  });
});

const liveDnse = process.env.DNSE_TEST_LIVE === "1";

describe.skipIf(!liveDnse)("DNSEBroker (read-only, requires live env)", () => {
  let broker: Broker;
  beforeAll(() => {
    broker = new DNSEBroker();
  });

  it("snapshot returns cash + positions", async () => {
    const snap = await broker.snapshot();
    expect(snap.broker).toBe("dnse");
    expect(typeof snap.cashVnd).toBe("number");
    expect(Array.isArray(snap.positions)).toBe(true);
  });

  it("listOrders returns today's orders", async () => {
    const orders = await broker.listOrders({ limit: 5 });
    expect(Array.isArray(orders)).toBe(true);
  });
});
