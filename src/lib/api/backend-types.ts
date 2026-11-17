/**
 * Response shapes of the FastAPI backend (backend/app/serializers.py, services/twin.py),
 * verified against a running server. Only the fields the frontend reads are typed.
 */

export interface BUser {
  id: number;
  name: string;
  country: string | null;
  is_demo: boolean;
}

export interface BMilestone {
  id: number;
  title: string;
  order: number;
  done: boolean;
}

export interface BTarget {
  goal_id: number;
  title: string;
  target_date: string | null;
  priority: number | null;
  desired_outcome: string | null;
  milestones: BMilestone[];
}

export interface BSkill {
  goal_id: number;
  title: string;
  metric_type: string;
  level: string | null;
  value: number | null;
}

export interface BTwin {
  user: BUser;
  current_self: {
    weekly_hours_available: number | null;
    constraints: string[] | null;
    skills: BSkill[];
    completed_tasks: number;
    completed_hours: number;
  } | null;
  future_self: {
    vision: string | null;
    horizon_date: string | null;
    desired_achievements: string[] | null;
    targets: BTarget[];
  } | null;
}

/** POST /goals returns twin.goal_snapshot — note: `id`, not `goal_id`. */
export interface BGoal {
  id: number;
  title: string;
  domain: string;
  status: string;
}

export interface BScenario {
  id: number;
  name: string;
  description: string | null;
  status: string;
  source: string;
  parent_scenario_id: number | null;
  total_hours: number;
  allocations: { goal_id: number; title: string; hours_per_week: number }[];
}

export interface BScenarioMetrics {
  scenario_id: number;
  name: string;
  total_hours: number;
  available_hours: number;
  utilization: number;
  slack_hours: number;
  over_capacity: boolean;
  priority_alignment: number;
  allocations: { goal_id: number; title: string; hours_per_week: number; weeks_left: number | null; hours_until_target: number | null }[];
  risks: { code: string; severity: string; message: string }[];
}

export interface BExplanationScenario {
  scenario_id: number;
  name: string;
  strengths: string[];
  tradeoffs: string[];
  risks: string[];
}

export interface BComparison {
  id: number;
  scenario_ids: number[];
  metrics: { scenarios: BScenarioMetrics[] };
  explanation: {
    summary?: string;
    scenarios?: BExplanationScenario[];
    priority_fit?: string;
    missing_data?: string[];
    assumptions?: string[];
    numbers_check?: unknown;
  } | null;
  explanation_source: "llm" | "template" | string;
}

export interface BDecision {
  id: number;
  scenario_id: number;
  scenario_name: string | null;
  source: string;
  rationale: string | null;
  decided_at: string;
}

export interface BTask {
  id: number;
  goal_id: number;
  goal_title: string;
  title: string;
  day_of_week: number;
  planned_minutes: number;
  actual_minutes: number;
  status: "pending" | "done" | "partial" | "skipped";
  is_carry_over: boolean;
}

export interface BPlan {
  id: number;
  week_index: number;
  week_start: string;
  week_end: string;
  status: "active" | "reviewed" | string;
  decision_id: number | null;
  scenario_id: number | null;
  previous_plan_id: number | null;
  planned_minutes_total: number;
  actual_minutes_total: number;
  adaptation_notes: unknown;
  tasks: BTask[];
}

export interface BProposal {
  id: number;
  reality_check_id: number;
  kind: "adjust_allocation" | "update_availability" | string;
  goal_id: number | null;
  payload: { from_hours?: number; to_hours?: number; goal_title?: string; [k: string]: unknown };
  reason: string;
  status: "pending" | "accepted" | "rejected" | string;
}

export interface BRealityCheck {
  id: number;
  plan_id: number;
  scenario_id: number | null;
  decision_id: number | null;
  planned_hours: number;
  actual_hours: number;
  completion_rate: number;
  per_goal: { goal_id: number; tasks_total: number; tasks_done: number; tasks_partial: number }[];
  insights: string[];
  user_feedback: string | null;
  perceived_difficulty: number | null;
  proposals: BProposal[];
  ai_commentary: {
    summary?: string;
    what_worked?: string[];
    obstacles?: string[];
    next_week_focus?: string[];
    questions?: string[];
    generator?: { source?: string };
  } | null;
  created_at: string;
}

export interface BHealth {
  status: string;
  database: string;
  llm: { enabled: boolean; model: string | null };
}
