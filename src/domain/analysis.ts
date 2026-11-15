/**
 * Deterministic scenario comparison used in demo mode (source: "local-rules").
 *
 * Everything here is derived from the user's own input — hours, duration,
 * declared constraints and self-assessed goal fit. No success probabilities,
 * no invented outcomes. When the backend LLM is connected it should return
 * the same Comparison shape (source: "ai") and the UI stays unchanged.
 */
import type {
  Comparison,
  ConstraintTag,
  Decision,
  DemandTag,
  GoalFit,
  LoadLevel,
  PathAnalysis,
  PathId,
  Profile,
  Risk,
  RiskCode,
  ScenarioInput,
  Tradeoff,
  UncertaintyLevel,
} from "./types";

/** Which personal constraints a scenario demand collides with. */
export const DEMAND_CONFLICTS: Record<DemandTag, ConstraintTag[]> = {
  money: ["budget"],
  relocation: ["relocation", "family"],
  full_time: ["study_load", "job"],
  language: ["language"],
  selection: [],
};

const FIT_RANK: Record<GoalFit, number> = { direct: 2, partial: 1, indirect: 0 };

export function loadLevel(ratio: number): LoadLevel {
  if (ratio <= 0.8) return "fits";
  if (ratio <= 1) return "tight";
  return "overload";
}

export function analyzePath(path: ScenarioInput, profile: Profile): PathAnalysis {
  const available = Math.max(1, profile.hoursPerWeek);
  const loadRatio = path.hoursPerWeek / available;
  const load = loadLevel(loadRatio);
  const totalHours = path.hoursPerWeek * path.durationWeeks;
  const weeksAtAvailablePace = Math.ceil(totalHours / available);
  const horizonWeeks = Math.round((profile.goals[0]?.horizonMonths ?? 12) * 4.345);

  const risks: Risk[] = [];

  if (load === "overload") {
    risks.push({
      code: "overload",
      severity: loadRatio > 1.3 ? "high" : "medium",
      params: { need: path.hoursPerWeek, have: profile.hoursPerWeek },
    });
  } else if (load === "tight") {
    risks.push({ code: "tight_time", severity: "low", params: { need: path.hoursPerWeek, have: profile.hoursPerWeek } });
  }

  for (const demand of path.demands) {
    const hit = DEMAND_CONFLICTS[demand].filter((c) => profile.constraints.includes(c));
    for (const constraint of hit) {
      risks.push({ code: "constraint_conflict", severity: "high", params: { demand, constraint } });
    }
  }

  if (path.demands.includes("selection")) {
    risks.push({ code: "selection", severity: "medium" });
  }

  if (path.durationWeeks > horizonWeeks) {
    risks.push({
      code: "beyond_horizon",
      severity: "medium",
      params: { weeks: path.durationWeeks, horizon: profile.goals[0]?.horizonMonths ?? 12 },
    });
  } else if (path.durationWeeks > 26) {
    risks.push({ code: "long_duration", severity: "low", params: { weeks: path.durationWeeks } });
  }

  if (path.goalFit === "indirect") {
    risks.push({ code: "indirect_goal", severity: "medium" });
  }

  if (path.steps.length === 0) {
    risks.push({ code: "no_steps", severity: "low" });
  }

  // Uncertainty is a count of factors outside the user's control or knowledge —
  // NOT a probability of success.
  const uncertaintyWeights: Partial<Record<RiskCode, number>> = {
    selection: 2,
    beyond_horizon: 1,
    long_duration: 1,
    indirect_goal: 1,
    no_steps: 1,
    overload: 1,
    constraint_conflict: 1,
  };
  const reasons = Array.from(new Set(risks.map((r) => r.code))).filter((c) => uncertaintyWeights[c]);
  const score = reasons.reduce((s, c) => s + (uncertaintyWeights[c] ?? 0), 0);
  const uncertainty: UncertaintyLevel = score >= 4 ? "high" : score >= 2 ? "medium" : "low";

  return { load, loadRatio, totalHours, weeksAtAvailablePace, risks, uncertainty, uncertaintyReasons: reasons };
}

const UNC_RANK: Record<UncertaintyLevel, number> = { low: 0, medium: 1, high: 2 };
const SEV_WEIGHT = { low: 1, medium: 2, high: 3 } as const;

function riskWeight(a: PathAnalysis) {
  return a.risks.reduce((s, r) => s + SEV_WEIGHT[r.severity], 0);
}

export function computeTradeoffs(decision: Decision, analyses: Record<PathId, PathAnalysis>): Tradeoff[] {
  const a = decision.paths.A;
  const b = decision.paths.B;
  const out: Tradeoff[] = [];

  const hourDiff = a.hoursPerWeek - b.hoursPerWeek;
  if (Math.abs(hourDiff) >= 2) {
    out.push({ code: "fewer_hours", favors: hourDiff > 0 ? "B" : "A", params: { diff: Math.abs(hourDiff) } });
  }

  const durDiff = a.durationWeeks - b.durationWeeks;
  if (Math.abs(durDiff) >= 2) {
    out.push({ code: "shorter", favors: durDiff > 0 ? "B" : "A", params: { diff: Math.abs(durDiff) } });
  }

  const totalDiff = analyses.A.totalHours - analyses.B.totalHours;
  if (Math.abs(totalDiff) >= 10) {
    out.push({ code: "less_total", favors: totalDiff > 0 ? "B" : "A", params: { diff: Math.abs(totalDiff) } });
  }

  const fitDiff = FIT_RANK[a.goalFit] - FIT_RANK[b.goalFit];
  if (fitDiff !== 0) {
    out.push({ code: "closer_to_goal", favors: fitDiff > 0 ? "A" : "B" });
  }

  // Weighted by severity, tie-broken by uncertainty level.
  const riskDiff =
    riskWeight(analyses.A) - riskWeight(analyses.B) ||
    UNC_RANK[analyses.A.uncertainty] - UNC_RANK[analyses.B.uncertainty];
  if (riskDiff !== 0) {
    out.push({ code: "fewer_risks", favors: riskDiff > 0 ? "B" : "A" });
  }

  return out;
}

export function compareLocally(decision: Decision, profile: Profile): Comparison {
  const paths = {
    A: analyzePath(decision.paths.A, profile),
    B: analyzePath(decision.paths.B, profile),
  };
  return {
    decisionId: decision.id,
    generatedAt: new Date().toISOString(),
    source: "local-rules",
    paths,
    tradeoffs: computeTradeoffs(decision, paths),
  };
}
