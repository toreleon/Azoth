import type { DesktopSettings } from "../../../shared/ipc.js";
import { Group, GroupTitle, PaneShell, Segmented, SettingRow, Toggle } from "./SettingsControls.js";

export function GeneralPane({
  config,
  appSettings,
  onSave,
  onSaveAppSettings,
}: {
  config: Record<string, any> | null;
  appSettings: DesktopSettings | null;
  onSave: (patch: Record<string, unknown>) => Promise<void>;
  onSaveAppSettings: (patch: Partial<DesktopSettings>) => Promise<void>;
}) {
  const team = config?.team ?? {};
  const settings = appSettings ?? {
    launchAtLogin: false,
    hideOnClose: true,
    showNotifications: true,
    notifyOnOrderFill: true,
    appearance: "light",
  } satisfies DesktopSettings;

  return (
    <PaneShell title="General" subtitle="Autonomy, default model tier, and app behavior.">
      <GroupTitle>Autonomy</GroupTitle>
      <Group>
        <SettingRow
          label="Autonomy mode"
          hint="Manual asks before every tool call. Auto runs tools without approval prompts."
          control={
            <Segmented
              value={config?.autonomy ?? "manual"}
              options={[
                { value: "manual", label: "Manual" },
                { value: "auto", label: "Auto" },
              ]}
              onChange={(autonomy) => void onSave({ autonomy })}
            />
          }
        />
        <SettingRow
          label="Output language"
          hint="Used by analyst and research agents."
          control={
            <select
              value={team.output_language ?? "en"}
              onChange={(e) => void onSave({ team: { ...team, output_language: e.target.value } })}
            >
              <option value="en">English</option>
              <option value="vi">Vietnamese</option>
            </select>
          }
        />
      </Group>

      <GroupTitle>App</GroupTitle>
      <Group>
        <SettingRow
          label="Launch at login"
          control={
            <Toggle
              checked={settings.launchAtLogin}
              onChange={(launchAtLogin) => void onSaveAppSettings({ launchAtLogin })}
            />
          }
        />
        <SettingRow
          label="Hide on close"
          hint="Keep Azoth running in the menu bar after the window closes."
          control={
            <Toggle
              checked={settings.hideOnClose}
              onChange={(hideOnClose) => void onSaveAppSettings({ hideOnClose })}
            />
          }
        />
        <SettingRow
          label="Show notifications"
          control={
            <Toggle
              checked={settings.showNotifications}
              onChange={(showNotifications) => void onSaveAppSettings({ showNotifications })}
            />
          }
        />
        <SettingRow
          label="Notify on order fill"
          hint="System notification when a live order fills or is rejected."
          control={
            <Toggle
              checked={settings.notifyOnOrderFill}
              onChange={(notifyOnOrderFill) => void onSaveAppSettings({ notifyOnOrderFill })}
            />
          }
        />
      </Group>

      <GroupTitle>Appearance</GroupTitle>
      <Group>
        <SettingRow
          label="Appearance"
          control={
            <Segmented
              value={settings.appearance}
              options={[
                { value: "light", label: "Light" },
                { value: "dark", label: "Dark" },
                { value: "system", label: "System" },
              ]}
              onChange={(appearance) => void onSaveAppSettings({ appearance })}
            />
          }
        />
      </Group>
    </PaneShell>
  );
}
