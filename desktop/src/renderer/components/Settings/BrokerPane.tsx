import { useEffect, useState } from "react";
import { AlertIcon, ChevronRightIcon } from "../Icon.js";
import { Group, GroupTitle, PaneShell, PasswordField, Segmented, SettingRow, TextRow } from "./SettingsControls.js";

export function BrokerPane({
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
