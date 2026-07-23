import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import "./QuoteHeader.css";
import ChangeBadge from "./ChangeBadge";
import {
  fmtPriceVnd,
  fmtChangeVnd,
  fmtPct,
  fmtBoard,
  dirOf,
  sessionLabel,
} from "../lib/format";
import { useWatchlists } from "../lib/userData";
import type { QuoteResponse } from "../lib/types";

interface Props {
  quote: QuoteResponse;
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M20 6 9 17l-5-5"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function QuoteHeader({ quote }: Props) {
  const name = quote.nameEn || quote.nameVi || quote.ticker;
  const dir = dirOf(quote.change_pct);
  const ticker = quote.ticker.toUpperCase();

  const { watchlists, loading, create, addItem, removeItem, isSaved } = useWatchlists();
  const saved = isSaved(ticker);

  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // Close the popover on outside click or Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const toggleList = async (id: number, inList: boolean) => {
    try {
      if (inList) await removeItem(id, ticker);
      else await addItem(id, ticker);
    } catch {
      /* keep popover open; state stays consistent with server on next load */
    }
  };

  const handleNewList = async () => {
    const raw = window.prompt(`Name the new watchlist for ${ticker}`);
    const nm = raw?.trim();
    if (!nm) return;
    try {
      const created = await create(nm);
      if (created) await addItem(created.id, ticker);
    } catch {
      /* ignore */
    }
  };

  return (
    <header className="qh">
      <div className="qh__crumb">
        <Link to="/" className="qh__crumb-link">
          Home
        </Link>
        <span className="qh__crumb-sep"> / </span>
        <span className="qh__crumb-cur text-muted">
          {quote.ticker}:{quote.exchange ?? ""}
        </span>
      </div>

      <div className="qh__title-row">
        <h1 className="qh__name">{name}</h1>
        <div className="qh__actions">
          <div className="qh__addwrap" ref={wrapRef}>
            <button
              type="button"
              className={`gf-pill qh__add${saved ? " gf-pill--active qh__add--saved" : ""}`}
              aria-haspopup="menu"
              aria-expanded={open}
              aria-label={saved ? `Edit watchlists for ${ticker}` : `Add ${ticker} to a watchlist`}
              onClick={() => setOpen((o) => !o)}
            >
              <span aria-hidden="true">{saved ? <CheckIcon /> : "＋"}</span>
              <span>{saved ? "In lists" : "Add to list"}</span>
            </button>

            {open && (
              <div className="gf-card qh__addpop" role="menu" aria-label="Save to watchlist">
                <div className="qh__addpop-head gf-section-title">Save to watchlist</div>

                <div className="qh__addpop-list">
                  {loading ? (
                    <div className="qh__addpop-empty text-muted">Loading…</div>
                  ) : watchlists.length === 0 ? (
                    <div className="qh__addpop-empty text-muted">No watchlists yet</div>
                  ) : (
                    watchlists.map((list) => {
                      const inList = list.tickers.includes(ticker);
                      return (
                        <button
                          key={list.id}
                          type="button"
                          role="menuitemcheckbox"
                          aria-checked={inList}
                          className={`qh__addpop-item${inList ? " is-checked" : ""}`}
                          onClick={() => toggleList(list.id, inList)}
                        >
                          <span className="qh__addpop-box" aria-hidden="true">
                            {inList && <CheckIcon />}
                          </span>
                          <span className="qh__addpop-name">{list.name}</span>
                        </button>
                      );
                    })
                  )}
                </div>

                <div className="qh__addpop-divider" role="separator" />

                <button type="button" className="qh__addpop-new" onClick={handleNewList}>
                  <span aria-hidden="true">＋</span>
                  <span>New watchlist</span>
                </button>
              </div>
            )}
          </div>

          <button type="button" className="gf-icon-btn" aria-label={`Share ${quote.ticker}`}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M18 8a3 3 0 1 0-2.83-4M18 8a3 3 0 0 1-2.83-2M18 8l-8.5 4.5M6 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm3-1.5L17 18M18 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      </div>

      <div className="qh__price-row">
        <span className="qh__price mono">{fmtPriceVnd(quote.last)}</span>
        <span className={`qh__change qh__change--${dir}`}>
          <ChangeBadge
            pct={quote.change_pct}
            text={`${fmtChangeVnd(quote.change_abs)} (${fmtPct(quote.change_pct)})`}
            size="lg"
          />
          <span className="qh__today">Today</span>
        </span>
      </div>

      <div className="qh__subline">
        <span className="gf-chip qh__session">
          <span
            className="qh__session-dot"
            style={{ background: quote.isOpen ? "var(--up-strong)" : "var(--text-muted)" }}
            aria-hidden="true"
          />
          {sessionLabel(quote.session, quote.isOpen)}
        </span>
        <span className="qh__meta text-secondary">
          Ref <span className="mono">{fmtPriceVnd(quote.ref, { suffix: false })}</span>
        </span>
        <span className="qh__meta text-secondary">
          Ceiling <span className="mono qh__ceiling">{fmtBoard(quote.ceiling)}</span>
        </span>
        <span className="qh__meta text-secondary">
          Floor <span className="mono qh__floor">{fmtBoard(quote.floor)}</span>
        </span>
      </div>
    </header>
  );
}
