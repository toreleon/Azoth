import React, { useEffect, useState } from "react";
import { Box, Text } from "ink";
import { Panel } from "../components/Panel.js";
import { useBrokerSnapshot } from "../hooks/useBrokerSnapshot.js";
import { useNow } from "../hooks/useNow.js";
import { classifySession } from "../lib/marketSession.js";
import { formatBigVnd, formatPct, formatPrice } from "../lib/format.js";
import { pctColor, vnColor, pnlColor } from "../lib/colors.js";
import { theme, glyph, sessionColor } from "../lib/theme.js";
import { sparkline } from "../lib/sparkline.js";
import { getMacroIndices, getForeignFlow, type IndexSnapshot, type ForeignFlow } from "../../tools/macro.js";
import { discoverTickers, type DiscoverResult } from "../../tools/discover.js";
import { getQuote, type SsiQuote } from "../../data/sources/ssiIboard.js";
import { getStockOhlcv, getIndexOhlcv, type Bar } from "../../data/sources/dnsePublic.js";
import { loadConfig } from "../../config/loader.js";

interface QuotePoint { quote: SsiQuote; last: number | null; prevClose: number | null; closes: number[] }
interface IndexPoint { snap: IndexSnapshot; closes: number[] }

function loadStaleAge(stamp: number, now: number): string {
  const sec = now - stamp;
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m`;
  return `${Math.floor(sec / 3600)}h`;
}

function flowBar(net: number | null | undefined, scale: number, width = 10): string {
  if (net == null || scale === 0) return " ".repeat(width);
  const pct = Math.max(-1, Math.min(1, net / scale));
  const cells = Math.round(Math.abs(pct) * width);
  return (net >= 0 ? "█" : "▒").repeat(cells).padEnd(width, " ");
}

export function DashboardScreen() {
  const cfg = loadConfig();
  const watchlist = cfg.watchlist;
  const now = useNow(2000);
  const session = classifySession(now);
  const refreshMs = session.intervalMs;

  const { snapshot } = useBrokerSnapshot(refreshMs);
  const [indices, setIndices] = useState<{ data: IndexPoint[]; ts: number } | null>(null);
  const [quotes, setQuotes] = useState<{ data: QuotePoint[]; ts: number } | null>(null);
  const [movers, setMovers] = useState<{ gainers: DiscoverResult; losers: DiscoverResult; ts: number } | null>(null);
  const [foreign, setForeign] = useState<{ data: ForeignFlow[]; ts: number } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    async function tick() {
      try {
        const data = await getMacroIndices();
        const enriched = await Promise.all(data.map(async (s): Promise<IndexPoint> => {
          const to = Math.floor(Date.now() / 1000);
          const bars: Bar[] = await getIndexOhlcv(s.symbol as any, "1D", to - 30 * 86400, to).catch(() => []);
          return { snap: s, closes: bars.slice(-15).map((b) => b.close) };
        }));
        if (!cancelled) setIndices({ data: enriched, ts: Math.floor(Date.now() / 1000) });
      } catch (e) {
        if (!cancelled) setErrors((p) => ({ ...p, indices: (e as Error).message }));
      }
      try {
        const points = await Promise.all(
          watchlist.slice(0, 8).map(async (sym): Promise<QuotePoint> => {
            const quote = await getQuote(sym);
            const to = Math.floor(Date.now() / 1000);
            const bars: Bar[] = await getStockOhlcv(sym, "1D", to - 30 * 86400, to).catch(() => []);
            const closes = bars.slice(-15).map((b) => b.close);
            const last = closes.length ? closes[closes.length - 1]! : null;
            const prev = closes.length > 1 ? closes[closes.length - 2]! : null;
            return { quote, last, prevClose: prev, closes };
          }),
        );
        if (!cancelled) setQuotes({ data: points, ts: Math.floor(Date.now() / 1000) });
      } catch (e) {
        if (!cancelled) setErrors((p) => ({ ...p, quotes: (e as Error).message }));
      }
      try {
        const [g, l] = await Promise.all([
          discoverTickers({ criterion: "top_gainers", limit: 5 }),
          discoverTickers({ criterion: "top_losers", limit: 5 }),
        ]);
        if (!cancelled) setMovers({ gainers: g, losers: l, ts: Math.floor(Date.now() / 1000) });
      } catch (e) {
        if (!cancelled) setErrors((p) => ({ ...p, movers: (e as Error).message }));
      }
      try {
        const flows = await Promise.all(watchlist.slice(0, 5).map((s) => getForeignFlow(s).catch(() => null)));
        const data = flows.filter((f): f is ForeignFlow => f != null);
        if (!cancelled) setForeign({ data, ts: Math.floor(Date.now() / 1000) });
      } catch (e) {
        if (!cancelled) setErrors((p) => ({ ...p, foreign: (e as Error).message }));
      }
    }
    void tick();
    const id = setInterval(tick, refreshMs);
    return () => { cancelled = true; clearInterval(id); };
  }, [refreshMs, watchlist.join(",")]);

  const flowScale = foreign?.data.reduce((m, f) => Math.max(m, Math.abs(f.foreign_net_value_vnd_wtd ?? 0)), 0) ?? 0;
  const arrow = (p: number | null | undefined) => (p == null ? glyph.flat : p > 0 ? glyph.up : p < 0 ? glyph.down : glyph.flat);

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box flexDirection="row" flexGrow={1}>
        <Panel title="INDICES" flex={1} borderColor={theme.accent} badge={indices ? `${loadStaleAge(indices.ts, now)} ago` : "loading"}>
          {indices?.data.map((p) => {
            const s = p.snap;
            return (
              <Text key={s.symbol}>
                <Text color="white">{s.symbol.padEnd(9)}</Text>
                <Text>{formatPrice(s.latest_close, 2).padStart(9)}</Text>
                <Text color={pctColor(s.change_pct_1d)}>  {arrow(s.change_pct_1d)}{formatPct(s.change_pct_1d).padStart(7)}</Text>
                <Text color={pctColor(s.change_pct_1d)}>  {sparkline(p.closes, 10) || "—"}</Text>
              </Text>
            );
          }) ?? <Text dimColor>loading…</Text>}
        </Panel>
        <Panel title="WATCHLIST" flex={1} borderColor={theme.up} badge={quotes ? `${loadStaleAge(quotes.ts, now)} ago` : "loading"}>
          {quotes?.data.map((q) => {
            const last = q.last;
            const ref = q.quote.ref;
            const ceiling = q.quote.ceiling;
            const floor = q.quote.floor;
            const chg = last != null && ref ? ((last - ref) / ref) * 100 : null;
            return (
              <Text key={q.quote.ticker}>
                <Text color="white">{q.quote.ticker.padEnd(5)}</Text>
                <Text color={vnColor(last, ref, ceiling, floor)}>{formatPrice(last).padStart(7)}</Text>
                <Text color={pctColor(chg)}>{formatPct(chg).padStart(8)}</Text>
                <Text color={pctColor(chg)}>  {sparkline(q.closes, 10) || "—"}</Text>
              </Text>
            );
          }) ?? <Text dimColor>loading…</Text>}
        </Panel>
        <Panel title="FOREIGN FLOW (WTD)" flex={1} borderColor={theme.persona} badge={foreign ? `${loadStaleAge(foreign.ts, now)} ago` : "loading"}>
          {foreign?.data.map((f) => {
            const net = f.foreign_net_value_vnd_wtd;
            return (
              <Text key={f.ticker}>
                <Text color="white">{f.ticker.padEnd(5)}</Text>
                <Text color={pnlColor(net)}>{flowBar(net, flowScale, 8)}</Text>
                <Text color={pnlColor(net)}>  {formatBigVnd(net).padStart(8)}</Text>
                <Text dimColor>  {f.foreign_ownership_pct?.toFixed(1) ?? "—"}%</Text>
              </Text>
            );
          }) ?? <Text dimColor>loading…</Text>}
        </Panel>
      </Box>
      <Box flexDirection="row" flexGrow={1}>
        <Panel title="TOP GAINERS (1W)" flex={1} borderColor={theme.up} badge={movers ? `${loadStaleAge(movers.ts, now)} ago` : "loading"}>
          {movers?.gainers.candidates.map((c) => (
            <Text key={c.ticker}>
              <Text color="white">{c.ticker.padEnd(5)}</Text>
              <Text color={theme.up}>{glyph.up} {formatPct(c.ret_1w_pct).padStart(7)}</Text>
              <Text dimColor>  rsi {c.rsi14?.toFixed(0) ?? "—"}</Text>
              <Text dimColor>  vol {c.vol_ratio_5_20?.toFixed(2) ?? "—"}x</Text>
            </Text>
          )) ?? <Text dimColor>loading…</Text>}
        </Panel>
        <Panel title="TOP LOSERS (1W)" flex={1} borderColor={theme.down} badge={movers ? `${loadStaleAge(movers.ts, now)} ago` : "loading"}>
          {movers?.losers.candidates.map((c) => (
            <Text key={c.ticker}>
              <Text color="white">{c.ticker.padEnd(5)}</Text>
              <Text color={theme.down}>{glyph.down} {formatPct(c.ret_1w_pct).padStart(7)}</Text>
              <Text dimColor>  rsi {c.rsi14?.toFixed(0) ?? "—"}</Text>
            </Text>
          )) ?? <Text dimColor>loading…</Text>}
        </Panel>
        <Panel title="POSITIONS" flex={1} borderColor={theme.flat}>
          {snapshot ? (
            <>
              <Text>cash <Text color={theme.up}>{formatBigVnd(snapshot.cashVnd)}</Text></Text>
              {snapshot.positions.length === 0 ? <Text dimColor>no positions</Text> : null}
              {snapshot.positions.map((p) => {
                const last = quotes?.data.find((q) => q.quote.ticker === p.ticker)?.last ?? null;
                const pnl = last != null ? (last - p.avgCost) * p.quantity * 1000 : null;
                return (
                  <Text key={p.ticker}>
                    <Text color="white">{p.ticker.padEnd(5)}</Text>
                    <Text dimColor> {p.quantity}</Text>
                    <Text dimColor> @ {formatPrice(p.avgCost)}</Text>
                    <Text dimColor>  pnl </Text>
                    <Text color={pnlColor(pnl)}>{pnl != null ? formatBigVnd(pnl) : "—"}</Text>
                  </Text>
                );
              })}
            </>
          ) : <Text dimColor>loading…</Text>}
        </Panel>
      </Box>
      <Box paddingX={1}>
        <Text>
          <Text color={sessionColor(session.label)}>{session.display}</Text>
          <Text dimColor>  ·  refresh {Math.round(refreshMs / 1000)}s</Text>
          {indices ? <Text dimColor>  ·  last {loadStaleAge(indices.ts, now)} ago</Text> : null}
          {Object.entries(errors).filter(([_, v]) => v).length
            ? <Text color={theme.down}>  ·  errors: {Object.keys(errors).filter((k) => errors[k]).join(", ")}</Text>
            : null}
        </Text>
      </Box>
    </Box>
  );
}
