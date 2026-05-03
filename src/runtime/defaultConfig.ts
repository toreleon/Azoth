export const DEFAULT_CONFIG_YAML = `# Azoth configuration

# advisory | confirm | auto
autonomy: advisory

# Default model for the orchestrator.
model: glm-5.1

# Multi-agent team model tiers. Research Manager and Portfolio Manager use
# deep_model; analysts, researchers, trader, and risk use quick_model.
team:
  quick_model: glm-5.1
  deep_model: glm-5.1
  output_language: en

# Tickers the agent should track by default.
watchlist:
  - HPG
  - VCB
  - FPT
  - VNM
  - MWG

# Broker selection.
broker: paper

# Risk guardrails.
risk:
  max_position_pct: 0.15
  max_daily_loss_pct: 0.03
  max_order_notional_vnd: 50000000
  ticker_whitelist: []
  allow_margin: false
`;

export const DEFAULT_ENV_EXAMPLE = `# Azoth environment
ANTHROPIC_API_KEY=

# Optional overrides:
# AZOTH_HOME=~/.azoth
# VNSTOCK_CONFIG=/absolute/path/to/config.yaml
# VNSTOCK_DB=/absolute/path/to/azoth.db
`;
