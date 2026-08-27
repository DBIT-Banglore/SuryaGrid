"use client";

import { useState } from "react";

/* ------------------------------------------------------------------ *
 * Reusable "how it works" + formula display components.
 * Every page uses these so the explanation style is consistent.
 * ------------------------------------------------------------------ */

/**
 * Collapsible "How it works" panel.  Renders a heading with an
 * expand/collapse toggle and a list of workflow steps.
 *
 * Props:
 *  - title:    the section heading (e.g. "How the DSM Engine works")
 *  - subtitle: optional one-line description
 *  - steps:    ordered list of { step: string, detail?: string } items
 */
export function HowItWorks({
  title = "How it works",
  subtitle,
  steps,
}: {
  title?: string;
  subtitle?: string;
  steps: { step: string; detail?: string }[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="glass-card p-4 mb-6">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between w-full text-left group"
      >
        <div>
          <span className="text-sm font-bold text-white/80 uppercase tracking-wider">
            {title}
          </span>
          {subtitle && (
            <div className="text-xs text-white/40 mt-0.5">{subtitle}</div>
          )}
        </div>
        <svg
          className={`w-4 h-4 text-white/40 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <ol className="mt-4 space-y-3">
          {steps.map((s, i) => (
            <li key={i} className="flex gap-3 text-sm">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-cyan-500/15 text-cyan-300 text-xs font-bold flex items-center justify-center">
                {i + 1}
              </span>
              <div>
                <span className="text-white/80 font-medium">{s.step}</span>
                {s.detail && (
                  <div className="text-white/45 text-xs mt-0.5 leading-relaxed">
                    {s.detail}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/**
 * Formula card.  Renders a labelled formula block with monospaced
 * math notation and optional source / classification badges.
 *
 * Props:
 *  - label:      formula name (e.g. "Irradiance closure")
 *  - formula:   monospaced formula text (use \n for multi-line)
 *  - variables: optional list of {name, desc} variable definitions
 *  - source:    optional source classification badge text
 *  - sourceUrl: optional link to the source document
 */
export function FormulaCard({
  label,
  formula,
  variables,
  source,
  sourceUrl,
}: {
  label: string;
  formula: string;
  variables?: { name: string; desc: string }[];
  source?: string;
  sourceUrl?: string;
}) {
  return (
    <div className="bg-white/[0.03] border border-white/10 rounded-lg p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-bold text-cyan-300 uppercase tracking-wider">
          {label}
        </span>
        {source && (
          <span className="text-[10px] px-2 py-0.5 rounded-full border border-white/10 text-white/40">
            {source}
          </span>
        )}
      </div>
      <pre className="text-sm text-emerald-200/90 font-mono whitespace-pre-wrap leading-relaxed">
        {formula}
      </pre>
      {variables && variables.length > 0 && (
        <div className="mt-3 space-y-1">
          {variables.map((v, i) => (
            <div key={i} className="text-xs text-white/40">
              <span className="text-white/70 font-mono">{v.name}</span>
              {" — "}
              {v.desc}
            </div>
          ))}
        </div>
      )}
      {sourceUrl && (
        <a
          href={sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="text-[10px] text-cyan-400/60 hover:text-cyan-300 mt-2 inline-block"
        >
          View source →
        </a>
      )}
    </div>
  );
}

/**
 * A grid of FormulaCards.  Just a wrapper that lays out formulas in a
 * responsive grid with an optional heading.
 */
export function FormulaGrid({
  title = "Formulas used",
  children,
}: {
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-6">
      <div className="text-sm font-bold text-white/70 uppercase tracking-wider mb-3">
        {title}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">{children}</div>
    </div>
  );
}

/**
 * A compact "data source" badge row.  Used to show which upstream
 * providers feed a given page.
 */
export function SourceBadges({ sources }: { sources: { name: string; label?: string }[] }) {
  return (
    <div className="flex flex-wrap gap-2 mb-4">
      {sources.map((s, i) => (
        <span
          key={i}
          className="text-[10px] px-2 py-1 rounded-full border border-cyan-500/20 bg-cyan-500/5 text-cyan-300/80"
        >
          {s.name}
          {s.label && <span className="text-white/30 ml-1">· {s.label}</span>}
        </span>
      ))}
    </div>
  );
}

/**
 * A "provenance" line — shows the data classification and a short note.
 */
export function ProvenanceNote({ label, note }: { label: string; note: string }) {
  return (
    <div className="text-xs text-white/40 bg-white/[0.02] border border-white/5 rounded-lg px-3 py-2 mb-4">
      <span className="text-amber-300/80 font-medium">Provenance:</span>{" "}
      <span className="text-white/60">{label}</span>
      {note && <span className="text-white/35"> — {note}</span>}
    </div>
  );
}
