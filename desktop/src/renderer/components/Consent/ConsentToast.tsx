import { useChatStore } from "../../store/chatStore.js";

export function ConsentToast() {
  const consent = useChatStore((s) => s.consent);
  const setConsent = useChatStore((s) => s.setConsent);
  if (!consent) return null;

  async function respond(approved: boolean) {
    if (!consent) return;
    await window.azoth.invoke("consent:respond", { id: consent.id, approved });
    setConsent(null);
  }

  return (
    <div className="fixed bottom-6 right-6 z-40 w-80 rounded-xl border border-azoth-warn/40 bg-azoth-surface p-4 shadow-xl">
      <div className="mb-1 text-xs uppercase tracking-wider text-azoth-warn">
        Broker action requested
      </div>
      <div className="mb-1 text-sm text-azoth-text">{consent.action}</div>
      {consent.detail && (
        <div className="mb-3 max-h-32 overflow-auto whitespace-pre-wrap text-xs text-azoth-muted">
          {consent.detail}
        </div>
      )}
      <div className="mb-3 text-[10px] uppercase tracking-wider text-azoth-muted">
        broker={consent.broker} · autonomy={consent.autonomy}
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => void respond(true)}
          className="flex-1 rounded bg-azoth-accent px-3 py-1.5 text-sm text-white"
        >
          Approve
        </button>
        <button
          onClick={() => void respond(false)}
          className="flex-1 rounded border border-azoth-border px-3 py-1.5 text-sm text-azoth-text hover:bg-azoth-panel"
        >
          Deny
        </button>
      </div>
    </div>
  );
}
