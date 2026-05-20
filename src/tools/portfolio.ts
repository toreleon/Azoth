import { tool } from "@anthropic-ai/claude-agent-sdk";
import { getStockOhlcv } from "../data/sources/dnsePublic.js";
import { nowSec } from "../agent/clock.js";
import { getBroker } from "../broker/index.js";
import type { BrokerSnapshot } from "../broker/types.js";
import { requireBrokerConsent } from "./brokerConsent.js";

function asText(obj: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(obj) }] };
}

async function lastClose(ticker: string): Promise<number | null> {
  const to = nowSec();
  const from = to - 14 * 86400;
  const bars = await getStockOhlcv(ticker, "1D", from, to).catch(() => []);
  return bars.length ? bars[bars.length - 1]!.close : null;
}

export async function shapeBrokerPortfolio(
  snap: BrokerSnapshot,
  priceFor: (ticker: string) => Promise<number | null>,
) {
  const positions = await Promise.all(
    snap.positions.map(async (p) => {
      const px = p.lastPrice ?? await priceFor(p.ticker);
      const cost_basis_vnd = p.avgCost * p.quantity * 1000;
      const market_value_vnd = p.marketValueVnd ?? (px != null ? px * p.quantity * 1000 : null);
      const unrealized_pnl_vnd =
        p.unrealizedPnlVnd ?? (px != null ? (px - p.avgCost) * p.quantity * 1000 : null);
      const unrealized_pnl_pct =
        p.unrealizedPnlPct ?? (px != null && p.avgCost > 0
          ? ((px - p.avgCost) / p.avgCost) * 100
          : null);
      return {
        ticker: p.ticker,
        quantity: p.quantity,
        sub_account_id: p.subAccountId ?? null,
        custody_code: p.custodyCode ?? null,
        avg_cost_thousand_vnd: p.avgCost,
        last_close_thousand_vnd: px,
        cost_basis_vnd,
        market_value_vnd,
        unrealized_pnl_vnd,
        unrealized_pnl_pct,
      };
    }),
  );

  const totals = positions.reduce(
    (a, p) => {
      a.cost_basis_vnd += p.cost_basis_vnd;
      if (p.market_value_vnd != null) a.market_value_vnd += p.market_value_vnd;
      if (p.unrealized_pnl_vnd != null) a.unrealized_pnl_vnd += p.unrealized_pnl_vnd;
      return a;
    },
    { cost_basis_vnd: 0, market_value_vnd: 0, unrealized_pnl_vnd: 0 },
  );
  const total_equity_vnd = snap.totalEquityVnd ?? snap.cashVnd + totals.market_value_vnd;

  return {
    broker: snap.broker,
    cash_vnd: snap.cashVnd,
    total_equity_vnd,
    margin_used_vnd: snap.marginUsedVnd ?? 0,
    sub_accounts: snap.subAccounts ?? [],
    positions,
    totals,
  };
}

export const listPositionsTool = tool(
  "portfolio_list",
  "List broker positions with current price, cash, and unrealized P&L. In manual mode, the user is prompted before the tool runs. Prices and avg_cost are in thousand VND (e.g. 28.5 = 28,500 VND). Monetary totals are returned in VND.",
  {},
  async () => {
    const ok = await requireBrokerConsent("portfolio_list", "read cash, positions, and exposure");
    if (!ok) return asText({ ok: false, error: "user_declined" });
    const snap = await getBroker().snapshot();
    return asText(await shapeBrokerPortfolio(snap, lastClose));
  },
);
