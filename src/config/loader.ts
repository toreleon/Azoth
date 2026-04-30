import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import { z } from "zod";

const ConfigSchema = z.object({
  autonomy: z.enum(["advisory", "confirm", "auto"]),
  model: z.string().min(1),
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
  const path = resolve(
    process.env.VNSTOCK_CONFIG ?? "src/config/config.yaml",
  );
  const raw = readFileSync(path, "utf8");
  const parsed = parseYaml(raw);
  cached = ConfigSchema.parse(parsed);
  return cached;
}
