import { useState } from "react";
import type { CompanyInfo } from "../lib/types";
import "./AboutCompany.css";

const CLAMP_THRESHOLD = 320;

function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function hostnameOf(raw: string): string {
  try {
    return new URL(normalizeUrl(raw)).hostname.replace(/^www\./, "");
  } catch {
    return raw.trim();
  }
}

/** Company profile dates arrive as ISO-ish strings; show just the year-month-day. */
function fmtFounded(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

export default function AboutCompany({ company }: { company: CompanyInfo }) {
  const [expanded, setExpanded] = useState(false);

  const description = company.intro || company.summary;
  const isLong = !!description && description.length > CLAMP_THRESHOLD;
  const clamped = isLong && !expanded;

  // Google Finance's About grid reads: CEO, Employees, Founded / Headquarters,
  // Sector, Website. VNDirect publishes no CEO, so that row is simply absent;
  // Exchange and Phone are VN-useful extras it doesn't carry.
  const facts: { label: string; value: string }[] = [];
  const founded = fmtFounded(company.founded);
  if (founded) facts.push({ label: "Founded", value: founded });
  if (company.employees) {
    facts.push({ label: "Employees", value: company.employees.toLocaleString("en-US") });
  }
  if (company.address) facts.push({ label: "Headquarters", value: company.address });
  if (company.sector) facts.push({ label: "Sector", value: company.sector });
  if (company.floor) facts.push({ label: "Exchange", value: company.floor });
  if (company.phone) facts.push({ label: "Phone", value: company.phone });

  return (
    <section className="gf-card about">
      <h2 className="gf-section-title">About</h2>

      {description ? (
        <div className="about__body">
          <p className={`about__desc${clamped ? " about__desc--clamped" : ""}`}>
            {description}
          </p>
          {isLong && (
            <button
              type="button"
              className="about__toggle"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
            >
              {expanded ? "Show less" : "Show more"}
            </button>
          )}
        </div>
      ) : (
        <p className="about__empty text-muted">
          No company description available.
        </p>
      )}

      {facts.length > 0 && (
        <dl className="about__facts">
          {facts.map((f) => (
            <div className="about__fact" key={f.label}>
              <dt className="about__fact-label">{f.label}</dt>
              <dd className="about__fact-value">{f.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {company.website && (
        <div className="about__meta">
          {(
            <a
              className="gf-chip about__link"
              href={normalizeUrl(company.website)}
              target="_blank"
              rel="noopener noreferrer"
            >
              {hostnameOf(company.website)}
              <svg
                className="about__link-glyph"
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
            </a>
          )}
        </div>
      )}
    </section>
  );
}
