CREATE TABLE IF NOT EXISTS kv_cache (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS kv_cache_expires_idx ON kv_cache(expires_at);

CREATE TABLE IF NOT EXISTS positions (
  ticker     TEXT PRIMARY KEY,
  quantity   INTEGER NOT NULL,
  avg_cost   REAL NOT NULL,
  opened_at  INTEGER NOT NULL,
  notes      TEXT
);

CREATE TABLE IF NOT EXISTS decisions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at  INTEGER NOT NULL,
  ticker      TEXT NOT NULL,
  action      TEXT NOT NULL,         -- BUY | SELL | HOLD | WATCH
  rationale   TEXT NOT NULL,         -- 4-dimension synthesis
  exit_plan   TEXT,                  -- thresholds for stop/take-profit
  source_run  TEXT                   -- session id, optional
);

CREATE INDEX IF NOT EXISTS decisions_ticker_idx ON decisions(ticker, created_at);

CREATE TABLE IF NOT EXISTS alerts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at  INTEGER NOT NULL,
  ticker      TEXT,
  level       TEXT NOT NULL,         -- info | warn | critical
  message     TEXT NOT NULL
);
