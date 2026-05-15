import { useEffect, useState } from "react";
import { availableModelOrDefault, normalizeProvider } from "../../lib/providerModels.js";
import { useProviderModels } from "../../lib/useProviderModels.js";

interface Props {
  onDone: () => void;
}

export function Onboarding({ onDone }: Props) {
  const [step, setStep] = useState<"welcome" | "llm" | "broker" | "done">("welcome");
  const [provider, setProvider] = useState("anthropic");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [broker, setBroker] = useState("paper");
  const modelList = useProviderModels({ provider, apiKey, baseUrl });

  useEffect(() => {
    void (async () => {
      const cfg = (await window.azoth.invoke("config:get", undefined)) as
        | { llm?: { api_key?: string; provider?: string; base_url?: string }; model?: string }
        | null;
      if (cfg?.llm?.api_key) setApiKey(cfg.llm.api_key);
      const nextProvider = normalizeProvider(cfg?.llm?.provider);
      if (cfg?.llm?.provider) setProvider(nextProvider);
      if (cfg?.llm?.base_url) setBaseUrl(cfg.llm.base_url);
      if (cfg?.model) setModel(cfg.model);
    })();
  }, []);

  function updateProvider(value: string) {
    const nextProvider = normalizeProvider(value);
    setProvider(nextProvider);
    setModel("");
  }

  async function saveLlm() {
    const selectedModel = availableModelOrDefault(modelList.models, model);
    if (!selectedModel) return;
    await window.azoth.invoke("config:save", {
      patch: {
        model: selectedModel,
        llm: { provider, api_key: apiKey, base_url: baseUrl },
      },
    });
    setStep("broker");
  }

  useEffect(() => {
    if (modelList.loading || modelList.error || modelList.models.length === 0) return;
    setModel((current) => availableModelOrDefault(modelList.models, current));
  }, [modelList.error, modelList.loading, modelList.models]);

  async function saveBroker() {
    await window.azoth.invoke("config:save", { patch: { broker } });
    await window.azoth.invoke("onboarding:complete", undefined);
    setStep("done");
    onDone();
  }

  return (
    <div className="flex h-full w-full items-center justify-center bg-azoth-bg px-6">
      <div className="w-[480px] rounded-2xl border border-azoth-border bg-azoth-surface p-8">
        {step === "welcome" && (
          <>
            <h1 className="mb-2 text-xl text-azoth-text">Welcome to Azoth</h1>
            <p className="mb-6 text-sm text-azoth-muted">
              AI co-pilot for Vietnamese equities — analysis, paper trading, and live broker
              workflows. Let&apos;s get you set up.
            </p>
            <button
              onClick={() => setStep("llm")}
              className="w-full rounded-md bg-azoth-accent px-4 py-2 text-sm text-white"
            >
              Get started
            </button>
          </>
        )}

        {step === "llm" && (
          <>
            <h2 className="mb-4 text-lg text-azoth-text">LLM access</h2>
            <Field label="Provider">
              <select
                value={provider}
                onChange={(e) => updateProvider(e.target.value)}
                className="w-full rounded border border-azoth-border bg-azoth-panel px-3 py-2 text-sm text-azoth-text"
              >
                <option value="anthropic">Anthropic</option>
                <option value="compatible">Anthropic-compatible</option>
              </select>
            </Field>
            <Field label="API key">
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-ant-…"
                className="w-full rounded border border-azoth-border bg-azoth-panel px-3 py-2 text-sm text-azoth-text outline-none focus:border-azoth-accent"
              />
            </Field>
            {provider === "compatible" && (
              <Field label="Base URL">
                <input
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  className="w-full rounded border border-azoth-border bg-azoth-panel px-3 py-2 text-sm text-azoth-text outline-none focus:border-azoth-accent"
                />
              </Field>
            )}
            <Field label="Model">
              <select
                value={modelList.loading || modelList.error || modelList.models.length === 0
                  ? ""
                  : availableModelOrDefault(modelList.models, model)}
                disabled={modelList.loading || Boolean(modelList.error) || modelList.models.length === 0}
                onChange={(e) => setModel(e.target.value)}
                className="w-full rounded border border-azoth-border bg-azoth-panel px-3 py-2 text-sm text-azoth-text outline-none focus:border-azoth-accent"
              >
                {modelList.loading || modelList.error || modelList.models.length === 0 ? (
                  <option value="">
                    {modelList.loading ? "Loading models..." : modelList.error ? "Models unavailable" : "No models"}
                  </option>
                ) : null}
                {modelList.models.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </Field>
            <button
              onClick={saveLlm}
              disabled={!apiKey.trim() || modelList.loading || Boolean(modelList.error) || !availableModelOrDefault(modelList.models, model)}
              className="mt-2 w-full rounded-md bg-azoth-accent px-4 py-2 text-sm text-white disabled:opacity-40"
            >
              Continue
            </button>
          </>
        )}

        {step === "broker" && (
          <>
            <h2 className="mb-4 text-lg text-azoth-text">Broker</h2>
            <p className="mb-4 text-xs text-azoth-muted">
              Choose how Azoth simulates orders. You can switch later in Settings.
            </p>
            <Field label="Broker">
              <select
                value={broker}
                onChange={(e) => setBroker(e.target.value)}
                className="w-full rounded border border-azoth-border bg-azoth-panel px-3 py-2 text-sm text-azoth-text"
              >
                <option value="paper">Paper (recommended)</option>
                <option value="dnse">DNSE</option>
                <option value="fhsc">FHSC</option>
              </select>
            </Field>
            <button
              onClick={saveBroker}
              className="mt-2 w-full rounded-md bg-azoth-accent px-4 py-2 text-sm text-white"
            >
              Finish
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="mb-3 block">
      <span className="mb-1 block text-xs uppercase tracking-wider text-azoth-muted">{label}</span>
      {children}
    </label>
  );
}
