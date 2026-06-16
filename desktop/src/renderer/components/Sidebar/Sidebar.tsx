import {
  ChartIcon,
  ClockIcon,
  NewChatIcon,
  PositionsIcon,
  SearchIcon,
  SettingsIcon,
} from "../Icon.js";
import { useChatStore } from "../../store/chatStore.js";
import { SessionList } from "./SessionList.js";

export function Sidebar({
  activeView,
  onOpenChat,
  onOpenMarkets,
  onOpenPortfolio,
  onOpenSettings,
}: {
  activeView: "chat" | "markets" | "portfolio";
  onOpenChat: () => void;
  onOpenMarkets: () => void;
  onOpenPortfolio: () => void;
  onOpenSettings: () => void;
}) {
  const { activeProjectId, setActiveSession, setRecords, setSessions } = useChatStore();

  async function newChat() {
    if (!activeProjectId) return;
    onOpenChat();
    const entry = await window.azoth.invoke("session:start", { projectId: activeProjectId });
    const list = await window.azoth.invoke("session:list", { projectId: activeProjectId });
    setSessions(list);
    setRecords(entry.id, []);
    setActiveSession(entry.id);
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-section">
        <button className="sidebar-action" aria-current="false" onClick={newChat}>
          <NewChatIcon className="ico" />
          New chat
        </button>
        <button className="sidebar-action">
          <SearchIcon className="ico" />
          Search
        </button>
        <button
          className="sidebar-action"
          aria-current={activeView === "markets" ? "true" : "false"}
          onClick={onOpenMarkets}
        >
          <ChartIcon className="ico" />
          Markets
        </button>
        <button
          className="sidebar-action"
          aria-current={activeView === "portfolio" ? "true" : "false"}
          onClick={onOpenPortfolio}
        >
          <PositionsIcon className="ico" />
          My Portfolio
        </button>
        <button className="sidebar-action">
          <ClockIcon className="ico" />
          Automations
          <span className="sidebar-soon">Soon</span>
        </button>
        <button className="sidebar-action" onClick={onOpenSettings}>
          <SettingsIcon className="ico" />
          Settings
        </button>
      </div>

      <div className="sidebar-section sidebar-sessions">
        <div className="sidebar-label">Sessions</div>
        <SessionList onOpenSession={onOpenChat} />
      </div>
    </aside>
  );
}
