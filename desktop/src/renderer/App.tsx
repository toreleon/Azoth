import { useEffect, useState } from "react";
import { Sidebar } from "./components/Sidebar/Sidebar.js";
import { ChatView } from "./components/ChatView/ChatView.js";
import { EmptyState } from "./components/Empty/EmptyState.js";
import { PromptComposer } from "./components/Composer/PromptComposer.js";
import { Onboarding } from "./components/Onboarding/Onboarding.js";
import { ConsentToast } from "./components/Consent/ConsentToast.js";
import { SettingsModal } from "./components/Settings/SettingsModal.js";
import { useStreamBridge } from "./lib/streamBridge.js";
import { useChatStore } from "./store/chatStore.js";

export function App() {
  useStreamBridge();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const {
    activeProjectId,
    activeSessionId,
    projects,
    sessions,
    onboarded,
    appSettings,
    setProjects,
    setSessions,
    setOnboarded,
    setConfig,
    setAppSettings,
  } = useChatStore();

  useEffect(() => {
    void (async () => {
      const [{ projects, activeId }, status, cfg, appSettings] = await Promise.all([
        window.azoth.invoke("project:list", undefined),
        window.azoth.invoke("onboarding:status", undefined),
        window.azoth.invoke("config:get", undefined),
        window.azoth.invoke("app-settings:get", undefined),
      ]);
      setProjects(projects, activeId);
      setOnboarded(status.onboarded);
      setConfig(cfg);
      setAppSettings(appSettings);
    })();
  }, [setProjects, setOnboarded, setConfig, setAppSettings]);

  useEffect(() => {
    if (!appSettings) return;
    const root = document.documentElement;
    const apply = () => {
      const theme = appSettings.appearance === "system"
        ? window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
        : appSettings.appearance;
      root.dataset.theme = theme;
      root.dataset.appearance = appSettings.appearance;
    };
    apply();
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [appSettings]);

  useEffect(() => {
    if (!activeProjectId) return;
    void (async () => {
      const sessions = await window.azoth.invoke("session:list", {
        projectId: activeProjectId,
      });
      setSessions(sessions);
    })();
  }, [activeProjectId, setSessions]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === ",") {
        event.preventDefault();
        setSettingsOpen(true);
      } else if (event.key === "Escape") {
        setSettingsOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  if (!onboarded) {
    return <Onboarding onDone={() => setOnboarded(true)} />;
  }

  const activeSession = sessions.find((s) => s.id === activeSessionId);
  const activeProject = projects.find((p) => p.id === activeProjectId);
  const windowTitle = `${activeSession?.title ?? "New chat"}${
    activeProject?.name ? ` - ${activeProject.name}` : ""
  }`;

  return (
    <div className="app">
      <div className="titlebar">
        <div className="traffic">
          <span />
          <span />
          <span />
        </div>
        <div className="titlebar-title">{windowTitle}</div>
      </div>
      <Sidebar onOpenSettings={() => setSettingsOpen(true)} />
      <main className="main">
        {activeSessionId ? <ChatView sessionId={activeSessionId} /> : <EmptyState />}
        <PromptComposer />
      </main>
      <ConsentToast />
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}
