import { useCallback, useEffect, useRef, useState } from "react";
import type { MarketIndexOverview } from "../../../shared/ipc.js";
import { ChartIcon, RefreshIcon } from "../Icon.js";
import {
  ChangePill,
  MarketLineChart,
  StatRow,
  forecastLabel,
  formatClock,
  formatNumber,
} from "./MarketView.js";

type Resolution = "1D" | "1W" | "1M";
const TIMEFRAMES: Array<{ value: Resolution; label: string; bars: number }> = [
  { value: "1D", label: "1D", bars: 120 },
  { value: "1W", label: "1W", bars: 120 },
  { value: "1M", label: "1M", bars: 120 },
];

const REFRESH_MS = 30_000;

export function TickerDetailWindow({
  initialSymbol,
}: {
  initialSymbol: string;
}) {
  const [symbol, setSymbol] = useState(() => initialSymbol.toUpperCase());
  const [resolution, setResolution] = useState<Resolution>("1D");
  const [asset, setAsset] = useState<MarketIndexOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const fetchAsset = useCallback(
    async (sym: string, res: Resolution, silent = false) => {
      const id = ++requestId.current;
      const bars = TIMEFRAMES.find((tf) => tf.value === res)?.bars ?? 120;
      if (!silent) setLoading(true);
      setError(null);
      try {
        const next = await window.azoth.invoke("market:asset", {
          symbol: sym,
          resolution: res,
          bars,
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
    void fetchAsset(symbol, resolution);
  }, [symbol, resolution, fetchAsset]);

  useEffect(() => {
    setSymbol(initialSymbol.toUpperCase());
  }, [initialSymbol]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void fetchAsset(symbol, resolution, true);
    }, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [symbol, resolution, fetchAsset]);

  const hero = asset ?? makePlaceholder(symbol);

  return (
    <section className="ticker-detail-page" aria-label={`${hero.symbol} detail`}>
      <main className="ticker-window">
            <header className="ticker-window-header">
              <div className="ticker-window-title">
                <span className="ds-kicker">{hero.kind === "index" ? "Index" : "Ticker"}</span>
                <div className="ticker-window-symbol">
                  <h1>{hero.symbol}</h1>
                  <ChangePill index={hero} />
                </div>
                <p>{hero.name}</p>
              </div>
              <div className="ticker-window-price">
                <strong>{formatNumber(hero.latestClose)}</strong>
                <span>{hero.exchange}{hero.updatedAt ? ` · ${formatClock(hero.updatedAt)}` : ""}</span>
              </div>
              <button
                type="button"
                className="settings-icon-btn"
                title="Refresh"
                aria-label="Refresh ticker"
                onClick={() => void fetchAsset(symbol, resolution)}
              >
                <RefreshIcon />
              </button>
            </header>

            {error ? <div className="market-error">{error}</div> : null}

            <section className="ticker-window-chart-card ds-card">
              <div className="ticker-window-chart-head">
                <div className="market-toggle-group" role="group" aria-label="Timeframe">
                  <span className="ds-kicker">Window</span>
                  {TIMEFRAMES.map((tf) => (
                    <button
                      key={tf.value}
                      type="button"
                      className={`market-toggle-btn ${resolution === tf.value ? "is-active" : ""}`}
                      onClick={() => setResolution(tf.value)}
                    >
                      {tf.label}
                    </button>
                  ))}
                </div>
                <span className="ticker-window-bars">
                  {loading && !asset ? "Loading..." : `${hero.bars.length} bars`}
                </span>
              </div>
              <div className="ticker-window-chart-body">
                {hero.bars.length > 0 ? (
                  <MarketLineChart index={hero} />
                ) : (
                  <div className="market-empty">{loading ? "Loading chart..." : "No data"}</div>
                )}
              </div>
            </section>

            {hero.forecast ? (
              <div className={`market-forecast-card is-${hero.forecast.direction}`}>
                <ChartIcon />
                <div>
                  <span>RMA forecast</span>
                  <strong>{forecastLabel(hero.forecast)}</strong>
                  <small>{hero.forecast.confidence} confidence</small>
                </div>
              </div>
            ) : null}

            <section className="ticker-window-grid">
              <div className="ds-card ticker-stats-card">
                <h3>Market</h3>
                <StatRow label="Industry" value={hero.industry ?? "Unclassified"} />
                <StatRow label="Exchange" value={hero.exchange} />
                <StatRow label="Previous close" value={formatNumber(hero.previousClose)} />
                <StatRow label="High / low" value={`${formatNumber(hero.high)} / ${formatNumber(hero.low)}`} />
                <StatRow label="Volume" value={formatNumber(hero.volume)} />
                <StatRow label="Market cap" value={formatNumber(hero.marketCap)} />
              </div>
              <div className="ds-card ticker-stats-card">
                <h3>Quote</h3>
                <StatRow label="Bid / offer" value={`${formatNumber(hero.quote?.bestBid)} / ${formatNumber(hero.quote?.bestOffer)}`} />
                <StatRow label="Matched volume" value={formatNumber(hero.quote?.matchedVolume)} />
                <StatRow label="Session" value={hero.quote?.session ?? "-"} />
                <StatRow label="Status" value={hero.quote?.tradingStatus ?? "-"} />
              </div>
            </section>

            {hero.intro || hero.website ? (
              <section className="ds-card ticker-stats-card">
                <h3>Company</h3>
                {hero.intro ? <p className="ticker-window-intro">{hero.intro}</p> : null}
                {hero.website ? (
                  <a className="ticker-window-link" href={hero.website} target="_blank" rel="noreferrer noopener">
                    {hero.website}
                  </a>
                ) : null}
              </section>
            ) : null}

            <section className="ds-card ticker-stats-card">
              <h3>News</h3>
              <p className="ticker-window-empty">Headlines coming soon.</p>
            </section>
      </main>
    </section>
  );
}

function makePlaceholder(symbol: string): MarketIndexOverview {
  return {
    symbol,
    name: symbol,
    exchange: "VN",
    bars: [],
  };
}
