import { useEffect } from "react";
import { ChevronDownIcon } from "../Icon.js";
import { availableModelOrDefault, normalizeProvider } from "../../lib/providerModels.js";
import { useProviderModels } from "../../lib/useProviderModels.js";
import { useChatStore } from "../../store/chatStore.js";

export function ModelPicker() {
  const config = useChatStore((s) => s.config) as {
    model?: string;
    llm?: { provider?: string; api_key?: string; base_url?: string };
  } | null;
  const setConfig = useChatStore((s) => s.setConfig);
  const provider = normalizeProvider(config?.llm?.provider);
  const modelList = useProviderModels({
    provider,
    apiKey: config?.llm?.api_key,
    baseUrl: config?.llm?.base_url,
  });
  const selectedModel = availableModelOrDefault(modelList.models, config?.model);

  async function update(model: string) {
    if (!model) return;
    const next = await window.azoth.invoke("config:save", { patch: { model } });
    setConfig(next);
  }

  useEffect(() => {
    if (modelList.loading || modelList.error || modelList.models.length === 0) return;
    if (!config?.model || config.model === selectedModel) return;
    void update(selectedModel);
  }, [config?.model, modelList.error, modelList.loading, modelList.models.length, selectedModel]);

  const disabled = modelList.loading || Boolean(modelList.error) || modelList.models.length === 0;

  return (
    <label className="picker" title="Model">
      <select
        value={disabled ? "" : selectedModel}
        disabled={disabled}
        onChange={(e) => void update(e.target.value)}
        className="picker-select"
      >
        {disabled ? (
          <option value="">{modelList.loading ? "Loading models..." : "No models"}</option>
        ) : null}
        {modelList.models.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
      <ChevronDownIcon className="grip" />
    </label>
  );
}
