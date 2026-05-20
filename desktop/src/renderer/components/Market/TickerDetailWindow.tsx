import { useCallback, useEffect, useRef, useState } from "react";
import type { MarketIndexOverview, PortfolioPlaceOrderRes } from "../../../shared/ipc.js";
import {
  MarketLineChart,
  forecastLabel,
  formatClock,
  formatNumber,
  formatPct,
} from "./MarketLineChart.js";

type Resolution = "1D" | "1W" | "1M";
type DisplayTimeframe = "1D" | "1W" | "1M" | "3M" | "1Y" | "All";

const TIMEFRAMES: Array<{ value: DisplayTimeframe; resolution: Resolution; bars: number }> = [
  { value: "1D", resolution: "1D", bars: 80 },
  { value: "1W", resolution: "1W", bars: 80 },
  { value: "1M", resolution: "1M", bars: 80 },
  { value: "3M", resolution: "1M", bars: 240 },
  { value: "1Y", resolution: "1M", bars: 365 },
  { value: "All", resolution: "1M", bars: 720 },
];

const REFRESH_MS = 30_000;

type Side = "BUY" | "SELL";
type OrderType = "LIMIT" | "MARKET" | "STOP";

export function TickerDetailWindow({ initialSymbol }: { initialSymbol: string }) {
  const [symbol, setSymbol] = useState(() => initialSymbol.toUpperCase());
  const [timeframe, setTimeframe] = useState<DisplayTimeframe>("1M");
  const [asset, setAsset] = useState<MarketIndexOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const fetchAsset = useCallback(
    async (sym: string, tf: DisplayTimeframe, silent = false) => {
      const id = ++requestId.current;
      const entry = TIMEFRAMES.find((t) => t.value === tf) ?? TIMEFRAMES[2];
      if (!silent) setLoading(true);
      setError(null);
      try {
        const next = await window.azoth.invoke("market:asset", {
          symbol: sym,
          resolution: entry.resolution,
          bars: entry.bars,
        });
        if (id !== requestId.current) return;
        setAsset(next);
        if (next.error) setError(next.error);
      } catch (err) {
        if (id !== requestId.current) return;
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    void fetchAsset(symbol, timeframe);
  }, [symbol, timeframe, fetchAsset]);

  useEffect(() => {
    setSymbol(initialSymbol.toUpperCase());
  }, [initialSymbol]);

  useEffect(() => {
    const timer = window.setInterval(() => void fetchAsset(symbol, timeframe, true), REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [symbol, timeframe, fetchAsset]);

  const hero = asset ?? placeholder(symbol);
  const change = hero.change ?? 0;
  const changePct = hero.changePct ?? 0;
  const tone = change > 0 ? "up" : change < 0 ? "down" : "flat";

  return (
    <section className="ticker-detail-page" aria-label={`${hero.symbol} detail`}>
      <main className="page">
        <nav className="crumbs">
          <span>Markets</span>
          <span className="sep">/</span>
          <span>{hero.exchange || "VN"}</span>
          <span className="sep">/</span>
          <span className="current">{hero.symbol}</span>
        </nav>

        <section className="detail-head">
          <div className="sym-block">
            <span className="sym-mark lg">{hero.symbol.slice(0, 3)}</span>
            <div className="sym-meta">
              <h1>{hero.name || hero.symbol}</h1>
              <span className="name">
                {hero.symbol}
                {hero.exchange ? ` · ${hero.exchange}` : ""}
                {hero.industry ? ` · ${hero.industry}` : ""}
                {" · Vietnam Dong (₫)"}
              </span>
              <div className="meta">
                <span className="status-bar">
                  <span className="dot" />
                  <span>{hero.quote?.session ?? "Session"}</span>
                </span>
                {hero.updatedAt ? <span>· Last fill {formatClock(hero.updatedAt)}</span> : null}
              </div>
            </div>
          </div>
          <div />
          <div className="price-block">
            <div className="price-now">
              {formatNumber(hero.latestClose)}
              <span className="unit"> K₫</span>
            </div>
            <div className="price-delta">
              <span className={`num ${tone}`}>
                {change > 0 ? "+" : ""}
                {formatNumber(hero.change)} K₫
              </span>
              <span className={`tone-pill ${tone}`}>{formatPct(changePct)}</span>
              <span style={{ color: "var(--meta)", fontSize: "var(--text-xs)" }}>today</span>
            </div>
            <div className="head-actions">
              <button type="button" className="btn btn-secondary">
                Watch
              </button>
              <button type="button" className="btn btn-secondary">
                Alert
              </button>
            </div>
          </div>
        </section>

        {error ? <div className="market-error">{error}</div> : null}

        <div className="detail-grid">
          <div>
            <section className="chart-card">
              <div className="chart-head">
                <div style={{ display: "flex", alignItems: "center", gap: "var(--space-4)" }}>
                  <h3 className="card-title">Price</h3>
                  <div className="chart-legend">
                    <span className="is-price">Close</span>
                    <span className="is-sma">SMA 20</span>
                    {hero.overlays?.rma14 ? <span className="is-rma">RMA 14</span> : null}
                  </div>
                </div>
                <div className="seg" role="group" aria-label="Timeframe">
                  {TIMEFRAMES.map((tf) => (
                    <button
                      key={tf.value}
                      type="button"
                      className={timeframe === tf.value ? "is-active" : ""}
                      onClick={() => setTimeframe(tf.value)}
                    >
                      {tf.value}
                    </button>
                  ))}
                </div>
              </div>
              <div className="chart-body">
                {hero.bars.length > 0 ? (
                  <MarketLineChart index={hero} />
                ) : (
                  <div className="market-empty">{loading ? "Loading chart..." : "No data"}</div>
                )}
              </div>
            </section>

            {hero.forecast ? (
              <div className={`market-forecast-card is-${hero.forecast.direction}`}>
                <div>
                  <span>RMA forecast</span>
                  <strong>{forecastLabel(hero.forecast)}</strong>
                  <small>{hero.forecast.confidence} confidence</small>
                </div>
              </div>
            ) : null}

            <section>
              <p className="kicker" style={{ marginBottom: "var(--space-3)" }}>Key statistics</p>
              <div className="stats-grid">
                <Stat k="Open" v={formatNumber(hero.bars[0]?.o)} />
                <Stat k="Day high" v={formatNumber(hero.high)} tone="up" />
                <Stat k="Day low" v={formatNumber(hero.low)} />
                <Stat k="Prev close" v={formatNumber(hero.previousClose)} />
                <Stat k="Volume" v={formatNumber(hero.volume)} />
                <Stat k="Matched value" v={formatNumber(hero.quote?.matchedVolume)} />
                <Stat k="Market cap" v={formatNumber(hero.marketCap)} />
                <Stat k="Industry" v={hero.industry ?? "—"} />
                <Stat k="Best bid" v={formatNumber(hero.quote?.bestBid)} />
                <Stat k="Best offer" v={formatNumber(hero.quote?.bestOffer)} />
                <Stat k="Session" v={hero.quote?.session ?? "—"} />
                <Stat k="Status" v={hero.quote?.tradingStatus ?? "—"} />
                <Stat
                  k="RMA-14 forecast"
                  v={hero.forecast ? formatPct(hero.forecast.changePct) : "—"}
                  tone={hero.forecast?.direction === "up" ? "up" : hero.forecast?.direction === "down" ? "down" : undefined}
                />
                <Stat k="Confidence" v={hero.forecast?.confidence ?? "—"} />
                <Stat k="Exchange" v={hero.exchange ?? "—"} />
                <Stat k="Bars loaded" v={String(hero.bars.length)} />
              </div>
            </section>

            {hero.intro || hero.website ? (
              <section className="card about-card">
                <div>
                  <h3 className="card-title" style={{ marginBottom: "var(--space-3)" }}>
                    About {hero.name || hero.symbol}
                  </h3>
                  {hero.intro ? <p>{hero.intro}</p> : null}
                </div>
                <div className="links">
                  <span className="kicker">Resources</span>
                  {hero.website ? (
                    <a href={hero.website} target="_blank" rel="noreferrer noopener">
                      Website →
                    </a>
                  ) : null}
                </div>
              </section>
            ) : null}
          </div>

          <aside>
            <TradePanel symbol={hero.symbol} exchange={hero.exchange} lastClose={hero.latestClose} />
            <OrderBookPreview hero={hero} />
            <RecentTradesPreview hero={hero} />
          </aside>
        </div>
      </main>
    </section>
  );
}

function Stat({ k, v, tone }: { k: string; v: string; tone?: "up" | "down" }) {
  return (
    <div>
      <div className="k">{k}</div>
      <div className={`v ${tone ?? ""}`}>{v}</div>
    </div>
  );
}

function placeholder(symbol: string): MarketIndexOverview {
  return { symbol, name: symbol, exchange: "VN", bars: [] };
}

function TradePanel({
  symbol,
  exchange,
  lastClose,
}: {
  symbol: string;
  exchange: string;
  lastClose?: number;
}) {
  const [side, setSide] = useState<Side>("BUY");
  const [type, setType] = useState<OrderType>("LIMIT");
  const [quantity, setQuantity] = useState("100");
  const [limitPrice, setLimitPrice] = useState<string>(() =>
    lastClose != null ? lastClose.toFixed(2) : "",
  );
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<PortfolioPlaceOrderRes | null>(null);

  useEffect(() => {
    if (lastClose != null && !limitPrice) setLimitPrice(lastClose.toFixed(2));
  }, [lastClose, limitPrice]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const qty = Number.parseInt(quantity, 10);
    const price = limitPrice ? Number.parseFloat(limitPrice) : undefined;
    if (!Number.isFinite(qty) || qty <= 0) return;
    if (type === "LIMIT" && (price == null || !Number.isFinite(price) || price <= 0)) {
      setResult({
        ok: false,
        error: "guardrail_blocked",
        reasons: ["LIMIT order requires a positive limit price."],
      });
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const res = await window.azoth.invoke("portfolio:placeOrder", {
        ticker: symbol,
        side,
        type: type === "STOP" ? "LIMIT" : type,
        quantity: qty,
        limitPrice: price,
      });
      setResult(res);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setResult({ ok: false, error: "broker_error", message });
    } finally {
      setBusy(false);
    }
  }

  const estimatedTotal = (Number.parseFloat(quantity) || 0) * (Number.parseFloat(limitPrice) || 0);

  return (
    <section className="card">
      <div className="card-pad" style={{ paddingBottom: "var(--space-3)" }}>
        <div className="row-between">
          <h3 className="card-title">Trade</h3>
          <span className="kicker" style={{ textTransform: "none", letterSpacing: 0, color: "var(--meta)" }}>
            {symbol} · {exchange}
          </span>
        </div>
      </div>
      <form className="trade-panel" onSubmit={submit}>
        <div className="side-toggle">
          <button
            type="button"
            className={side === "BUY" ? "is-buy" : ""}
            onClick={() => setSide("BUY")}
          >
            Buy
          </button>
          <button
            type="button"
            className={side === "SELL" ? "is-sell" : ""}
            onClick={() => setSide("SELL")}
          >
            Sell
          </button>
        </div>

        <div className="row-between">
          <span className="field-label">Order type</span>
          <div className="seg">
            {(["LIMIT", "MARKET", "STOP"] as const).map((opt) => (
              <button
                key={opt}
                type="button"
                className={type === opt ? "is-active" : ""}
                onClick={() => setType(opt)}
                disabled={opt === "STOP"}
                title={opt === "STOP" ? "Coming soon" : undefined}
              >
                {opt.charAt(0) + opt.slice(1).toLowerCase()}
              </button>
            ))}
          </div>
        </div>

        <div className="stack-3">
          <div className="field">
            <span className="field-label">Quantity</span>
            <div className="field-row">
              <input
                type="text"
                inputMode="numeric"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
              <span className="unit">shares</span>
            </div>
          </div>
          {type === "LIMIT" ? (
            <div className="field">
              <span className="field-label">Limit price</span>
              <div className="field-row">
                <input
                  type="text"
                  inputMode="decimal"
                  value={limitPrice}
                  onChange={(e) => setLimitPrice(e.target.value)}
                />
                <span className="unit">K₫</span>
              </div>
            </div>
          ) : null}
        </div>

        <div className="stat-list">
          <div className="row">
            <span className="k">Estimated total</span>
            <span className="v">{formatNumber(estimatedTotal)} K₫</span>
          </div>
          <div className="row">
            <span className="k">Brokerage fee (0.15%)</span>
            <span className="v">{formatNumber(estimatedTotal * 0.0015)} K₫</span>
          </div>
        </div>

        <button
          type="submit"
          className={`btn ${side === "BUY" ? "btn-buy" : "btn-sell"} trade-submit`}
          disabled={busy}
        >
          {busy ? "Submitting..." : `${side === "BUY" ? "Buy" : "Sell"} ${symbol}`}
        </button>
        <p className="trade-note">
          Order will be reviewed against your account guardrails before submission.
        </p>

        {result ? <TradeResult result={result} /> : null}
      </form>
    </section>
  );
}

function TradeResult({ result }: { result: PortfolioPlaceOrderRes }) {
  if (result.ok) {
    return (
      <div className="trade-result ok">
        Order {result.order.status.toLowerCase()} · #{result.order.id}
      </div>
    );
  }
  if (result.error === "guardrail_blocked") {
    return (
      <div className="trade-result error">
        <strong>Blocked by risk guardrails</strong>
        <ul>
          {(result.reasons ?? []).map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      </div>
    );
  }
  return <div className="trade-result error">{result.message ?? result.error}</div>;
}

function OrderBookPreview({ hero }: { hero: MarketIndexOverview }) {
  const mid = hero.latestClose ?? 0;
  const step = mid * 0.0007 || 0.05;
  const asks = [4, 3, 2, 1, 0.5].map((k) => ({
    px: mid + step * k,
    qty: Math.round((1 + Math.sin(k) * 0.6) * 5000),
    width: 30 + k * 8,
  }));
  const bids = [0.5, 1, 2, 3, 4].map((k) => ({
    px: mid - step * k,
    qty: Math.round((1 + Math.cos(k) * 0.6) * 5000),
    width: 30 + k * 8,
  }));
  return (
    <section className="card" style={{ padding: 0, overflow: "hidden" }}>
      <div className="card-pad" style={{ paddingBottom: "var(--space-3)" }}>
        <div className="row-between">
          <h3 className="card-title">Order book</h3>
          <span className="preview-tag">preview</span>
        </div>
      </div>
      <div className="ob">
        <div className="ob-head">
          <span>Price</span>
          <span>Qty</span>
          <span>Total</span>
        </div>
        {asks.map((row, i) => (
          <div
            key={`ask-${i}`}
            className="ob-row ask"
            style={{ ["--w" as string]: `${row.width}%` }}
          >
            <span className="px">{row.px.toFixed(2)}</span>
            <span className="qty">{row.qty.toLocaleString()}</span>
            <span className="total">{(row.qty * (i + 1)).toLocaleString()}</span>
          </div>
        ))}
        <div className="ob-mid">
          <span className="num up">{formatNumber(mid)} K</span>
          <span className="spread">spread {(step * 2).toFixed(2)}</span>
          <span className="num">{formatPct(hero.changePct)}</span>
        </div>
        {bids.map((row, i) => (
          <div
            key={`bid-${i}`}
            className="ob-row bid"
            style={{ ["--w" as string]: `${row.width}%` }}
          >
            <span className="px">{row.px.toFixed(2)}</span>
            <span className="qty">{row.qty.toLocaleString()}</span>
            <span className="total">{(row.qty * (i + 1)).toLocaleString()}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function RecentTradesPreview({ hero }: { hero: MarketIndexOverview }) {
  const recent = hero.bars.slice(-8).reverse();
  return (
    <section className="card" style={{ padding: 0, overflow: "hidden" }}>
      <div className="card-pad" style={{ paddingBottom: "var(--space-3)" }}>
        <div className="row-between">
          <h3 className="card-title">Recent trades</h3>
          <span className="preview-tag">from bars</span>
        </div>
      </div>
      <div className="ob">
        <div className="ob-head">
          <span>Time</span>
          <span>Price</span>
          <span>Qty</span>
        </div>
        {recent.length === 0 ? (
          <div className="market-empty" style={{ padding: "var(--space-4) var(--space-5)" }}>
            No recent bars.
          </div>
        ) : (
          recent.map((bar, i) => {
            const tone = i + 1 < recent.length && bar.c >= recent[i + 1]!.c ? "up" : "down";
            return (
              <div key={bar.t} className="ob-row">
                <span className="mono" style={{ color: "var(--muted)" }}>
                  {formatClock(bar.t)}
                </span>
                <span className={`qty ${tone}`}>{bar.c.toFixed(2)}</span>
                <span className="total">{bar.v.toLocaleString()}</span>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
