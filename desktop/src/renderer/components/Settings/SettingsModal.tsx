import { useEffect, useRef, useState } from "react";
import type React from "react";
import type { DesktopSettings } from "../../../shared/ipc.js";
import {
  ArrowLeftIcon,
  BrokerIcon,
  FolderIcon,
  InfoIcon,
  ModelIcon,
  SettingsIcon,
  SlidersIcon,
  AlertIcon,
} from "../Icon.js";
import { useChatStore } from "../../store/chatStore.js";
import { AboutPane } from "./AboutPane.js";
import { AdvancedPane } from "./AdvancedPane.js";
import { BrokerPane } from "./BrokerPane.js";
import { GeneralPane } from "./GeneralPane.js";
import { ModelsPane } from "./ModelsPane.js";
import { RiskPane } from "./RiskPane.js";
import { SessionsPane } from "./SessionsPane.js";

type Pane = "general" | "models" | "broker" | "risk" | "sessions" | "advanced" | "about";

interface Props {
  onClose: () => void;
}

const panes: Array<{ id: Pane; label: string; icon: React.ReactNode; group?: "primary" | "secondary" }> = [
  { id: "general", label: "General", icon: <SettingsIcon /> },
  { id: "models", label: "Models", icon: <ModelIcon /> },
  { id: "broker", label: "Broker", icon: <BrokerIcon /> },
  { id: "risk", label: "Risk", icon: <AlertIcon /> },
  { id: "sessions", label: "Data & Sessions", icon: <FolderIcon />, group: "secondary" },
  { id: "advanced", label: "Advanced", icon: <SlidersIcon />, group: "secondary" },
  { id: "about", label: "About", icon: <InfoIcon />, group: "secondary" },
];

export function SettingsModal({ onClose }: Props) {
  const [pane, setPane] = useState<Pane>("general");
  const [toast, setToast] = useState({ visible: false, message: "Saved" });
  const toastTimer = useRef<number | null>(null);
  const config = useChatStore((s) => s.config) as Record<string, any> | null;
  const appSettings = useChatStore((s) => s.appSettings);
  const setConfig = useChatStore((s) => s.setConfig);
  const setAppSettings = useChatStore((s) => s.setAppSettings);
  const projects = useChatStore((s) => s.projects);
  const sessions = useChatStore((s) => s.sessions);

  useEffect(() => {
    return () => {
      if (toastTimer.current != null) window.clearTimeout(toastTimer.current);
    };
  }, []);

  function showToast(message: string) {
    setToast({ visible: true, message });
    if (toastTimer.current != null) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(
      () => setToast((current) => ({ ...current, visible: false })),
      1800,
    );
  }

  function flashSaved() {
    showToast("Saved");
  }

  async function save(patch: Record<string, unknown>) {
    const next = await window.azoth.invoke("config:save", { patch });
    setConfig(next);
    flashSaved();
  }

  async function saveAppSettings(patch: Partial<DesktopSettings>) {
    const next = await window.azoth.invoke("app-settings:save", { patch });
    setAppSettings(next);
    flashSaved();
  }

  const primary = panes.filter((item) => item.group !== "secondary");
  const secondary = panes.filter((item) => item.group === "secondary");

  return (
    <div className="settings-backdrop" onMouseDown={onClose}>
      <div
        className="settings-win"
        role="dialog"
        aria-label="Azoth Settings"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="settings-titlebar">
          <div className="traffic">
            <span />
            <span />
            <span />
          </div>
          <div className="settings-titlebar-title">Settings</div>
        </div>

        <div className="settings-body">
          <nav className="settings-nav" aria-label="Settings sections">
            <button className="settings-back-btn" onClick={onClose}>
              <ArrowLeftIcon />
              Back to app
            </button>
            {primary.map((item) => (
              <NavItem key={item.id} item={item} active={pane === item.id} onClick={() => setPane(item.id)} />
            ))}
            {secondary.length > 0 && <div className="settings-nav-divider" />}
            {secondary.map((item) => (
              <NavItem key={item.id} item={item} active={pane === item.id} onClick={() => setPane(item.id)} />
            ))}
          </nav>

          <div className="settings-pane">
            {pane === "general" && (
              <GeneralPane
                config={config}
                appSettings={appSettings}
                onSave={save}
                onSaveAppSettings={saveAppSettings}
              />
            )}
            {pane === "models" && <ModelsPane config={config} onSave={save} onNotify={showToast} />}
            {pane === "broker" && <BrokerPane config={config} onSave={save} />}
            {pane === "risk" && <RiskPane config={config} onSave={save} />}
            {pane === "sessions" && <SessionsPane projects={projects.length} sessions={sessions.length} />}
            {pane === "advanced" && <AdvancedPane onSave={flashSaved} />}
            {pane === "about" && <AboutPane />}
          </div>
        </div>
      </div>
      <div className={`settings-saved${toast.visible ? " show" : ""}`}>
        {toast.message}
      </div>
    </div>
  );
}

function NavItem({
  item,
  active,
  onClick,
}: {
  item: { id: Pane; label: string; icon: React.ReactNode };
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button className="settings-nav-item" aria-current={active ? "true" : "false"} onClick={onClick}>
      <span className="ico">{item.icon}</span>
      {item.label}
    </button>
  );
}
