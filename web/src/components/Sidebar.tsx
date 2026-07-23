import { useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { usePortfolios, useWatchlists } from "../lib/userData";
import "./Sidebar.css";

// Inline nav icons (kept tiny + optional per the design language).
function IconHome() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1v-9.5Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconPortfolio() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="7" width="18" height="13" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8 7V5.5A1.5 1.5 0 0 1 9.5 4h5A1.5 1.5 0 0 1 16 5.5V7" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function IconTrends() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 15l5-5 3.5 3.5L20 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M15 6h5v5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconChevron({ open }: { open: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className={`sidebar__chevron${open ? " sidebar__chevron--open" : ""}`}
    >
      <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function navLinkClass({ isActive }: { isActive: boolean }) {
  return `sidebar__nav-link${isActive ? " sidebar__nav-link--active" : ""}`;
}

export default function Sidebar() {
  const navigate = useNavigate();
  const wl = useWatchlists();
  const pf = usePortfolios();

  // Collapse state per watchlist; groups default to open (undefined === open).
  const [collapsed, setCollapsed] = useState<Record<number, boolean>>({});
  const isOpen = (id: number) => !collapsed[id];
  const toggle = (id: number) =>
    setCollapsed((prev) => ({ ...prev, [id]: !prev[id] }));

  async function onCreatePortfolio() {
    const name = window.prompt("Name your portfolio")?.trim();
    if (!name) return;
    const meta = await pf.create(name);
    if (meta) navigate(`/portfolio/${meta.id}`);
  }

  async function onCreateWatchlist() {
    const name = window.prompt("Name your watchlist")?.trim();
    if (!name) return;
    const meta = await wl.create(name);
    if (meta) {
      setCollapsed((prev) => ({ ...prev, [meta.id]: false }));
      navigate(`/watchlist/${meta.id}`);
    }
  }

  async function onAddSymbol(listId: number) {
    const raw = window.prompt("Add a symbol (ticker)")?.trim();
    if (!raw) return;
    await wl.addItem(listId, raw.toUpperCase());
    setCollapsed((prev) => ({ ...prev, [listId]: false }));
  }

  function onRemoveSymbol(e: React.MouseEvent, listId: number, ticker: string) {
    e.preventDefault();
    e.stopPropagation();
    void wl.removeItem(listId, ticker);
  }

  return (
    <aside className="sidebar">
      <div className="sidebar__header">
        <h2 className="sidebar__title">Lists</h2>
        <button type="button" className="gf-icon-btn" aria-label="List options">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
            <circle cx="12" cy="5" r="1.6" fill="currentColor" />
            <circle cx="12" cy="12" r="1.6" fill="currentColor" />
            <circle cx="12" cy="19" r="1.6" fill="currentColor" />
          </svg>
        </button>
      </div>

      {/* Primary navigation */}
      <nav className="sidebar__nav">
        <NavLink to="/" end className={navLinkClass}>
          <span className="sidebar__nav-icon">
            <IconHome />
          </span>
          Home
        </NavLink>
        <NavLink to="/portfolio" className={navLinkClass}>
          <span className="sidebar__nav-icon">
            <IconPortfolio />
          </span>
          Portfolio
        </NavLink>
        <NavLink to="/markets" className={navLinkClass}>
          <span className="sidebar__nav-icon">
            <IconTrends />
          </span>
          Market trends
        </NavLink>
      </nav>

      <div className="gf-divider sidebar__rule" />

      {/* Portfolios */}
      <div className="sidebar__section-label">PORTFOLIOS</div>
      {pf.loading ? (
        <div className="sidebar__rows">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="gf-skeleton sidebar__skeleton sidebar__skeleton--sm" />
          ))}
        </div>
      ) : (
        <div className="sidebar__pf-list">
          {pf.portfolios.map((p) => (
            <NavLink key={p.id} to={`/portfolio/${p.id}`} className={navLinkClass}>
              <span className="sidebar__nav-icon">
                <IconPortfolio />
              </span>
              <span className="sidebar__pf-name">{p.name}</span>
            </NavLink>
          ))}
        </div>
      )}
      <button type="button" className="sidebar__create" onClick={onCreatePortfolio}>
        <span className="sidebar__create-plus" aria-hidden>
          +
        </span>
        Create portfolio
      </button>

      <div className="gf-divider sidebar__rule" />

      {/* Watchlists */}
      <div className="sidebar__section-label">WATCHLISTS</div>

      {wl.loading && (
        <div className="sidebar__rows">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="gf-skeleton sidebar__skeleton" />
          ))}
        </div>
      )}

      {!wl.loading &&
        wl.watchlists.map((list) => {
          const open = isOpen(list.id);
          return (
            <div key={list.id} className="sidebar__group">
              <div className="sidebar__group-head">
                <button
                  type="button"
                  className="sidebar__group-toggle"
                  aria-label={open ? "Collapse list" : "Expand list"}
                  aria-expanded={open}
                  onClick={() => toggle(list.id)}
                >
                  <IconChevron open={open} />
                </button>
                <Link to={`/watchlist/${list.id}`} className="sidebar__group-name">
                  <span className="sidebar__group-title">{list.name}</span>
                  <span className="sidebar__group-count">{list.tickers.length}</span>
                </Link>
                <button
                  type="button"
                  className="sidebar__group-add gf-icon-btn"
                  aria-label={`Add symbol to ${list.name}`}
                  title="Add symbol"
                  onClick={() => onAddSymbol(list.id)}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  </svg>
                </button>
              </div>

              {open && (
                <div className="sidebar__members">
                  {list.tickers.length === 0 ? (
                    <button
                      type="button"
                      className="sidebar__add-symbol"
                      onClick={() => onAddSymbol(list.id)}
                    >
                      + Add symbol
                    </button>
                  ) : (
                    list.tickers.map((ticker) => (
                      <Link key={ticker} to={`/quote/${ticker}`} className="sidebar__member">
                        <span className="sidebar__member-ticker">{ticker}</span>
                        <button
                          type="button"
                          className="sidebar__member-remove"
                          aria-label={`Remove ${ticker}`}
                          title={`Remove ${ticker}`}
                          onClick={(e) => onRemoveSymbol(e, list.id, ticker)}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                            <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                          </svg>
                        </button>
                      </Link>
                    ))
                  )}
                </div>
              )}
            </div>
          );
        })}

      {!wl.loading && wl.watchlists.length === 0 && (
        <div className="sidebar__empty text-muted">No watchlists yet</div>
      )}

      <button type="button" className="sidebar__create" onClick={onCreateWatchlist}>
        <span className="sidebar__create-plus" aria-hidden>
          +
        </span>
        Create watchlist
      </button>
    </aside>
  );
}
