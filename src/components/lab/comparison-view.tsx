"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { ArrowRight, Check, Pencil } from "@/components/ui/icons";
import { Meter, Tag } from "@/components/ui/surface";
import type { Comparison, Decision, PathId, Profile, Severity, UncertaintyLevel } from "@/domain/types";
import { PATH_IDS } from "@/domain/types";
import { t } from "@/i18n";
import { cn } from "@/lib/cn";

const R = t.lab.result;
const L = t.labels;

const SEVERITY_DOT: Record<Severity, string> = { low: "bg-ink-3", medium: "bg-warn", high: "bg-risk" };
const LOAD_TONE = { fits: "done", tight: "warn", overload: "risk" } as const;
const UNC_STEPS: Record<UncertaintyLevel, number> = { low: 1, medium: 2, high: 3 };

/** Fork that visually splits the decision into the two columns below it. */
function Fork({ chosen }: { chosen: PathId | null }) {
  const style = (id: PathId) => ({
    stroke: `var(--color-path-${id.toLowerCase()})`,
    strokeDasharray: chosen === id ? undefined : "3 4",
    opacity: chosen && chosen !== id ? 0.3 : 0.9,
  });
  return (
    <div aria-hidden="true" className="relative h-14">
      <span className="absolute left-1/2 top-0 size-3 -translate-x-1/2 rotate-45 border-[1.5px] border-ink bg-bg" />
      <svg className="absolute inset-x-0 top-2.5 h-[calc(100%-10px)] w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
        <path d="M50 0 C50 80 25 20 25 100" fill="none" strokeWidth={1.5} vectorEffect="non-scaling-stroke" {...style("A")} />
        <path d="M50 0 C50 80 75 20 75 100" fill="none" strokeWidth={1.5} vectorEffect="non-scaling-stroke" {...style("B")} />
      </svg>
    </div>
  );
}

function Row({
  label,
  note,
  chosen,
  children,
}: {
  label: string;
  note?: string;
  chosen: PathId | null;
  children: (id: PathId) => ReactNode;
}) {
  return (
    <div className="grid grid-cols-2 gap-x-3 border-t border-line py-4 md:grid-cols-[168px_minmax(0,1fr)_minmax(0,1fr)] md:gap-x-6">
      <div className="col-span-2 mb-2.5 md:col-span-1 md:mb-0">
        <h3 className="text-[13px] font-medium text-ink-2">{label}</h3>
        {note && <p className="mt-1 max-w-[30ch] text-[12px] leading-snug text-ink-3">{note}</p>}
      </div>
      {PATH_IDS.map((id) => (
        <div
         
          key={id}
          className={cn("min-w-0 transition-opacity duration-300", chosen && chosen !== id && "opacity-50")}
        >
          <span className="sr-only">{t.lab.pathLabel(id)}: </span>
          {children(id)}
        </div>
      ))}
    </div>
  );
}

function Bullets({ items, empty, marker }: { items: string[]; empty: string; marker: string }) {
  if (items.length === 0) return <p className="text-[13px] text-ink-3">{empty}</p>;
  return (
    <ul className="grid gap-1.5">
      {items.map((x, i) => (
        <li key={i} className="flex gap-2 text-[13.5px] leading-snug text-ink-2">
          <span aria-hidden="true" className="mt-px font-mono text-ink-3">
            {marker}
          </span>
          <span className="min-w-0 break-words">{x}</span>
        </li>
      ))}
    </ul>
  );
}

export function ComparisonView({
  decision,
  comparison,
  profile,
  chosen,
  onChoose,
  onEdit,
  onContinue,
  continuing,
  planNote,
}: {
  decision: Decision;
  comparison: Comparison;
  profile: Profile;
  chosen: PathId | null;
  onChoose: (id: PathId) => void;
  onEdit: () => void;
  onContinue: () => void;
  continuing: boolean;
  planNote?: string;
}) {
  const P = decision.paths;
  const A = comparison.paths;

  return (
    <div className="grid gap-6 animate-rise">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="eyebrow">{t.lab.analysisLabel}</p>
          <h2 className="mt-2 max-w-3xl font-serif text-[22px] leading-snug text-ink text-balance md:text-[26px]">
            {decision.question}
          </h2>
          <div className="mt-3">
            <Tag tone={comparison.source === "ai" ? "a" : "future"}>{R.source[comparison.source]}</Tag>
          </div>
        </div>
        <Button variant="ghost" size="sm" icon={<Pencil size={14} />} onClick={onEdit} className="self-start">
          {t.lab.edit}
        </Button>
      </div>

      <div className="rounded-panel border border-line bg-surface/70 px-4 pb-2 md:px-6">
        {/* Fork + column headers */}
        <div>
          <div className="grid grid-cols-2 gap-x-3 pt-4 md:grid-cols-[168px_minmax(0,1fr)_minmax(0,1fr)] md:gap-x-6">
            <div className="hidden md:block" />
            <div className="col-span-2 md:col-span-2" aria-hidden="true">
              <Fork chosen={chosen} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-x-3 pb-4 md:grid-cols-[168px_minmax(0,1fr)_minmax(0,1fr)] md:gap-x-6">
            <div className="hidden md:block" />
            {PATH_IDS.map((id) => (
              <div
               
                key={id}
                className={cn(
                  "min-w-0 rounded-[12px] border px-3 py-3 transition-[opacity,border-color] duration-300 md:px-4",
                  id === "A" ? "border-path-a/40" : "border-path-b/40",
                  chosen === id ? "bg-surface-2" : "border-dashed",
                  chosen && chosen !== id && "opacity-50",
                )}
              >
                <p className={cn("eyebrow flex items-center justify-between", id === "A" ? "text-path-a" : "text-path-b")}>
                  {t.lab.pathLabel(id)}
                  {chosen === id && (
                    <span className="inline-flex items-center gap-1 normal-case tracking-normal">
                      <Check size={11} /> {R.chosen}
                    </span>
                  )}
                </p>
                <p className="mt-1 text-[14.5px] font-medium leading-snug text-ink break-words">{P[id].title}</p>
                {P[id].description && (
                  <p className="mt-1 hidden text-[13px] leading-snug text-ink-3 sm:block">{P[id].description}</p>
                )}
              </div>
            ))}
          </div>
        </div>

        <div>
          <Row label={R.weekly} chosen={chosen}>
            {(id) => (
              <div>
                <p className="tabular flex flex-wrap items-baseline gap-x-1.5">
                  <span className="font-serif text-[26px] leading-none text-ink">{P[id].hoursPerWeek}</span>
                  <span className="text-[12.5px] text-ink-3">{R.ofAvailable(profile.hoursPerWeek)}</span>
                </p>
                <Meter
                  className="mt-2.5"
                  value={P[id].hoursPerWeek}
                  max={profile.hoursPerWeek}
                  label={`${t.lab.pathLabel(id)}: ${P[id].hoursPerWeek} / ${profile.hoursPerWeek}`}
                  tone={id === "A" ? "path-a" : "path-b"}
                  height={5}
                />
                <div className="mt-2">
                  <Tag tone={LOAD_TONE[A[id].load]}>{L.load[A[id].load]}</Tag>
                </div>
              </div>
            )}
          </Row>

          <Row label={R.duration} chosen={chosen}>
            {(id) => (
              <div className="tabular text-[13.5px] text-ink-2">
                <p>
                  <span className="text-ink">{P[id].durationWeeks}</span> {t.common.weeksShort} ·{" "}
                  <span className="text-ink">{A[id].totalHours}</span> {t.common.hoursShort} {R.total.toLowerCase()}
                </p>
                {A[id].load === "overload" && (
                  <p className="mt-1 text-[12.5px] text-warn">{R.atYourPace(A[id].weeksAtAvailablePace)}</p>
                )}
              </div>
            )}
          </Row>

          <Row label={R.goalFit} note={t.lab.fields.goalFit} chosen={chosen}>
            {(id) => <Tag tone={P[id].goalFit === "direct" ? "done" : P[id].goalFit === "partial" ? "neutral" : "warn"}>{L.goalFit[P[id].goalFit]}</Tag>}
          </Row>

          <Row label={R.pros} chosen={chosen}>
            {(id) => <Bullets items={P[id].pros} empty={R.prosEmpty} marker="+" />}
          </Row>

          <Row label={R.cons} chosen={chosen}>
            {(id) => <Bullets items={P[id].cons} empty={R.prosEmpty} marker="−" />}
          </Row>

          <Row label={R.risks} chosen={chosen}>
            {(id) =>
              A[id].risks.length === 0 ? (
                <p className="text-[13px] text-ink-3">{R.risksEmpty}</p>
              ) : (
                <ul className="grid gap-2">
                  {A[id].risks.map((r, i) => (
                    <li key={i} className="flex gap-2 text-[13.5px] leading-snug text-ink-2">
                      <span
                        className={cn("mt-[7px] size-1.5 shrink-0 rounded-full", SEVERITY_DOT[r.severity])}
                        aria-hidden="true"
                      />
                      <span className="min-w-0 break-words">{t.risk[r.code](r.params ?? {})}</span>
                    </li>
                  ))}
                </ul>
              )
            }
          </Row>

          <Row label={R.uncertainty} note={R.uncertaintyNote} chosen={chosen}>
            {(id) => {
              const u = A[id].uncertainty;
              return (
                <div>
                  <div className="flex items-center gap-2">
                    <span className="flex gap-1" aria-hidden="true">
                      {[1, 2, 3].map((i) => (
                        <span
                          key={i}
                          className={cn(
                            "h-3.5 w-2 rounded-[3px] border",
                            i <= UNC_STEPS[u] ? "border-future bg-future/70" : "border-dashed border-line-strong",
                          )}
                        />
                      ))}
                    </span>
                    <span className="text-[13.5px] text-ink">{L.uncertainty[u]}</span>
                  </div>
                </div>
              );
            }}
          </Row>
        </div>
      </div>

      {/* Tradeoffs — facts derived from inputs, grouped by which path they favour */}
      <section aria-labelledby="tradeoffs" className="grid gap-3">
        <h3 id="tradeoffs" className="eyebrow">
          {R.tradeoffs}
        </h3>
        {comparison.tradeoffs.length === 0 ? (
          <p className="text-[14px] text-ink-3">{R.tradeoffsEmpty}</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {PATH_IDS.map((id) => {
              const items = comparison.tradeoffs.filter((x) => x.favors === id);
              return (
                <div key={id} className="rounded-panel border border-line px-4 py-3.5">
                  <p className={cn("eyebrow mb-2", id === "A" ? "text-path-a" : "text-path-b")}>
                    {t.lab.pathLabel(id)}
                  </p>
                  {items.length === 0 ? (
                    <p className="text-[13.5px] text-ink-3">—</p>
                  ) : (
                    <ul className="grid gap-1.5">
                      {items.map((x) => (
                        <li key={x.code} className="flex gap-2 text-[14px] text-ink-2">
                          <Check size={14} className={cn("mt-1 shrink-0", id === "A" ? "text-path-a" : "text-path-b")} />
                          {t.tradeoff[x.code](x.params ?? {})}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Choice */}
      <section
        aria-label={R.toPlan}
        className="sticky bottom-[72px] z-20 rounded-panel border border-line-strong bg-surface-2/95 p-4 backdrop-blur lg:bottom-4"
      >
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="grid grid-cols-2 gap-2 md:flex">
            {PATH_IDS.map((id) => (
              <Button
                key={id}
                variant="secondary"
                aria-pressed={chosen === id}
                onClick={() => onChoose(id)}
                className={cn(
                  "min-w-0",
                  chosen === id && (id === "A" ? "border-path-a bg-path-a/10 text-ink" : "border-path-b bg-path-b/10 text-ink"),
                )}
                icon={chosen === id ? <Check size={14} /> : undefined}
              >
                {R.choose(id)}
              </Button>
            ))}
          </div>
          <div className="flex flex-col gap-1 md:items-end">
            <Button
              variant="primary"
              disabled={!chosen || continuing}
              onClick={onContinue}
              iconRight={<ArrowRight />}
            >
              {continuing ? t.common.loading : R.toPlan}
            </Button>
            {planNote && <p className="text-[12px] text-ink-3">{planNote}</p>}
          </div>
        </div>
      </section>

      <p className="max-w-3xl text-[13px] italic text-ink-3">{R.disclaimer}</p>
    </div>
  );
}
