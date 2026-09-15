import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import type { WatchlistDetail } from "../lib/types";
import { dirOf, fmtChangeVnd, fmtPriceVnd } from "../lib/format";
import { useWatchlists } from "../lib/userData";
import Sparkline from "../components/Sparkline";
import ChangeBadge from "../components/ChangeBadge";
import "./WatchlistPage.css";

export default function WatchlistPage() {
  const { id: idParam } = useParams();
  const id = Number(idParam);
  const navigate = useNavigate();
  const { rename, remove, addItem, removeItem } = useWatchlists();

  const [detail, setDetail] = useState<WatchlistDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [input, setInput] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      if (!Number.isFinite(id)) {
        setDetail(null);
        setError("notfound");
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const d = await api.watchlists.get(id, signal);
        setDetail(d);
      } catch (e: any) {
        if (e?.name === "AbortError") return;
        setDetail(null);
        setError(e instanceof ApiError && e.status === 404 ? "notfound" : e?.message || "Failed to load");
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [id],
  );

  useEffect(() => {
    const ac = new AbortController();
    setInput("");
    setAddError(null);
    setActionError(null);
    load(ac.signal);
    return () => ac.abort();
  }, [load]);

  const sanitized = useMemo(() => input.toUpperCase().replace(/[^A-Z0-9]/g, ""), [input]);
  const canAdd = /^[A-Z0-9]{3,}$/.test(sanitized) && !busy;

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    if (!canAdd) return;
    setBusy(true);
    setAddError(null);
    setActionError(null);
    try {
      await addItem(id, sanitized);
      setInput("");
      await load();
    } catch (err: any) {
      setAddError(err?.message || `Couldn't add ${sanitized}`);
    } finally {
      setBusy(false);
    }
  }

  async function onRemove(ticker: string) {
    setBusy(true);
    setActionError(null);
    try {
      await removeItem(id, ticker);
      await load();
    } catch (err: any) {
      setActionError(err?.message || `Couldn't remove ${ticker}`);
    } finally {
      setBusy(false);
    }
  }

  async function onRename() {
    const current = detail?.name ?? "";
    const next = window.prompt("Rename watchlist", current);
    if (next == null) return;
    const trimmed = next.trim();
    if (!trimmed || trimmed === current) return;
    setBusy(true);
    setActionError(null);
    try {
      await rename(id, trimmed);
      await load();
    } catch (err: any) {
      setActionError(err?.message || "Couldn't rename watchlist");
    } finally {
      setBusy(false);
    }
  }

  async function onDelete() {
    const label = detail?.name ?? "this watchlist";
    if (!window.confirm(`Delete "${label}"? This can't be undone.`)) return;
    setBusy(true);
    setActionError(null);
    try {
      await remove(id);
      navigate("/");
    } catch (err: any) {
      setActionError(err?.message || "Couldn't delete watchlist");
      setBusy(false);
    }
  }

  // --- Not-found / hard error -------------------------------------------------
  if (error === "notfound") {
    return (
      <div className="wl">
        <div className="wl__error gf-card">
          <p className="wl__error-title">Watchlist not found</p>
          <p className="text-secondary">It may have been deleted or the link is out of date.</p>
          <Link to="/" className="wl__back">
            ← Back to markets
          </Link>
        </div>
      </div>
    );
  }

  if (error && !detail) {
    return (
      <div className="wl">
        <div className="wl__error gf-card">
          <p className="wl__error-title">Couldn't load this watchlist</p>
          <p className="text-secondary">{error}</p>
          <button type="button" className="gf-pill wl__retry" onClick={() => load()}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  const rows = detail?.rows ?? [];
  const count = rows.length;

  return (
    <div className="wl">
      <header className="wl__head">
        <div className="wl__titles">
          {loading && !detail ? (
            <>
              <span className="gf-skeleton wl__skel-title" />
              <span className="gf-skeleton wl__skel-sub" />
            </>
          ) : (
            <>
              <h1 className="wl__title">{detail?.name}</h1>
              <p className="wl__count text-secondary">
                {count} {count === 1 ? "symbol" : "symbols"}
              </p>
            </>
          )}
        </div>
        <div className="wl__actions">
          <button
            type="button"
            className="gf-pill"
            onClick={onRename}
            disabled={busy || !detail}
          >
            Rename
          </button>
          <button
            type="button"
            className="gf-pill wl__delete"
            onClick={onDelete}
            disabled={busy || !detail}
          >
            Delete
          </button>
        </div>
      </header>

      <form className="wl__add" onSubmit={onAdd}>
        <input
          className="wl__input mono"
          type="text"
          inputMode="text"
          autoComplete="off"
          spellCheck={false}
          placeholder="Add symbol (e.g. FPT)"
          aria-label="Add symbol to watchlist"
          value={input}
          maxLength={12}
          onChange={(e) => {
            setInput(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""));
            if (addError) setAddError(null);
          }}
        />
        <button type="submit" className="gf-pill gf-pill--active wl__add-btn" disabled={!canAdd}>
          Add
        </button>
      </form>
      {addError && <p className="wl__msg down">{addError}</p>}
      {actionError && <p className="wl__msg down">{actionError}</p>}

      <section className="gf-card wl__card">
        <div className="wl__scroll">
          <table className="wl__table">
            <thead>
              <tr className="wl__colhead">
                <th className="wl__th wl__th--sym">Symbol</th>
                <th className="wl__th wl__th--spark" aria-hidden />
                <th className="wl__th wl__th--num">Price</th>
                <th className="wl__th wl__th--num">Change</th>
                <th className="wl__th wl__th--num">% Change</th>
                <th className="wl__th wl__th--act" aria-hidden />
              </tr>
            </thead>
            <tbody>
              {loading && !detail ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr className="wl__row" key={i}>
                    <td className="wl__td wl__td--sym">
                      <span className="gf-skeleton wl__skel-ticker" />
                      <span className="gf-skeleton wl__skel-name" />
                    </td>
                    <td className="wl__td wl__td--spark">
                      <span className="gf-skeleton wl__skel-spark" />
                    </td>
                    <td className="wl__td wl__td--num">
                      <span className="gf-skeleton wl__skel-num" />
                    </td>
                    <td className="wl__td wl__td--num">
                      <span className="gf-skeleton wl__skel-num" />
                    </td>
                    <td className="wl__td wl__td--num">
                      <span className="gf-skeleton wl__skel-num" />
                    </td>
                    <td className="wl__td wl__td--act" />
                  </tr>
                ))
              ) : count === 0 ? (
                <tr>
                  <td className="wl__empty" colSpan={6}>
                    <p className="wl__empty-title">No symbols yet</p>
                    <p className="text-secondary">
                      Add a ticker above to start tracking it. Prices, day change, and a mini chart
                      show up here.
                    </p>
                  </td>
                </tr>
              ) : (
                rows.map((row) => {
                  const dir = dirOf(row.change_abs);
                  return (
                    <tr className="wl__row" key={row.ticker}>
                      <td className="wl__td wl__td--sym">
                        <Link to={`/quote/${row.ticker}`} className="wl__symlink">
                          <span className="wl__ticker">{row.ticker}</span>
                          {row.name && <span className="wl__name">{row.name}</span>}
                        </Link>
                      </td>
                      <td className="wl__td wl__td--spark">
                        <Sparkline data={row.spark} width={112} height={32} fill />
                      </td>
                      <td className="wl__td wl__td--num mono">{fmtPriceVnd(row.last)}</td>
                      <td className={`wl__td wl__td--num mono ${dir}`}>{fmtChangeVnd(row.change_abs)}</td>
                      <td className="wl__td wl__td--num">
                        <span className="wl__badge-wrap">
                          <ChangeBadge pct={row.change_pct} size="sm" />
                        </span>
                      </td>
                      <td className="wl__td wl__td--act">
                        <button
                          type="button"
                          className="wl__remove"
                          aria-label={`Remove ${row.ticker}`}
                          title={`Remove ${row.ticker}`}
                          disabled={busy}
                          onClick={() => onRemove(row.ticker)}
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
