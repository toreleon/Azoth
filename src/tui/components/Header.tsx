import React, { useEffect, useState } from "react";
import { Box, Text, useStdout } from "ink";
import { useNow } from "../hooks/useNow.js";
import { classifySession } from "../lib/marketSession.js";
import { formatTime, formatPct, formatPrice } from "../lib/format.js";
import { theme, glyph, sessionColor } from "../lib/theme.js";
import { pctColor } from "../lib/colors.js";
import { snapshotIndex } from "../../tools/macro.js";
import { getQuote } from "../../data/sources/ssiIboard.js";
import { getStockOhlcv } from "../../data/sources/dnsePublic.js";
import { loadConfig } from "../../config/loader.js";

interface MiniQuote { ticker: string; last: number | null; chgPct: number | null }
interface IndexLite { symbol: string; close: number; chgPct: number | null }

export function Header({ mode }: { mode: string }) {
  const cfg = loadConfig();
  const watchlist = cfg.watchlist.slice(0, 3);
  const now = useNow(1000);
  const session = classifySession(now);
  const { stdout } = useStdout();
  const cols = stdout?.columns ?? 120;

  const [vnIndex, setVnIndex] = useState<IndexLite | null>(null);
  const [quotes, setQuotes] = useState<MiniQuote[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function tick() {
      try {
        const idx = await snapshotIndex("VNINDEX");
        if (!cancelled && idx) {
          setVnIndex({ symbol: idx.symbol, close: idx.latest_close, chgPct: idx.change_pct_1d });
        }
      } catch {}
      try {
        const points = await Promise.all(
          watchlist.map(async (sym): Promise<MiniQuote> => {
            const q = await getQuote(sym).catch(() => null);
            const to = Math.floor(Date.now() / 1000);
            const bars = await getStockOhlcv(sym, "1D", to - 7 * 86400, to).catch(() => []);
            const last = bars.length ? bars[bars.length - 1]!.close : null;
            const ref = q?.ref ?? null;
            const chg = last != null && ref ? ((last - ref) / ref) * 100 : null;
            return { ticker: sym, last, chgPct: chg };
          }),
        );
        if (!cancelled) setQuotes(points);
      } catch {}
    }
    void tick();
    const id = setInterval(tick, session.intervalMs);
    return () => { cancelled = true; clearInterval(id); };
  }, [session.intervalMs, watchlist.join(",")]);

  const arrow = (p: number | null | undefined) => (p == null ? glyph.flat : p > 0 ? glyph.up : p < 0 ? glyph.down : glyph.flat);
  const showQuotes = cols >= 110;
  const showIndex = cols >= 80;

  return (
    <Box borderStyle="single" borderColor={theme.muted} paddingX={1} justifyContent="space-between">
      <Box>
        <Text color={theme.brand} bold>{glyph.bar} </Text>
        <Text color={theme.accent} bold>AZOTH</Text>
        <Text color={theme.muted}>  {mode}</Text>
        {showIndex && vnIndex ? (
          <>
            <Text color={theme.muted}>     VNINDEX </Text>
            <Text bold>{formatPrice(vnIndex.close)}</Text>
            <Text color={pctColor(vnIndex.chgPct)}> {arrow(vnIndex.chgPct)}{formatPct(vnIndex.chgPct)}</Text>
          </>
        ) : null}
        {showQuotes ? quotes.map((q) => (
          <React.Fragment key={q.ticker}>
            <Text color={theme.muted}>   </Text>
            <Text>{q.ticker}</Text>
            <Text color={pctColor(q.chgPct)}> {arrow(q.chgPct)}{formatPct(q.chgPct, false)}</Text>
          </React.Fragment>
        )) : null}
      </Box>
      <Box>
        <Text color={sessionColor(session.label)}>{session.display}</Text>
        <Text color={theme.muted}>  {formatTime(now)} ICT</Text>
      </Box>
    </Box>
  );
}
