"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Reset } from "@/components/ui/icons";
import { Meter, Tag } from "@/components/ui/surface";
import { TrajectoryMap } from "@/components/trajectory/trajectory-map";
import { summarize, weekRange } from "@/domain/plan";
import { horizonToWeeks, updatedScenario } from "@/domain/reality";
import { clampSim, simulatePath, SIM_LIMITS, type PathSim, type SimInput } from "@/domain/simulation";
import { DEMAND_CONFLICTS } from "@/domain/analysis";
import { PATH_IDS, type PathId, type Profile, type RiskCode, type ScenarioInput } from "@/domain/types";
import { formatDate, formatNumber, t } from "@/i18n";
import { cn } from "@/lib/cn";
import type { MirrorState } from "@/lib/store/use-mirror";

/**
 * FUTURE PATHS — the dashboard trajectory, upgraded into an interactive simulator.
 *
 *  - Sliders change HYPOTHETICAL weekly hours / horizon. Nothing is saved; the
 *    profile and the chosen path are untouched (clearly badged "Гипотеза").
 *  - Lanes A/B: weeks needed at the hypothetical pace, milestones at 25/50/75/100%
 *    of the path volume, horizon marker, overflow beyond the horizon (hatched).
 *  - Pace lane (if Reality Check history exists): the chosen path at the user's
 *    ACTUAL recent pace — solid sage for weeks already lived, dashed for the estimate.
 *    Independent of the sliders.
 * All numbers come from src/domain/simulation.ts and src/domain/reality.ts.
 */

const LOAD_TONE = { fits: "done", tight: "warn", overload: "risk" } as const;
const COLOR: Record<PathId, string> = { A: "var(--color-path-a)", B: "var(--color-path-b)" };

function Slider({
  label,
  value,
  min,
  max,
  saved,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  saved: number;
  format: (n: number) => string;
  onChange: (n: number) => void;
}) {
  const id = useId();
  const changed = value !== saved;
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-[13px] font-medium text-ink-2">
          {label}
        </label>
        <output htmlFor={id} className={cn("tabular font-mono text-[15px]", changed ? "text-future" : "text-ink")}>
          {format(value)}
        </output>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-valuetext={format(value)}
        className="mt-2 w-full accent-[var(--color-future)]"
      />
      <p className="mt-0.5 font-mono text-[11px] text-ink-3">{t.futurePaths.savedValue(format(saved))}</p>
    </div>
  );
}

/** Pick readable axis ticks for a span of weeks. */
function ticks(maxWeeks: number) {
  const step = maxWeeks <= 16 ? 4 : maxWeeks <= 40 ? 8 : maxWeeks <= 80 ? 13 : 26;
  const out: number[] = [];
  for (let w = step; w < maxWeeks; w += step) out.push(w);
  return out;
}

function Lane({
  label,
  color,
  weeks,
  horizonWeeks,
  scale,
  milestones,
  actualWeeks = 0,
  dimmed,
}: {
  label: string;
  color: string;
  weeks: number;
  horizonWeeks: number;
  scale: number;
  milestones?: { fraction: number; week: number }[];
  actualWeeks?: number;
  dimmed?: boolean;
}) {
  const pct = (w: number) => `${Math.min(100, (w / scale) * 100)}%`;
  const inside = Math.min(weeks, horizonWeeks);
  const beyond = Math.max(0, weeks - horizonWeeks);
  return (
    <div className={cn("transition-opacity duration-300", dimmed && "opacity-50")}>
      <p className="mb-1.5 truncate text-[12.5px] text-ink-2">{label}</p>
      <div className="relative h-6 rounded-[6px] bg-surface-3/60" aria-hidden="true">
        {actualWeeks > 0 && (
          <div className="absolute inset-y-0 left-0 rounded-l-[6px] bg-done" style={{ width: pct(actualWeeks) }} />
        )}
        <div
          className="absolute inset-y-0 rounded-[6px] transition-[width,left] duration-300 ease-out"
          style={{
            left: pct(actualWeeks),
            width: `calc(${pct(inside)} - ${pct(actualWeeks)})`,
            background: actualWeeks > 0 ? "transparent" : `color-mix(in oklab, ${color} 55%, transparent)`,
            border: actualWeeks > 0 ? `1.5px dashed ${color}` : undefined,
          }}
        />
        {beyond > 0 && (
          <div
            className="absolute inset-y-0 rounded-r-[6px] transition-[width,left] duration-300 ease-out"
            style={{
              left: pct(horizonWeeks),
              width: `calc(${pct(weeks)} - ${pct(horizonWeeks)})`,
              border: `1.5px dashed ${color}`,
              background: `repeating-linear-gradient(135deg, color-mix(in oklab, ${color} 30%, transparent) 0 4px, transparent 4px 9px)`,
            }}
          />
        )}
        {milestones?.map((m) => (
          <span
            key={m.fraction}
            className="absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rotate-45 border border-bg"
            style={{ left: pct(m.week), background: "var(--color-ink)" }}
          />
        ))}
      </div>
    </div>
  );
}

export function FuturePaths({ state }: { state: MirrorState & { profile: Profile } }) {
  const { profile, decision, selectedPath, plan, checkIns } = state;
  const F = t.futurePaths;
  const main = profile.goals[0];
  const saved: SimInput = { hoursPerWeek: profile.hoursPerWeek, horizonMonths: main.horizonMonths };
  const [sim, setSim] = useState(saved);
  const input = clampSim(sim);
  const changed = input.hoursPerWeek !== saved.hoursPerWeek || input.horizonMonths !== saved.horizonMonths;

  const sims: Partial<Record<PathId, PathSim>> = decision
    ? { A: simulatePath(decision.paths.A, input, profile), B: simulatePath(decision.paths.B, input, profile) }
    : {};

  // Actual-pace lane: saved history only, never the sliders.
  const est =
    plan && decision && plan.decisionId === decision.id
      ? updatedScenario({ plan, path: decision.paths[plan.pathId], checkIns, horizonMonths: main.horizonMonths })
      : null;
  const paceLane = est && est.status === "ok" && est.adjustedWeeks ? est : null;

  const horizonWeeks = horizonToWeeks(input.horizonMonths);
  const maxWeeks = Math.max(
    horizonWeeks,
    sims.A?.weeksNeeded ?? 0,
    sims.B?.weeksNeeded ?? 0,
    paceLane?.adjustedWeeks ?? 0,
    paceLane ? horizonToWeeks(main.horizonMonths) : 0,
  );
  const scale = Math.min(Math.ceil(maxWeeks * 1.06), 260);
  const startIso = plan?.startDate ?? new Date().toISOString().slice(0, 10);
  const horizonDate = weekRange(startIso, horizonWeeks).end;
  const progress = plan ? summarize(plan.tasks) : null;

  const pathNode = (id: PathId) => {
    const p = decision!.paths[id];
    const s = sims[id]!;
    return {
      title: p.title,
      meta: (
        <span className="tabular font-mono text-[11.5px]">
          {s.weeksNeeded} {t.common.weeksShort} · {formatNumber(s.allocatedHours)} {t.common.hPerWeek}
        </span>
      ),
      footer: (
        <div className="grid gap-2">
          <div className="flex flex-wrap gap-1">
            <Tag tone={LOAD_TONE[s.load]}>{t.labels.load[s.load]}</Tag>
            {!s.fitsHorizon && <Tag tone="warn">{F.beyond(s.weeksNeeded - s.horizonWeeks)}</Tag>}
          </div>
          {selectedPath === id && progress && progress.total > 0 && (
            <div>
              <div className="mb-1 flex justify-between font-mono text-[10.5px] text-ink-3">
                <span>{t.twin.map.reality}</span>
                <span className="tabular">
                  {progress.done}/{progress.total}
                </span>
              </div>
              <Meter value={progress.done} max={progress.total} label={t.twin.progressOf(progress.done, progress.total)} tone="done" height={4} />
            </div>
          )}
        </div>
      ),
    };
  };


  return (
    <section id="future-paths" aria-labelledby="future-paths-title" className="scroll-mt-20 rounded-panel border border-line bg-surface/50">
      <header className="flex flex-col gap-3 px-5 pt-5 md:flex-row md:items-start md:justify-between md:px-6">
        <div className="max-w-2xl">
          <p className="eyebrow">{F.eyebrow}</p>
          <h2 id="future-paths-title" className="mt-1 font-serif text-[22px] leading-snug text-ink">
            {F.title}
          </h2>
          <p className="mt-1 text-[14px] text-ink-2">{F.lead}</p>
        </div>
        <Tag tone={changed ? "future" : "neutral"} className="self-start">
          {changed ? F.hypothetical : F.savedData}
        </Tag>
      </header>

      {/* Controls — hypothetical only */}
      <div
        className={cn(
          "mx-5 mt-4 grid gap-5 rounded-[12px] border px-4 py-4 md:mx-6 md:grid-cols-[1fr_1fr_auto] md:items-start",
          changed ? "border-dashed border-future/60" : "border-line",
        )}
      >
        <Slider
          label={F.hours}
          value={input.hoursPerWeek}
          min={SIM_LIMITS.hoursMin}
          max={SIM_LIMITS.hoursMax}
          saved={saved.hoursPerWeek}
          format={F.hoursValue}
          onChange={(v) => setSim((s) => ({ ...s, hoursPerWeek: v }))}
        />
        <Slider
          label={F.horizon}
          value={input.horizonMonths}
          min={SIM_LIMITS.horizonMin}
          max={SIM_LIMITS.horizonMax}
          saved={saved.horizonMonths}
          format={F.horizonValue}
          onChange={(v) => setSim((s) => ({ ...s, horizonMonths: v }))}
        />
        <div className="flex flex-wrap gap-2 md:flex-col md:items-stretch">
          {est?.pace ? (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setSim((s) => ({ ...s, hoursPerWeek: Math.max(1, Math.round(est.pace!)) }))}
            >
              {F.applyPace(formatNumber(est.pace))}
            </Button>
          ) : null}
          <Button size="sm" variant="ghost" icon={<Reset size={14} />} disabled={!changed} onClick={() => setSim(saved)}>
            {F.reset}
          </Button>
        </div>
      </div>

      <div className="grid gap-5 px-5 pb-5 pt-5 md:px-6">
        {/* Structural view: Current Self → decision → A/B → Future Self (existing trajectory) */}
        <TrajectoryMap
          ariaLabel={t.twin.map.describe(t.labels.stage[profile.stage], main.title)}
          now={{
            title: t.twin.current,
            meta: (
              <span className="tabular font-mono text-[11.5px]">
                {input.hoursPerWeek} {t.common.hPerWeek} {t.twin.timeFree}
              </span>
            ),
          }}
          decisionLabel={decision ? t.twin.map.decision : undefined}
          paths={decision ? { A: pathNode("A"), B: pathNode("B") } : null}
          chosen={selectedPath}
          future={{
            title: t.twinMirror.future,
            meta: <span className="tabular font-mono text-[11.5px]">{F.horizonValue(input.horizonMonths)}</span>,
          }}
          emptyPaths={
            <span>
              {F.noDecision}
              <Link href="/lab" className="mt-1 block text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink">
                {t.twin.openLab}
              </Link>
            </span>
          }
        />

        {decision && (
          <>
            {/* Timeline lanes */}
            <div className="overflow-hidden rounded-[12px] border border-line bg-bg-elev px-4 pb-3 pt-4">
              <div className="relative">
                {/* Horizon marker spans all lanes */}
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute -top-1 bottom-6 z-10 border-l border-dashed border-future"
                  style={{ left: `${Math.min(100, (horizonWeeks / scale) * 100)}%` }}
                >
                  <span
                    className={cn(
                      "absolute -top-0.5 whitespace-nowrap font-mono text-[10.5px] text-future max-[520px]:hidden",
                      horizonWeeks / scale > 0.55 ? "right-1.5" : "left-1.5",
                    )}
                  >
                    {F.horizonMarker(formatDate(horizonDate, { month: "short", year: "numeric" }))}
                  </span>
                </div>
                <div className="grid gap-3.5 pt-5">
                  {PATH_IDS.map((id) => (
                    <Lane
                      key={id}
                      label={`${t.lab.pathLabel(id)} · ${decision.paths[id].title}`}
                      color={COLOR[id]}
                      weeks={sims[id]!.weeksNeeded}
                      horizonWeeks={horizonWeeks}
                      scale={scale}
                      milestones={sims[id]!.milestones}
                      dimmed={Boolean(selectedPath && selectedPath !== id)}
                    />
                  ))}
                  {paceLane && plan && (
                    <Lane
                      label={F.paceLane(t.lab.pathLabel(plan.pathId), formatNumber(paceLane.pace ?? 0))}
                      color={COLOR[plan.pathId]}
                      weeks={paceLane.adjustedWeeks!}
                      horizonWeeks={horizonWeeks}
                      scale={scale}
                      actualWeeks={paceLane.weeksElapsed}
                    />
                  )}
                </div>
                {/* Axis */}
                <div aria-hidden="true" className="relative mt-2 h-5 border-t border-line font-mono text-[10.5px] text-ink-3">
                  <span className="absolute left-0 top-1">{F.now}</span>
                  {ticks(scale).map((w) => (
                    <span key={w} className="absolute top-1 -translate-x-1/2" style={{ left: `${(w / scale) * 100}%` }}>
                      {w}
                    </span>
                  ))}
                  <span className="absolute right-0 top-1">{t.common.weeksShort}</span>
                </div>
              </div>
              {/* Legend — patterns, not colour alone */}
              <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5 text-[11.5px] text-ink-2" aria-hidden="true">
                <li className="flex items-center gap-1.5">
                  <span className="h-2.5 w-5 rounded-sm bg-ink-3/60" />
                  {F.legendPlan}
                </li>
                <li className="flex items-center gap-1.5">
                  <span
                    className="h-2.5 w-5 rounded-sm border border-dashed border-ink-3"
                    style={{ background: "repeating-linear-gradient(135deg, var(--color-line-strong) 0 3px, transparent 3px 6px)" }}
                  />
                  {F.legendBeyond}
                </li>
                {paceLane && (
                  <li className="flex items-center gap-1.5">
                    <span className="h-2.5 w-5 rounded-sm bg-done" />
                    {F.legendActual}
                  </li>
                )}
                <li className="flex items-center gap-1.5">
                  <span className="size-2 rotate-45 bg-ink" />
                  {F.legendMilestone}
                </li>
              </ul>
            </div>

            {/* Text summary — the accessible, exact version of the chart */}
            <div className="grid gap-3 md:grid-cols-2" aria-live="polite">
              {PATH_IDS.map((id) => {
                const s = sims[id]!;
                return (
                  <div key={id} className={cn("rounded-[12px] border px-4 py-3", id === "A" ? "border-path-a/35" : "border-path-b/35")}>
                    <p className={cn("eyebrow", id === "A" ? "text-path-a" : "text-path-b")}>{t.lab.pathLabel(id)}</p>
                    <p className="mt-1 text-[14px] text-ink">
                      {F.laneSummary(s.weeksNeeded, formatNumber(s.allocatedHours), s.totalHours)}
                    </p>
                    <p className={cn("mt-1 text-[13px]", s.fitsHorizon ? "text-done" : "text-warn")}>
                      {s.fitsHorizon ? F.fits : F.beyond(s.weeksNeeded - s.horizonWeeks)}
                      {!s.fitsHorizon && <span className="text-ink-2"> · {F.within(Math.round(s.volumeWithinHorizon * 100))}</span>}
                    </p>
                    <p className="mt-1 text-[12.5px] text-ink-3">
                      {F.milestones(s.milestones.map((m) => F.milestoneItem(m.fraction * 100, m.week)).join(", "))}
                    </p>
                    <div className="mt-2 border-t border-line pt-2">
                      <p className="text-[12px] font-medium text-ink-2">{F.conflicts}</p>
                      {s.conflicts.length === 0 ? (
                        <p className="text-[12.5px] text-ink-3">{F.noConflicts}</p>
                      ) : (
                        <ul className="mt-1 grid gap-1">
                          {s.conflicts.map((c) => (
                            <li key={c} className="text-[12.5px] leading-snug text-ink-2">
                              {conflictMessage(c, s, decision.paths[id], profile, input.hoursPerWeek, input.horizonMonths)}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            {paceLane && (
              <p className="rounded-[12px] border border-done/40 px-4 py-3 text-[13px] text-ink-2">
                <span className="text-ink">{F.paceSummary(paceLane.adjustedWeeks!, paceLane.weeksElapsed)}</span>
                <br />
                {F.paceNote}
              </p>
            )}
            <p className="text-[12.5px] italic text-ink-3">{F.assumption}</p>
          </>
        )}
      </div>
    </section>
  );
}

/** Uses the Lab's risk messages, with the hypothetical numbers filled in. */
function conflictMessage(code: RiskCode, s: PathSim, path: ScenarioInput, profile: Profile, hours: number, horizon: number): string {
  if (code === "overload" || code === "tight_time") return t.risk[code]({ need: path.hoursPerWeek, have: hours });
  if (code === "beyond_horizon") return t.risk.beyond_horizon({ weeks: s.weeksNeeded, horizon });
  if (code === "constraint_conflict") {
    return path.demands
      .flatMap((d) =>
        DEMAND_CONFLICTS[d]
          .filter((c) => profile.constraints.includes(c))
          .map((c) => t.risk.constraint_conflict({ demand: d, constraint: c })),
      )
      .join(" ");
  }
  return "";
}
