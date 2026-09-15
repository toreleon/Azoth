import { useState, type FormEvent } from "react";
import { api } from "../lib/api";
import "./AddHoldingForm.css";

interface Props {
  portfolioId: number;
  onAdded: () => void;
}

export default function AddHoldingForm({ portfolioId, onAdded }: Props) {
  const [ticker, setTicker] = useState("");
  const [quantity, setQuantity] = useState("");
  const [avgCost, setAvgCost] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const sym = ticker.trim().toUpperCase();
    // Avg cost is PLAIN VND per share — pass straight through, no scaling.
    const qty = Number(quantity.replace(/[^0-9.]/g, ""));
    const avgCostVnd = Number(avgCost.replace(/[^0-9.]/g, ""));

    if (!sym) {
      setError("Enter a ticker symbol.");
      return;
    }
    if (!Number.isFinite(qty) || qty <= 0) {
      setError("Enter a quantity greater than 0.");
      return;
    }
    if (!Number.isFinite(avgCostVnd) || avgCostVnd <= 0) {
      setError("Enter an average cost in ₫.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await api.portfolios.addHolding(portfolioId, { ticker: sym, quantity: qty, avgCostVnd });
      setTicker("");
      setQuantity("");
      setAvgCost("");
      onAdded();
    } catch (err) {
      setError((err as Error)?.message || "Couldn't add holding.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="gf-card addhold" onSubmit={onSubmit}>
      <h3 className="addhold__title">Add holding</h3>
      <div className="addhold__row">
        <label className="addhold__field addhold__field--sym">
          <span className="addhold__label text-secondary">Ticker</span>
          <input
            className="addhold__input"
            value={ticker}
            onChange={(e) => setTicker(e.target.value.toUpperCase().replace(/[^A-Z]/g, ""))}
            placeholder="e.g. FPT"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
          />
        </label>
        <label className="addhold__field">
          <span className="addhold__label text-secondary">Quantity</span>
          <input
            className="addhold__input"
            type="number"
            min={0}
            step={100}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder="100"
          />
        </label>
        <label className="addhold__field">
          <span className="addhold__label text-secondary">Avg cost (₫)</span>
          <input
            className="addhold__input"
            inputMode="numeric"
            value={avgCost}
            onChange={(e) => setAvgCost(e.target.value)}
            placeholder="64,800"
          />
        </label>
        <button
          type="submit"
          className="gf-pill gf-pill--active addhold__submit"
          disabled={submitting}
        >
          {submitting ? "Adding…" : "Add"}
        </button>
      </div>
      <p className="addhold__hint text-muted">
        HOSE lots are multiples of 100. Avg cost is the price you paid per share, in đồng
        (e.g. 64,800).
      </p>
      {error && <p className="addhold__error down">{error}</p>}
    </form>
  );
}
