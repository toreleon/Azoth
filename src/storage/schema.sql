CREATE TABLE IF NOT EXISTS kv_cache (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS kv_cache_expires_idx ON kv_cache(expires_at);

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

-- Backtest harness (Phase 6)

CREATE TABLE IF NOT EXISTS backtest_runs (
  id              TEXT PRIMARY KEY,
  persona         TEXT NOT NULL,
  start_date      INTEGER NOT NULL,
  end_date        INTEGER NOT NULL,
  cadence         TEXT NOT NULL,         -- e.g. "30m", "1h", "2h"
  initial_cash_vnd INTEGER NOT NULL,
  config_json     TEXT NOT NULL,
  created_at      INTEGER NOT NULL,
  finished_at     INTEGER
);

CREATE TABLE IF NOT EXISTS backtest_turns (
  run_id              TEXT NOT NULL,
  as_of               INTEGER NOT NULL,
  session_id          TEXT,
  prompt              TEXT,
  response            TEXT,
  in_tokens           INTEGER,
  out_tokens          INTEGER,
  cost_usd            REAL,
  cache_read_tokens   INTEGER DEFAULT 0,
  cache_creation_tokens INTEGER DEFAULT 0,
  PRIMARY KEY (run_id, as_of)
);

CREATE TABLE IF NOT EXISTS llm_response_cache (
  key            TEXT PRIMARY KEY,
  model          TEXT NOT NULL,
  request_json   TEXT NOT NULL,
  response_json  TEXT NOT NULL,
  created_at     INTEGER NOT NULL,
  hit_count      INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS backtest_equity (
  run_id            TEXT NOT NULL,
  as_of             INTEGER NOT NULL,
  cash_vnd          REAL NOT NULL,
  mtm_vnd           REAL NOT NULL,
  benchmark_mtm_vnd REAL NOT NULL,
  PRIMARY KEY (run_id, as_of)
);
