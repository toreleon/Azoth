import type {
  PortfolioPosition,
  PortfolioSnapshot,
  PortfolioSubAccount,
} from "../../../shared/ipc.js";
import {
  formatPercent,
  formatQuantity,
  formatSignedVnd,
  formatThousandVnd,
  formatVndCompact,
  pnlClass,
} from "../../lib/format.js";

interface AccountPane {
  account: PortfolioSubAccount | null;
  title: string;
  kind: "main" | "margin" | "other";
  positions: PortfolioPosition[];
  cashVnd: number;
  costBasisVnd: number;
  marketValueVnd: number;
  unrealizedPnlVnd: number;
}

function accountText(account: PortfolioSubAccount | null): string {
  return [account?.type, account?.label, account?.id].filter(Boolean).join(" ");
}

function normalizeWords(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function isMarginAccount(account: PortfolioSubAccount | null): boolean {
  const text = normalizeWords(accountText(account));
  return /\b(margin|mr|loan|ky quy|vay)\b/.test(text);
}

function isMainAccount(account: PortfolioSubAccount | null): boolean {
  const text = normalizeWords(accountText(account));
  return /\b(main|normal|cash|thuong|co so|base)\b/.test(text);
}

function accountKind(
  account: PortfolioSubAccount | null,
  index: number,
  accountCount: number,
): AccountPane["kind"] {
  if (isMarginAccount(account)) return "margin";
  if (isMainAccount(account)) return "main";
  if (accountCount === 2) return index === 0 ? "main" : "margin";
  return "other";
}

function accountTitle(kind: AccountPane["kind"], account: PortfolioSubAccount | null, index: number): string {
  if (kind === "main") return "Main account";
  if (kind === "margin") return "Margin account";
  return account?.label || account?.id || `Account ${index + 1}`;
}

function accountCash(account: PortfolioSubAccount | null): number {
  return account?.totalCashVnd ?? account?.cashVnd ?? 0;
}

function makePane(
  account: PortfolioSubAccount | null,
  positions: PortfolioPosition[],
  index: number,
  accountCount: number,
): AccountPane {
  const kind = accountKind(account, index, accountCount);
  return {
    account,
    title: accountTitle(kind, account, index),
    kind,
    positions,
    cashVnd: accountCash(account),
    costBasisVnd: positions.reduce((sum, p) => sum + p.cost_basis_vnd, 0),
    marketValueVnd: positions.reduce((sum, p) => sum + (p.market_value_vnd ?? 0), 0),
    unrealizedPnlVnd: positions.reduce((sum, p) => sum + (p.unrealized_pnl_vnd ?? 0), 0),
  };
}

function accountPanes(snapshot: PortfolioSnapshot | null): AccountPane[] {
  if (!snapshot) return [];
  const accounts = snapshot.sub_accounts ?? [];
  if (accounts.length === 0) {
    return [makePane(null, snapshot.positions, 0, 1)];
  }

  const panes = accounts.map((account, index) => {
    const positions = snapshot.positions.filter((position) => position.sub_account_id === account.id);
    return makePane(account, positions, index, accounts.length);
  });
  const knownAccountIds = new Set(accounts.map((account) => account.id));
  const unassignedPositions = snapshot.positions.filter(
    (position) => !position.sub_account_id || !knownAccountIds.has(position.sub_account_id),
  );
  if (unassignedPositions.length > 0) {
    panes.push(makePane(null, unassignedPositions, panes.length, panes.length + 1));
  }

  return panes.sort((a, b) => {
    const rank = { main: 0, margin: 1, other: 2 };
    return rank[a.kind] - rank[b.kind] || (a.account?.id ?? "").localeCompare(b.account?.id ?? "");
  });
}

export function AccountSplitView({
  snapshot,
  onOpenTicker,
}: {
  snapshot: PortfolioSnapshot | null;
  onOpenTicker: (symbol: string) => void;
}) {
  const panes = accountPanes(snapshot);
  return (
    <section className="portfolio-card ds-card portfolio-account-split">
      <div className="portfolio-card-header">
        <div>
          <span className="ds-kicker">Sub-account split</span>
          <h2 className="ds-title">Main / Margin</h2>
        </div>
        <span className="portfolio-card-meta">{panes.length || "—"} accounts</span>
      </div>
      {panes.length === 0 ? (
        <div className="portfolio-empty">Waiting for account data.</div>
      ) : (
        <div className="portfolio-account-grid">
          {panes.map((pane) => (
            <AccountPaneCard
              key={`${pane.kind}-${pane.account?.id ?? "unassigned"}`}
              pane={pane}
              onOpenTicker={onOpenTicker}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function AccountPaneCard({
  pane,
  onOpenTicker,
}: {
  pane: AccountPane;
  onOpenTicker: (symbol: string) => void;
}) {
  const equityVnd = pane.cashVnd + pane.marketValueVnd;
  const unrealizedPct = pane.costBasisVnd > 0 ? (pane.unrealizedPnlVnd / pane.costBasisVnd) * 100 : null;
  return (
    <article className={`portfolio-account-pane portfolio-account-${pane.kind}`}>
      <div className="portfolio-account-pane-head">
        <div>
          <h3>{pane.title}</h3>
          <div className="portfolio-account-id">
            {pane.account?.label && pane.account.label !== pane.title ? `${pane.account.label} · ` : ""}
            {pane.account?.id ?? "Unassigned"}
          </div>
        </div>
        <span className="portfolio-account-badge">{pane.kind}</span>
      </div>

      <div className="portfolio-account-metrics">
        <Metric label="Equity" value={formatVndCompact(equityVnd)} />
        <Metric label="Cash" value={formatVndCompact(pane.cashVnd)} />
        <Metric label="Market value" value={formatVndCompact(pane.marketValueVnd)} />
        <Metric
          label="P&L"
          value={formatSignedVnd(pane.unrealizedPnlVnd)}
          sub={unrealizedPct != null ? formatPercent(unrealizedPct) : undefined}
          className={pnlClass(pane.unrealizedPnlVnd)}
        />
      </div>

      {pane.positions.length === 0 ? (
        <div className="portfolio-empty portfolio-account-empty">No positions in this account.</div>
      ) : (
        <div className="portfolio-account-position-list">
          {pane.positions.map((position) => (
            <div
              className="portfolio-account-position"
              key={`${position.ticker}-${position.sub_account_id ?? ""}-${position.custody_code ?? ""}`}
            >
              <div className="portfolio-account-position-main">
                <button
                  type="button"
                  className="portfolio-ticker-button"
                  onClick={() => onOpenTicker(position.ticker)}
                >
                  <strong>{position.ticker}</strong>
                </button>
                <span>
                  {formatQuantity(position.quantity)} @ {formatThousandVnd(position.last_close_thousand_vnd)}
                </span>
              </div>
              <div className="portfolio-account-position-value">
                <strong>{formatVndCompact(position.market_value_vnd)}</strong>
                <span className={pnlClass(position.unrealized_pnl_vnd)}>
                  {formatSignedVnd(position.unrealized_pnl_vnd)}
                  <em>{formatPercent(position.unrealized_pnl_pct)}</em>
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}

function Metric({
  label,
  value,
  sub,
  className,
}: {
  label: string;
  value: string;
  sub?: string;
  className?: string;
}) {
  return (
    <div className={["portfolio-account-metric", className].filter(Boolean).join(" ")}>
      <span>{label}</span>
      <strong>{value}</strong>
      {sub ? <em>{sub}</em> : null}
    </div>
  );
}
