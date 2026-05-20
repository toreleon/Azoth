import { useEffect, useRef, useState } from "react";
import { RefreshIcon } from "../Icon.js";
import {
  availableModelOrDefault,
  modelIsAvailable,
  normalizeProvider,
  type LlmProvider,
} from "../../lib/providerModels.js";
import { useProviderModels } from "../../lib/useProviderModels.js";
import { Group, GroupTitle, ModelSelect, PaneShell, PasswordField, SettingRow } from "./SettingsControls.js";

export function ModelsPane({
  config,
  onSave,
  onNotify,
}: {
  config: Record<string, any> | null;
  onSave: (patch: Record<string, unknown>) => Promise<void>;
  onNotify: (message: string) => void;
}) {
  const llm = config?.llm ?? {};
  const team = config?.team ?? {};
  const provider = normalizeProvider(llm.provider);
  const [apiKey, setApiKey] = useState(llm.api_key ?? "");
  const [baseUrl, setBaseUrl] = useState(llm.base_url ?? "");
  const [showKey, setShowKey] = useState(false);
  const modelList = useProviderModels({ provider, apiKey, baseUrl });
  const connectionReady = Boolean(apiKey.trim()) && (provider === "anthropic" || Boolean(baseUrl.trim()));
  const lastConnectionNotice = useRef("");

  useEffect(() => {
    setApiKey(llm.api_key ?? "");
    setBaseUrl(llm.base_url ?? "");
  }, [llm.api_key, llm.base_url]);

  useEffect(() => {
    if (!config) return;
    if (modelList.loading || modelList.error || modelList.models.length === 0) return;
    if (
      modelIsAvailable(modelList.models, config.model) &&
      modelIsAvailable(modelList.models, team.quick_model ?? config.model) &&
      modelIsAvailable(modelList.models, team.deep_model ?? config.model)
    ) {
      return;
    }
    void onSave({
      model: availableModelOrDefault(modelList.models, config.model),
      team: {
        ...team,
        quick_model: availableModelOrDefault(modelList.models, team.quick_model ?? config.model),
        deep_model: availableModelOrDefault(modelList.models, team.deep_model ?? config.model),
      },
    });
  }, [config, modelList.error, modelList.loading, modelList.models, onSave, team]);

  useEffect(() => {
    if (modelList.loading) return;
    const message = !connectionReady
      ? provider === "compatible" && !baseUrl.trim()
        ? "Missing endpoint"
        : "Missing API key"
      : modelList.error
        ? modelList.error
        : modelList.models.length > 0
          ? `${modelList.models.length} models loaded`
          : "No models found";
    const key = `${provider}:${apiKey}:${baseUrl}:${message}`;
    if (lastConnectionNotice.current === key) return;
    lastConnectionNotice.current = key;
    onNotify(message);
  }, [
    apiKey,
    baseUrl,
    connectionReady,
    modelList.error,
    modelList.loading,
    modelList.models.length,
    onNotify,
    provider,
  ]);

  function saveProvider(nextProvider: LlmProvider) {
    return onSave({
      llm: {
        ...llm,
        provider: nextProvider,
        base_url: baseUrl,
      },
    });
  }

  return (
    <PaneShell title="Models" subtitle="LLM provider, API credentials, and model tiers for the agent team.">
      <GroupTitle>Provider</GroupTitle>
      <Group>
        <SettingRow
          label="Provider"
          control={
            <>
              <select
                value={provider}
                onChange={(e) => void saveProvider(normalizeProvider(e.target.value))}
              >
                <option value="anthropic">Anthropic</option>
                <option value="compatible">Anthropic-compatible (proxy)</option>
              </select>
              <button
                className="settings-icon-btn"
                disabled={!connectionReady}
                title="Refresh models"
                aria-label="Refresh models"
                onClick={modelList.refresh}
              >
                <RefreshIcon />
              </button>
            </>
          }
        />
        <SettingRow
          label="API key"
          hint="Stored locally in ~/.azoth/config.yaml with mode 0600."
          control={
            <PasswordField
              value={apiKey}
              visible={showKey}
              onToggle={() => setShowKey((v) => !v)}
              onChange={setApiKey}
              onBlur={() => void onSave({ llm: { ...llm, api_key: apiKey, base_url: baseUrl } })}
            />
          }
        />
        {provider === "compatible" && (
          <SettingRow
            label="Endpoint"
            hint="Anthropic-compatible base URL. This is preserved if you switch providers."
            control={
              <input
                className="mono w-lg"
                value={baseUrl}
                placeholder="https://provider.example.com"
                onChange={(e) => setBaseUrl(e.target.value)}
                onBlur={() => void onSave({ llm: { ...llm, api_key: apiKey, base_url: baseUrl } })}
              />
            }
          />
        )}
      </Group>

      <GroupTitle>Team tiers</GroupTitle>
      <Group>
        <SettingRow
          label="Quick model"
          hint="Analysts, researchers, trader, risk agent."
          control={
            <ModelSelect
              models={modelList.models}
              loading={modelList.loading}
              error={modelList.error}
              value={team.quick_model ?? config?.model}
              onChange={(quick_model) => void onSave({ team: { ...team, quick_model } })}
            />
          }
        />
        <SettingRow
          label="Deep model"
          hint="Research manager and portfolio manager, used sparingly."
          control={
            <ModelSelect
              models={modelList.models}
              loading={modelList.loading}
              error={modelList.error}
              value={team.deep_model ?? config?.model}
              onChange={(deep_model) => void onSave({ team: { ...team, deep_model } })}
            />
          }
        />
        <SettingRow
          label="Orchestrator default"
          hint="Top-level model used by the desktop chat."
          control={
            <ModelSelect
              models={modelList.models}
              loading={modelList.loading}
              error={modelList.error}
              value={config?.model}
              onChange={(model) => void onSave({ model })}
            />
          }
        />
      </Group>

      <GroupTitle>Budget</GroupTitle>
      <Group>
        <SettingRow
          label="Daily spend cap"
          hint="Soft cap, used for warning and planning."
          control={
            <>
              <input className="w-num" type="number" value="5.00" step="0.5" onChange={() => undefined} />
              <span className="settings-unit">USD / day</span>
            </>
          }
        />
        <SettingRow
          label="Today's spend"
          hint="Resets at 00:00 ICT."
          control={
            <>
              <span className="settings-stat">$0.00 of $5.00</span>
              <div className="settings-meter"><span style={{ width: "0%" }} /></div>
            </>
          }
        />
      </Group>
    </PaneShell>
  );
}
