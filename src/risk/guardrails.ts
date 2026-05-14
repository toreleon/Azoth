import { loadConfig } from "../config/loader.js";
import type { Broker, PlaceOrderInput } from "../broker/types.js";
import { currentBrokerName, currentFreezeBuys } from "../agent/clock.js";
import { checkVnMarketSession } from "./vnMarketSession.js";

export interface GuardrailResult {
  ok: boolean;
  reasons: string[];
}

const ESTIMATED_ORDER_FEE_PCT = 0.002;

function equityValue(
  snapshot: Awaited<ReturnType<Broker["snapshot"]>>,
  ticker: string,
  refPriceVnd: number,
): number {
  return (
    snapshot.cashVnd +
    snapshot.positions.reduce((sum, p) => {
      const px = p.ticker.toUpperCase() === ticker ? refPriceVnd : p.avgCost;
      return sum + px * p.quantity * 1000;
    }, 0)
  );
}

/**
 * Pre-trade checks for order-capable autonomy modes. Live/user-facing flows
 * obtain explicit broker consent before reaching this function because the
 * checks read broker state.
 */
export async function checkOrder(
  broker: Broker,
  input: PlaceOrderInput,
  refPriceVnd: number,
): Promise<GuardrailResult> {
  const cfg = loadConfig();
  const reasons: string[] = [];
  const ticker = input.ticker.toUpperCase();
  const notionalVnd = refPriceVnd * input.quantity * 1000;
  const snapshot = await broker.snapshot();
  const portfolioValue = equityValue(snapshot, ticker, refPriceVnd);

  if (notionalVnd > cfg.risk.max_order_notional_vnd) {
    reasons.push(
      `order notional ${(notionalVnd / 1e6).toFixed(1)}M VND exceeds max ${(cfg.risk.max_order_notional_vnd / 1e6).toFixed(1)}M VND`,
    );
  }

  const inBacktest = currentBrokerName() != null;
  const allowed = cfg.risk.ticker_whitelist;
  if (allowed.length > 0 && !allowed.map((t) => t.toUpperCase()).includes(ticker)) {
    reasons.push(`ticker ${ticker} is not in ticker_whitelist`);
  }

  if (input.side === "BUY" && currentFreezeBuys()) {
    reasons.push("drawdown circuit breaker active: BUY orders are frozen this turn");
  }

  if (!cfg.risk.allow_margin) {
    if ((snapshot.marginUsedVnd ?? 0) > 0) {
      reasons.push("margin is disabled by risk.allow_margin=false but broker reports margin usage");
    }
    if (input.side === "BUY") {
      const requiredCashVnd = notionalVnd * (1 + ESTIMATED_ORDER_FEE_PCT);
      if (snapshot.cashVnd < requiredCashVnd) {
        reasons.push(
          `margin disabled: BUY requires about ${requiredCashVnd.toFixed(0)} VND cash, available ${snapshot.cashVnd.toFixed(0)} VND`,
        );
      }
    }
  }

  if (snapshot.initialCashVnd != null && snapshot.initialCashVnd > 0) {
    const lossPct = 1 - portfolioValue / snapshot.initialCashVnd;
    if (lossPct > cfg.risk.max_daily_loss_pct) {
      reasons.push(
        `loss ${(lossPct * 100).toFixed(1)}% exceeds max_daily_loss_pct ${(cfg.risk.max_daily_loss_pct * 100).toFixed(1)}%; trading halted`,
      );
    }
  }

  if (input.side === "BUY") {
    const existing = snapshot.positions.find((p) => p.ticker === ticker);
    const projectedVnd =
      ((existing?.quantity ?? 0) + input.quantity) * refPriceVnd * 1000;
    const projectedPct = portfolioValue > 0 ? projectedVnd / portfolioValue : 1;
    if (projectedPct > cfg.risk.max_position_pct) {
      reasons.push(
        `projected ${ticker} position ${(projectedPct * 100).toFixed(1)}% would exceed max_position_pct ${(cfg.risk.max_position_pct * 100).toFixed(1)}%`,
      );
    }
  }

  // Backtest mode (per-run broker pinned via ALS): skip wall-clock checks.
  // The harness fires on simulated historical interval closes, which are
  // independent of the real wall clock.
  if (inBacktest) {
    return { ok: reasons.length === 0, reasons };
  }

  const session = checkVnMarketSession();
  if (!session.open) {
    reasons.push(`market closed (${session.ictTime} ICT: ${session.reason})`);
  }

  return { ok: reasons.length === 0, reasons };
}
