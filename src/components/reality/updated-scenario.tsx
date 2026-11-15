"use client";

import Link from "next/link";
import { Tag } from "@/components/ui/surface";
import { ArrowRight } from "@/components/ui/icons";
import { updatedScenario } from "@/domain/reality";
import type { CheckIn, Plan, Profile, ScenarioInput } from "@/domain/types";
import { formatDate, formatNumber, t } from "@/i18n";
import { cn } from "@/lib/cn";

/**
 * Original vs adjusted timeline for the chosen path. Read-only: the original
 * plan is never overwritten. Formula and assumptions are printed under the bars.
 */
export function UpdatedScenario({
  plan,
  path,
  checkIns,
  profile,
}: {
  plan: Plan;
  path: ScenarioInput;
  checkIns: CheckIn[];
  profile: Profile;
}) {
  const U = t.reality.updated;
  const est = updatedScenario({ plan, path, checkIns, horizonMonths: profile.goals[0].horizonMonths });
  const scale = Math.max(est.originalWeeks, est.adjustedWeeks ?? 0, est.horizonWeeks) * 1.05;
  const pct = (w: number) => `${Math.min(100, (w / scale) * 100)}%`;
  const date = (d: Date | null) => (d ? formatDate(d, { day: "numeric", month: "short", year: "numeric" }) : "—");
  const pathColor = plan.pathId === "A" ? "var(--color-path-a)" : "var(--color-path-b)";

  return (
    <section aria-labelledby="updated-title" className="rounded-panel border border-line bg-surface/70 px-5 py-5 md:px-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="eyebrow">{U.eyebrow}</p>
          <h2 id="updated-title" className="mt-1 font-serif text-[22px] leading-snug text-ink">
            {U.title}
          </h2>
          <p className="mt-1 text-[13px] text-ink-2">{U.logged(formatNumber(est.loggedHours), est.totalHours)}</p>
        </div>
        <Tag tone="future" className="self-start">
          {t.futurePaths.hypothetical}
        </Tag>
      </div>

      {est.status !== "ok" ? (
        <p className="mt-4 rounded-[12px] border border-dashed border-line-strong px-4 py-3 text-[14px] text-ink-2">
          {est.status === "no_history" ? U.noHistory : U.zeroPace}
        </p>
      ) : null}

      {/* Bars: original (plan pace) vs adjusted (recent pace) */}
      <div className="relative mt-5 grid gap-4">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-2 -top-2 z-10 border-l border-dashed border-future"
          style={{ left: pct(est.horizonWeeks) }}
        />
        {[
          { key: "o", label: U.original, weeks: est.originalWeeks, finish: est.originalFinish, pace: est.plannedPace, solid: true },
          ...(est.adjustedWeeks !== null
            ? [{ key: "a", label: U.adjusted, weeks: est.adjustedWeeks, finish: est.adjustedFinish, pace: est.pace ?? 0, solid: false }]
            : []),
        ].map((row) => (
          <div key={row.key}>
            <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-x-3 text-[13px]">
              <span className="text-ink-2">
                {row.label} · <span className="tabular font-mono text-[12px]">{U.paceLabel(formatNumber(row.pace))}</span>
              </span>
              <span className="tabular text-ink">
                {U.estimate}: {U.weeks(row.weeks)} <span className="text-ink-3">{U.finish(date(row.finish))}</span>
              </span>
            </div>
            <div className="relative h-5 rounded-[6px] bg-surface-3/60" aria-hidden="true">
              {row.key === "a" && est.weeksElapsed > 0 && (
                <div className="absolute inset-y-0 left-0 rounded-l-[6px] bg-done" style={{ width: pct(est.weeksElapsed) }} />
              )}
              <div
                className="absolute inset-y-0 rounded-[6px] transition-[width] duration-500 ease-out"
                style={{
                  left: row.key === "a" ? pct(est.weeksElapsed) : 0,
                  width: row.key === "a" ? `calc(${pct(row.weeks)} - ${pct(est.weeksElapsed)})` : pct(row.weeks),
                  background: row.solid ? `color-mix(in oklab, ${pathColor} 55%, transparent)` : "transparent",
                  border: row.solid ? undefined : `1.5px dashed ${pathColor}`,
                }}
              />
            </div>
          </div>
        ))}
      </div>

      {est.deltaWeeks !== null && (
        <div className="mt-5 flex flex-col gap-1 rounded-[12px] border border-line px-4 py-3">
          <p className={cn("text-[14.5px]", est.deltaWeeks > 0 ? "text-ink" : "text-done")}>{U.delta(est.deltaWeeks)}</p>
          <p className={cn("text-[13px]", est.adjustedFitsHorizon ? "text-ink-2" : "text-warn")}>
            {est.adjustedFitsHorizon ? U.horizonOk : U.horizonOver}
          </p>
          <p className="text-[12.5px] text-ink-3">{U.keepsOriginal}</p>
        </div>
      )}

      <details className="group mt-4">
        <summary className="cursor-pointer list-none rounded text-[13px] font-medium text-ink-2 hover:text-ink">
          <span aria-hidden="true" className="mr-1.5 inline-block transition-transform group-open:rotate-90">›</span>
          {U.assumptionsTitle}
        </summary>
        <ul className="mt-2 grid gap-1 pl-4 text-[13px] text-ink-2">
          {U.assumptions({
            hours: path.hoursPerWeek,
            weeks: path.durationWeeks,
            total: est.totalHours,
            plannedPace: formatNumber(est.plannedPace),
            n: est.weeksUsed,
            pace: est.pace === null ? "—" : formatNumber(est.pace),
          }).map((line) => (
            <li key={line} className="list-disc">
              {line}
            </li>
          ))}
        </ul>
      </details>

      <Link
        href="/twin#future-paths"
        className="mt-4 inline-flex items-center gap-1.5 rounded text-[13.5px] text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink"
      >
        {U.toFuturePaths}
        <ArrowRight size={14} />
      </Link>
    </section>
  );
}
