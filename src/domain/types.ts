/**
 * MIRROR AI — domain types.
 * Pure data shapes shared by UI, store and API adapters.
 * Keep these free of React and of any UI copy (copy lives in src/i18n).
 */

export type Stage = "school" | "university" | "graduate" | "working";
export type Priority = "high" | "medium" | "low";
export type HorizonMonths = 3 | 6 | 12 | 24;
export type SkillLevel = 1 | 2 | 3;

/** Personal constraints the user declares in onboarding. */
export type ConstraintTag =
  | "budget"
  | "study_load"
  | "job"
  | "family"
  | "relocation"
  | "health"
  | "language";

/** What a scenario demands from the user. Conflicts are checked against ConstraintTag. */
export type DemandTag = "money" | "relocation" | "full_time" | "language" | "selection";

export interface Goal {
  id: string;
  title: string;
  priority: Priority;
  horizonMonths: HorizonMonths;
}

export interface Skill {
  id: string;
  name: string;
  /** Self-assessed: 1 — базовый, 2 — уверенный, 3 — сильный. */
  level: SkillLevel;
}

export interface Profile {
  name: string;
  stage: Stage;
  /** goals[0] is the main goal. */
  goals: Goal[];
  skills: Skill[];
  hoursPerWeek: number;
  constraints: ConstraintTag[];
  constraintNote: string;
  createdAt: string;
  updatedAt: string;
}

export type PathId = "A" | "B";
export const PATH_IDS: readonly PathId[] = ["A", "B"] as const;

/** User's own judgement of how directly a path leads to the main goal. */
export type GoalFit = "direct" | "partial" | "indirect";

export interface ScenarioInput {
  title: string;
  description: string;
  hoursPerWeek: number;
  durationWeeks: number;
  pros: string[];
  cons: string[];
  steps: string[];
  demands: DemandTag[];
  goalFit: GoalFit;
}

export interface Decision {
  id: string;
  question: string;
  paths: Record<PathId, ScenarioInput>;
  createdAt: string;
}

export type LoadLevel = "fits" | "tight" | "overload";
export type Severity = "low" | "medium" | "high";
export type UncertaintyLevel = "low" | "medium" | "high";

export type RiskCode =
  | "overload"
  | "tight_time"
  | "selection"
  | "long_duration"
  | "beyond_horizon"
  | "constraint_conflict"
  | "indirect_goal"
  | "no_steps";

export interface Risk {
  code: RiskCode;
  severity: Severity;
  /** Values for message interpolation (numbers or enum keys, never prose). */
  params?: Record<string, string | number>;
}

export interface PathAnalysis {
  load: LoadLevel;
  /** requested hours / available hours */
  loadRatio: number;
  totalHours: number;
  /** Weeks needed if the user only spends their available hours. */
  weeksAtAvailablePace: number;
  risks: Risk[];
  uncertainty: UncertaintyLevel;
  uncertaintyReasons: RiskCode[];
}

export type TradeoffCode = "fewer_hours" | "shorter" | "less_total" | "closer_to_goal" | "fewer_risks";

export interface Tradeoff {
  code: TradeoffCode;
  /** The path that is better on this dimension. */
  favors: PathId;
  params?: Record<string, string | number>;
}

export interface Comparison {
  decisionId: string;
  generatedAt: string;
  /** "local-rules" = deterministic frontend calculation (demo mode). "ai" = backend LLM. */
  source: "local-rules" | "ai";
  paths: Record<PathId, PathAnalysis>;
  tradeoffs: Tradeoff[];
}

export type TaskSource = "scenario" | "user" | "system";

export interface PlanTask {
  id: string;
  title: string;
  /** 1-based week index inside the plan. */
  week: number;
  priority: Priority;
  estimateHours: number;
  done: boolean;
  doneAt: string | null;
  source: TaskSource;
  /** 0 = Monday … 6 = Sunday. Set for backend-planned tasks (remote mode). */
  dayOfWeek?: number;
  /** Backend locks tasks after Reality Check (remote mode). */
  locked?: boolean;
}

export interface Plan {
  id: string;
  decisionId: string;
  pathId: PathId;
  /** ISO date (Monday) of week 1. */
  startDate: string;
  weeks: number;
  weeklyBudgetHours: number;
  tasks: PlanTask[];
  createdAt: string;
}

/* ------------------------------------------------------------ Reality Check */

export type CheckInKind = "obstacle" | "observation" | "change";

/**
 * A weekly check-in: what actually happened. `plannedHours` and task counts are
 * snapshots taken when the check-in was saved, so history stays stable even if
 * the plan is edited later.
 */
export interface CheckIn {
  id: string;
  planId: string;
  /** 1-based plan week. One check-in per (planId, week). */
  week: number;
  plannedHours: number;
  actualHours: number;
  tasksDone: number;
  tasksTotal: number;
  kind: CheckInKind | null;
  note: string;
  createdAt: string;
  updatedAt: string;
}
