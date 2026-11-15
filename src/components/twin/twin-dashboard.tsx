"use client";

import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { ArrowRight, IconBranch } from "@/components/ui/icons";
import { Meter, PageHeader, Panel, Tag } from "@/components/ui/surface";
import { summarize } from "@/domain/plan";
import type { Priority, Profile, SkillLevel } from "@/domain/types";
import { formatDate, formatNumber, t } from "@/i18n";
import { cn } from "@/lib/cn";
import type { MirrorState } from "@/lib/store/use-mirror";
import { TwinMirror, type TwinAssets } from "./twin-mirror";
import { FuturePaths } from "@/components/future/future-paths";
import { currentWeek } from "@/domain/plan";

const T = t.twin;
const L = t.labels;

const PRIORITY_TONE: Record<Priority, "risk" | "warn" | "neutral"> = { high: "risk", medium: "warn", low: "neutral" };

function LevelPips({ level }: { level: SkillLevel }) {
  return (
    <span className="grid w-[72px] grid-cols-3 gap-1" aria-hidden="true">
      {[1, 2, 3].map((i) => (
        <span key={i} className={cn("h-1 rounded-full", i <= level ? "bg-ink-2" : "bg-surface-3")} />
      ))}
    </span>
  );
}

function nextStep(s: MirrorState): { text: string; href: string; cta: string } {
  if (s.plan) {
    const plan = s.plan;
    const week = currentWeek(plan);
    // Previous week without a check-in → ask for the Reality Check first.
    const missing = week > 1 && !s.checkIns.some((c) => c.planId === plan.id && c.week === week - 1);
    if (missing || (week === plan.weeks && !s.checkIns.some((c) => c.planId === plan.id && c.week === week)))
      return { text: T.nextCheckIn, href: "/reality", cta: T.openReality };
    return { text: T.nextPlan, href: "/plan", cta: T.openPlan };
  }
  if (s.selectedPath) return { text: T.nextChosen, href: "/plan", cta: T.openPlan };
  if (s.comparison) return { text: T.nextNoChoice, href: "/lab", cta: T.openLab };
  return { text: T.nextNoDecision, href: "/lab", cta: T.openLab };
}

export function TwinDashboard({ state, assets }: { state: MirrorState & { profile: Profile }; assets: TwinAssets }) {
  const { profile, decision, selectedPath, plan } = state;
  const main = profile.goals[0];
  const extra = profile.goals.slice(1);
  const skillsByLevel = [...profile.skills].sort((a, b) => b.level - a.level);
  const goalDate = new Date(new Date(profile.updatedAt).getFullYear(), new Date(profile.updatedAt).getMonth() + main.horizonMonths, 1);
  const progress = plan ? summarize(plan.tasks) : null;
  const committed = selectedPath && decision ? decision.paths[selectedPath].hoursPerWeek : 0;
  const next = nextStep(state);

  return (
    <div className="grid gap-6 md:gap-8">
      <PageHeader
        eyebrow={T.eyebrow}
        title={T.greeting(profile.name)}
        lead={T.updated(formatDate(profile.updatedAt, { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }))}
        actions={
          next.href !== "/lab" ? (
            <ButtonLink href="/lab" variant="secondary" icon={<IconBranch />}>
              {t.nav.lab}
            </ButtonLink>
          ) : undefined
        }
      />

      <div className="grid gap-3">
        <TwinMirror
          profile={profile}
          chosenPathTitle={selectedPath && decision ? decision.paths[selectedPath].title : null}
          assets={assets}
        />
        {/* Next step — the single primary action on this screen. */}
        <div className="flex flex-col gap-3 rounded-panel border border-line-strong bg-surface-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="eyebrow">{T.next}</p>
            <p className="mt-1 text-[15px] text-ink">{next.text}</p>
          </div>
          <ButtonLink href={next.href} variant="primary" iconRight={<ArrowRight />} className="shrink-0">
            {next.cta}
          </ButtonLink>
        </div>
      </div>

      {/* Future Paths: the decision trajectory, now an interactive simulator. */}
      <FuturePaths state={state} />

      <div className="grid gap-4 lg:grid-cols-12 lg:gap-5">
        {/* -------- Current self: one sheet with hairlines, not a pile of cards */}
        <Panel
          eyebrow={T.current}
          title={L.stage[profile.stage]}
          className="lg:col-span-7 lg:self-start"
          labelledBy="current-self"
          bodyClassName="pt-3"
          action={
            <Link href="/onboarding" className="rounded text-[13px] text-ink-3 hover:text-ink">
              {t.common.edit}
            </Link>
          }
        >
          <div className="border-t border-line px-5 py-4">
            <div className="mb-3 flex items-baseline justify-between">
              <h3 className="text-[13px] font-medium text-ink-2">{T.skills}</h3>
              <span className="text-[12px] text-ink-3">{T.skillsNote}</span>
            </div>
            <ul className="grid gap-x-8 gap-y-2.5 sm:grid-cols-2">
              {skillsByLevel.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate text-[14px] text-ink">{s.name}</span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="sr-only">{L.skillLevel[s.level]}</span>
                    <span aria-hidden="true" className="font-mono text-[11px] text-ink-2">
                      {L.skillLevel[s.level]}
                    </span>
                    <LevelPips level={s.level} />
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div className="border-t border-line px-5 py-4">
            <h3 className="mb-2.5 text-[13px] font-medium text-ink-2">{T.constraints}</h3>
            {profile.constraints.length === 0 && !profile.constraintNote ? (
              <p className="text-[14px] text-ink-3">{T.noConstraints}</p>
            ) : (
              <>
                <div className="flex flex-wrap gap-1.5">
                  {profile.constraints.map((c) => (
                    <Tag key={c}>{L.constraint[c]}</Tag>
                  ))}
                </div>
                {profile.constraintNote && <p className="mt-2.5 text-[14px] text-ink-2">{profile.constraintNote}</p>}
              </>
            )}
          </div>
        </Panel>

        <div className="grid content-start gap-4 lg:col-span-5 lg:gap-5">
          {/* -------- Goals */}
          <Panel eyebrow={T.goals} labelledBy="goals">
            <div className="border-l border-dashed border-future/60 pl-3.5">
              <p className="font-serif text-[19px] leading-snug text-ink">{main.title}</p>
              <p className="mt-1 font-mono text-[11.5px] text-ink-2">
                {L.horizon[main.horizonMonths]} · {T.goalBy(formatDate(goalDate, { month: "long", year: "numeric" }))}
              </p>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <Tag tone="future">{T.mainGoal}</Tag>
              <Tag tone={PRIORITY_TONE[main.priority]}>{L.priority[main.priority]}</Tag>
            </div>
            {extra.length > 0 && (
              <ul className="mt-4 divide-y divide-line border-t border-line">
                {extra.map((g) => (
                  <li key={g.id} className="flex items-start justify-between gap-3 py-2.5 last:pb-0">
                    <span className="min-w-0 text-[14px] text-ink-2">{g.title}</span>
                    <Tag tone={PRIORITY_TONE[g.priority]} className="shrink-0">
                      {L.priority[g.priority]}
                    </Tag>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {/* -------- Time budget */}
          <Panel eyebrow={T.time} labelledBy="time">
            <p className="tabular flex items-baseline gap-2">
              <span className="font-serif text-[40px] leading-none text-ink">{profile.hoursPerWeek}</span>
              <span className="text-ink-3">
                {t.common.hoursShort} {T.timeFree}
              </span>
            </p>
            <Meter
              className="mt-4"
              value={committed}
              max={profile.hoursPerWeek}
              label={committed ? T.timeCommitted(committed) : T.timeNoPath}
              tone={selectedPath === "B" ? "path-b" : "path-a"}
            />
            <p className={cn("mt-2 text-[13px]", committed > profile.hoursPerWeek ? "text-risk" : "text-ink-3")}>
              {committed ? T.timeCommitted(committed) : T.timeNoPath}
            </p>
          </Panel>

          {/* -------- Progress (real task data only) */}
          <Panel eyebrow={T.progress} labelledBy="progress">
            {progress && progress.total > 0 ? (
              <>
                <div className="flex items-baseline justify-between gap-3">
                  <p className="tabular font-serif text-[40px] leading-none text-ink">
                    {Math.round(progress.ratio * 100)}
                    <span className="text-[20px] text-ink-3">%</span>
                  </p>
                  <p className="tabular text-right text-[13px] text-ink-3">
                    {T.progressOf(progress.done, progress.total)}
                    <br />
                    {T.progressHours(formatNumber(progress.doneHours), formatNumber(progress.plannedHours))}
                  </p>
                </div>
                <Meter
                  className="mt-4"
                  value={progress.done}
                  max={progress.total}
                  label={T.progressOf(progress.done, progress.total)}
                  tone="done"
                />
              </>
            ) : (
              <p className="text-[14px] text-ink-3">{T.progressEmpty}</p>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
