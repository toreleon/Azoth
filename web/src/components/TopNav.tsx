import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import { fmtPriceVnd } from "../lib/format";
import ChangeBadge from "./ChangeBadge";
import type { SearchResult } from "../lib/types";
import "./TopNav.css";

const THEME_KEY = "azoth-theme";
const RECENT_KEY = "azoth-recent";
const MAX_RECENT = 5;
type Theme = "light" | "dark";

/** Recently opened tickers, most recent first (Google Finance shows these too). */
function readRecent(): SearchResult[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((r): r is SearchResult => Boolean(r) && typeof (r as SearchResult).ticker === "string")
      .slice(0, MAX_RECENT);
  } catch {
    return [];
  }
}

function pushRecent(entry: SearchResult): SearchResult[] {
  const next = [
    { ticker: entry.ticker, name: entry.name, exchange: entry.exchange },
    ...readRecent().filter((r) => r.ticker !== entry.ticker),
  ].slice(0, MAX_RECENT);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable — recents are best-effort */
  }
  return next;
}

function currentTheme(): Theme {
  const attr = document.documentElement.getAttribute("data-theme");
  if (attr === "light" || attr === "dark") return attr;
  const stored = localStorage.getItem(THEME_KEY);
  if (stored === "light" || stored === "dark") return stored;
  // Default to light (like Google Finance), ignoring the OS dark-mode setting.
  return "light";
}

function BarChartGlyph() {
  return (
    <svg
      className="topnav__logo"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="var(--accent)"
      aria-hidden="true"
    >
      <rect x="3" y="12" width="4" height="9" rx="1" />
      <rect x="10" y="7" width="4" height="14" rx="1" />
      <rect x="17" y="3" width="4" height="18" rx="1" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
      <line x1="16.5" y1="16.5" x2="21" y2="21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="4.5" stroke="currentColor" strokeWidth="2" />
      <g stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <line x1="12" y1="2" x2="12" y2="4.5" />
        <line x1="12" y1="19.5" x2="12" y2="22" />
        <line x1="2" y1="12" x2="4.5" y2="12" />
        <line x1="19.5" y1="12" x2="22" y2="12" />
        <line x1="4.9" y1="4.9" x2="6.7" y2="6.7" />
        <line x1="17.3" y1="17.3" x2="19.1" y2="19.1" />
        <line x1="4.9" y1="19.1" x2="6.7" y2="17.3" />
        <line x1="17.3" y1="6.7" x2="19.1" y2="4.9" />
      </g>
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M20 14.5A8 8 0 0 1 9.5 4a7 7 0 1 0 10.5 10.5Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
      <path
        d="M12 2.5v2.2M12 19.3v2.2M4.9 4.9l1.6 1.6M17.5 17.5l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.9 19.1l1.6-1.6M17.5 6.5l1.6-1.6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function TopNav() {
  const navigate = useNavigate();
  const [theme, setTheme] = useState<Theme>(() => currentTheme());

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [recent, setRecent] = useState<SearchResult[]>(() => readRecent());

  const rootRef = useRef<HTMLDivElement>(null);

  // With an empty box we show recents instead of results (Google Finance does this).
  const showingRecent = query.trim().length === 0;
  const visible = showingRecent ? recent : results;

  // Apply + persist theme.
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((t) => (t === "dark" ? "light" : "dark"));
  }, []);

  // Debounced search.
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      setOpen(false);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      api
        .search(q, controller.signal)
        .then((res) => {
          setResults(res.results);
          setHighlight(0);
          setOpen(true);
        })
        .catch((err) => {
          if (err instanceof DOMException && err.name === "AbortError") return;
          if (err instanceof ApiError || err instanceof Error) {
            setResults([]);
            setOpen(false);
          }
        });
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  // Close on outside click.
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const goTo = useCallback(
    (entry: SearchResult) => {
      setRecent(pushRecent(entry));
      setQuery("");
      setResults([]);
      setOpen(false);
      navigate(`/quote/${entry.ticker}`);
    },
    [navigate],
  );

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || visible.length === 0) {
      if (e.key === "Escape") setOpen(false);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => (h + 1) % visible.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => (h - 1 + visible.length) % visible.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const pick = visible[highlight] ?? visible[0];
      if (pick) goTo(pick);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  const showDropdown = open && visible.length > 0;

  return (
    <header className="topnav">
      <div className="topnav__inner">
        {/* Left — brand */}
        <Link to="/" className="topnav__brand" aria-label="Azoth Finance home">
          <BarChartGlyph />
          <span className="topnav__wordmark">
            <span className="topnav__wordmark-name">Azoth</span>
            <span className="topnav__wordmark-sub">Finance</span>
          </span>
          <span className="gf-chip topnav__beta">Beta</span>
        </Link>

        {/* Center — search */}
        <div className="topnav__search" ref={rootRef}>
          <div className="topnav__search-field">
            <span className="topnav__search-icon" aria-hidden="true">
              <SearchIcon />
            </span>
            <input
              className="topnav__search-input"
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              onFocus={() => {
                setHighlight(0);
                if (visible.length > 0) setOpen(true);
              }}
              placeholder="Search stocks, tickers, companies"
              aria-label="Search stocks, tickers, companies"
              role="combobox"
              aria-expanded={showDropdown}
              aria-controls="topnav-search-results"
              aria-autocomplete="list"
              autoComplete="off"
            />
          </div>

          {showDropdown && (
            <div className="gf-card topnav__results" id="topnav-search-results">
              {showingRecent && <div className="topnav__results-label">Recent searches</div>}
              <ul className="topnav__results-list" role="listbox">
                {visible.map((r, i) => (
                  <li key={r.ticker} role="option" aria-selected={i === highlight}>
                    <button
                      type="button"
                      className={`topnav__result${i === highlight ? " topnav__result--active" : ""}`}
                      onMouseEnter={() => setHighlight(i)}
                      onClick={() => goTo(r)}
                    >
                      <span className="topnav__result-id">
                        <span className="topnav__result-ticker mono">{r.ticker}</span>
                        <span className="topnav__result-name">{r.name ?? ""}</span>
                      </span>
                      {r.exchange && (
                        <span className="gf-chip topnav__result-exch">{r.exchange}</span>
                      )}
                      {r.last != null && (
                        <span className="topnav__result-quote">
                          <span className="topnav__result-price mono">{fmtPriceVnd(r.last)}</span>
                          <ChangeBadge pct={r.change_pct ?? null} size="sm" dot={false} />
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Right — actions */}
        <div className="topnav__actions">
          <button
            type="button"
            className="gf-icon-btn"
            onClick={toggleTheme}
            aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
          >
            {theme === "dark" ? <SunIcon /> : <MoonIcon />}
          </button>
          <button type="button" className="gf-icon-btn topnav__settings" aria-label="Settings">
            <GearIcon />
          </button>
          <button type="button" className="topnav__signin">
            Sign in
          </button>
        </div>
      </div>
    </header>
  );
}
