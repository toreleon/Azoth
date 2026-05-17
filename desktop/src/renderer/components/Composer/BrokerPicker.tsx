import { useChatStore } from "../../store/chatStore.js";

const BROKERS = ["paper", "dnse", "fhsc"] as const;

export function BrokerPicker() {
  const config = useChatStore((s) => s.config) as { broker?: string } | null;
  const setConfig = useChatStore((s) => s.setConfig);

  async function update(broker: string) {
    const next = await window.azoth.invoke("config:save", { patch: { broker } });
    setConfig(next);
  }

  return (
    <select
      value={config?.broker ?? "paper"}
      onChange={(e) => void update(e.target.value)}
      className="picker picker-select-control"
      title="Broker"
    >
      {BROKERS.map((b) => (
        <option key={b} value={b}>
          {b}
        </option>
      ))}
    </select>
  );
}
