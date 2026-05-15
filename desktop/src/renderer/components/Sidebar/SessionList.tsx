import { useEffect, useRef, useState } from "react";
import type { SessionDescriptor } from "../../../shared/ipc.js";
import { useChatStore } from "../../store/chatStore.js";

const UNDO_MS = 5000;

interface PendingArchive {
  session: SessionDescriptor;
  startedAt: number;
}

export function SessionList() {
  const {
    sessions,
    activeProjectId,
    activeSessionId,
    setActiveSession,
    setRecords,
    archiveSession,
    restoreArchivedSession,
  } = useChatStore();
  const [pending, setPending] = useState<PendingArchive | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current != null) window.clearTimeout(timerRef.current);
    };
  }, []);

  async function open(id: string) {
    if (!activeProjectId) return;
    const { session, records } = await window.azoth.invoke("session:resume", {
      projectId: activeProjectId,
      sessionId: id,
    });
    setRecords(session.id, records);
    setActiveSession(session.id);
  }

  function clearPendingTimer() {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  async function refreshSessions() {
    if (!activeProjectId) return;
    const list = await window.azoth.invoke("session:list", { projectId: activeProjectId });
    useChatStore.getState().setSessions(list);
  }

  function clearPending(target = pending) {
    if (!target) return;
    clearPendingTimer();
    setPending(null);
  }

  function startArchive(session: SessionDescriptor) {
    if (pending && pending.session.id !== session.id) clearPending(pending);
    clearPendingTimer();
    const next = { session, startedAt: Date.now() };
    archiveSession(session.id);
    setPending(next);
    void (async () => {
      if (!activeProjectId) return;
      await window.azoth.invoke("session:archive", {
        projectId: activeProjectId,
        sessionId: session.id,
      });
      await refreshSessions();
    })();
    timerRef.current = window.setTimeout(() => clearPending(next), UNDO_MS);
  }

  function undoArchive() {
    const target = pending;
    if (target) restoreArchivedSession(target.session.id);
    clearPendingTimer();
    setPending(null);
    void (async () => {
      if (target && activeProjectId) {
        await window.azoth.invoke("session:restore", {
          projectId: activeProjectId,
          session: target.session,
        });
      }
      await refreshSessions();
    })();
  }

  return (
    <>
      <div className="session-list">
        {sessions.length === 0 ? (
          <div className="empty-sidebar">No sessions yet</div>
        ) : (
          sessions.map((s) => (
            <button
              key={s.id}
              onClick={() => open(s.id)}
              className="session-item"
              aria-current={s.id === activeSessionId ? "true" : "false"}
              title={s.title}
            >
              <span className="title">{s.title || "Untitled session"}</span>
              <span className="when">{formatAge(s.updatedAt)}</span>
              <span
                role="button"
                tabIndex={0}
                className="archive-btn"
                aria-label="Archive session"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  startArchive(s);
                }}
                onKeyDown={(e) => {
                  if (e.key !== "Enter" && e.key !== " ") return;
                  e.preventDefault();
                  e.stopPropagation();
                  startArchive(s);
                }}
              >
                <ArchiveIcon />
              </span>
            </button>
          ))
        )}
      </div>
      <div className={`undo-toast${pending ? " is-visible" : ""}`} role="status" aria-live="polite">
        <span>{pending ? `Archived "${pending.session.title || "Untitled session"}"` : "Session archived"}</span>
        <button type="button" onClick={undoArchive}>
          Undo
        </button>
        <span className="toast-progress" />
      </div>
    </>
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

function ArchiveIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2 4h12M3 4v9a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V4M6 4V3a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1M6.5 7.5h3" />
    </svg>
  );
}
