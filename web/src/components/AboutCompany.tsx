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

export default function AboutCompany({ company }: { company: CompanyInfo }) {
  const [expanded, setExpanded] = useState(false);

  const description = company.intro || company.summary;
  const isLong = !!description && description.length > CLAMP_THRESHOLD;
  const clamped = isLong && !expanded;

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

      {(company.sector || company.floor || company.website) && (
        <div className="about__meta">
          {company.sector && <span className="gf-chip">{company.sector}</span>}
          {company.floor && <span className="gf-chip">{company.floor}</span>}
          {company.website && (
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
