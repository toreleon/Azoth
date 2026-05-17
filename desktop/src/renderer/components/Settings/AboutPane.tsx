import { AzothMark, PaneShell } from "./SettingsControls.js";

export function AboutPane() {
  return (
    <PaneShell title="About">
      <div className="about-hero">
        <div className="about-mark" aria-label="Azoth"><AzothMark /></div>
        <h2 className="about-name">Azoth Desktop</h2>
        <p className="about-version">Version 0.1.0</p>
        <p className="about-tagline">An agentic trading assistant for Vietnam equities. Live on FHSC and DNSE; paper trading otherwise.</p>
        <div className="about-links">
          <a href="#">Release notes</a>
          <span>|</span>
          <a href="#">Documentation</a>
          <span>|</span>
          <a href="#">Report an issue</a>
        </div>
        <button className="settings-btn primary">Check for updates</button>
        <p className="about-risk">
          Trading involves risk of loss. Past performance is not indicative of future results. Azoth is not a registered investment advisor.
        </p>
      </div>
    </PaneShell>
  );
}
