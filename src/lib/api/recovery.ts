/**
 * Recovery Preview API client (docs/recovery-contract.md).
 * Stateless and user-less on the backend: nothing is read or saved. All numbers shown in
 * the UI come from these responses (or a plain minutes→hours conversion).
 */
import { request } from "./http";
import { ApiError } from "./types";

export type RecoveryCategory = "ent" | "sat" | "ielts" | "other";
export const RECOVERY_CATEGORIES: readonly RecoveryCategory[] = ["ent", "sat", "ielts", "other"] as const;

export interface RecoveryTaskIn {
  id: string;
  title: string;
  planned_minutes: number;
  priority: number;
}

export interface RecoveryPreviewIn {
  category: RecoveryCategory;
  subject: string;
  original_weekly_minutes: number;
  new_weekly_minutes: number;
  available_today_minutes: number;
  tasks?: RecoveryTaskIn[];
  topic?: string | null;
}

export type RecoveryAction = "keep" | "shorten" | "defer";
export type RecoveryTaskReason =
  | "fits_budget"
  | "shortened_to_fit"
  | "deferred_no_budget"
  | "deferred_below_meaningful_minimum"
  | "paused_no_time"
  | "zero_planned";
export type RecoveryWarningCode =
  | "original_plan_over_budget"
  | "workload_exceeds_new_budget"
  | "no_time_pause_suggested"
  | "budget_increased_no_outcome_guarantee"
  | "reserve_not_feasible"
  | "high_priority_reduced"
  | "today_exceeds_weekly_budget"
  | "no_tasks_generic_template";
export type RecoveryAssumption =
  | "minutes_are_focused_study_time"
  | "priorities_supplied_by_user"
  | "more_time_does_not_guarantee_better_results"
  | "deferred_tasks_are_kept_not_deleted"
  | "reserve_is_10_percent_of_new_budget"
  | "generic_template_not_based_on_known_weaknesses"
  | "original_workload_equals_original_budget_without_tasks";
export type TemplateKey = "review_material" | "practice_set" | "check_mistakes";
export type NextActionKind = "start_task" | "start_template" | "schedule_next_session" | "pause";
export type NextActionReason =
  | "highest_priority_kept_task"
  | "short_start_top_priority"
  | "generic_study_start"
  | "short_session_only"
  | "no_time_today"
  | "no_time_this_week";

export interface RecoveryTaskOut {
  id: string;
  title: string;
  priority: number;
  rank: number;
  previous_minutes: number;
  proposed_minutes: number;
  deferred_minutes: number;
  action: RecoveryAction;
  reason: RecoveryTaskReason | string;
}

export interface RecoverySummary {
  original_budget_minutes: number;
  original_workload_minutes: number;
  new_budget_minutes: number;
  reserve_minutes: number;
  planning_budget_minutes: number;
  proposed_minutes: number;
  unallocated_minutes: number;
  deferred_minutes: number;
  kept_count: number;
  shortened_count: number;
  deferred_count: number;
  budget_change_ratio: number | null;
}

export interface RecoveryPreviewOut {
  preview: true;
  persisted: false;
  algorithm_version: string;
  category: RecoveryCategory;
  subject: string;
  topic: string | null;
  status: "fits" | "reduced" | "paused";
  summary: RecoverySummary;
  tasks: RecoveryTaskOut[];
  template_plan: { key: TemplateKey | string; proposed_minutes: number }[];
  warnings: { code: RecoveryWarningCode | string; params: Record<string, number | string> }[];
  assumptions: (RecoveryAssumption | string)[];
  next_action: {
    kind: NextActionKind;
    task_id: string | null;
    template_key: TemplateKey | string | null;
    minutes: number;
    reason: NextActionReason | string;
  };
}

export interface RecoveryDemoOut {
  label: string;
  request: RecoveryPreviewIn;
  preview: RecoveryPreviewOut;
}

/** Guards against a stale/incompatible backend: we never render a response we don't understand. */
function assertPreview(p: unknown): RecoveryPreviewOut {
  const r = p as RecoveryPreviewOut | null;
  if (!r || r.preview !== true || r.persisted !== false || !r.summary || !Array.isArray(r.tasks) || !r.next_action) {
    throw new ApiError("unexpected recovery response", "invalid_response");
  }
  return r;
}

export async function previewRecovery(body: RecoveryPreviewIn): Promise<RecoveryPreviewOut> {
  return assertPreview(await request<unknown>("/recovery/preview", { method: "POST", body }));
}

export async function getRecoveryDemo(): Promise<RecoveryDemoOut> {
  const d = await request<RecoveryDemoOut>("/recovery/demo");
  if (!d?.request) throw new ApiError("unexpected recovery demo", "invalid_response");
  return { ...d, preview: assertPreview(d.preview) };
}

/** Contract: ids must match this and be unique within a request. */
export const RECOVERY_ID_RE = /^[A-Za-z0-9_.:-]{1,64}$/;

export const hoursToMinutes = (h: number) => Math.round(h * 60);

export const priorityToRecovery = (p: "high" | "medium" | "low") => (p === "high" ? 5 : p === "medium" ? 3 : 1);
