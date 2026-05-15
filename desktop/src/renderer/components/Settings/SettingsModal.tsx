import { useState } from "react";
import { useChatStore } from "../../store/chatStore.js";

type Tab = "llm" | "broker" | "risk" | "about";

interface Props {
  onClose: () => void;
}

export function SettingsModal({ onClose }: Props) {
  const [tab, setTab] = useState<Tab>("llm");
  const config = useChatStore((s) => s.config) as Record<string, any> | null;
  const setConfig = useChatStore((s) => s.setConfig);
  const [draft, setDraft] = useState<Record<string, any>>(config ?? {});

  async function save(patch: Record<string, unknown>) {
    const next = await window.azoth.invoke("config:save", { patch });
    setConfig(next);
    setDraft({ ...draft, ...patch });
  }

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="flex h-[560px] w-[720px] flex-col overflow-hidden rounded-xl border border-azoth-border bg-azoth-surface"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-azoth-border px-5 py-3">
          <h2 className="text-sm font-medium text-azoth-text">Settings</h2>
          <button onClick={onClose} className="text-azoth-muted hover:text-azoth-text">✕</button>
        </div>
        <div className="flex flex-1 overflow-hidden">
          <nav className="flex w-40 shrink-0 flex-col gap-1 border-r border-azoth-border p-2 text-sm">
            {(["llm", "broker", "risk", "about"] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`rounded px-3 py-1.5 text-left ${
                  tab === t ? "bg-azoth-panel text-azoth-text" : "text-azoth-muted hover:bg-azoth-panel/60"
                }`}
              >
                {t.toUpperCase()}
              </button>
            ))}
          </nav>
          <div className="flex-1 overflow-y-auto p-5">
            {tab === "llm" && <LlmTab config={config} onSave={save} />}
            {tab === "broker" && <BrokerTab config={config} onSave={save} />}
            {tab === "risk" && <RiskTab config={config} onSave={save} />}
            {tab === "about" && <AboutTab />}
          </div>
        </div>
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

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className="w-full rounded border border-azoth-border bg-azoth-panel px-3 py-2 text-sm text-azoth-text outline-none focus:border-azoth-accent"
    />
  );
}

function LlmTab({
  config,
  onSave,
}: {
  config: Record<string, any> | null;
  onSave: (patch: Record<string, unknown>) => Promise<void>;
}) {
  const [provider, setProvider] = useState(config?.llm?.provider ?? "anthropic");
  const [apiKey, setApiKey] = useState(config?.llm?.api_key ?? "");
  const [baseUrl, setBaseUrl] = useState(config?.llm?.base_url ?? "");
  const [model, setModel] = useState(config?.model ?? "claude-opus-4-1");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void onSave({
          model,
          llm: { provider, api_key: apiKey, base_url: baseUrl },
        });
      }}
    >
      <Field label="Provider">
        <select
          value={provider}
          onChange={(e) => setProvider(e.target.value)}
          className="w-full rounded border border-azoth-border bg-azoth-panel px-3 py-2 text-sm text-azoth-text"
        >
          <option value="anthropic">Anthropic</option>
          <option value="compatible">Anthropic-compatible (proxy)</option>
        </select>
      </Field>
      <Field label="API key">
        <Input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
      </Field>
      {provider === "compatible" && (
        <Field label="Base URL">
          <Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
        </Field>
      )}
      <Field label="Model">
        <Input value={model} onChange={(e) => setModel(e.target.value)} />
      </Field>
      <button
        type="submit"
        className="mt-2 rounded bg-azoth-accent px-4 py-2 text-sm text-white"
      >
        Save
      </button>
    </form>
  );
}

function BrokerTab({
  config,
  onSave,
}: {
  config: Record<string, any> | null;
  onSave: (patch: Record<string, unknown>) => Promise<void>;
}) {
  const [broker, setBroker] = useState(config?.broker ?? "paper");
  const [fhsc, setFhsc] = useState<Record<string, string>>({
    sub_account_id: config?.fhsc?.sub_account_id ?? "",
    api_key: config?.fhsc?.api_key ?? "",
    api_secret: config?.fhsc?.api_secret ?? "",
    base_url: config?.fhsc?.base_url ?? "https://api.vinasecurities.com",
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void onSave({ broker, fhsc });
      }}
    >
      <Field label="Broker">
        <select
          value={broker}
          onChange={(e) => setBroker(e.target.value)}
          className="w-full rounded border border-azoth-border bg-azoth-panel px-3 py-2 text-sm text-azoth-text"
        >
          <option value="paper">Paper</option>
          <option value="dnse">DNSE</option>
          <option value="fhsc">FHSC</option>
        </select>
      </Field>
      {broker === "fhsc" && (
        <>
          <Field label="Sub account ID">
            <Input
              value={fhsc.sub_account_id}
              onChange={(e) => setFhsc({ ...fhsc, sub_account_id: e.target.value })}
            />
          </Field>
          <Field label="API key">
            <Input
              value={fhsc.api_key}
              onChange={(e) => setFhsc({ ...fhsc, api_key: e.target.value })}
            />
          </Field>
          <Field label="API secret">
            <Input
              type="password"
              value={fhsc.api_secret}
              onChange={(e) => setFhsc({ ...fhsc, api_secret: e.target.value })}
            />
          </Field>
          <Field label="Base URL">
            <Input
              value={fhsc.base_url}
              onChange={(e) => setFhsc({ ...fhsc, base_url: e.target.value })}
            />
          </Field>
        </>
      )}
      <button
        type="submit"
        className="mt-2 rounded bg-azoth-accent px-4 py-2 text-sm text-white"
      >
        Save
      </button>
    </form>
  );
}

function RiskTab({
  config,
  onSave,
}: {
  config: Record<string, any> | null;
  onSave: (patch: Record<string, unknown>) => Promise<void>;
}) {
  const r = config?.risk ?? {};
  const [maxPos, setMaxPos] = useState(String(r.max_position_pct ?? 0.1));
  const [maxLoss, setMaxLoss] = useState(String(r.max_daily_loss_pct ?? 0.05));
  const [maxNotional, setMaxNotional] = useState(String(r.max_order_notional_vnd ?? 100000000));
  const [whitelist, setWhitelist] = useState<string>(
    ((r.ticker_whitelist as string[] | undefined) ?? []).join(", "),
  );
  const [allowMargin, setAllowMargin] = useState(Boolean(r.allow_margin));

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void onSave({
          risk: {
            max_position_pct: Number(maxPos),
            max_daily_loss_pct: Number(maxLoss),
            max_order_notional_vnd: Number(maxNotional),
            ticker_whitelist: whitelist
              .split(",")
              .map((s) => s.trim().toUpperCase())
              .filter(Boolean),
            allow_margin: allowMargin,
          },
        });
      }}
    >
      <Field label="Max position %">
        <Input value={maxPos} onChange={(e) => setMaxPos(e.target.value)} />
      </Field>
      <Field label="Max daily loss %">
        <Input value={maxLoss} onChange={(e) => setMaxLoss(e.target.value)} />
      </Field>
      <Field label="Max order notional (VND)">
        <Input value={maxNotional} onChange={(e) => setMaxNotional(e.target.value)} />
      </Field>
      <Field label="Ticker whitelist (comma-separated)">
        <Input value={whitelist} onChange={(e) => setWhitelist(e.target.value)} />
      </Field>
      <label className="mb-3 flex items-center gap-2 text-sm text-azoth-text">
        <input
          type="checkbox"
          checked={allowMargin}
          onChange={(e) => setAllowMargin(e.target.checked)}
        />
        Allow margin
      </label>
      <button
        type="submit"
        className="mt-2 rounded bg-azoth-accent px-4 py-2 text-sm text-white"
      >
        Save
      </button>
    </form>
  );
}

function AboutTab() {
  return (
    <div className="text-sm text-azoth-muted">
      <p className="mb-2 text-azoth-text">Azoth Desktop v0.1.0</p>
      <p>AI stock trading assistant for Vietnam equities.</p>
      <p className="mt-4">Config and sessions live in <code>~/.azoth/</code>.</p>
    </div>
  );
}
