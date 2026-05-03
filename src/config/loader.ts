import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import { DEFAULT_CONFIG_YAML } from "../runtime/defaultConfig.js";
import { azothPaths, ensureAzothDirs } from "../runtime/paths.js";

const ConfigSchema = z.object({
  autonomy: z.enum(["advisory", "confirm", "auto"]),
  model: z.string().min(1),
  team: z
    .object({
      quick_model: z.string().min(1).optional(),
      deep_model: z.string().min(1).optional(),
      output_language: z.string().min(1).default("en"),
    })
    .optional()
    .default({}),
  watchlist: z.array(z.string().regex(/^[A-Z0-9]{3,4}$/)).min(1),
  broker: z.enum(["paper", "dnse"]),
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

export function loadConfig(): Config {
  if (cached) return cached;
  const configOverride = process.env.VNSTOCK_CONFIG?.trim() || undefined;
  const path = resolve(configOverride ?? azothPaths().config);
  if (!configOverride) {
    ensureAzothDirs();
    if (!existsSync(path)) {
      writeFileSync(path, DEFAULT_CONFIG_YAML, { encoding: "utf8", mode: 0o600 });
    }
  }
  if (existsSync(path) && statSync(path).isDirectory()) {
    throw new Error(`Config path points to a directory: ${path}. Set VNSTOCK_CONFIG to a YAML file path.`);
  }
  const raw = readFileSync(path, "utf8");
  const parsed = parseYaml(raw);
  cached = ConfigSchema.parse(parsed);
  return cached;
}

export function resetConfigCacheForTests(): void {
  cached = null;
}
