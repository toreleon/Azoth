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

-- Paper / live broker state (Phase 4+)

CREATE TABLE IF NOT EXISTS broker_state (
  broker     TEXT PRIMARY KEY,        -- 'paper' | 'dnse'
  cash_vnd   REAL NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS broker_positions (
  broker     TEXT NOT NULL,
  ticker     TEXT NOT NULL,
  quantity   INTEGER NOT NULL,
  avg_cost   REAL NOT NULL,           -- thousand VND
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (broker, ticker)
);

CREATE TABLE IF NOT EXISTS broker_orders (
  id              TEXT PRIMARY KEY,
  broker          TEXT NOT NULL,
  ticker          TEXT NOT NULL,
  side            TEXT NOT NULL,      -- BUY | SELL
  type            TEXT NOT NULL,      -- MARKET | LIMIT
  quantity        INTEGER NOT NULL,
  limit_price     REAL,                -- thousand VND
  status          TEXT NOT NULL,      -- PENDING | FILLED | CANCELLED | REJECTED
  reject_reason   TEXT,
  created_at      INTEGER NOT NULL,
  filled_at       INTEGER,
  filled_price    REAL,                -- thousand VND
  filled_qty      INTEGER,
  notes           TEXT
);

CREATE INDEX IF NOT EXISTS broker_orders_ticker_idx ON broker_orders(broker, ticker, created_at);
CREATE INDEX IF NOT EXISTS broker_orders_status_idx ON broker_orders(broker, status);

CREATE TABLE IF NOT EXISTS alerts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at  INTEGER NOT NULL,
  ticker      TEXT,
  level       TEXT NOT NULL,         -- info | warn | critical
  message     TEXT NOT NULL
);
