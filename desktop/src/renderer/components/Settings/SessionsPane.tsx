import { Group, GroupTitle, LocationRow, PaneShell, SettingRow } from "./SettingsControls.js";

export function SessionsPane({ projects, sessions }: { projects: number; sessions: number }) {
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
