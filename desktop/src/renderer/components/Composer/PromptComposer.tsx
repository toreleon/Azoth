import { useCallback, useEffect, useRef, useState } from "react";
import { matchSlash } from "../../../shared/slashCommands.js";
import { useChatStore } from "../../store/chatStore.js";
import { SlashSuggest } from "./SlashSuggest.js";
import { ModelPicker } from "./ModelPicker.js";
import { AutonomyPicker } from "./AutonomyPicker.js";

function newTurnId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function PromptComposer() {
  const [value, setValue] = useState("");
  const [suggestIdx, setSuggestIdx] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const {
    activeProjectId,
    activeSessionId,
    activeTurnsBySession,
    setActiveSession,
    setRecords,
    setSessions,
    appendRecord,
    startStreaming,
    stopStreaming,
  } = useChatStore();
  const activeTurnId = activeSessionId ? activeTurnsBySession[activeSessionId] : undefined;
  const streaming = activeTurnId != null;

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail;
      if (typeof detail === "string") {
        setValue(detail);
        taRef.current?.focus();
      }
    };
    window.addEventListener("azoth:prefill", handler);
    return () => window.removeEventListener("azoth:prefill", handler);
  }, []);

  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [value]);

  const send = useCallback(async () => {
    const text = value.trim();
    if (!text || !activeProjectId || streaming) return;
    setError(null);

    let sessionId = activeSessionId;
    try {
      if (!sessionId) {
        const entry = await window.azoth.invoke("session:start", {
          projectId: activeProjectId,
          title: text.slice(0, 80),
        });
        sessionId = entry.id;
        setActiveSession(sessionId);
        setRecords(sessionId, []);
        const list = await window.azoth.invoke("session:list", { projectId: activeProjectId });
        setSessions(list);
      }

      // Optimistic user record so the message appears immediately.
      appendRecord(sessionId, {
        type: "user",
        timestamp: Date.now(),
        sessionId,
        text,
      });

      const turnId = newTurnId();
      startStreaming(sessionId, turnId);
      setValue("");
      await window.azoth.invoke("turn:send", {
        projectId: activeProjectId,
        sessionId,
        prompt: text,
        turnId,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (sessionId) stopStreaming(sessionId);
      if (sessionId) {
        appendRecord(sessionId, {
          type: "error",
          timestamp: Date.now(),
          sessionId,
          text: message,
        });
      } else {
        setError(message);
      }
    }
  }, [
    value,
    activeProjectId,
    activeSessionId,
    streaming,
    setActiveSession,
    setRecords,
    setSessions,
    appendRecord,
    startStreaming,
    stopStreaming,
  ]);

  async function abort() {
    if (!activeTurnId) return;
    await window.azoth.invoke("turn:abort", { turnId: activeTurnId });
  }

  const suggestions = matchSlash(value);

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (suggestions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSuggestIdx((i) => i + 1);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSuggestIdx((i) => i - 1);
        return;
      }
      if (e.key === "Tab") {
        e.preventDefault();
        const sel =
          ((suggestIdx % suggestions.length) + suggestions.length) % suggestions.length;
        const cmd = suggestions[sel]!;
        setValue(`/${cmd.name}${cmd.args ? " " : ""}`);
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  }

  return (
    <div className="composer">
      <div className="composer-shell">
        <SlashSuggest
          input={value}
          selected={suggestIdx}
          onPick={(c) => setValue(`/${c.name}${c.args ? " " : ""}`)}
        />
        {error && (
          <div className="error-bubble composer-error">
            {error}
          </div>
        )}
        <textarea
          ref={taRef}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setSuggestIdx(0);
          }}
          onKeyDown={handleKey}
          placeholder="Ask for follow-up changes"
          rows={1}
        />
        <div className="composer-row">
          <button type="button" className="icon-btn" title="Attach context">
            <PlusIcon />
          </button>
          <AutonomyPicker />
          <span className="grow" />
          <ModelPicker />
          <button type="button" className="icon-btn" title="Voice input">
            <VoiceIcon />
          </button>
          {streaming ? (
            <button onClick={abort} className="stop-btn">
              Stop
            </button>
          ) : (
            <button
              onClick={() => void send()}
              disabled={!value.trim()}
              className="send-btn"
              title="Send (⌘↵)"
            >
              <SendIcon />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function VoiceIcon() {
  return (
    <svg
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <rect x="5.5" y="2" width="3" height="6.5" rx="1.5" />
      <path d="M3.5 7a3.5 3.5 0 0 0 7 0M7 10.5v1.5" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg
      className="h-3.5 w-3.5"
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M7 2.5v9M2.5 7h9" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg
      className="h-3.5 w-3.5"
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M7 11V3M3.5 6.5 7 3l3.5 3.5" />
    </svg>
  );
}
