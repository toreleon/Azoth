import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { app, nativeTheme } from "electron";
import { azothHome } from "@azoth/core/runtime/paths.js";
import type { DesktopSettings } from "../shared/ipc.js";

const DEFAULT_SETTINGS: DesktopSettings = {
  launchAtLogin: false,
  hideOnClose: true,
  showNotifications: true,
  notifyOnOrderFill: true,
  appearance: "light",
};

function settingsPath(): string {
  return resolve(azothHome(), "desktop-settings.json");
}

function normalizeSettings(raw: Partial<DesktopSettings> | null | undefined): DesktopSettings {
  const appearance = ["light", "dark", "system"].includes(String(raw?.appearance))
    ? raw!.appearance!
    : DEFAULT_SETTINGS.appearance;
  return {
    launchAtLogin: Boolean(raw?.launchAtLogin ?? DEFAULT_SETTINGS.launchAtLogin),
    hideOnClose: Boolean(raw?.hideOnClose ?? DEFAULT_SETTINGS.hideOnClose),
    showNotifications: Boolean(raw?.showNotifications ?? DEFAULT_SETTINGS.showNotifications),
    notifyOnOrderFill: Boolean(raw?.notifyOnOrderFill ?? DEFAULT_SETTINGS.notifyOnOrderFill),
    appearance,
  };
}

function readStoredSettings(): DesktopSettings {
  const path = settingsPath();
  if (!existsSync(path)) return DEFAULT_SETTINGS;
  try {
    return normalizeSettings(JSON.parse(readFileSync(path, "utf8")) as Partial<DesktopSettings>);
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function writeStoredSettings(settings: DesktopSettings): void {
  mkdirSync(azothHome(), { recursive: true });
  writeFileSync(settingsPath(), `${JSON.stringify(settings, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
}

export function getDesktopSettings(): DesktopSettings {
  const settings = readStoredSettings();
  if (app.isReady()) {
    settings.launchAtLogin = app.getLoginItemSettings().openAtLogin;
  }
  return settings;
}

export function applyDesktopSettings(settings = getDesktopSettings()): void {
  nativeTheme.themeSource = settings.appearance;
  if (app.isReady()) {
    app.setLoginItemSettings({ openAtLogin: settings.launchAtLogin });
  }
}

export function saveDesktopSettings(patch: Partial<DesktopSettings>): DesktopSettings {
  const next = normalizeSettings({ ...getDesktopSettings(), ...patch });
  writeStoredSettings(next);
  applyDesktopSettings(next);
  return getDesktopSettings();
}
