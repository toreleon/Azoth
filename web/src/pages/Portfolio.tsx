import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { usePortfolios } from "../lib/userData";
import { api } from "../lib/api";
import type { PortfolioResponse } from "../lib/types";
import PortfolioSummary from "../components/PortfolioSummary";
import HoldingsTable from "../components/HoldingsTable";
import AddHoldingForm from "../components/AddHoldingForm";
import "./Portfolio.css";

export default function Portfolio() {
  const { id } = useParams();
  const navigate = useNavigate();
  const {
    portfolios,
    loading: portfoliosLoading,
    create,
    rename,
    remove,
  } = usePortfolios();

  const activeId = id ? Number(id) : null;

  const [data, setData] = useState<PortfolioResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const refetch = useCallback(() => setReloadKey((k) => k + 1), []);

  // With no :id in the URL, land on the first portfolio (or fall through to the
  // empty state below once we know there are none).
  useEffect(() => {
    if (id || portfoliosLoading) return;
    if (portfolios.length > 0) {
      navigate(`/portfolio/${portfolios[0].id}`, { replace: true });
    }
  }, [id, portfolios, portfoliosLoading, navigate]);

  // Load the active portfolio (with computed quotes) on id change / after mutations.
  useEffect(() => {
    if (activeId == null) {
      setData(null);
      setLoading(false);
      return;
    }
    const ac = new AbortController();
    setLoading(true);
    setError(null);
    api.portfolios
      .get(activeId, ac.signal)
      .then(setData)
      .catch((e) => {
        if (e?.name !== "AbortError") setError(e?.message || "Failed to load portfolio");
      })
      .finally(() => setLoading(false));
    return () => ac.abort();
  }, [activeId, reloadKey]);

  const handleCreate = useCallback(async () => {
    const name = window.prompt("Name your portfolio", "My portfolio")?.trim();
    if (!name) return;
    const meta = await create(name);
    if (meta) navigate(`/portfolio/${meta.id}`);
  }, [create, navigate]);

  async function handleRename() {
    if (activeId == null || !data) return;
    const name = window.prompt("Rename portfolio", data.name)?.trim();
    if (!name || name === data.name) return;
    await rename(activeId, name);
    refetch();
  }

  async function handleDelete() {
    if (activeId == null || !data) return;
    if (!window.confirm(`Delete "${data.name}"? This can't be undone.`)) return;
    await remove(activeId);
    navigate("/portfolio", { replace: true });
  }

  // ---- No portfolio selected yet -------------------------------------------
  if (activeId == null) {
    if (!portfoliosLoading && portfolios.length === 0) {
      return (
        <div className="portfolio">
          <div className="gf-card portfolio__empty">
            <h1 className="portfolio__empty-title">Track a portfolio</h1>
            <p className="text-secondary portfolio__empty-copy">
              Build a manually-entered portfolio to follow your holdings with live Vietnam-market
              prices. It isn't linked to any broker account.
            </p>
            <button
              type="button"
              className="gf-pill gf-pill--active portfolio__empty-btn"
              onClick={handleCreate}
            >
              + Create portfolio
            </button>
          </div>
        </div>
      );
    }
    // Loading portfolios, or a redirect to the first one is in flight.
    return (
      <div className="portfolio">
        <div className="gf-skeleton portfolio__skel-head" />
        <div className="gf-skeleton portfolio__skel-card" />
      </div>
    );
  }

  // ---- Failed to load the selected portfolio -------------------------------
  if (error && !data) {
    return (
      <div className="portfolio">
        <div className="gf-card portfolio__error">
          <p>Couldn't load this portfolio.</p>
          <p className="text-secondary">{error}</p>
          <Link to="/portfolio" className="portfolio__back">
            ← All portfolios
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="portfolio">
      <header className="portfolio__head">
        <div className="portfolio__title-wrap">
          {data ? (
            <h1 className="portfolio__title">{data.name}</h1>
          ) : (
            <div className="gf-skeleton portfolio__title-skel" />
          )}
          <span className="gf-chip portfolio__chip">Manual</span>
        </div>
        <div className="portfolio__actions">
          <button
            type="button"
            className="gf-pill portfolio__act"
            onClick={handleRename}
            disabled={!data}
          >
            Rename
          </button>
          <button
            type="button"
            className="gf-pill portfolio__act"
            onClick={handleDelete}
            disabled={!data}
          >
            Delete
          </button>
          <button type="button" className="gf-pill portfolio__act" onClick={handleCreate}>
            + New
          </button>
        </div>
      </header>

      {portfolios.length > 1 && (
        <nav className="portfolio__switch" aria-label="Switch portfolio">
          {portfolios.map((p) => (
            <Link
              key={p.id}
              to={`/portfolio/${p.id}`}
              className={`gf-pill portfolio__switch-pill${p.id === activeId ? " gf-pill--active" : ""}`}
            >
              {p.name}
            </Link>
          ))}
        </nav>
      )}

      {loading || !data ? (
        <div className="gf-skeleton portfolio__skel-card" />
      ) : (
        <>
          <PortfolioSummary totals={data.totals} />
          <p className="portfolio__disclaimer text-muted">
            Manually-entered portfolio — values use live market prices but are not linked to a
            broker account.
          </p>
          <HoldingsTable holdings={data.holdings} onChanged={refetch} />
          <AddHoldingForm portfolioId={activeId} onAdded={refetch} />
        </>
      )}
    </div>
  );
}
