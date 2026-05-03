import { formatBigVnd, formatPct, formatPrice, truncate } from "./format.js";

function safeJson(s: string | undefined): any {
  if (!s) return null;
  try { return JSON.parse(s); } catch { return null; }
}

export function summarizeToolInput(raw: string | undefined): string {
  if (!raw) return "";
  const obj = safeJson(raw);
  if (!obj || typeof obj !== "object") return truncate(raw.replace(/\s+/g, " "), 60);
  const t = obj.ticker ?? obj.symbol ?? obj.tickers ?? obj.symbols;
  const tf = obj.timeframe ?? obj.interval;
  const parts: string[] = [];
  if (Array.isArray(t)) parts.push(t.slice(0, 3).join(","));
  else if (t) parts.push(String(t));
  if (tf) parts.push(String(tf));
  if (obj.criterion) parts.push(String(obj.criterion));
  if (obj.limit) parts.push(`n=${obj.limit}`);
  if (parts.length === 0) {
    const keys = Object.keys(obj).slice(0, 3);
    return truncate(keys.map((k) => `${k}=${JSON.stringify(obj[k])}`).join(" "), 60);
  }
  return parts.join(" ");
}

export function summarizeToolResult(name: string, raw: string | undefined): string {
  if (!raw) return "";
  const obj = safeJson(raw);
  if (!obj) return truncate(raw.replace(/\s+/g, " "), 80);

  try {
    switch (name) {
      case "market_quote": {
        const q = obj.quote ?? obj;
        const last = q?.last ?? q?.close ?? q?.price;
        const ref = q?.ref;
        const chg = last != null && ref ? ((last - ref) / ref) * 100 : q?.change_pct ?? null;
        return `${q?.ticker ?? ""}  ${formatPrice(last)}  ${formatPct(chg)}`;
      }
      case "market_ohlcv": {
        const bars = obj.bars ?? obj.data ?? obj;
        if (Array.isArray(bars) && bars.length) {
          const last = bars[bars.length - 1];
          return `${bars.length} bars · last ${formatPrice(last?.close)} vol ${formatBigVnd(last?.volume)}`;
        }
        break;
      }
      case "technical_indicators": {
        const ind = obj.indicators ?? obj;
        const rsi = ind?.rsi14 ?? ind?.rsi;
        const macd = ind?.macd?.hist ?? ind?.macd_hist;
        return `rsi ${rsi?.toFixed?.(1) ?? "—"} · macd ${macd?.toFixed?.(2) ?? "—"}`;
      }
      case "fundamentals_snapshot": {
        const f = obj.fundamentals ?? obj;
        return `pe ${f?.pe?.toFixed?.(1) ?? "—"} · pb ${f?.pb?.toFixed?.(1) ?? "—"} · roe ${f?.roe?.toFixed?.(1) ?? "—"}%`;
      }
      case "ticker_news": {
        const items = obj.news ?? obj.items ?? obj;
        if (Array.isArray(items)) return `${items.length} headlines · ${truncate(items[0]?.title ?? "", 50)}`;
        break;
      }
      case "foreign_flow": {
        const f = obj.flow ?? obj;
        return `net ${formatBigVnd(f?.foreign_net_value_vnd_wtd ?? f?.net)} · own ${f?.foreign_ownership_pct?.toFixed?.(1) ?? "—"}%`;
      }
      case "macro_indices": {
        const arr = obj.indices ?? obj;
        if (Array.isArray(arr)) {
          const v = arr.find((x: any) => x.symbol === "VNINDEX") ?? arr[0];
          return `${v?.symbol ?? "idx"} ${formatPrice(v?.latest_close)} ${formatPct(v?.change_pct_1d)}`;
        }
        break;
      }
      case "discover_tickers": {
        const cands = obj.candidates ?? obj;
        if (Array.isArray(cands)) return `${cands.length} tickers · ${cands.slice(0, 4).map((c: any) => c.ticker).join(", ")}`;
        break;
      }
      case "broker_state": {
        const cash = obj.cashVnd ?? obj.cash;
        const positions = obj.positions?.length ?? 0;
        return `cash ${formatBigVnd(cash)} · ${positions} positions`;
      }
      case "journal_read": {
        const rows = obj.rows ?? obj;
        if (Array.isArray(rows)) return `${rows.length} entries`;
        break;
      }
      case "journal_append":
        return obj.ok ? "appended" : "ok";
    }
  } catch {}

  const flat = JSON.stringify(obj);
  return truncate(flat.replace(/[{}"]/g, ""), 80);
}
