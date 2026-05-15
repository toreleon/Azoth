import { useChatStore } from "../../store/chatStore.js";

export function SessionList() {
  const { sessions, activeProjectId, activeSessionId, setActiveSession, setRecords } =
    useChatStore();

  async function open(id: string) {
    if (!activeProjectId) return;
    const { session, records } = await window.azoth.invoke("session:resume", {
      projectId: activeProjectId,
      sessionId: id,
    });
    setRecords(session.id, records);
    setActiveSession(session.id);
  }

  if (sessions.length === 0) {
    return (
      <div className="session-list">
        <div className="empty-sidebar">No sessions yet</div>
      </div>
    );
  }

  return (
    <div className="session-list">
      {sessions.map((s) => (
        <button
          key={s.id}
          onClick={() => open(s.id)}
          className="session-item"
          aria-current={s.id === activeSessionId ? "true" : "false"}
          title={s.title}
        >
          <span className="title">{s.title || "Untitled session"}</span>
          <span className="when">{formatAge(s.updatedAt)}</span>
        </button>
      ))}
    </div>
  );
}

function formatAge(timestamp: number): string {
  const delta = Math.max(0, Date.now() - timestamp);
  const minutes = Math.floor(delta / 60000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return `${Math.floor(days / 7)}w`;
}
