import type { ReactNode } from "react";
import type { ChatRecord } from "../../../shared/ipc.js";
import { MarkdownContent } from "./MarkdownContent.js";

interface Props {
  record: ChatRecord;
  fallback: ReactNode;
}

interface TeamResult {
  ok?: boolean;
  type?: string;
  runId?: string;
  asOfDateIso?: string;
  decision?: Record<string, unknown>;
  researchPlan?: Record<string, unknown>;
  trader?: Record<string, unknown>;
  risk?: Record<string, unknown>;
  analysts?: Array<Record<string, unknown>>;
}

export function isTeamToolName(name: string | undefined): boolean {
  return Boolean(name && /(^|__)team_(analyze|question)$/.test(name));
}

export function TeamResultCard({ record, fallback }: Props) {
  const result = parseTeamResult(record.text);
  if (!result) return <>{fallback}</>;

  const isAnalyze = result.type === "team_analyze" || record.toolName?.includes("team_analyze");
  const decision = result.decision ?? {};
  const title = isAnalyze ? "Team Analyze" : "Team Question";
  const rating = textValue(decision.rating) || textValue(decision.recommendation);
  const ticker = textValue(decision.ticker);
  const size = numberValue(decision.sizingPct);
  const summary = textValue(decision.rationale) || textValue(decision.answer);
  const runLabel = result.runId ? result.runId.slice(0, 8) : undefined;

  return (
    <article className="turn team-turn">
      <section className="team-result-card">
        <header className="team-card-head">
          <div className="team-mark is-complete" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <div className="team-head-text">
            <div className="team-title">{title}</div>
            <div className="team-subtitle">
              {[ticker, result.asOfDateIso, runLabel].filter(Boolean).join(" - ")}
            </div>
          </div>
          {rating ? <span className="team-pill">{rating}</span> : null}
        </header>

        <div className="team-result-grid">
          {ticker ? <Metric label="Ticker" value={ticker} /> : null}
          {rating ? <Metric label="Decision" value={rating} /> : null}
          {size != null ? <Metric label="Size" value={`${formatPercent(size)}`} /> : null}
          {typeof result.risk?.approved === "boolean" ? (
            <Metric label="Risk" value={result.risk.approved ? "Approved" : "Rejected"} />
          ) : null}
        </div>

        {summary ? (
          <div className="team-result-summary md">
            <MarkdownContent text={summary} />
          </div>
        ) : null}

        {isAnalyze ? <AnalyzeDetails result={result} /> : <QuestionDetails decision={decision} />}
      </section>
    </article>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="team-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function AnalyzeDetails({ result }: { result: TeamResult }) {
  const analystRows = result.analysts ?? [];
  const concerns = arrayText(result.risk?.concerns);
  return (
    <details className="team-result-details">
      <summary>Subagents</summary>
      <div className="team-detail-list">
        {analystRows.map((analyst, idx) => (
          <div key={idx} className="team-detail-row">
            <span>{textValue(analyst.role) || `Analyst ${idx + 1}`}</span>
            <p>{textValue(analyst.summary)}</p>
          </div>
        ))}
        {result.researchPlan?.rationale ? (
          <div className="team-detail-row">
            <span>Research manager</span>
            <p>{textValue(result.researchPlan.rationale)}</p>
          </div>
        ) : null}
        {result.trader?.rationale ? (
          <div className="team-detail-row">
            <span>Trader</span>
            <p>{textValue(result.trader.rationale)}</p>
          </div>
        ) : null}
        {concerns.length > 0 ? (
          <div className="team-detail-row">
            <span>Risk</span>
            <p>{concerns.join("; ")}</p>
          </div>
        ) : null}
      </div>
    </details>
  );
}

function QuestionDetails({ decision }: { decision: Record<string, unknown> }) {
  const reasons = arrayText(decision.keyReasons);
  const risks = arrayText(decision.risks);
  const nextActions = arrayText(decision.nextActions);
  if (reasons.length + risks.length + nextActions.length === 0) return null;
  return (
    <details className="team-result-details">
      <summary>Subagents</summary>
      <div className="team-detail-list">
        {reasons.length > 0 ? <DetailList title="Reasons" values={reasons} /> : null}
        {risks.length > 0 ? <DetailList title="Risks" values={risks} /> : null}
        {nextActions.length > 0 ? <DetailList title="Next actions" values={nextActions} /> : null}
      </div>
    </details>
  );
}

function DetailList({ title, values }: { title: string; values: string[] }) {
  return (
    <div className="team-detail-row">
      <span>{title}</span>
      <p>{values.join("; ")}</p>
    </div>
  );
}

function parseTeamResult(text: string | undefined): TeamResult | null {
  if (!text) return null;
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const result = parsed as TeamResult;
    if (result.ok === false) return null;
    if (result.type !== "team_analyze" && result.type !== "team_question") return null;
    return result;
  } catch {
    return null;
  }
}

function textValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function arrayText(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function formatPercent(value: number): string {
  const pct = value <= 1 ? value * 100 : value;
  return `${pct.toFixed(pct >= 10 ? 0 : 1)}%`;
}
