/**
 * Azoth Finance — web persistence layer.
 *
 * SQLite-backed storage for user-managed watchlists and manual (Google-Finance
 * style) portfolios. Tables are prefixed `web_` and live in the same better-sqlite3
 * handle as the rest of Azoth (WAL + foreign_keys=ON already set by getDb()).
 *
 * Units note: holdings store avg_cost_vnd as PLAIN VND per share (e.g. 64800),
 * while board prices are resolved elsewhere in THOUSAND VND. This layer only
 * persists raw inputs; all portfolio math (market value, gain, weights) happens
 * in the router in index.ts.
 */
import { getDb } from "../../src/storage/db.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WatchlistMeta {
  id: number;
  name: string;
  tickers: string[];
}

export interface PortfolioMeta {
  id: number;
  name: string;
}

export interface HoldingInput {
  ticker: string;
  quantity: number;
  avgCostVnd: number;
}

export interface StoredHolding {
  id: number;
  ticker: string;
  quantity: number;
  avgCostVnd: number;
}

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

let schemaReady = false;

export function ensureWebSchema(): void {
  if (schemaReady) return;
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS web_watchlist (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      sort INTEGER DEFAULT 0,
      created_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS web_watchlist_item (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      watchlist_id INTEGER NOT NULL REFERENCES web_watchlist(id) ON DELETE CASCADE,
      ticker TEXT NOT NULL,
      added_at INTEGER,
      UNIQUE(watchlist_id, ticker)
    );
    CREATE TABLE IF NOT EXISTS web_portfolio (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      sort INTEGER DEFAULT 0,
      created_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS web_holding (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      portfolio_id INTEGER NOT NULL REFERENCES web_portfolio(id) ON DELETE CASCADE,
      ticker TEXT NOT NULL,
      quantity REAL NOT NULL,
      avg_cost_vnd REAL NOT NULL,
      added_at INTEGER
    );
  `);

  // Seed a default watchlist on first run so the sidebar isn't empty.
  const count = (db.prepare("SELECT count(*) AS n FROM web_watchlist").get() as { n: number }).n;
  if (count === 0) {
    const now = nowSec();
    const info = db
      .prepare("INSERT INTO web_watchlist (name, sort, created_at) VALUES (?, 0, ?)")
      .run("My watchlist", now);
    const wid = Number(info.lastInsertRowid);
    const insItem = db.prepare(
      "INSERT OR IGNORE INTO web_watchlist_item (watchlist_id, ticker, added_at) VALUES (?, ?, ?)",
    );
    for (const t of ["VCB", "FPT", "HPG", "VNM", "MWG", "MBB"]) {
      insItem.run(wid, t, now);
    }
  }

  schemaReady = true;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

function sanitizeTicker(raw: unknown): string {
  const t = String(raw ?? "").toUpperCase().trim();
  if (!/^[A-Z0-9]{1,12}$/.test(t)) {
    throw new Error(`invalid ticker: ${JSON.stringify(raw)}`);
  }
  return t;
}

function sanitizeName(raw: unknown): string {
  const n = String(raw ?? "").trim();
  if (!n) throw new Error("name required");
  return n.slice(0, 120);
}

// ---------------------------------------------------------------------------
// Watchlists
// ---------------------------------------------------------------------------

export function listWatchlists(): WatchlistMeta[] {
  ensureWebSchema();
  const db = getDb();
  const lists = db
    .prepare("SELECT id, name FROM web_watchlist ORDER BY sort, id")
    .all() as { id: number; name: string }[];
  const itemStmt = db.prepare(
    "SELECT ticker FROM web_watchlist_item WHERE watchlist_id = ? ORDER BY added_at, id",
  );
  return lists.map((l) => ({
    id: l.id,
    name: l.name,
    tickers: (itemStmt.all(l.id) as { ticker: string }[]).map((r) => r.ticker),
  }));
}

export function getWatchlistTickers(id: number): string[] {
  ensureWebSchema();
  const db = getDb();
  const rows = db
    .prepare("SELECT ticker FROM web_watchlist_item WHERE watchlist_id = ? ORDER BY added_at, id")
    .all(id) as { ticker: string }[];
  return rows.map((r) => r.ticker);
}

/** Full meta (id, name, tickers) for a single list, or null if it doesn't exist. */
export function getWatchlistMeta(id: number): WatchlistMeta | null {
  ensureWebSchema();
  const db = getDb();
  const row = db.prepare("SELECT id, name FROM web_watchlist WHERE id = ?").get(id) as
    | { id: number; name: string }
    | undefined;
  if (!row) return null;
  return { id: row.id, name: row.name, tickers: getWatchlistTickers(id) };
}

export function createWatchlist(name: string): WatchlistMeta {
  ensureWebSchema();
  const db = getDb();
  const clean = sanitizeName(name);
  const info = db
    .prepare("INSERT INTO web_watchlist (name, sort, created_at) VALUES (?, 0, ?)")
    .run(clean, nowSec());
  return { id: Number(info.lastInsertRowid), name: clean, tickers: [] };
}

export function renameWatchlist(id: number, name: string): WatchlistMeta | null {
  ensureWebSchema();
  const db = getDb();
  const clean = sanitizeName(name);
  const info = db.prepare("UPDATE web_watchlist SET name = ? WHERE id = ?").run(clean, id);
  if (info.changes === 0) return null;
  return getWatchlistMeta(id);
}

export function deleteWatchlist(id: number): void {
  ensureWebSchema();
  const db = getDb();
  db.prepare("DELETE FROM web_watchlist WHERE id = ?").run(id);
}

export function addWatchlistItem(id: number, ticker: string): WatchlistMeta | null {
  ensureWebSchema();
  const db = getDb();
  const t = sanitizeTicker(ticker);
  if (!getWatchlistMeta(id)) return null;
  db.prepare(
    "INSERT OR IGNORE INTO web_watchlist_item (watchlist_id, ticker, added_at) VALUES (?, ?, ?)",
  ).run(id, t, nowSec());
  return getWatchlistMeta(id);
}

export function removeWatchlistItem(id: number, ticker: string): WatchlistMeta | null {
  ensureWebSchema();
  const db = getDb();
  const t = sanitizeTicker(ticker);
  if (!getWatchlistMeta(id)) return null;
  db.prepare("DELETE FROM web_watchlist_item WHERE watchlist_id = ? AND ticker = ?").run(id, t);
  return getWatchlistMeta(id);
}

// ---------------------------------------------------------------------------
// Portfolios
// ---------------------------------------------------------------------------

export function listPortfolios(): PortfolioMeta[] {
  ensureWebSchema();
  const db = getDb();
  return db
    .prepare("SELECT id, name FROM web_portfolio ORDER BY sort, id")
    .all() as PortfolioMeta[];
}

export function getPortfolio(id: number): PortfolioMeta | null {
  ensureWebSchema();
  const db = getDb();
  const row = db.prepare("SELECT id, name FROM web_portfolio WHERE id = ?").get(id) as
    | PortfolioMeta
    | undefined;
  return row ?? null;
}

export function createPortfolio(name: string): PortfolioMeta {
  ensureWebSchema();
  const db = getDb();
  const clean = sanitizeName(name);
  const info = db
    .prepare("INSERT INTO web_portfolio (name, sort, created_at) VALUES (?, 0, ?)")
    .run(clean, nowSec());
  return { id: Number(info.lastInsertRowid), name: clean };
}

export function renamePortfolio(id: number, name: string): PortfolioMeta | null {
  ensureWebSchema();
  const db = getDb();
  const clean = sanitizeName(name);
  const info = db.prepare("UPDATE web_portfolio SET name = ? WHERE id = ?").run(clean, id);
  if (info.changes === 0) return null;
  return { id, name: clean };
}

export function deletePortfolio(id: number): void {
  ensureWebSchema();
  const db = getDb();
  db.prepare("DELETE FROM web_portfolio WHERE id = ?").run(id);
}

export function getHoldings(id: number): StoredHolding[] {
  ensureWebSchema();
  const db = getDb();
  const rows = db
    .prepare(
      "SELECT id, ticker, quantity, avg_cost_vnd FROM web_holding WHERE portfolio_id = ? ORDER BY added_at, id",
    )
    .all(id) as { id: number; ticker: string; quantity: number; avg_cost_vnd: number }[];
  return rows.map((r) => ({
    id: r.id,
    ticker: r.ticker,
    quantity: r.quantity,
    avgCostVnd: r.avg_cost_vnd,
  }));
}

export function addHolding(id: number, input: HoldingInput): StoredHolding {
  ensureWebSchema();
  const db = getDb();
  const ticker = sanitizeTicker(input.ticker);
  const quantity = Number(input.quantity);
  const avgCostVnd = Number(input.avgCostVnd);
  if (!Number.isFinite(quantity) || quantity <= 0) throw new Error("quantity must be > 0");
  if (!Number.isFinite(avgCostVnd) || avgCostVnd < 0) throw new Error("avgCostVnd must be >= 0");
  const info = db
    .prepare(
      "INSERT INTO web_holding (portfolio_id, ticker, quantity, avg_cost_vnd, added_at) VALUES (?, ?, ?, ?, ?)",
    )
    .run(id, ticker, quantity, avgCostVnd, nowSec());
  return { id: Number(info.lastInsertRowid), ticker, quantity, avgCostVnd };
}

export function updateHolding(
  hid: number,
  patch: { quantity?: number; avgCostVnd?: number },
): void {
  ensureWebSchema();
  const db = getDb();
  const sets: string[] = [];
  const args: (number | string)[] = [];
  if (patch.quantity !== undefined) {
    const quantity = Number(patch.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) throw new Error("quantity must be > 0");
    sets.push("quantity = ?");
    args.push(quantity);
  }
  if (patch.avgCostVnd !== undefined) {
    const avgCostVnd = Number(patch.avgCostVnd);
    if (!Number.isFinite(avgCostVnd) || avgCostVnd < 0) throw new Error("avgCostVnd must be >= 0");
    sets.push("avg_cost_vnd = ?");
    args.push(avgCostVnd);
  }
  if (!sets.length) return;
  args.push(hid);
  db.prepare(`UPDATE web_holding SET ${sets.join(", ")} WHERE id = ?`).run(...args);
}

export function deleteHolding(hid: number): void {
  ensureWebSchema();
  const db = getDb();
  db.prepare("DELETE FROM web_holding WHERE id = ?").run(hid);
}
