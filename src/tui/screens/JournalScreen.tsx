import React, { useEffect, useState } from "react";
import { Box, Text, useInput } from "ink";
import { Tabs } from "../components/Tabs.js";
import { getDb } from "../../storage/db.js";
import { formatDate, formatPrice, truncate } from "../lib/format.js";

const TABS = ["Decisions", "Orders", "Fills", "Alerts"] as const;

interface Row { id: string | number; primary: string; secondary: string; detail: string; ts: number; color?: string }

function loadRows(tab: number): Row[] {
  const db = getDb();
  if (tab === 0) {
    const rows = db.prepare("SELECT id, ticker, action, rationale, exit_plan, created_at FROM decisions ORDER BY created_at DESC LIMIT 100").all() as Array<{ id: number; ticker: string; action: string; rationale: string; exit_plan: string; created_at: number }>;
    return rows.map((r) => ({
      id: r.id,
      primary: `${r.action.padEnd(5)} ${r.ticker}`,
      secondary: formatDate(r.created_at),
      detail: `Action: ${r.action}\nTicker: ${r.ticker}\nDate: ${formatDate(r.created_at)}\n\nRationale:\n${r.rationale ?? "—"}\n\nExit plan:\n${r.exit_plan ?? "—"}`,
      ts: r.created_at,
      color: r.action === "BUY" ? "green" : r.action === "SELL" ? "red" : "yellow",
    }));
  }
  if (tab === 1) {
    const rows = db.prepare("SELECT id, ticker, side, status, quantity, type, limit_price, filled_price, created_at, notes FROM broker_orders ORDER BY created_at DESC LIMIT 100").all() as Array<{ id: string; ticker: string; side: string; status: string; quantity: number; type: string; limit_price: number | null; filled_price: number | null; created_at: number; notes: string | null }>;
    return rows.map((r) => ({
      id: r.id,
      primary: `${r.side.padEnd(4)} ${r.ticker} ${r.quantity}`,
      secondary: `${r.status} · ${formatDate(r.created_at)}`,
      detail: `Order ${r.id}\n${r.side} ${r.ticker} qty=${r.quantity} type=${r.type}\nlimit=${formatPrice(r.limit_price)} filled=${formatPrice(r.filled_price)}\nstatus=${r.status}\ndate=${formatDate(r.created_at)}\nnotes: ${r.notes ?? "—"}`,
      ts: r.created_at,
      color: r.side === "BUY" ? "green" : "red",
    }));
  }
  if (tab === 2) {
    const rows = db.prepare("SELECT id, ticker, side, quantity, filled_price, filled_at FROM broker_orders WHERE status = 'FILLED' ORDER BY filled_at DESC LIMIT 100").all() as Array<{ id: string; ticker: string; side: string; quantity: number; filled_price: number; filled_at: number }>;
    return rows.map((r) => ({
      id: r.id,
      primary: `${r.side.padEnd(4)} ${r.ticker} ${r.quantity} @ ${formatPrice(r.filled_price)}`,
      secondary: formatDate(r.filled_at),
      detail: `${r.side} ${r.ticker}\nqty=${r.quantity}\nprice=${formatPrice(r.filled_price)}\nfilled=${formatDate(r.filled_at)}`,
      ts: r.filled_at,
      color: r.side === "BUY" ? "green" : "red",
    }));
  }
  try {
    const rows = db.prepare("SELECT id, level, message, created_at FROM alerts ORDER BY created_at DESC LIMIT 100").all() as Array<{ id: number; level: string; message: string; created_at: number }>;
    return rows.map((r) => ({
      id: r.id,
      primary: r.level.toUpperCase(),
      secondary: formatDate(r.created_at),
      detail: r.message,
      ts: r.created_at,
      color: r.level === "critical" ? "red" : r.level === "warn" ? "yellow" : "white",
    }));
  } catch {
    return [];
  }
}

export function JournalScreen() {
  const [tab, setTab] = useState(0);
  const [sel, setSel] = useState(0);
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    setRows(loadRows(tab));
    setSel(0);
  }, [tab]);

  useInput((inp, key) => {
    if (key.leftArrow) setTab((t) => (t - 1 + TABS.length) % TABS.length);
    else if (key.rightArrow) setTab((t) => (t + 1) % TABS.length);
    else if (key.upArrow) setSel((s) => Math.max(0, s - 1));
    else if (key.downArrow) setSel((s) => Math.min(rows.length - 1, s + 1));
    else if (inp === "r") setRows(loadRows(tab));
  });

  const current = rows[sel];

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box paddingX={1}><Tabs tabs={TABS as unknown as string[]} active={tab} /></Box>
      <Box flexDirection="row" flexGrow={1}>
        <Box flexDirection="column" width={48} borderStyle="round" borderColor="gray" paddingX={1}>
          {rows.length === 0 ? <Text dimColor>(no rows — press r to refresh)</Text> : null}
          {rows.slice(0, 30).map((r, i) => (
            <Text key={String(r.id)}>
              <Text color={i === sel ? "cyan" : "gray"}>{i === sel ? "▶ " : "  "}</Text>
              <Text color={r.color ?? "white"}>{truncate(r.primary, 22).padEnd(22)}</Text>
              <Text dimColor>  {r.secondary}</Text>
            </Text>
          ))}
        </Box>
        <Box flexDirection="column" flexGrow={1} borderStyle="round" borderColor="gray" paddingX={1}>
          <Text bold color="cyan">DETAIL</Text>
          {current ? current.detail.split("\n").map((l, i) => <Text key={i}>{l}</Text>) : <Text dimColor>—</Text>}
        </Box>
      </Box>
      <Box paddingX={1}><Text dimColor>←→: tab · ↑↓: select · r: refresh</Text></Box>
    </Box>
  );
}
