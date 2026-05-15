import type React from "react";
import { useChatStore } from "../../store/chatStore.js";
import { SessionList } from "./SessionList.js";

export function Sidebar() {
  const { activeProjectId, setActiveSession, setRecords, setSessions } = useChatStore();

  async function newChat() {
    if (!activeProjectId) return;
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
          <PlusIcon />
          New chat
          <kbd>⌘N</kbd>
        </button>
        <button className="sidebar-action">
          <SearchIcon />
          Search
          <kbd>⌘K</kbd>
        </button>
        <button className="sidebar-action">
          <PluginsIcon />
          Plugins
          <span className="sidebar-soon">Soon</span>
        </button>
        <button className="sidebar-action">
          <AutomationIcon />
          Automations
          <span className="sidebar-soon">Soon</span>
        </button>
      </div>

      <div className="sidebar-section sidebar-sessions">
        <div className="sidebar-label">Sessions</div>
        <SessionList />
      </div>
    </aside>
  );
}

function SidebarSvg({ children }: { children: React.ReactNode }) {
  return (
    <svg
      className="ico"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

function PlusIcon() {
  return (
    <SidebarSvg>
      <path d="M8 3v10M3 8h10" />
    </SidebarSvg>
  );
}

function SearchIcon() {
  return (
    <SidebarSvg>
      <circle cx="7" cy="7" r="4.5" />
      <path d="m13 13-2.5-2.5" />
    </SidebarSvg>
  );
}

function PluginsIcon() {
  return (
    <SidebarSvg>
      <rect x="2.5" y="2.5" width="11" height="11" rx="2" />
      <path d="M2.5 6.5h11M6.5 2.5v11" />
    </SidebarSvg>
  );
}

function AutomationIcon() {
  return (
    <SidebarSvg>
      <path d="M3 8a5 5 0 1 0 10 0M3 8a5 5 0 1 1 10 0M8 3v10" />
    </SidebarSvg>
  );
}
