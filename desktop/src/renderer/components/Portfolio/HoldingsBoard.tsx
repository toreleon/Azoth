import { useMemo, useState } from "react";
import type { PortfolioSnapshot, PortfolioSubAccount } from "../../../shared/ipc.js";
import { accountKindOf, accountTitle, type AccountKind } from "../../lib/accountKind.js";
import {
  formatPercent,
  formatQuantity,
  formatSignedVnd,
  formatThousandVnd,
  formatVndCompact,
  pnlClass,
} from "../../lib/format.js";

interface Filter {
  id: string;
  label: string;
  kind: AccountKind | "all";
  subAccountId?: string;
}

const SECTOR_CLASS: Record<string, string> = {
  banks: "banks",
  bank: "banks",
  banking: "banks",
  technology: "tech",
  tech: "tech",
  it: "tech",
  consumer: "consumer",
  food: "consumer",
  "food & beverage": "consumer",
  retail: "retail",
  steel: "steel",
  "real estate": "realestate",
  realestate: "realestate",
  property: "realestate",
  energy: "energy",
  oil: "energy",
  securities: "securities",
  brokerage: "securities",
};

export function sectorClassFor(industry: string | undefined | null): string {
  if (!industry) return "";
  const key = industry.toLowerCase();
  return SECTOR_CLASS[key] ?? "";
}

export function HoldingsBoard({
  snapshot,
  onOpenPosition,
}: {
  snapshot: PortfolioSnapshot | null;
  onOpenPosition: (symbol: string) => void;
}) {
  const filters = useMemo(() => buildFilters(snapshot?.sub_accounts ?? []), [snapshot?.sub_accounts]);
  const [activeId, setActiveId] = useState<string>("all");

  const positions = snapshot?.positions ?? [];
  const filtered = useMemo(() => {
    const filter = filters.find((f) => f.id === activeId);
    if (!filter || filter.id === "all") return positions;
    if (filter.subAccountId) return positions.filter((p) => p.sub_account_id === filter.subAccountId);
    return positions;
  }, [filters, activeId, positions]);

  const totalMarketValue = filtered.reduce((sum, p) => sum + (p.market_value_vnd ?? 0), 0);
  const investedLabel = formatVndCompact(totalMarketValue);

  return (
    <section className="tbl-card">
      <div className="tbl-toolbar">
        <h3>Holdings</h3>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", flexWrap: "wrap" }}>
          <span className="kicker" style={{ textTransform: "none", letterSpacing: 0, color: "var(--meta)" }}>
            {filtered.length} positions · {investedLabel} invested
          </span>
          <div className="seg" role="group" aria-label="Sub-account filter">
            {filters.map((f) => (
              <button
                key={f.id}
                type="button"
                className={activeId === f.id ? "is-active" : ""}
                onClick={() => setActiveId(f.id)}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      {filtered.length === 0 ? (
        <div className="market-symbols-empty">No positions in this view.</div>
      ) : (
        <table className="tbl">
          <thead>
            <tr>
              <th>Symbol</th>
              <th>Qty</th>
              <th>Avg cost</th>
              <th>Last</th>
              <th>Market value</th>
              <th>Unrealized P&amp;L</th>
              <th className="holdings-weight">Weight</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => {
              const weight = totalMarketValue > 0 ? ((p.market_value_vnd ?? 0) / totalMarketValue) * 100 : 0;
              return (
                <tr key={`${p.ticker}-${p.sub_account_id ?? ""}-${p.custody_code ?? ""}`}>
                  <td>
                    <button type="button" className="ticker-link" onClick={() => onOpenPosition(p.ticker)}>
                      <span className="sym-mark">{p.ticker.slice(0, 3)}</span>
                      <span className="sym-text">
                        <strong>{p.ticker}</strong>
                        {p.sub_account_id ? <span className="name">{p.sub_account_id}</span> : null}
                      </span>
                    </button>
                  </td>
                  <td className="num">{formatQuantity(p.quantity)}</td>
                  <td className="num">{formatThousandVnd(p.avg_cost_thousand_vnd)}</td>
                  <td className="num">{formatThousandVnd(p.last_close_thousand_vnd)}</td>
                  <td className="num">{formatVndCompact(p.market_value_vnd)}</td>
                  <td className={`num ${pnlClass(p.unrealized_pnl_vnd)}`}>
                    <div>{formatSignedVnd(p.unrealized_pnl_vnd)}</div>
                    <div style={{ fontSize: "var(--text-xs)" }}>{formatPercent(p.unrealized_pnl_pct)}</div>
                  </td>
                  <td className="holdings-weight">
                    <div className="holdings-weight-bar">
                      <span style={{ width: `${Math.min(100, weight).toFixed(1)}%` }} />
                    </div>
                    <div className="holdings-weight-label">{weight.toFixed(1)}%</div>
                  </td>
                  <td>
                    <button type="button" className="btn btn-ghost" onClick={() => onOpenPosition(p.ticker)}>
                      Open
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}

function buildFilters(accounts: PortfolioSubAccount[]): Filter[] {
  const filters: Filter[] = [{ id: "all", label: "All", kind: "all" }];
  accounts.forEach((account, idx) => {
    const kind = accountKindOf(account, idx, accounts.length);
    const label = kind === "main" ? "Main" : kind === "margin" ? "Margin" : (account.label || account.id);
    filters.push({ id: account.id, label, kind, subAccountId: account.id });
  });
  return filters;
}

export { accountTitle };
