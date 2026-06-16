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
    <div className="consent-toast ds-card">
      <div className="ds-kicker consent-kicker">
        Tool approval requested
      </div>
      <div className="consent-action">{consent.action}</div>
      {consent.detail && (
        <div className="consent-detail">
          {consent.detail}
        </div>
      )}
      <div className="consent-meta">
        broker={consent.broker} · mode={consent.autonomy}
      </div>
      <div className="ds-actions">
        <button
          onClick={() => void respond(true)}
          className="ds-button primary"
        >
          Approve
        </button>
        <button
          onClick={() => void respond(false)}
          className="ds-button"
        >
          Deny
        </button>
      </div>
    </div>
  );
}
