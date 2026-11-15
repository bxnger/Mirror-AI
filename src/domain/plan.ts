/**
 * Plan generation + progress math. Progress is always computed from real task
 * state (done flags), never estimated.
 */
import { createId } from "@/lib/id";
import type { Decision, PathId, Plan, PlanTask, Priority, Profile } from "./types";

export const PLAN_MAX_WEEKS = 4;

/**
 * First day of week 1, as YYYY-MM-DD (local time): Monday of the current week,
 * or next Monday when the plan is created on a weekend.
 */
export function planStartDate(date: Date): string {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = (d.getDay() + 6) % 7; // 0 = Monday … 6 = Sunday
  d.setDate(day >= 5 ? d.getDate() + (7 - day) : d.getDate() - day);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export function weekRange(startDate: string, week: number): { start: Date; end: Date } {
  const [y, m, d] = startDate.split("-").map(Number);
  const start = new Date(y, m - 1, d + (week - 1) * 7);
  const end = new Date(y, m - 1, d + (week - 1) * 7 + 6);
  return { start, end };
}

const roundHalf = (n: number) => Math.max(0.5, Math.round(n * 2) / 2);

/**
 * Builds the first weeks of a plan from the chosen path's steps.
 * Steps are distributed in order; each week also gets a short review task —
 * that review is what feeds Reality Check.
 */
export function buildPlan(decision: Decision, pathId: PathId, profile: Profile, now = new Date()): Plan {
  const path = decision.paths[pathId];
  const weeks = Math.max(1, Math.min(PLAN_MAX_WEEKS, path.durationWeeks));
  const weeklyBudgetHours = Math.max(1, Math.min(path.hoursPerWeek, profile.hoursPerWeek));
  const reviewHours = 0.5;
  const workHours = Math.max(0.5, weeklyBudgetHours - reviewHours);

  const steps = path.steps.length > 0 ? path.steps : [path.title];
  const perWeek = Math.ceil(steps.length / weeks);
  const tasks: PlanTask[] = [];

  for (let w = 1; w <= weeks; w++) {
    const weekSteps = steps.slice((w - 1) * perWeek, w * perWeek);
    weekSteps.forEach((title, i) => {
      const priority: Priority = i === 0 ? "high" : "medium";
      tasks.push({
        id: createId(),
        title,
        week: w,
        priority,
        estimateHours: roundHalf(workHours / weekSteps.length),
        done: false,
        doneAt: null,
        source: "scenario",
      });
    });
    tasks.push({
      id: createId(),
      title: "review",
      week: w,
      priority: "low",
      estimateHours: reviewHours,
      done: false,
      doneAt: null,
      source: "system",
    });
  }

  return {
    id: createId(),
    decisionId: decision.id,
    pathId,
    startDate: planStartDate(now),
    weeks,
    weeklyBudgetHours,
    tasks,
    createdAt: now.toISOString(),
  };
}

export interface ProgressSummary {
  total: number;
  done: number;
  /** 0..1, from task count */
  ratio: number;
  plannedHours: number;
  doneHours: number;
}

export function summarize(tasks: PlanTask[]): ProgressSummary {
  const total = tasks.length;
  const done = tasks.filter((t) => t.done).length;
  const plannedHours = tasks.reduce((s, t) => s + t.estimateHours, 0);
  const doneHours = tasks.filter((t) => t.done).reduce((s, t) => s + t.estimateHours, 0);
  return { total, done, ratio: total === 0 ? 0 : done / total, plannedHours, doneHours };
}

/** Index of the current plan week (1-based, clamped to plan length). */
export function currentWeek(plan: Plan, now = new Date()): number {
  const { start } = weekRange(plan.startDate, 1);
  const diffDays = Math.floor((now.getTime() - start.getTime()) / 86_400_000);
  return Math.min(plan.weeks, Math.max(1, Math.floor(diffDays / 7) + 1));
}
