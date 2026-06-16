import { useMemo, type ReactNode } from "react";
import {
  AgentIcon,
  CheckIcon,
  LightningIcon,
  SpinnerIcon,
  TerminalIcon,
  UsersIcon,
  XIcon,
} from "../Icon.js";
import { useChatStore, type TeamRoleView, type TeamRunView } from "../../store/chatStore.js";

export function AgentPanel() {
  const activeSessionId = useChatStore((s) => s.activeSessionId);
  const activeTurnId = useChatStore((s) =>
    activeSessionId ? s.activeTurnsBySession[activeSessionId] : undefined,
  );
  const runs = useChatStore((s) =>
    activeSessionId ? s.teamRunsBySession[activeSessionId] ?? [] : [],
  );

  const orderedRuns = useMemo(
    () =>
      [...runs].sort((a, b) => {
        const activeDelta = Number(b.turnId === activeTurnId) - Number(a.turnId === activeTurnId);
        if (activeDelta !== 0) return activeDelta;
        const statusDelta = statusRank(b.status) - statusRank(a.status);
        if (statusDelta !== 0) return statusDelta;
        return b.updatedAt - a.updatedAt;
      }),
    [activeTurnId, runs],
  );
  const activeCount = runs.filter((run) => run.status === "running").length;
  const roleTotals = runs.reduce(
    (acc, run) => {
      acc.total += run.roles.length;
      acc.done += run.roles.filter((role) => role.status === "done").length;
      acc.running += run.roles.filter((role) => role.status === "running").length;
      return acc;
    },
    { total: 0, done: 0, running: 0 },
  );

  return (
    <aside className="agent-panel" aria-label="Agent runs">
      <section className="agent-banner">
        <header className="agent-banner-head">
          <h2>Agents</h2>
        </header>

        <div className="agent-banner-rows">
          <BannerRow
            icon={<AgentIcon />}
            label="Agent runs"
            value={activeCount > 0 ? `${activeCount} live` : runs.length ? `${runs.length} recent` : "Idle"}
            tone={activeCount > 0 ? "active" : undefined}
          />
          <BannerRow icon={<LightningIcon />} label="Subagents" value="Auto" tone="auto" />
          <BannerRow
            icon={<UsersIcon />}
            label="Roles"
            value={roleTotals.total ? `${roleTotals.done}/${roleTotals.total}` : "-"}
          />
        </div>

        <div className="agent-banner-section">
          <div className="agent-section-title">Background agents</div>
          <div className="agent-run-list">
            {orderedRuns.length > 0 ? (
              orderedRuns.slice(0, 5).map((run) => <AgentRun key={run.key} run={run} />)
            ) : (
              <div className="agent-empty-row">
                <TerminalIcon />
                <span>No agent runs yet</span>
              </div>
            )}
          </div>
        </div>

        <div className="agent-banner-section">
          <div className="agent-section-title">Sources</div>
          <div className="agent-source-list">
            {orderedRuns.length > 0 ? (
              <>
                <span>Market tools</span>
                <span>Portfolio state</span>
                <span>Risk guardrails</span>
              </>
            ) : (
              <span>No sources yet</span>
            )}
          </div>
        </div>
      </section>
    </aside>
  );
}

function AgentRun({ run }: { run: TeamRunView }) {
  const done = run.roles.filter((role) => role.status === "done").length;
  const total = run.roles.length;
  const progress = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <section className={`agent-run is-${run.status}`}>
      <div className="agent-run-top">
        <div className="agent-run-icon" aria-hidden="true">
          <AgentIcon />
        </div>
        <div className="agent-run-title-wrap">
          <div className="agent-run-title">{runTitle(run)}</div>
          <div className="agent-run-subtitle">{runSubtitle(run)}</div>
        </div>
        <span className="agent-run-pill">{statusLabel(run)}</span>
      </div>

      <div className="agent-progress" aria-label={`${progress}% complete`}>
        <span style={{ width: `${progress}%` }} />
      </div>

      <div className="agent-role-list">
        {run.roles.length > 0 ? (
          run.roles.map((role) => <AgentRole key={role.key} role={role} />)
        ) : (
          <div className="agent-role-empty">Starting</div>
        )}
      </div>
    </section>
  );
}

function BannerRow({
  icon,
  label,
  value,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value?: string;
  tone?: "active" | "auto";
}) {
  return (
    <div className={`agent-banner-row ${tone ? `is-${tone}` : ""}`}>
      <span className="agent-banner-icon">{icon}</span>
      <span className="agent-banner-label">{label}</span>
      {value ? <span className="agent-banner-value">{value}</span> : null}
    </div>
  );
}

function AgentRole({ role }: { role: TeamRoleView }) {
  return (
    <div className={`agent-role is-${role.status}`}>
      <StatusIcon status={role.status} />
      <div className="agent-role-body">
        <span>{roleName(role)}</span>
        <strong>{roleMeta(role)}</strong>
      </div>
    </div>
  );
}

function StatusIcon({ status }: { status: TeamRoleView["status"] }) {
  if (status === "done") {
    return <CheckIcon className="agent-status-icon" />;
  }
  if (status === "error") {
    return <XIcon className="agent-status-icon" />;
  }
  return <SpinnerIcon className="agent-status-icon is-spinning" />;
}

function runTitle(run: TeamRunView): string {
  if (run.ticker && run.ticker !== "TEAM") return `${run.ticker} analysis`;
  return run.tool === "team_analyze" ? "Ticker analysis" : "Team question";
}

function runSubtitle(run: TeamRunView): string {
  if (run.status === "error") return run.message ?? "Run failed";
  if (run.status === "done") {
    const size = run.sizingPct != null ? ` · ${(run.sizingPct * 100).toFixed(1)}%` : "";
    return run.rating ? `${run.rating}${size}` : "Complete";
  }
  const activeRole = run.roles.find((role) => role.status === "running");
  return activeRole ? roleName(activeRole) : "Preparing agents";
}

function statusLabel(run: TeamRunView): string {
  if (run.status === "done") return "Done";
  if (run.status === "error") return "Failed";
  return "Live";
}

function statusRank(status: TeamRunView["status"]): number {
  if (status === "running") return 2;
  if (status === "done") return 1;
  return 0;
}

function roleName(role: TeamRoleView): string {
  const name = role.role
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
  return role.round == null ? name : `${name} R${role.round}`;
}

function roleMeta(role: TeamRoleView): string {
  if (role.status === "error") return role.detail ? `Failed - ${role.detail}` : "Failed";
  if (role.status === "done") {
    if (role.toolCount > 0) return `${role.resultCount}/${role.toolCount} tools`;
    return "Complete";
  }
  if (role.lastTool) return role.lastTool.replace(/^mcp__[^_]+__/, "").replace(/[_-]+/g, " ");
  return "Running";
}
