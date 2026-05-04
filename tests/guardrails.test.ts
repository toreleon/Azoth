import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setActiveAsOf } from "../src/agent/clock.js";
import { checkOrder } from "../src/risk/guardrails.js";
import { resetConfigCacheForTests } from "../src/config/loader.js";
import type { Broker } from "../src/broker/types.js";

let tmp: string;

const broker: Broker = {
  name: "paper-bt-test",
  async placeOrder() {
    throw new Error("not used");
  },
  async cancelOrder() {
    throw new Error("not used");
  },
  async listOrders() {
    return [];
  },
  async snapshot() {
    return { broker: "paper-bt-test", cashVnd: 1_000_000_000, positions: [] };
  },
};

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "azoth-guardrails-"));
  const cfg = join(tmp, "config.yaml");
  writeFileSync(cfg, [
    "autonomy: auto",
    "model: default",
    "broker: paper",
    "risk:",
    "  max_position_pct: 0.15",
    "  max_daily_loss_pct: 0.03",
    "  max_order_notional_vnd: 50000000",
    "  ticker_whitelist: []",
    "  allow_margin: false",
    "",
  ].join("\n"));
  process.env.AZOTH_CONFIG = cfg;
  resetConfigCacheForTests();
});

afterEach(() => {
  setActiveAsOf(null);
  resetConfigCacheForTests();
  delete process.env.AZOTH_CONFIG;
  rmSync(tmp, { recursive: true, force: true });
});

describe("guardrails in backtest mode", () => {
  it("does not restrict dynamic discovery tickers when ticker_whitelist is empty", async () => {
    setActiveAsOf({ asOfSec: 1, brokerName: "paper-bt-test" });
    const result = await checkOrder(
      broker,
      { ticker: "BID", side: "BUY", type: "MARKET", quantity: 100 },
      30,
    );
    expect(result.ok).toBe(true);
    expect(result.reasons).toEqual([]);
  });

  it("still enforces notional limits in backtest mode", async () => {
    setActiveAsOf({ asOfSec: 1, brokerName: "paper-bt-test" });
    const result = await checkOrder(
      broker,
      { ticker: "BID", side: "BUY", type: "MARKET", quantity: 2600 },
      38.67,
    );
    expect(result.ok).toBe(false);
    expect(result.reasons.join(" ")).toContain("exceeds max");
    expect(result.reasons.join(" ")).not.toContain("ticker_whitelist");
  });
});

describe("configured trading risk", () => {
  it("blocks buys that would require margin when margin is disabled", async () => {
    const result = await checkOrder(
      {
        ...broker,
        async snapshot() {
          return { broker: "paper", cashVnd: 1_000_000, positions: [] };
        },
      },
      { ticker: "FPT", side: "BUY", type: "MARKET", quantity: 100 },
      30,
    );

    expect(result.ok).toBe(false);
    expect(result.reasons.join(" ")).toContain("margin disabled");
  });

  it("halts trading when the broker baseline is past max_daily_loss_pct", async () => {
    const result = await checkOrder(
      {
        ...broker,
        async snapshot() {
          return {
            broker: "paper",
            cashVnd: 900_000_000,
            positions: [],
            initialCashVnd: 1_000_000_000,
          };
        },
      },
      { ticker: "FPT", side: "SELL", type: "MARKET", quantity: 100 },
      30,
    );

    expect(result.ok).toBe(false);
    expect(result.reasons.join(" ")).toContain("max_daily_loss_pct");
  });
});
