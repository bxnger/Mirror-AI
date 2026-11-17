import type { CheckInKind, ConstraintTag, Decision, Goal, PathId, Skill, Stage } from "@/domain/types";

/** Backend-only information attached to a synced state (never persisted). */
export interface RemoteMeta {
  userId: number;
  syncedAt: string;
  /** Root scenario per path of the current Lab decision. */
  scenarioIds: Partial<Record<PathId, number>>;
  comparisonId: number | null;
  analysis: BackendAnalysis | null;
  /** Backend plan ids of the chosen path, in week order (week 1 = index 0). */
  planIds: number[];
  /** True when the latest plan has passed Reality Check → next week can be generated. */
  latestPlanReviewed: boolean;
  /** Week → backend review of that week. */
  reviews: Record<number, WeekReview>;
  proposals: RemoteProposal[];
}

export interface PathAnalysis {
  utilization: number;
  overCapacity: boolean;
  slackHours: number;
  strengths: string[];
  tradeoffs: string[];
  risks: string[];
}

export interface BackendAnalysis {
  comparisonId: number;
  source: "llm" | "template";
  summary: string | null;
  priorityFit: string | null;
  assumptions: string[];
  missingData: string[];
  perPath: Partial<Record<PathId, PathAnalysis>>;
}

export interface WeekReview {
  completionRate: number;
  insights: string[];
  summary: string | null;
  whatWorked: string[];
  obstacles: string[];
  nextFocus: string[];
  questions: string[];
  commentarySource: "llm" | "template";
  difficulty: number | null;
}

export interface RemoteProposal {
  id: number;
  week: number | null;
  kind: string;
  reason: string;
  status: "pending" | "accepted" | "rejected" | string;
  title: string | null;
  fromHours: number | null;
  toHours: number | null;
}

/**
 * Frontend-only fields the backend schema doesn't have yet, kept in localStorage
 * per backend user id (never mixed between users). See docs/backend-contract.md.
 */
export interface RemoteExt {
  v: 1;
  userId: number;
  stage: Stage;
  skills: Skill[];
  constraintTags: ConstraintTag[];
  constraintNote: string;
  /** Frontend goals (priority/horizon per goal); titles are mirrored to the backend Future Self. */
  goals: Goal[];
  /** Lab decision with path details (duration, pros, cons, steps, demands). */
  decision: Decision | null;
  /** Path content hash → backend goal id (one "track" goal per path). */
  pathGoals: Record<string, number>;
  /** Backend root scenario id → path. */
  scenarioPath: Record<number, PathId>;
  comparisonId: number | null;
  /** Backend plan id → kind chosen in the check-in form. */
  checkInKinds: Record<number, CheckInKind>;
  createdAt: string;
}
