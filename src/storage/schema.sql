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
  action      TEXT NOT NULL,         -- legacy BUY | SELL | HOLD
  rating      TEXT,                  -- Buy | Overweight | Hold | Underweight | Sell
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

-- Backtest harness (Phase 6)

CREATE TABLE IF NOT EXISTS backtest_runs (
  id              TEXT PRIMARY KEY,
  persona         TEXT NOT NULL,
  start_date      INTEGER NOT NULL,
  end_date        INTEGER NOT NULL,
  cadence         TEXT NOT NULL,         -- "weekly"
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

-- Agent profile (Phase 7: evolving profile + harness)

CREATE TABLE IF NOT EXISTS agent_profiles (
  id            TEXT NOT NULL,
  version       INTEGER NOT NULL,
  parent_ver    INTEGER,
  profile_json  TEXT NOT NULL,
  created_at    INTEGER NOT NULL,
  PRIMARY KEY (id, version)
);

CREATE TABLE IF NOT EXISTS profile_evaluations (
  profile_id   TEXT NOT NULL,
  profile_ver  INTEGER NOT NULL,
  fold         TEXT NOT NULL,
  run_id       TEXT NOT NULL,
  sharpe       REAL,
  max_dd       REAL,
  alpha        REAL,
  total_return REAL,
  fitness      REAL,
  created_at   INTEGER NOT NULL,
  PRIMARY KEY (profile_id, profile_ver, fold)
);

CREATE TABLE IF NOT EXISTS agent_memory (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id  TEXT NOT NULL,
  layer       TEXT NOT NULL,
  as_of       INTEGER NOT NULL,
  content     TEXT NOT NULL,
  importance  REAL NOT NULL DEFAULT 0.5,
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS agent_memory_lookup ON agent_memory(profile_id, layer, as_of);

CREATE TABLE IF NOT EXISTS alerts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at  INTEGER NOT NULL,
  ticker      TEXT,
  level       TEXT NOT NULL,         -- info | warn | critical
  message     TEXT NOT NULL
);
