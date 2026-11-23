/**
 * Pure mapping: FastAPI responses → frontend domain types.
 * No fetch, no storage — unit-testable. Every number shown in remote mode comes
 * from the backend or from the same transparent frontend formulas.
 */
import { compareLocally } from "@/domain/analysis";
import type { CheckIn, Decision, HorizonMonths, PathId, Plan, PlanTask, Priority, Profile } from "@/domain/types";
import type { BComparison, BDecision, BPlan, BRealityCheck, BScenario, BTwin } from "@/lib/api/backend-types";
import type { BackendAnalysis, RemoteExt, RemoteMeta, RemoteProposal, WeekReview } from "./types";
import type { MirrorState } from "@/lib/store/mirror-store";

const HORIZONS: HorizonMonths[] = [3, 6, 12, 24];

export function priorityToBackend(p: Priority): number {
  return p === "high" ? 5 : p === "medium" ? 3 : 1;
}

export function horizonFromDate(iso: string | null, from = new Date()): HorizonMonths {
  if (!iso) return 12;
  const months = (new Date(iso).getTime() - from.getTime()) / (30.44 * 86_400_000);
  return HORIZONS.reduce((best, h) => (Math.abs(h - months) < Math.abs(best - months) ? h : best), HORIZONS[0]);
}

export function addMonthsIso(months: number, from = new Date()): string {
  const d = new Date(from.getFullYear(), from.getMonth() + months, from.getDate());
  return d.toISOString().slice(0, 10);
}

export function addWeeksIso(weeks: number, from = new Date()): string {
  return new Date(from.getTime() + weeks * 7 * 86_400_000).toISOString().slice(0, 10);
}

/** Stable key for a path's content, so an unchanged path reuses its backend goal. */
export function pathKey(p: Decision["paths"][PathId]): string {
  return JSON.stringify([p.title.trim(), p.steps, p.durationWeeks]);
}

/** Follows parent_scenario_id to the root scenario created by the Lab. */
export function rootScenarioId(id: number, scenarios: BScenario[]): number {
  const byId = new Map(scenarios.map((s) => [s.id, s]));
  let cur = byId.get(id);
  const seen = new Set<number>();
  while (cur?.parent_scenario_id && !seen.has(cur.id)) {
    seen.add(cur.id);
    cur = byId.get(cur.parent_scenario_id);
  }
  return cur?.id ?? id;
}

export function profileFromTwin(twin: BTwin, ext: RemoteExt | null): Profile {
  const fs = twin.future_self;
  const cs = twin.current_self;
  const horizon = horizonFromDate(fs?.horizon_date ?? null);
  const titles = fs?.desired_achievements?.length ? fs.desired_achievements : fs?.vision ? [fs.vision] : [];
  // Backend Future Self is the source of truth for goal titles; ext adds priority/horizon.
  const goals = titles.map((title, i) => {
    const local = ext?.goals.find((g) => g.title === title);
    return {
      id: local?.id ?? `remote-${i}`,
      title,
      priority: local?.priority ?? (i === 0 ? "high" : "medium"),
      horizonMonths: i === 0 ? horizon : (local?.horizonMonths ?? 12),
    } satisfies Profile["goals"][number];
  });
  const now = new Date().toISOString();
  return {
    name: twin.user.name,
    stage: ext?.stage ?? "university",
    goals: goals.length ? goals : [{ id: "remote-0", title: fs?.vision ?? "—", priority: "high", horizonMonths: horizon }],
    skills:
      ext?.skills ??
      (cs?.skills ?? []).map((s, i) => ({ id: `rs-${i}`, name: s.title, level: 2 as const })),
    hoursPerWeek: cs?.weekly_hours_available ?? 0,
    constraints: ext?.constraintTags ?? [],
    constraintNote: ext?.constraintNote ?? (ext ? "" : (cs?.constraints ?? []).join("; ")),
    createdAt: ext?.createdAt ?? now,
    updatedAt: now,
  };
}

export function analysisFrom(comp: BComparison, scenarioPath: Record<number, PathId>): BackendAnalysis {
  const exp = comp.explanation ?? {};
  const perPath: BackendAnalysis["perPath"] = {};
  for (const m of comp.metrics.scenarios) {
    const pathId = scenarioPath[m.scenario_id];
    if (!pathId) continue;
    const e = exp.scenarios?.find((x) => x.scenario_id === m.scenario_id);
    // Mapping artefacts, not real risks: each Lab path is its own backend goal and each
    // scenario funds exactly one of them, so "unfunded_goal" (the other path) and
    // "concentration" (100% on one goal) would fire for every comparison.
    const risks = m.risks.filter((r) => r.code !== "concentration" && r.code !== "unfunded_goal").map((r) => r.message);
    const filterText = (xs: string[] | undefined) =>
      (xs ?? []).filter((x) => !/100%|0 ч\/нед — цель не продвигается/.test(x));
    perPath[pathId] = {
      utilization: m.utilization,
      overCapacity: m.over_capacity,
      slackHours: m.slack_hours,
      strengths: filterText(e?.strengths),
      tradeoffs: filterText(e?.tradeoffs),
      risks: Array.from(new Set([...risks, ...filterText(e?.risks)])),
    };
  }
  return {
    comparisonId: comp.id,
    source: comp.explanation_source === "llm" ? "llm" : "template",
    summary: exp.summary ?? null,
    priorityFit: null, // priority index is meaningless with one goal per path — not shown
    assumptions: exp.assumptions ?? [],
    missingData: exp.missing_data ?? [],
    perPath,
  };
}

function stripGoalPrefix(title: string, goal: string) {
  return title.startsWith(`${goal}: `) ? title.slice(goal.length + 2) : title;
}

export function planFrom(plans: BPlan[], decision: Decision, pathId: PathId): Plan {
  const tasks: PlanTask[] = plans.flatMap((p, i) =>
    p.tasks.map((t) => ({
      id: String(t.id),
      title: stripGoalPrefix(t.title, t.goal_title),
      week: i + 1,
      priority: (t.is_carry_over ? "high" : "medium") as Priority,
      estimateHours: Math.round((t.planned_minutes / 60) * 10) / 10,
      done: t.status === "done" || t.status === "partial",
      doneAt: null,
      source: "scenario" as const,
      dayOfWeek: t.day_of_week,
      locked: p.status === "reviewed",
      status: t.status,
      plannedMinutes: t.planned_minutes,
      actualMinutes: t.actual_minutes,
    })),
  );
  const latest = plans[plans.length - 1];
  return {
    id: `remote-plan-${plans[0].id}`,
    decisionId: decision.id,
    pathId,
    startDate: plans[0].week_start,
    weeks: plans.length,
    weeklyBudgetHours: Math.round((latest.planned_minutes_total / 60) * 10) / 10,
    tasks,
    createdAt: plans[0].week_start,
  };
}

export function checkInsFrom(rcs: BRealityCheck[], planIds: number[], planKey: string, ext: RemoteExt | null): CheckIn[] {
  return rcs
    .filter((rc) => planIds.includes(rc.plan_id))
    .map((rc) => ({
      id: `rc-${rc.id}`,
      planId: planKey,
      week: planIds.indexOf(rc.plan_id) + 1,
      plannedHours: rc.planned_hours,
      actualHours: rc.actual_hours,
      tasksDone: rc.per_goal.reduce((s, g) => s + g.tasks_done + g.tasks_partial, 0),
      tasksTotal: rc.per_goal.reduce((s, g) => s + g.tasks_total, 0),
      kind: ext?.checkInKinds[rc.plan_id] ?? null,
      note: rc.user_feedback ?? "",
      createdAt: rc.created_at,
      updatedAt: rc.created_at,
    }));
}

export function reviewFrom(rc: BRealityCheck): WeekReview {
  const c = rc.ai_commentary ?? {};
  return {
    completionRate: rc.completion_rate,
    insights: rc.insights ?? [],
    summary: c.summary ?? null,
    whatWorked: c.what_worked ?? [],
    obstacles: c.obstacles ?? [],
    nextFocus: c.next_week_focus ?? [],
    questions: c.questions ?? [],
    commentarySource: c.generator?.source === "llm" ? "llm" : "template",
    difficulty: rc.perceived_difficulty,
  };
}

/**
 * Builds the whole frontend state from backend data + local extension.
 * Plans/check-ins are limited to the chain of the CURRENT Lab decision.
 */
export function buildState(input: {
  twin: BTwin;
  ext: RemoteExt | null;
  scenarios: BScenario[];
  decisions: BDecision[];
  plans: BPlan[];
  rcs: BRealityCheck[];
  comparison: BComparison | null;
}): MirrorState {
  const { twin, ext, scenarios, decisions, plans, rcs, comparison } = input;
  const profile = profileFromTwin(twin, ext);
  const scenarioPath = ext?.scenarioPath ?? {};
  const pathOf = (scenarioId: number | null): PathId | null =>
    scenarioId === null ? null : (scenarioPath[rootScenarioId(scenarioId, scenarios)] ?? null);

  // Decision with path details (local) — paths' hours follow confirmed backend adaptations.
  const decision: Decision | null = ext?.decision ? structuredClone(ext.decision) : null;
  const latestDecision = [...decisions].reverse().find((d) => pathOf(d.scenario_id));
  const selectedPath = latestDecision ? pathOf(latestDecision.scenario_id) : null;
  if (decision && selectedPath && latestDecision) {
    const active = scenarios.find((s) => s.id === latestDecision.scenario_id);
    const hours = active?.allocations.reduce((s, a) => s + a.hours_per_week, 0);
    if (hours && active?.parent_scenario_id) decision.paths[selectedPath].hoursPerWeek = Math.round(hours * 10) / 10;
  }

  const chainPlans = plans.filter((p) => selectedPath && pathOf(p.scenario_id) === selectedPath).sort((a, b) => a.id - b.id);
  const planIds = chainPlans.map((p) => p.id);
  const plan = decision && selectedPath && chainPlans.length ? planFrom(chainPlans, decision, selectedPath) : null;
  const checkIns = plan ? checkInsFrom(rcs, planIds, plan.id, ext) : [];

  const reviews: RemoteMeta["reviews"] = {};
  const proposals: RemoteProposal[] = [];
  for (const rc of rcs) {
    const idx = planIds.indexOf(rc.plan_id);
    if (idx < 0) continue;
    reviews[idx + 1] = reviewFrom(rc);
    for (const p of rc.proposals) {
      proposals.push({
        id: p.id,
        week: idx + 1,
        kind: p.kind,
        reason: p.reason,
        status: p.status,
        title: typeof p.payload.goal_title === "string" ? p.payload.goal_title : null,
        fromHours: typeof p.payload.from_hours === "number" ? p.payload.from_hours : null,
        toHours: typeof p.payload.to_hours === "number" ? p.payload.to_hours : null,
      });
    }
  }

  const scenarioIds: RemoteMeta["scenarioIds"] = {};
  for (const [id, path] of Object.entries(scenarioPath)) scenarioIds[path] = Number(id);
  const analysis = comparison ? analysisFrom(comparison, scenarioPath) : null;

  return {
    version: 2,
    isDemo: false,
    profile,
    decision,
    // Transparent A/B view is the same deterministic frontend calculation as in demo mode.
    comparison: decision && comparison ? { ...compareLocally(decision, profile), decisionId: decision.id } : null,
    selectedPath,
    plan,
    checkIns,
    remote: {
      userId: twin.user.id,
      syncedAt: new Date().toISOString(),
      scenarioIds,
      comparisonId: comparison?.id ?? null,
      analysis,
      planIds,
      latestPlanReviewed: chainPlans.length > 0 && chainPlans[chainPlans.length - 1].status === "reviewed",
      reviews,
      proposals,
    },
  };
}
