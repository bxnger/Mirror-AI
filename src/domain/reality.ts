/**
 * Plan vs Reality + updated timeline estimate.
 * Pure, deterministic functions. Every number is derived from saved plan data
 * and the user's own check-ins. Estimates assume the recent pace continues —
 * they are not predictions.
 */
import { weekRange } from "./plan";
import type { CheckIn, Plan, ScenarioInput } from "./types";

export const PACE_WINDOW = 3;
/** Below/above these ratios a week is shown as under/over plan. */
export const UNDER_RATIO = 0.8;
export const OVER_RATIO = 1.2;

export type WeekStatus = "none" | "under" | "on" | "over";

export interface WeekRow {
  week: number;
  plannedHours: number;
  actualHours: number | null;
  tasksDone: number;
  tasksTotal: number;
  /** actual − planned, null without a check-in */
  deltaHours: number | null;
  status: WeekStatus;
  checkIn: CheckIn | null;
}

export function weekTasks(plan: Plan, week: number) {
  const tasks = plan.tasks.filter((t) => t.week === week);
  return {
    tasks,
    done: tasks.filter((t) => t.done).length,
    total: tasks.length,
    plannedHours: tasks.reduce((s, t) => s + t.estimateHours, 0),
  };
}

export function statusOf(planned: number, actual: number | null): WeekStatus {
  if (actual === null) return "none";
  if (planned <= 0) return actual > 0 ? "over" : "on";
  const r = actual / planned;
  if (r < UNDER_RATIO) return "under";
  if (r > OVER_RATIO) return "over";
  return "on";
}

export function checkInsFor(plan: Plan, checkIns: CheckIn[]): CheckIn[] {
  return checkIns.filter((c) => c.planId === plan.id).sort((a, b) => a.week - b.week);
}

export function planVsReality(plan: Plan, checkIns: CheckIn[]) {
  const mine = checkInsFor(plan, checkIns);
  const rows: WeekRow[] = Array.from({ length: plan.weeks }, (_, i) => {
    const week = i + 1;
    const live = weekTasks(plan, week);
    const ci = mine.find((c) => c.week === week) ?? null;
    // Planned hours come from the live plan; task completion is live too.
    const actual = ci ? ci.actualHours : null;
    return {
      week,
      plannedHours: live.plannedHours,
      actualHours: actual,
      tasksDone: live.done,
      tasksTotal: live.total,
      deltaHours: actual === null ? null : round1(actual - live.plannedHours),
      status: statusOf(live.plannedHours, actual),
      checkIn: ci,
    };
  });
  const checked = rows.filter((r) => r.actualHours !== null);
  return {
    rows,
    checkedWeeks: checked.length,
    plannedHoursChecked: round1(checked.reduce((s, r) => s + r.plannedHours, 0)),
    actualHoursChecked: round1(checked.reduce((s, r) => s + (r.actualHours ?? 0), 0)),
    plannedHoursTotal: round1(rows.reduce((s, r) => s + r.plannedHours, 0)),
    tasksDone: rows.reduce((s, r) => s + r.tasksDone, 0),
    tasksTotal: rows.reduce((s, r) => s + r.tasksTotal, 0),
  };
}

/** Average actual hours over the last `window` check-ins. null = no history. */
export function recentPace(checkIns: CheckIn[], window = PACE_WINDOW): { pace: number | null; weeksUsed: number } {
  const recent = [...checkIns].sort((a, b) => a.week - b.week).slice(-window);
  if (recent.length === 0) return { pace: null, weeksUsed: 0 };
  return { pace: round1(recent.reduce((s, c) => s + c.actualHours, 0) / recent.length), weeksUsed: recent.length };
}

export type EstimateStatus = "no_history" | "zero_pace" | "ok";

export interface UpdatedScenario {
  status: EstimateStatus;
  /** Path volume from the user's inputs: hours/week × weeks. */
  totalHours: number;
  plannedPace: number;
  originalWeeks: number;
  originalFinish: Date;
  loggedHours: number;
  weeksElapsed: number;
  pace: number | null;
  weeksUsed: number;
  remainingHours: number;
  adjustedWeeks: number | null;
  adjustedFinish: Date | null;
  deltaWeeks: number | null;
  horizonWeeks: number;
  originalFitsHorizon: boolean;
  adjustedFitsHorizon: boolean | null;
}

export const horizonToWeeks = (months: number) => Math.round(months * 4.345);

/**
 * Original vs adjusted timeline for the chosen path.
 * Formula (shown to the user):
 *   original  = ceil(total / plannedPace)
 *   adjusted  = weeksElapsed + ceil((total − logged) / recentPace)
 */
export function updatedScenario(input: {
  plan: Plan;
  path: ScenarioInput;
  checkIns: CheckIn[];
  horizonMonths: number;
}): UpdatedScenario {
  const { plan, path, horizonMonths } = input;
  const mine = checkInsFor(plan, input.checkIns);
  const totalHours = path.hoursPerWeek * path.durationWeeks;
  const plannedPace = Math.max(0.5, plan.weeklyBudgetHours);
  const originalWeeks = Math.ceil(totalHours / plannedPace);
  const loggedHours = round1(mine.reduce((s, c) => s + c.actualHours, 0));
  const weeksElapsed = mine.length ? Math.max(...mine.map((c) => c.week)) : 0;
  const { pace, weeksUsed } = recentPace(mine);
  const remainingHours = Math.max(0, round1(totalHours - loggedHours));
  const horizonWeeks = horizonToWeeks(horizonMonths);

  let status: EstimateStatus = "ok";
  let adjustedWeeks: number | null = null;
  if (pace === null) status = "no_history";
  else if (pace <= 0) status = "zero_pace";
  else adjustedWeeks = weeksElapsed + Math.ceil(remainingHours / pace);

  const finish = (weeks: number) => weekRange(plan.startDate, weeks).end;
  return {
    status,
    totalHours,
    plannedPace,
    originalWeeks,
    originalFinish: finish(originalWeeks),
    loggedHours,
    weeksElapsed,
    pace,
    weeksUsed,
    remainingHours,
    adjustedWeeks,
    adjustedFinish: adjustedWeeks === null ? null : finish(adjustedWeeks),
    deltaWeeks: adjustedWeeks === null ? null : adjustedWeeks - originalWeeks,
    horizonWeeks,
    originalFitsHorizon: originalWeeks <= horizonWeeks,
    adjustedFitsHorizon: adjustedWeeks === null ? null : adjustedWeeks <= horizonWeeks,
  };
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}
