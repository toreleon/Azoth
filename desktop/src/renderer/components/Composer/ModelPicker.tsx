import { useChatStore } from "../../store/chatStore.js";

const MODELS = [
  "claude-opus-4-1",
  "claude-sonnet-4-5",
  "claude-haiku-4-5",
];

export function ModelPicker() {
  const config = useChatStore((s) => s.config) as { model?: string } | null;
  const setConfig = useChatStore((s) => s.setConfig);

  async function update(model: string) {
    const next = await window.azoth.invoke("config:save", { patch: { model } });
    setConfig(next);
  }

  return (
    <label className="picker" title="Model">
      <select
        value={config?.model ?? ""}
        onChange={(e) => void update(e.target.value)}
        className="picker-select"
      >
        {MODELS.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
        {config?.model && !MODELS.includes(config.model) && (
          <option value={config.model}>{config.model}</option>
        )}
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
