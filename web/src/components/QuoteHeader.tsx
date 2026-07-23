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
import type { QuoteResponse } from "../lib/types";

interface Props {
  quote: QuoteResponse;
}

export default function QuoteHeader({ quote }: Props) {
  const name = quote.nameEn || quote.nameVi || quote.ticker;
  const dir = dirOf(quote.change_pct);

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
          <button type="button" className="gf-pill" aria-label={`Add ${quote.ticker} to a list`}>
            <span aria-hidden="true">＋</span>
            <span>Add to list</span>
          </button>
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
