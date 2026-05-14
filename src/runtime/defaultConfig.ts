export const DEFAULT_CONFIG_YAML = `# Azoth configuration

# advisory | confirm | auto
autonomy: advisory

# Default model for the orchestrator.
model: glm-5.1

# LLM provider settings. api_key is stored in this 0600 config file so Azoth
# does not depend on shell env files.
llm:
  provider: anthropic
  api_key: ""
  base_url: ""

# Multi-agent team model tiers. Research Manager and Portfolio Manager use
# deep_model; analysts, researchers, trader, and risk use quick_model.
team:
  quick_model: glm-5.1
  deep_model: glm-5.1
  output_language: en

# Broker selection.
broker: paper

# FHSC broker settings. Use /setup-fhsc in the TUI to fill these safely.
fhsc:
  sub_account_id: ""
  account_id: ""
  base_url: https://api.vinasecurities.com
  access_token: ""
  access_key: ""
  device_id: ""
  user_id: ""
  cust_id: ""
  api_key: ""
  api_secret: ""

# Risk guardrails.
risk:
  max_position_pct: 0.15
  max_daily_loss_pct: 0.03
  max_order_notional_vnd: 50000000
  ticker_whitelist: []
  allow_margin: false
`;
