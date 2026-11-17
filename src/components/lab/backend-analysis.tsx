"use client";

import { Tag } from "@/components/ui/surface";
import { PATH_IDS } from "@/domain/types";
import { formatNumber, t } from "@/i18n";
import { cn } from "@/lib/cn";
import type { BackendAnalysis } from "@/lib/remote/types";

/**
 * What the FastAPI backend computed for the same two paths (remote mode only).
 * Shown as-is, labelled by generator: "template" (rules) or "llm" (Claude explains,
 * numbers come from code). The local A/B view above stays the transparent baseline.
 */
export function BackendAnalysisPanel({ analysis }: { analysis: BackendAnalysis }) {
  const A = t.remote.analysis;
  const list = (title: string, items: string[]) =>
    items.length > 0 && (
      <div>
        <p className="text-[12px] font-medium text-ink-2">{title}</p>
        <ul className="mt-1 grid gap-1">
          {items.map((x) => (
            <li key={x} className="text-[13px] leading-snug text-ink-2 break-words">
              {x}
            </li>
          ))}
        </ul>
      </div>
    );
  return (
    <section aria-labelledby="backend-analysis" className="mt-6 rounded-panel border border-line bg-surface/70 px-5 py-5 md:px-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 id="backend-analysis" className="text-[15px] font-semibold text-ink">
            {A.title}
          </h2>
          {analysis.summary && <p className="mt-1 text-[13.5px] text-ink-2">{analysis.summary}</p>}
        </div>
        <Tag tone={analysis.source === "llm" ? "a" : "neutral"}>{analysis.source === "llm" ? A.llm : A.template}</Tag>
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {PATH_IDS.map((id) => {
          const p = analysis.perPath[id];
          if (!p) return null;
          return (
            <div key={id} className={cn("grid gap-3 rounded-[12px] border px-4 py-3", id === "A" ? "border-path-a/35" : "border-path-b/35")}>
              <div className="flex flex-wrap items-center gap-2">
                <span className={cn("eyebrow", id === "A" ? "text-path-a" : "text-path-b")}>{t.lab.pathLabel(id)}</span>
                <span className="tabular font-mono text-[11.5px] text-ink-2">{A.utilization(Math.round(p.utilization * 100))}</span>
                {p.overCapacity ? (
                  <Tag tone="risk">{A.overCapacity}</Tag>
                ) : (
                  <span className="tabular font-mono text-[11.5px] text-ink-3">{A.slack(formatNumber(p.slackHours))}</span>
                )}
              </div>
              {list(A.strengths, p.strengths)}
              {list(A.tradeoffs, p.tradeoffs)}
              {list(A.risks, p.risks)}
            </div>
          );
        })}
      </div>
      {(analysis.assumptions.length > 0 || analysis.missingData.length > 0) && (
        <div className="mt-4 grid gap-3 border-t border-line pt-3 md:grid-cols-2">
          {list(A.assumptions, analysis.assumptions)}
          {list(A.missingData, analysis.missingData)}
        </div>
      )}
    </section>
  );
}
