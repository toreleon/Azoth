import { useCallback, useEffect, useRef, useState } from "react";
import { matchSlash } from "../../../shared/slashCommands.js";
import { useChatStore } from "../../store/chatStore.js";
import { SlashSuggest } from "./SlashSuggest.js";
import { ModelPicker } from "./ModelPicker.js";
import { AutonomyPicker } from "./AutonomyPicker.js";
import { MicIcon, PlusIcon, SendIcon, StopIcon } from "../Icon.js";

function newTurnId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function parseSlash(input: string): { name: string; args: string } | null {
  if (!input.startsWith("/")) return null;
  const [rawName = "", ...rest] = input.slice(1).trim().split(/\s+/);
  const name = rawName.toLowerCase();
  if (!name) return null;
  return { name, args: rest.join(" ").trim() };
}

function promptForSlash(name: string, args: string): string | null {
  switch (name) {
    case "team":
      return args ? `Run agent-team orchestration for this request: ${args}` : null;
    case "backtest":
      return `Run an interval backtest with these arguments: ${args || "default previous calendar week"}.`;
    case "quote":
      return args
        ? `Give me a market quote with technicals and recent news for ${args.toUpperCase()}.`
        : null;
    case "positions":
      return "Summarize my current portfolio positions, unrealized PnL, and exposures.";
    default:
      return null;
  }
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
    setConfig,
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

  const refreshSessions = useCallback(async () => {
    if (!activeProjectId) return;
    const list = await window.azoth.invoke("session:list", { projectId: activeProjectId });
    setSessions(list);
  }, [activeProjectId, setSessions]);

  const ensureSession = useCallback(async (title: string) => {
    if (!activeProjectId) throw new Error("No active project selected.");
    let sessionId = activeSessionId;
    if (sessionId) return sessionId;
    const entry = await window.azoth.invoke("session:start", {
      projectId: activeProjectId,
      title: title.slice(0, 80) || "Untitled session",
    });
    sessionId = entry.id;
    setActiveSession(sessionId);
    setRecords(sessionId, []);
    await refreshSessions();
    return sessionId;
  }, [activeProjectId, activeSessionId, refreshSessions, setActiveSession, setRecords]);

  const sendPrompt = useCallback(async (prompt: string, displayPrompt = prompt) => {
    if (!activeProjectId || streaming) return;
    setError(null);
    let sessionId: string | null = null;
    try {
      sessionId = await ensureSession(displayPrompt);
      // Optimistic user record so the message appears immediately.
      appendRecord(sessionId, {
        type: "user",
        timestamp: Date.now(),
        sessionId,
        text: displayPrompt,
      });

      const turnId = newTurnId();
      startStreaming(sessionId, turnId);
      setValue("");
      await window.azoth.invoke("turn:send", {
        projectId: activeProjectId,
        sessionId,
        prompt,
        displayPrompt: displayPrompt === prompt ? undefined : displayPrompt,
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
    activeProjectId,
    streaming,
    ensureSession,
    appendRecord,
    startStreaming,
    stopStreaming,
  ]);

  const runLocalSlash = useCallback(async (name: string, args: string, userText: string) => {
    if (!activeProjectId || streaming) return;
    setError(null);
    let sessionId: string | null = null;
    try {
      sessionId = await ensureSession(userText);
      appendRecord(sessionId, {
        type: "user",
        timestamp: Date.now(),
        sessionId,
        text: userText,
      });
      setValue("");
      const res = await window.azoth.invoke("slash:run", {
        projectId: activeProjectId,
        sessionId,
        name,
        args,
      });
      appendRecord(sessionId, {
        type: "assistant",
        timestamp: Date.now(),
        sessionId,
        text: res.text ?? "",
      });
      if (name === "autonomy") {
        const cfg = await window.azoth.invoke("config:get", undefined);
        setConfig(cfg);
      }
      await refreshSessions();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
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
    activeProjectId,
    streaming,
    ensureSession,
    appendRecord,
    refreshSessions,
    setConfig,
  ]);

  const startNewChat = useCallback(async () => {
    if (!activeProjectId || streaming) return;
    setError(null);
    try {
      const entry = await window.azoth.invoke("session:start", {
        projectId: activeProjectId,
        title: "Untitled session",
      });
      setActiveSession(entry.id);
      setRecords(entry.id, []);
      setValue("");
      await refreshSessions();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [activeProjectId, streaming, refreshSessions, setActiveSession, setRecords]);

  const send = useCallback(async () => {
    const text = value.trim();
    if (!text || !activeProjectId || streaming) return;

    const slash = parseSlash(text);
    if (slash) {
      if (slash.name === "new") {
        await startNewChat();
        return;
      }
      const prompt = promptForSlash(slash.name, slash.args);
      if (prompt) {
        await sendPrompt(prompt, text);
        return;
      }
      if (["help", "sessions", "health", "about", "autonomy"].includes(slash.name)) {
        await runLocalSlash(slash.name, slash.args, text);
        return;
      }
      await runLocalSlash(slash.name, slash.args, text || `/${slash.name}`);
      return;
    }

    await sendPrompt(text);
  }, [
    value,
    activeProjectId,
    streaming,
    sendPrompt,
    runLocalSlash,
    startNewChat,
  ]);

  async function abort() {
    if (!activeTurnId) return;
    const sessionId = activeSessionId;
    const res = await window.azoth.invoke("turn:abort", { turnId: activeTurnId });
    if (res.ok && sessionId) stopStreaming(sessionId);
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
            <MicIcon />
          </button>
          {streaming ? (
            <button onClick={abort} className="stop-btn" title="Stop">
              <StopIcon />
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
