import { useEffect, useState } from "react";
import { normalizeProvider, type LlmProvider } from "./providerModels.js";

interface UseProviderModelsInput {
  provider?: string;
  apiKey?: string;
  baseUrl?: string;
}

interface ProviderModelsState {
  provider: LlmProvider;
  models: string[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useProviderModels(input: UseProviderModelsInput): ProviderModelsState {
  const provider = normalizeProvider(input.provider);
  const apiKey = input.apiKey ?? "";
  const baseUrl = input.baseUrl ?? "";
  const [refreshId, setRefreshId] = useState(0);
  const [state, setState] = useState<ProviderModelsState>({
    provider,
    models: [],
    loading: true,
    error: null,
    refresh: () => setRefreshId((id) => id + 1),
  });

  useEffect(() => {
    let cancelled = false;
    setState((current) => ({
      ...current,
      provider,
      loading: true,
      error: null,
    }));

    if (!apiKey.trim()) {
      setState((current) => ({
        ...current,
        provider,
        models: [],
        loading: false,
        error: "API key is required",
      }));
      return () => {
        cancelled = true;
      };
    }
    if (provider === "compatible" && !baseUrl.trim()) {
      setState((current) => ({
        ...current,
        provider,
        models: [],
        loading: false,
        error: "Base URL is required",
      }));
      return () => {
        cancelled = true;
      };
    }

    const timer = window.setTimeout(() => {
      void (async () => {
        const res = await window.azoth.invoke("models:list", {
          provider,
          apiKey,
          baseUrl,
        });
        if (cancelled) return;
        setState({
          refresh: () => setRefreshId((id) => id + 1),
          provider,
          models: res.models,
          loading: false,
          error: res.error ?? null,
        });
      })();
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [apiKey, baseUrl, provider, refreshId]);

  return state;
}
