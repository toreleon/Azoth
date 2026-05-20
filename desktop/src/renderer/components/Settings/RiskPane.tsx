import { useEffect, useState } from "react";
import { Group, GroupTitle, PaneShell, SettingRow, Slider, Toggle } from "./SettingsControls.js";

export function RiskPane({
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
