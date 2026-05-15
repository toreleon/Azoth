import { useChatStore } from "../../store/chatStore.js";

const MODES = ["advisory", "confirm", "auto"] as const;
const LABELS: Record<(typeof MODES)[number], string> = {
  advisory: "Advise",
  confirm: "Approve",
  auto: "Auto",
};

export function AutonomyPicker() {
  const config = useChatStore((s) => s.config) as { autonomy?: string } | null;
  const setConfig = useChatStore((s) => s.setConfig);

  async function update(autonomy: string) {
    const next = await window.azoth.invoke("config:save", { patch: { autonomy } });
    setConfig(next);
  }

  return (
    <label className="picker access" title="Autonomy">
      <span className="dot" />
      <select
        value={config?.autonomy ?? "advisory"}
        onChange={(e) => void update(e.target.value)}
        className="picker-select"
      >
        {MODES.map((m) => (
          <option key={m} value={m}>
            {LABELS[m]}
          </option>
        ))}
      </select>
      <ChevronIcon />
    </label>
  );
}

function ChevronIcon() {
  return (
    <svg className="grip" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="m3 5 3 3 3-3" />
    </svg>
  );
}
