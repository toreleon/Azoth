import { useEffect, useState } from "react";
import { Sidebar } from "./components/Sidebar/Sidebar.js";
import { ChatView } from "./components/ChatView/ChatView.js";
import { EmptyState } from "./components/Empty/EmptyState.js";
import { PromptComposer } from "./components/Composer/PromptComposer.js";
import { Onboarding } from "./components/Onboarding/Onboarding.js";
import { ConsentToast } from "./components/Consent/ConsentToast.js";
import { SettingsModal } from "./components/Settings/SettingsModal.js";
import { AgentPanel } from "./components/AgentPanel/AgentPanel.js";
import { ArrowLeftIcon, ArrowRightIcon, SidebarToggleIcon } from "./components/Icon.js";
import { MarketView } from "./components/Market/MarketView.js";
import { TickerDetailWindow } from "./components/Market/TickerDetailWindow.js";
import { PortfolioView } from "./components/Portfolio/PortfolioView.js";
import { PositionDetailView } from "./components/Portfolio/PositionDetailView.js";
import { useStreamBridge } from "./lib/streamBridge.js";
import { useChatStore } from "./store/chatStore.js";

type AppView = "chat" | "markets" | "portfolio" | "position";
type NavState = {
  view: AppView;
  settingsOpen: boolean;
  tickerSymbol: string | null;
  positionSymbol: string | null;
};

export function App({ initialTickerSymbol }: { initialTickerSymbol?: string | null } = {}) {
  useStreamBridge();
  const [nav, setNav] = useState<NavState>({
    view: initialTickerSymbol ? "markets" : "chat",
    settingsOpen: false,
    tickerSymbol: initialTickerSymbol ? initialTickerSymbol.toUpperCase() : null,
    positionSymbol: null,
  });
  const [backStack, setBackStack] = useState<NavState[]>([]);
  const [forwardStack, setForwardStack] = useState<NavState[]>([]);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
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

  function normalizeNav(next: NavState): NavState {
    return {
      view: next.view,
      settingsOpen: next.settingsOpen,
      tickerSymbol: next.tickerSymbol ? next.tickerSymbol.toUpperCase() : null,
      positionSymbol: next.positionSymbol ? next.positionSymbol.toUpperCase() : null,
    };
  }

  function sameNav(a: NavState, b: NavState): boolean {
    return (
      a.view === b.view &&
      a.settingsOpen === b.settingsOpen &&
      a.tickerSymbol === b.tickerSymbol &&
      a.positionSymbol === b.positionSymbol
    );
  }

  function navigateTo(next: NavState): void {
    const normalized = normalizeNav(next);
    if (sameNav(nav, normalized)) return;
    setBackStack((current) => [...current, nav].slice(-50));
    setForwardStack([]);
    setNav(normalized);
  }

  function goBack(): void {
    const previous = backStack.at(-1);
    if (!previous) return;
    setBackStack((current) => current.slice(0, -1));
    setForwardStack((current) => [nav, ...current].slice(0, 50));
    setNav(previous);
  }

  function goForward(): void {
    const next = forwardStack[0];
    if (!next) return;
    setForwardStack((current) => current.slice(1));
    setBackStack((current) => [...current, nav].slice(-50));
    setNav(next);
  }

  if (!onboarded) {
    return <Onboarding onDone={() => setOnboarded(true)} />;
  }

  const activeSession = sessions.find((s) => s.id === activeSessionId);
  const activeProject = projects.find((p) => p.id === activeProjectId);
  const { view, settingsOpen, tickerSymbol, positionSymbol } = nav;
  const titleBase =
    positionSymbol ??
    tickerSymbol ??
    (view === "markets"
      ? "Markets"
      : view === "portfolio"
        ? "My Portfolio"
        : view === "position"
          ? "Position"
          : activeSession?.title ?? "New chat");
  const windowTitle = `${titleBase}${
    activeProject?.name ? ` - ${activeProject.name}` : ""
  }`;
  const appClassName = [
    "app",
    view === "markets" ? "is-markets" : "",
    view === "portfolio" ? "is-portfolio" : "",
    view === "position" ? "is-portfolio" : "",
    sidebarCollapsed ? "is-sidebar-collapsed" : "",
  ].filter(Boolean).join(" ");

  return (
    <div className={appClassName}>
      <div className="titlebar">
        <div className="traffic">
          <span />
          <span />
          <span />
        </div>
        <div className="titlebar-title">{windowTitle}</div>
      </div>
      <div className="app-nav-controls" aria-label="Navigation controls">
        <button
          type="button"
          className="titlebar-nav-btn"
          title={sidebarCollapsed ? "Show sidebar" : "Hide sidebar"}
          aria-label={sidebarCollapsed ? "Show sidebar" : "Hide sidebar"}
          onClick={() => setSidebarCollapsed((current) => !current)}
        >
          <SidebarToggleIcon />
        </button>
        <button
          type="button"
          className="titlebar-nav-btn"
          title="Back"
          aria-label="Back"
          disabled={backStack.length === 0}
          onClick={goBack}
        >
          <ArrowLeftIcon />
        </button>
        <button
          type="button"
          className="titlebar-nav-btn"
          title="Forward"
          aria-label="Forward"
          disabled={forwardStack.length === 0}
          onClick={goForward}
        >
          <ArrowRightIcon />
        </button>
      </div>
      <Sidebar
        activeView={view === "position" ? "portfolio" : view}
        onOpenChat={() =>
          navigateTo({ view: "chat", settingsOpen: false, tickerSymbol: null, positionSymbol: null })
        }
        onOpenMarkets={() =>
          navigateTo({ view: "markets", settingsOpen: false, tickerSymbol: null, positionSymbol: null })
        }
        onOpenPortfolio={() =>
          navigateTo({ view: "portfolio", settingsOpen: false, tickerSymbol: null, positionSymbol: null })
        }
        onOpenSettings={() => navigateTo({ ...nav, settingsOpen: true, tickerSymbol: null, positionSymbol: null })}
      />
      <main className="main">
        {tickerSymbol ? (
          <TickerDetailWindow key={tickerSymbol} initialSymbol={tickerSymbol} />
        ) : view === "position" && positionSymbol ? (
          <PositionDetailView
            key={positionSymbol}
            symbol={positionSymbol}
            onOpenTicker={(symbol) =>
              navigateTo({
                view: "markets",
                settingsOpen: false,
                tickerSymbol: symbol.toUpperCase(),
                positionSymbol: null,
              })
            }
            onBack={goBack}
          />
        ) : view === "markets" ? (
          <MarketView
            onOpenTicker={(symbol) =>
              navigateTo({
                view: "markets",
                settingsOpen: false,
                tickerSymbol: symbol.toUpperCase(),
                positionSymbol: null,
              })
            }
          />
        ) : view === "portfolio" ? (
          <PortfolioView
            onOpenTicker={(symbol) =>
              navigateTo({
                view: "markets",
                settingsOpen: false,
                tickerSymbol: symbol.toUpperCase(),
                positionSymbol: null,
              })
            }
            onOpenPosition={(symbol) =>
              navigateTo({
                view: "position",
                settingsOpen: false,
                tickerSymbol: null,
                positionSymbol: symbol.toUpperCase(),
              })
            }
          />
        ) : (
          <>
            {activeSessionId ? <ChatView sessionId={activeSessionId} /> : <EmptyState />}
            <PromptComposer />
          </>
        )}
      </main>
      {view === "chat" ? <AgentPanel /> : null}
      <ConsentToast />
      {settingsOpen && (
        <SettingsModal onClose={() => navigateTo({ ...nav, settingsOpen: false })} />
      )}
    </div>
  );
}
