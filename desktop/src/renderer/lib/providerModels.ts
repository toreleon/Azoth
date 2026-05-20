export type LlmProvider = "anthropic" | "compatible";

export function normalizeProvider(provider: string | undefined): LlmProvider {
  return provider === "compatible" ? "compatible" : "anthropic";
}

export function availableModelOrDefault(models: string[], model: string | undefined): string {
  if (model && models.includes(model)) return model;
  return models[0] ?? model ?? "";
}

export function modelIsAvailable(models: string[], model: string | undefined): boolean {
  return Boolean(model && models.includes(model));
}
