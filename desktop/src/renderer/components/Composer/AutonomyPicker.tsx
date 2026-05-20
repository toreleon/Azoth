import { ChevronDownIcon, HandIcon, LightningIcon } from "../Icon.js";
import { useChatStore } from "../../store/chatStore.js";

const MODES = ["manual", "auto"] as const;
const LABELS: Record<(typeof MODES)[number], string> = {
  manual: "Manual",
  auto: "Auto",
};

export function AutonomyPicker() {
  const config = useChatStore((s) => s.config) as { autonomy?: string } | null;
  const setConfig = useChatStore((s) => s.setConfig);
  const mode = MODES.includes(config?.autonomy as (typeof MODES)[number])
    ? config?.autonomy as (typeof MODES)[number]
    : "manual";

  async function update(autonomy: string) {
    const next = await window.azoth.invoke("config:save", { patch: { autonomy } });
    setConfig(next);
  }

  return (
    <label className={`picker autonomy ${mode}`} title="Autonomy">
      <ModeIcon mode={mode} />
      <select
        value={mode}
        onChange={(e) => void update(e.target.value)}
        className="picker-select"
      >
        {MODES.map((m) => (
          <option key={m} value={m}>
            {LABELS[m]}
          </option>
        ))}
      </select>
      <ChevronDownIcon className="grip" />
    </label>
  );
}

function ModeIcon({ mode }: { mode: (typeof MODES)[number] }) {
  if (mode === "auto") {
    return <LightningIcon className="mode-icon" />;
  }
  return <HandIcon className="mode-icon" />;
}
