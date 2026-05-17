import type { PortfolioSnapshot } from "../../../shared/ipc.js";
import { sectorClassFor } from "./HoldingsBoard.js";

interface AllocRow {
  name: string;
  pct: number;
  cls: string;
}

export function AllocationCard({ snapshot }: { snapshot: PortfolioSnapshot | null }) {
  const rows = computeAllocation(snapshot);
  return (
    <section className="card card-pad">
      <h3 className="card-title">Allocation by sector</h3>
      <div style={{ marginTop: "var(--space-3)" }}>
        {rows.length === 0 ? (
          <div className="market-empty" style={{ padding: "var(--space-4) 0" }}>
            No positions to allocate.
          </div>
        ) : (
          rows.map((row) => (
            <div className="alloc-row" key={row.name}>
              <span className="sym">{row.name}</span>
              <div className="alloc-bar">
                <span className={row.cls} style={{ width: `${row.pct.toFixed(1)}%` }} />
              </div>
              <span className="pct">{row.pct.toFixed(0)}%</span>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function computeAllocation(snapshot: PortfolioSnapshot | null): AllocRow[] {
  if (!snapshot) return [];
  const totalEquity = snapshot.total_equity_vnd || 1;
  const buckets = new Map<string, number>();
  // TODO: industry isn't on PortfolioPosition; bucket all positions under "Equities" until a sector mapping is available.
  let positionsValue = 0;
  for (const p of snapshot.positions) {
    positionsValue += p.market_value_vnd ?? 0;
  }
  if (positionsValue > 0) {
    buckets.set("Equities", positionsValue);
  }
  if (snapshot.cash_vnd > 0) {
    buckets.set("Cash", snapshot.cash_vnd);
  }
  return Array.from(buckets, ([name, value]) => ({
    name,
    pct: (value / totalEquity) * 100,
    cls: name === "Cash" ? "cash" : sectorClassFor(name) || "",
  })).sort((a, b) => b.pct - a.pct);
}
