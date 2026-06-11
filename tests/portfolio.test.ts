import { describe, expect, it } from "vitest";
import { shapeBrokerPortfolio } from "../src/tools/portfolio.js";

describe("portfolio units", () => {
  it("returns prices in thousand VND and monetary values in VND", async () => {
    const shaped = await shapeBrokerPortfolio(
      {
        broker: "paper",
        cashVnd: 1_000_000,
        positions: [{ ticker: "FPT", quantity: 100, avgCost: 25 }],
      },
      async (tickers) => Object.fromEntries(tickers.map(t => [t, 30])),
    );

    expect(shaped.cash_vnd).toBe(1_000_000);
    expect(shaped.positions[0]?.avg_cost_thousand_vnd).toBe(25);
    expect(shaped.positions[0]?.last_close_thousand_vnd).toBe(30);
    expect(shaped.positions[0]?.cost_basis_vnd).toBe(2_500_000);
    expect(shaped.positions[0]?.market_value_vnd).toBe(3_000_000);
    expect(shaped.positions[0]?.unrealized_pnl_vnd).toBe(500_000);
    expect(shaped.totals.market_value_vnd).toBe(3_000_000);
  });
});

