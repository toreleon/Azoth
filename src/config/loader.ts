import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { z } from "zod";
import { DEFAULT_CONFIG_YAML } from "../runtime/defaultConfig.js";
import { azothPaths, ensureAzothDirs } from "../runtime/paths.js";

const ConfigSchema = z.object({
  autonomy: z.enum(["advisory", "confirm", "auto"]),
  model: z.string().min(1),
  llm: z
    .object({
      provider: z.enum(["anthropic", "compatible"]).default("anthropic"),
      api_key: z.string().default(""),
      base_url: z.string().default(""),
    })
    .optional()
    .default({ provider: "anthropic", api_key: "", base_url: "" }),
  team: z
    .object({
      quick_model: z.string().min(1).optional(),
      deep_model: z.string().min(1).optional(),
      output_language: z.string().min(1).default("en"),
    })
    .optional()
    .default({}),
  broker: z.enum(["paper", "dnse", "fhsc"]),
  fhsc: z
    .object({
      sub_account_id: z.string().default(""),
      account_id: z.string().default(""),
      base_url: z.string().default("https://api.vinasecurities.com"),
      access_token: z.string().default(""),
      access_key: z.string().default(""),
      device_id: z.string().default(""),
      user_id: z.string().default(""),
      cust_id: z.string().default(""),
      api_key: z.string().default(""),
      api_secret: z.string().default(""),
    })
    .optional()
    .default({
      sub_account_id: "",
      account_id: "",
      base_url: "https://api.vinasecurities.com",
      access_token: "",
      access_key: "",
      device_id: "",
      user_id: "",
      cust_id: "",
      api_key: "",
      api_secret: "",
    }),
  risk: z.object({
    max_position_pct: z.number().min(0).max(1),
    max_daily_loss_pct: z.number().min(0).max(1),
    max_order_notional_vnd: z.number().positive(),
    ticker_whitelist: z.array(z.string()),
    allow_margin: z.boolean(),
  }),
});

export type Config = z.infer<typeof ConfigSchema>;

let cached: Config | null = null;

function applyLlmEnvironment(cfg: Config): void {
  const apiKey = cfg.llm.api_key.trim();
  const baseUrl = cfg.llm.base_url.trim();
  if (apiKey) process.env.ANTHROPIC_API_KEY = apiKey;
  else delete process.env.ANTHROPIC_API_KEY;
  if (cfg.llm.provider === "compatible" && baseUrl) process.env.ANTHROPIC_BASE_URL = baseUrl;
  else delete process.env.ANTHROPIC_BASE_URL;
}

function configPath(): { path: string; override: boolean } {
  const configOverride = process.env.AZOTH_CONFIG?.trim() || undefined;
  return {
    path: resolve(configOverride ?? azothPaths().config),
    override: configOverride != null,
  };
}

export function loadConfig(): Config {
  if (cached) {
    applyLlmEnvironment(cached);
    return cached;
  }
  const { path, override } = configPath();
  if (!override) {
    ensureAzothDirs();
    if (!existsSync(path)) {
      writeFileSync(path, DEFAULT_CONFIG_YAML, { encoding: "utf8", mode: 0o600 });
    }
  }
  if (existsSync(path) && statSync(path).isDirectory()) {
    throw new Error(`Config path points to a directory: ${path}. Set AZOTH_CONFIG to a YAML file path.`);
  }
  const raw = readFileSync(path, "utf8");
  const parsed = parseYaml(raw);
  cached = ConfigSchema.parse(parsed);
  applyLlmEnvironment(cached);
  return cached;
}

export function saveConfig(next: Config): Config {
  const parsed = ConfigSchema.parse(next);
  const { path, override } = configPath();
  if (!override) ensureAzothDirs();
  if (existsSync(path) && statSync(path).isDirectory()) {
    throw new Error(`Config path points to a directory: ${path}. Set AZOTH_CONFIG to a YAML file path.`);
  }
  writeFileSync(path, stringifyYaml(parsed), { encoding: "utf8", mode: 0o600 });
  cached = parsed;
  applyLlmEnvironment(cached);
  return parsed;
}

export function updateConfig(patch: Partial<Config>): Config {
  return saveConfig({
    ...loadConfig(),
    ...patch,
    llm: patch.llm ? { ...loadConfig().llm, ...patch.llm } : loadConfig().llm,
    team: patch.team ? { ...loadConfig().team, ...patch.team } : loadConfig().team,
    fhsc: patch.fhsc ? { ...loadConfig().fhsc, ...patch.fhsc } : loadConfig().fhsc,
    risk: patch.risk ? { ...loadConfig().risk, ...patch.risk } : loadConfig().risk,
  });
}

export function resetConfigCacheForTests(): void {
  cached = null;
}
