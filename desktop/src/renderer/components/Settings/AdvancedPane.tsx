import { Group, GroupTitle, PaneShell, Segmented, SettingRow, Toggle } from "./SettingsControls.js";

export function AdvancedPane({ onSave }: { onSave: () => void }) {
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
