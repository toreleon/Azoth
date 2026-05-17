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
      <ChevronIcon />
    </label>
  );
}

function ModeIcon({ mode }: { mode: (typeof MODES)[number] }) {
  if (mode === "auto") {
    return (
      <svg className="mode-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M9.4 1.8 4 8.8h4l-1.4 5.4 5.4-7h-4l1.4-5.4z" />
      </svg>
    );
  }
  return (
    <svg className="mode-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4.5 7.2V4.8a1.1 1.1 0 0 1 2.2 0v2" />
      <path d="M6.7 6.7V3.9a1.1 1.1 0 0 1 2.2 0v3" />
      <path d="M8.9 6.8V4.7a1.1 1.1 0 0 1 2.2 0v4" />
      <path d="M4.5 7.2 3.8 6.5a1.1 1.1 0 0 0-1.6 1.5l3.1 3.8c.7.9 1.8 1.4 3 1.4h.9a3 3 0 0 0 3-3V6.6" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg className="grip" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="m3 5 3 3 3-3" />
    </svg>
  );
}
