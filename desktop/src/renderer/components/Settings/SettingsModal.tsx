import { useEffect, useRef, useState } from "react";
import type React from "react";
import type { DesktopSettings } from "../../../shared/ipc.js";
import {
  ArrowLeftIcon,
  BrokerIcon,
  ChevronRightIcon,
  EyeIcon,
  FolderIcon,
  InfoIcon,
  ModelIcon,
  RefreshIcon,
  SettingsIcon,
  SlidersIcon,
  AlertIcon,
} from "../Icon.js";
import {
  availableModelOrDefault,
  modelIsAvailable,
  normalizeProvider,
  type LlmProvider,
} from "../../lib/providerModels.js";
import { useProviderModels } from "../../lib/useProviderModels.js";
import { useChatStore } from "../../store/chatStore.js";

type Pane = "general" | "models" | "broker" | "risk" | "sessions" | "advanced" | "about";

interface Props {
  onClose: () => void;
}

const panes: Array<{ id: Pane; label: string; icon: React.ReactNode; group?: "primary" | "secondary" }> = [
  { id: "general", label: "General", icon: <SettingsIcon /> },
  { id: "models", label: "Models", icon: <ModelIcon /> },
  { id: "broker", label: "Broker", icon: <BrokerIcon /> },
  { id: "risk", label: "Risk", icon: <AlertIcon /> },
  { id: "sessions", label: "Data & Sessions", icon: <FolderIcon />, group: "secondary" },
  { id: "advanced", label: "Advanced", icon: <SlidersIcon />, group: "secondary" },
  { id: "about", label: "About", icon: <InfoIcon />, group: "secondary" },
];

export function SettingsModal({ onClose }: Props) {
  const [pane, setPane] = useState<Pane>("general");
  const [toast, setToast] = useState({ visible: false, message: "Saved" });
  const toastTimer = useRef<number | null>(null);
  const config = useChatStore((s) => s.config) as Record<string, any> | null;
  const appSettings = useChatStore((s) => s.appSettings);
  const setConfig = useChatStore((s) => s.setConfig);
  const setAppSettings = useChatStore((s) => s.setAppSettings);
  const projects = useChatStore((s) => s.projects);
  const sessions = useChatStore((s) => s.sessions);

  useEffect(() => {
    return () => {
      if (toastTimer.current != null) window.clearTimeout(toastTimer.current);
    };
  }, []);

  function showToast(message: string) {
    setToast({ visible: true, message });
    if (toastTimer.current != null) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(
      () => setToast((current) => ({ ...current, visible: false })),
      1800,
    );
  }

  function flashSaved() {
    showToast("Saved");
  }

  async function save(patch: Record<string, unknown>) {
    const next = await window.azoth.invoke("config:save", { patch });
    setConfig(next);
    flashSaved();
  }

  async function saveAppSettings(patch: Partial<DesktopSettings>) {
    const next = await window.azoth.invoke("app-settings:save", { patch });
    setAppSettings(next);
    flashSaved();
  }

  const primary = panes.filter((item) => item.group !== "secondary");
  const secondary = panes.filter((item) => item.group === "secondary");

  return (
    <div className="settings-backdrop" onMouseDown={onClose}>
      <div
        className="settings-win"
        role="dialog"
        aria-label="Azoth Settings"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="settings-titlebar">
          <div className="traffic">
            <span />
            <span />
            <span />
          </div>
          <div className="settings-titlebar-title">Settings</div>
        </div>

        <div className="settings-body">
          <nav className="settings-nav" aria-label="Settings sections">
            <button className="settings-back-btn" onClick={onClose}>
              <ArrowLeftIcon />
              Back to app
            </button>
            {primary.map((item) => (
              <NavItem key={item.id} item={item} active={pane === item.id} onClick={() => setPane(item.id)} />
            ))}
            {secondary.length > 0 && <div className="settings-nav-divider" />}
            {secondary.map((item) => (
              <NavItem key={item.id} item={item} active={pane === item.id} onClick={() => setPane(item.id)} />
            ))}
          </nav>

          <div className="settings-pane">
            {pane === "general" && (
              <GeneralPane
                config={config}
                appSettings={appSettings}
                onSave={save}
                onSaveAppSettings={saveAppSettings}
              />
            )}
            {pane === "models" && <ModelsPane config={config} onSave={save} onNotify={showToast} />}
            {pane === "broker" && <BrokerPane config={config} onSave={save} />}
            {pane === "risk" && <RiskPane config={config} onSave={save} />}
            {pane === "sessions" && <SessionsPane projects={projects.length} sessions={sessions.length} />}
            {pane === "advanced" && <AdvancedPane onSave={flashSaved} />}
            {pane === "about" && <AboutPane />}
          </div>
        </div>
      </div>
      <div className={`settings-saved${toast.visible ? " show" : ""}`}>
        {toast.message}
      </div>
    </div>
  );
}

function NavItem({
  item,
  active,
  onClick,
}: {
  item: { id: Pane; label: string; icon: React.ReactNode };
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button className="settings-nav-item" aria-current={active ? "true" : "false"} onClick={onClick}>
      <span className="ico">{item.icon}</span>
      {item.label}
    </button>
  );
}

function GeneralPane({
  config,
  appSettings,
  onSave,
  onSaveAppSettings,
}: {
  config: Record<string, any> | null;
  appSettings: DesktopSettings | null;
  onSave: (patch: Record<string, unknown>) => Promise<void>;
  onSaveAppSettings: (patch: Partial<DesktopSettings>) => Promise<void>;
}) {
  const team = config?.team ?? {};
  const settings = appSettings ?? {
    launchAtLogin: false,
    hideOnClose: true,
    showNotifications: true,
    notifyOnOrderFill: true,
    appearance: "light",
  } satisfies DesktopSettings;

  return (
    <PaneShell title="General" subtitle="Autonomy, default model tier, and app behavior.">
      <GroupTitle>Autonomy</GroupTitle>
      <Group>
        <SettingRow
          label="Autonomy mode"
          hint="Manual asks before every tool call. Auto runs tools without approval prompts."
          control={
            <Segmented
              value={config?.autonomy ?? "manual"}
              options={[
                { value: "manual", label: "Manual" },
                { value: "auto", label: "Auto" },
              ]}
              onChange={(autonomy) => void onSave({ autonomy })}
            />
          }
        />
        <SettingRow
          label="Output language"
          hint="Used by analyst and research agents."
          control={
            <select
              value={team.output_language ?? "en"}
              onChange={(e) => void onSave({ team: { ...team, output_language: e.target.value } })}
            >
              <option value="en">English</option>
              <option value="vi">Vietnamese</option>
            </select>
          }
        />
      </Group>

      <GroupTitle>App</GroupTitle>
      <Group>
        <SettingRow
          label="Launch at login"
          control={
            <Toggle
              checked={settings.launchAtLogin}
              onChange={(launchAtLogin) => void onSaveAppSettings({ launchAtLogin })}
            />
          }
        />
        <SettingRow
          label="Hide on close"
          hint="Keep Azoth running in the menu bar after the window closes."
          control={
            <Toggle
              checked={settings.hideOnClose}
              onChange={(hideOnClose) => void onSaveAppSettings({ hideOnClose })}
            />
          }
        />
        <SettingRow
          label="Show notifications"
          control={
            <Toggle
              checked={settings.showNotifications}
              onChange={(showNotifications) => void onSaveAppSettings({ showNotifications })}
            />
          }
        />
        <SettingRow
          label="Notify on order fill"
          hint="System notification when a live order fills or is rejected."
          control={
            <Toggle
              checked={settings.notifyOnOrderFill}
              onChange={(notifyOnOrderFill) => void onSaveAppSettings({ notifyOnOrderFill })}
            />
          }
        />
      </Group>

      <GroupTitle>Appearance</GroupTitle>
      <Group>
        <SettingRow
          label="Appearance"
          control={
            <Segmented
              value={settings.appearance}
              options={[
                { value: "light", label: "Light" },
                { value: "dark", label: "Dark" },
                { value: "system", label: "System" },
              ]}
              onChange={(appearance) => void onSaveAppSettings({ appearance })}
            />
          }
        />
      </Group>
    </PaneShell>
  );
}

function ModelsPane({
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

function BrokerPane({
  config,
  onSave,
}: {
  config: Record<string, any> | null;
  onSave: (patch: Record<string, unknown>) => Promise<void>;
}) {
  const fhsc = config?.fhsc ?? {};
  const [draft, setDraft] = useState<Record<string, string>>({
    sub_account_id: fhsc.sub_account_id ?? "",
    account_id: fhsc.account_id ?? "",
    api_key: fhsc.api_key ?? "",
    api_secret: fhsc.api_secret ?? "",
    base_url: fhsc.base_url ?? "https://api.vinasecurities.com",
    device_id: fhsc.device_id ?? "",
    user_id: fhsc.user_id ?? "",
    cust_id: fhsc.cust_id ?? "",
  });
  const [shown, setShown] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setDraft({
      sub_account_id: fhsc.sub_account_id ?? "",
      account_id: fhsc.account_id ?? "",
      api_key: fhsc.api_key ?? "",
      api_secret: fhsc.api_secret ?? "",
      base_url: fhsc.base_url ?? "https://api.vinasecurities.com",
      device_id: fhsc.device_id ?? "",
      user_id: fhsc.user_id ?? "",
      cust_id: fhsc.cust_id ?? "",
    });
  }, [
    fhsc.account_id,
    fhsc.api_key,
    fhsc.api_secret,
    fhsc.base_url,
    fhsc.cust_id,
    fhsc.device_id,
    fhsc.sub_account_id,
    fhsc.user_id,
  ]);

  const saveFhsc = () => void onSave({ fhsc: { ...fhsc, ...draft } });
  const hasLiveCredentials = Boolean(draft.sub_account_id && (draft.api_key || fhsc.access_token));

  return (
    <PaneShell title="Broker" subtitle="Where Azoth places orders. Paper trading is the default and uses no real money.">
      <div className="settings-banner warn">
        <AlertIcon />
        <div>
          Live broker connections place <strong>real orders</strong>. Azoth uses your saved Risk limits as a hard
          ceiling, but a misconfigured strategy can still lose money.
        </div>
      </div>

      <GroupTitle>Connection</GroupTitle>
      <Group>
        <SettingRow
          label="Broker"
          control={
            <Segmented
              value={config?.broker ?? "paper"}
              options={[
                { value: "paper", label: "Paper" },
                { value: "fhsc", label: "FHSC" },
                { value: "dnse", label: "DNSE" },
              ]}
              onChange={(broker) => void onSave({ broker })}
            />
          }
        />
        <SettingRow
          label="Status"
          hint={hasLiveCredentials ? `Configured as ${draft.sub_account_id}` : "Paper mode uses no broker credentials."}
          control={
            <>
              <span className={hasLiveCredentials ? "pill pill-ok" : "pill pill-muted"}>
                <span className="dot" />
                {hasLiveCredentials ? "Live" : "Paper"}
              </span>
              <button className="settings-btn" onClick={() => undefined}>Reconnect</button>
            </>
          }
        />
      </Group>

      <GroupTitle>FHSC credentials</GroupTitle>
      <Group>
        <TextRow label="Sub-account ID" value={draft.sub_account_id} onChange={(v) => setDraft({ ...draft, sub_account_id: v })} onBlur={saveFhsc} />
        <TextRow label="Account ID" value={draft.account_id} onChange={(v) => setDraft({ ...draft, account_id: v })} onBlur={saveFhsc} />
        <SettingRow
          label="API key"
          control={
            <PasswordField
              value={draft.api_key}
              visible={Boolean(shown.api_key)}
              onToggle={() => setShown((s) => ({ ...s, api_key: !s.api_key }))}
              onChange={(api_key) => setDraft({ ...draft, api_key })}
              onBlur={saveFhsc}
            />
          }
        />
        <SettingRow
          label="API secret"
          control={
            <PasswordField
              value={draft.api_secret}
              visible={Boolean(shown.api_secret)}
              onToggle={() => setShown((s) => ({ ...s, api_secret: !s.api_secret }))}
              onChange={(api_secret) => setDraft({ ...draft, api_secret })}
              onBlur={saveFhsc}
            />
          }
        />
        <TextRow className="w-lg" label="Base URL" value={draft.base_url} onChange={(base_url) => setDraft({ ...draft, base_url })} onBlur={saveFhsc} />
      </Group>

      <details className="settings-advanced">
        <summary>
          <ChevronRightIcon />
          Advanced - session tokens and device binding
        </summary>
        <Group>
          <TextRow className="w-lg" label="Device ID" value={draft.device_id} onChange={(device_id) => setDraft({ ...draft, device_id })} onBlur={saveFhsc} />
          <TextRow label="User ID" value={draft.user_id} onChange={(user_id) => setDraft({ ...draft, user_id })} onBlur={saveFhsc} />
          <TextRow label="Customer ID" value={draft.cust_id} onChange={(cust_id) => setDraft({ ...draft, cust_id })} onBlur={saveFhsc} />
          <SettingRow
            label="Access token"
            hint={fhsc.access_token ? "Saved locally. Refresh from broker setup when expired." : "No access token saved."}
            control={<button className="settings-btn" onClick={() => undefined}>Force refresh</button>}
          />
        </Group>
      </details>
    </PaneShell>
  );
}

function RiskPane({
  config,
  onSave,
}: {
  config: Record<string, any> | null;
  onSave: (patch: Record<string, unknown>) => Promise<void>;
}) {
  const risk = config?.risk ?? {};
  const [whitelist, setWhitelist] = useState<string[]>((risk.ticker_whitelist as string[] | undefined) ?? []);
  const [ticker, setTicker] = useState("");

  useEffect(() => {
    setWhitelist((risk.ticker_whitelist as string[] | undefined) ?? []);
  }, [risk.ticker_whitelist]);

  const saveRisk = (patch: Record<string, unknown>) => void onSave({ risk: { ...risk, ...patch } });
  const addTicker = () => {
    const nextTicker = ticker.trim().toUpperCase();
    if (!nextTicker || whitelist.includes(nextTicker)) return;
    const next = [...whitelist, nextTicker];
    setWhitelist(next);
    setTicker("");
    saveRisk({ ticker_whitelist: next });
  };
  const removeTicker = (value: string) => {
    const next = whitelist.filter((item) => item !== value);
    setWhitelist(next);
    saveRisk({ ticker_whitelist: next });
  };

  return (
    <PaneShell
      title="Risk guardrails"
      subtitle="Hard ceilings the orchestrator and broker layer cannot exceed, even with autonomy set to Auto."
    >
      <GroupTitle>Position sizing</GroupTitle>
      <Group>
        <SettingRow
          label="Max position size"
          hint="As a share of total portfolio equity, per ticker."
          control={
            <Slider
              value={Math.round((risk.max_position_pct ?? 0.15) * 100)}
              min={1}
              max={50}
              suffix="%"
              onChange={(v) => saveRisk({ max_position_pct: v / 100 })}
            />
          }
        />
        <SettingRow
          label="Max daily loss"
          hint="Trips the kill-switch and rejects new orders for the rest of the trading day."
          control={
            <Slider
              value={Math.round((risk.max_daily_loss_pct ?? 0.03) * 100)}
              min={1}
              max={20}
              suffix="%"
              onChange={(v) => saveRisk({ max_daily_loss_pct: v / 100 })}
            />
          }
        />
        <SettingRow
          label="Max order notional"
          hint="Single-order cap in VND."
          control={
            <>
              <input
                className="w-num wide"
                type="number"
                value={risk.max_order_notional_vnd ?? 50000000}
                step={5000000}
                onChange={(e) => saveRisk({ max_order_notional_vnd: Number(e.target.value) })}
              />
              <span className="settings-unit">VND</span>
            </>
          }
        />
      </Group>

      <GroupTitle>Universe</GroupTitle>
      <Group>
        <div className="settings-row stacked">
          <div>
            <label>Ticker whitelist</label>
            <span className="hint">Azoth will refuse to place orders outside this list. Leave empty to allow all configured markets.</span>
          </div>
          <div className="control">
            <div className="chip-input" onClick={(e) => (e.currentTarget.querySelector("input") as HTMLInputElement | null)?.focus()}>
              {whitelist.map((item) => (
                <span className="chip" key={item}>
                  {item}
                  <button aria-label={`Remove ${item}`} onClick={() => removeTicker(item)}>x</button>
                </span>
              ))}
              <input
                placeholder="Add ticker..."
                value={ticker}
                onChange={(e) => setTicker(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addTicker();
                  } else if (e.key === "Backspace" && !ticker && whitelist.length > 0) {
                    removeTicker(whitelist[whitelist.length - 1]!);
                  }
                }}
              />
            </div>
          </div>
        </div>
        <SettingRow
          label="Allow margin"
          hint="Permit leveraged orders on margin-eligible accounts."
          control={<Toggle checked={Boolean(risk.allow_margin)} onChange={(allow_margin) => saveRisk({ allow_margin })} />}
        />
        <SettingRow
          label="Allow shorting"
          hint="Vietnam short-selling support depends on account and market rules."
          control={<Toggle checked={false} onChange={() => undefined} />}
        />
      </Group>

      <GroupTitle>Trading hours</GroupTitle>
      <Group>
        <SettingRow
          label="Restrict to VN session"
          hint="09:00-11:30 and 13:00-14:45 ICT, weekdays."
          control={<Toggle checked onChange={() => undefined} />}
        />
        <SettingRow
          label="Block ATC orders"
          hint="Reject orders during 14:30-14:45 closing auction."
          control={<Toggle checked={false} onChange={() => undefined} />}
        />
      </Group>
    </PaneShell>
  );
}

function SessionsPane({ projects, sessions }: { projects: number; sessions: number }) {
  return (
    <PaneShell title="Data & Sessions" subtitle="Where Azoth keeps your chats, config, and projects on disk.">
      <GroupTitle>Locations</GroupTitle>
      <Group>
        <LocationRow label="Config file" hint="Schema-validated YAML, mode 0600." path="~/.azoth/config.yaml" />
        <LocationRow label="Sessions directory" hint="One JSONL per session, grouped by project." path="~/.azoth/projects/" />
        <LocationRow label="Projects index" hint="Desktop projects and active selection." path="~/.azoth/projects-desktop.json" />
      </Group>

      <GroupTitle>Storage</GroupTitle>
      <Group>
        <SettingRow
          label="Active sessions"
          hint={`${sessions} sessions across ${projects} projects`}
          control={<button className="settings-btn" onClick={() => undefined}>Export...</button>}
        />
        <SettingRow
          label="Archived sessions"
          hint="Soft-deleted, hidden from sidebar. Restore support is available during the undo window."
          control={
            <>
              <span className="pill pill-muted">Hidden</span>
              <button className="settings-btn" onClick={() => undefined}>Open archive</button>
            </>
          }
        />
        <SettingRow
          label="Tool call cache"
          hint="Market quotes, consensus snapshots, news fetches."
          control={
            <>
              <span className="settings-stat">Local cache</span>
              <button className="settings-btn" onClick={() => undefined}>Clear cache</button>
            </>
          }
        />
      </Group>

      <GroupTitle>Danger zone</GroupTitle>
      <Group>
        <SettingRow
          label="Reset all settings"
          hint="Restores default config. Sessions and broker credentials are kept."
          control={<button className="settings-btn danger" onClick={() => undefined}>Reset settings...</button>}
        />
        <SettingRow
          label="Delete all sessions"
          hint="Permanently removes every session JSONL. Cannot be undone."
          control={<button className="settings-btn danger" onClick={() => undefined}>Delete sessions...</button>}
        />
      </Group>
    </PaneShell>
  );
}

function AdvancedPane({ onSave }: { onSave: () => void }) {
  return (
    <PaneShell title="Advanced" subtitle="Diagnostics and developer-only switches. Wrong values here can break the agent loop.">
      <GroupTitle>Logging</GroupTitle>
      <Group>
        <SettingRow
          label="Log level"
          control={
            <Segmented
              value="info"
              options={[
                { value: "error", label: "Error" },
                { value: "info", label: "Info" },
                { value: "debug", label: "Debug" },
                { value: "trace", label: "Trace" },
              ]}
              onChange={onSave}
            />
          }
        />
        <SettingRow
          label="Stream every block delta"
          hint="Persist each content_block_delta to the session JSONL. High volume."
          control={<Toggle checked={false} onChange={onSave} />}
        />
        <SettingRow
          label="Diagnostics bundle"
          hint="Last 7 days of logs, redacted config, and broker handshake."
          control={<button className="settings-btn" onClick={onSave}>Export bundle</button>}
        />
      </Group>

      <GroupTitle>Experimental</GroupTitle>
      <Group>
        <SettingRow
          label="Use Vietnamese tool descriptions"
          hint="Send Vietnamese tool schemas to the orchestrator."
          control={<Toggle checked={false} onChange={onSave} />}
        />
        <SettingRow
          label="Parallel analyst fan-out"
          hint="Run fundamental, technical, and sentiment analysts in parallel."
          control={<Toggle checked onChange={onSave} />}
        />
        <SettingRow
          label="Strict schema validation"
          hint="Reject tool outputs that fail Zod parse instead of repairing."
          control={<Toggle checked onChange={onSave} />}
        />
      </Group>
    </PaneShell>
  );
}

function AboutPane() {
  return (
    <PaneShell title="About">
      <div className="about-hero">
        <div className="about-mark" aria-label="Azoth"><AzothMark /></div>
        <h2 className="about-name">Azoth Desktop</h2>
        <p className="about-version">Version 0.1.0</p>
        <p className="about-tagline">An agentic trading assistant for Vietnam equities. Live on FHSC and DNSE; paper trading otherwise.</p>
        <div className="about-links">
          <a href="#">Release notes</a>
          <span>|</span>
          <a href="#">Documentation</a>
          <span>|</span>
          <a href="#">Report an issue</a>
        </div>
        <button className="settings-btn primary">Check for updates</button>
        <p className="about-risk">
          Trading involves risk of loss. Past performance is not indicative of future results. Azoth is not a registered investment advisor.
        </p>
      </div>
    </PaneShell>
  );
}

function PaneShell({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="settings-pane-header">
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

function Group({ children }: { children: React.ReactNode }) {
  return <div className="settings-group">{children}</div>;
}

function GroupTitle({ children }: { children: React.ReactNode }) {
  return <div className="settings-group-title">{children}</div>;
}

function SettingRow({
  label,
  hint,
  control,
}: {
  label: string;
  hint?: string;
  control: React.ReactNode;
}) {
  return (
    <div className="settings-row">
      <div>
        <label>{label}</label>
        {hint && <span className="hint">{hint}</span>}
      </div>
      <div className="control">{control}</div>
    </div>
  );
}

function TextRow({
  label,
  value,
  onChange,
  onBlur,
  className = "w-md",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onBlur: () => void;
  className?: string;
}) {
  return (
    <SettingRow
      label={label}
      control={<input className={`mono ${className}`} value={value} onChange={(e) => onChange(e.target.value)} onBlur={onBlur} />}
    />
  );
}

function LocationRow({ label, hint, path }: { label: string; hint: string; path: string }) {
  return (
    <SettingRow
      label={label}
      hint={hint}
      control={
        <>
          <span className="settings-path">{path}</span>
          <button className="settings-btn" onClick={() => undefined}>Reveal</button>
        </>
      }
    />
  );
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <div className="settings-seg" role="radiogroup">
      {options.map((option) => (
        <button
          key={option.value}
          role="radio"
          aria-pressed={value === option.value ? "true" : "false"}
          aria-checked={value === option.value ? "true" : "false"}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      className="settings-toggle"
      role="switch"
      aria-checked={checked ? "true" : "false"}
      onClick={() => onChange(!checked)}
    />
  );
}

function Slider({
  value,
  min,
  max,
  suffix,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  suffix: string;
  onChange: (value: number) => void;
}) {
  const [localValue, setLocalValue] = useState(value);
  useEffect(() => setLocalValue(value), [value]);
  return (
    <div className="slider-row">
      <input
        type="range"
        min={min}
        max={max}
        value={localValue}
        onChange={(e) => setLocalValue(Number(e.target.value))}
        onMouseUp={() => onChange(localValue)}
        onKeyUp={() => onChange(localValue)}
      />
      <span className="slider-num">{localValue.toFixed(1)}{suffix}</span>
    </div>
  );
}

function ModelSelect({
  models,
  loading,
  error,
  value,
  onChange,
}: {
  models: string[];
  loading: boolean;
  error: string | null;
  value: string | undefined;
  onChange: (value: string) => void;
}) {
  const selected = availableModelOrDefault(models, value);
  const disabled = loading || Boolean(error) || models.length === 0;
  return (
    <select value={disabled ? "" : selected} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
      {disabled ? (
        <option value="">{loading ? "Loading models..." : error ? "Models unavailable" : "No models"}</option>
      ) : null}
      {models.map((option) => <option key={option} value={option}>{option}</option>)}
    </select>
  );
}

function PasswordField({
  value,
  visible,
  onToggle,
  onChange,
  onBlur,
}: {
  value: string;
  visible: boolean;
  onToggle: () => void;
  onChange: (value: string) => void;
  onBlur: () => void;
}) {
  return (
    <span className="pw-wrap">
      <input
        type={visible ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
      />
      <button className="pw-reveal" aria-label={visible ? "Hide key" : "Show key"} onClick={onToggle}>
        <EyeIcon />
      </button>
    </span>
  );
}

function AzothMark() {
  return (
    <svg viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <circle cx="32" cy="20" r="6" stroke="currentColor" strokeWidth="3" />
      <path d="M14 52 L32 26 L50 52" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M22 42 L42 42" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
