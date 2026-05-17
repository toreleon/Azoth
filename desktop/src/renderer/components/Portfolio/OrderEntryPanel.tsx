import { useState } from "react";
import type { PortfolioPlaceOrderRes } from "../../../shared/ipc.js";

type Side = "BUY" | "SELL";
type OrderType = "MARKET" | "LIMIT";

export function OrderEntryPanel({ onPlaced }: { onPlaced: () => void }) {
  const [ticker, setTicker] = useState("");
  const [side, setSide] = useState<Side>("BUY");
  const [type, setType] = useState<OrderType>("LIMIT");
  const [quantity, setQuantity] = useState<string>("100");
  const [limitPrice, setLimitPrice] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<PortfolioPlaceOrderRes | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const qty = Number.parseInt(quantity, 10);
    const price = limitPrice ? Number.parseFloat(limitPrice) : undefined;
    if (!ticker.trim() || !Number.isFinite(qty) || qty <= 0) return;
    if (type === "LIMIT" && (price == null || !Number.isFinite(price) || price <= 0)) {
      setResult({
        ok: false,
        error: "guardrail_blocked",
        reasons: ["LIMIT order requires a positive limit price (thousand VND)."],
      });
      return;
    }

    setBusy(true);
    setResult(null);
    try {
      const res = await window.azoth.invoke("portfolio:placeOrder", {
        ticker: ticker.trim().toUpperCase(),
        side,
        type,
        quantity: qty,
        limitPrice: price,
        notes: notes.trim() || undefined,
      });
      setResult(res);
      if (res.ok) {
        onPlaced();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setResult({ ok: false, error: "broker_error", message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="portfolio-card ds-card portfolio-order-entry">
      <div className="portfolio-card-header">
        <div>
          <span className="ds-kicker">Trade ticket</span>
          <h2 className="ds-title">Place order</h2>
        </div>
      </div>
      <form className="portfolio-form" onSubmit={submit}>
        <label className="ds-field">
          <span className="ds-field-label">Ticker</span>
          <input
            className="ds-input portfolio-symbol-input"
            type="text"
            value={ticker}
            onChange={(e) => setTicker(e.target.value.toUpperCase())}
            placeholder="e.g. VNM"
            maxLength={12}
            autoComplete="off"
            required
          />
        </label>

        <div className="portfolio-segment" role="group" aria-label="Side">
          <button
            type="button"
            className={`portfolio-segment-option ${side === "BUY" ? "is-active portfolio-side-buy" : ""}`}
            onClick={() => setSide("BUY")}
          >
            BUY
          </button>
          <button
            type="button"
            className={`portfolio-segment-option ${side === "SELL" ? "is-active portfolio-side-sell" : ""}`}
            onClick={() => setSide("SELL")}
          >
            SELL
          </button>
        </div>

        <div className="portfolio-segment" role="group" aria-label="Order type">
          <button
            type="button"
            className={`portfolio-segment-option ${type === "LIMIT" ? "is-active" : ""}`}
            onClick={() => setType("LIMIT")}
          >
            LIMIT
          </button>
          <button
            type="button"
            className={`portfolio-segment-option ${type === "MARKET" ? "is-active" : ""}`}
            onClick={() => setType("MARKET")}
          >
            MARKET
          </button>
        </div>

        <label className="ds-field">
          <span className="ds-field-label">Quantity (HOSE lot = 100)</span>
          <input
            className="ds-input"
            type="number"
            min={100}
            step={100}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            required
          />
        </label>

        {type === "LIMIT" ? (
          <label className="ds-field">
            <span className="ds-field-label">Limit price (thousand VND)</span>
            <input
              className="ds-input"
              type="number"
              min={0}
              step={0.05}
              value={limitPrice}
              onChange={(e) => setLimitPrice(e.target.value)}
              required
            />
          </label>
        ) : null}

        <label className="ds-field">
          <span className="ds-field-label">Notes (optional)</span>
          <input
            className="ds-input"
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={120}
          />
        </label>

        <button
          type="submit"
          className={`ds-button primary full-width portfolio-submit portfolio-submit-${side.toLowerCase()}`}
          disabled={busy}
        >
          {busy ? "Submitting..." : `${side} ${ticker || "-"}`}
        </button>

        {result ? <OrderResult result={result} /> : null}
      </form>
    </section>
  );
}

function OrderResult({ result }: { result: PortfolioPlaceOrderRes }) {
  if (result.ok) {
    return (
      <div className="portfolio-result portfolio-result-ok">
        Order {result.order.status.toLowerCase()} #{result.order.id}
      </div>
    );
  }
  if (result.error === "guardrail_blocked") {
    return (
      <div className="portfolio-result portfolio-result-error">
        <div>
          <strong>Blocked by risk guardrails</strong>
        </div>
        <ul>
          {(result.reasons ?? []).map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      </div>
    );
  }
  return (
    <div className="portfolio-result portfolio-result-error">
      {result.message ?? result.error}
    </div>
  );
}
