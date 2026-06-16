import type { TeamRoleView, TeamRunView } from "../../store/chatStore.js";

export function TeamRunCard({ run }: { run: TeamRunView }) {
  const subtitle = run.ticker && run.ticker !== "TEAM"
    ? `${run.ticker}${run.runId ? ` - ${run.runId.slice(0, 8)}` : ""}`
    : run.runId
      ? run.runId.slice(0, 8)
      : "Coordinating subagents";

  return (
    <article className="turn team-turn">
      <section className={`team-card is-${run.status}`}>
        <header className="team-card-head">
          <div className="team-mark" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <div className="team-head-text">
            <div className="team-title">{run.title}</div>
            <div className="team-subtitle">{subtitle}</div>
          </div>
          <span className="team-pill">{teamStatusLabel(run)}</span>
        </header>

        {run.roles.length > 0 ? (
          <div className="team-role-list">
            {run.roles.map((role) => (
              <TeamRoleRow key={role.key} role={role} />
            ))}
          </div>
        ) : (
          <div className="team-empty">Starting team</div>
        )}
      </section>
    </article>
  );
}

function TeamRoleRow({ role }: { role: TeamRoleView }) {
  return (
    <div className={`team-role-row is-${role.status}`}>
      <span className="team-role-dot" aria-hidden="true" />
      <span className="team-role-name">{roleName(role)}</span>
      <span className="team-role-meta">{roleMeta(role)}</span>
    </div>
  );
}

function teamStatusLabel(run: TeamRunView): string {
  if (run.status === "error") return "Failed";
  if (run.status === "done") return run.rating ? `Done - ${run.rating}` : "Done";
  return "Running";
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
    if (role.toolCount > 0) return `Done - ${role.resultCount}/${role.toolCount} tools`;
    return "Done";
  }
  if (role.lastTool) {
    const tool = role.lastTool.replace(/^mcp__[^_]+__/, "").replace(/[_-]+/g, " ");
    if (role.detail) return `${tool} - ${role.detail}`;
    return `${tool} running`;
  }
  return "Running";
}
