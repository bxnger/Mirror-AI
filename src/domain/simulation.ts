/**
 * Future Paths simulator — "what if I had N hours a week and an M-month horizon?"
 * Pure and deterministic; reuses the same load/risk rules as the What If Lab.
 * Hypothetical inputs never touch the saved profile.
 */
import { analyzePath, loadLevel } from "./analysis";
import { horizonToWeeks } from "./reality";
import type { HorizonMonths, LoadLevel, Profile, RiskCode, ScenarioInput } from "./types";

export const SIM_LIMITS = { hoursMin: 1, hoursMax: 60, horizonMin: 1, horizonMax: 36 } as const;
export const MILESTONES = [0.25, 0.5, 0.75, 1] as const;

export interface SimInput {
  hoursPerWeek: number;
  horizonMonths: number;
}

export interface PathSim {
  load: LoadLevel;
  /** requested ÷ available */
  loadRatio: number;
  /** hours/week actually allocated = min(requested, available) */
  allocatedHours: number;
  totalHours: number;
  weeksNeeded: number;
  horizonWeeks: number;
  fitsHorizon: boolean;
  /** planned cumulative hours that fit inside the horizon */
  hoursWithinHorizon: number;
  /** share of the path's volume that fits inside the horizon (0..1) — a volume ratio, not a probability */
  volumeWithinHorizon: number;
  milestones: { fraction: number; week: number }[];
  conflicts: RiskCode[];
}

export function clampSim(input: SimInput): SimInput {
  const c = (n: number, lo: number, hi: number, fb: number) => (Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : fb);
  return {
    hoursPerWeek: c(input.hoursPerWeek, SIM_LIMITS.hoursMin, SIM_LIMITS.hoursMax, SIM_LIMITS.hoursMin),
    horizonMonths: c(input.horizonMonths, SIM_LIMITS.horizonMin, SIM_LIMITS.horizonMax, 12),
  };
}

export function simulatePath(path: ScenarioInput, raw: SimInput, profile: Profile): PathSim {
  const input = clampSim(raw);
  const available = input.hoursPerWeek;
  const loadRatio = path.hoursPerWeek / available;
  const allocatedHours = Math.min(path.hoursPerWeek, available);
  const totalHours = path.hoursPerWeek * path.durationWeeks;
  const weeksNeeded = Math.ceil(totalHours / allocatedHours);
  const horizonWeeks = horizonToWeeks(input.horizonMonths);
  const hoursWithinHorizon = Math.min(totalHours, allocatedHours * horizonWeeks);

  // Same rules as the Lab, applied to a hypothetical copy of the profile.
  const hypothetical: Profile = {
    ...profile,
    hoursPerWeek: available,
    goals: profile.goals.map((g, i) => (i === 0 ? { ...g, horizonMonths: input.horizonMonths as HorizonMonths } : g)),
  };
  const analysis = analyzePath(path, hypothetical);
  const conflicts = Array.from(
    new Set(
      analysis.risks
        .map((r) => r.code)
        .filter((c) => c === "overload" || c === "tight_time" || c === "beyond_horizon" || c === "constraint_conflict"),
    ),
  );
  if (weeksNeeded > horizonWeeks && !conflicts.includes("beyond_horizon")) conflicts.push("beyond_horizon");

  return {
    load: loadLevel(loadRatio),
    loadRatio,
    allocatedHours,
    totalHours,
    weeksNeeded,
    horizonWeeks,
    fitsHorizon: weeksNeeded <= horizonWeeks,
    hoursWithinHorizon,
    volumeWithinHorizon: totalHours === 0 ? 1 : hoursWithinHorizon / totalHours,
    milestones: MILESTONES.map((f) => ({ fraction: f, week: Math.ceil((totalHours * f) / allocatedHours) })),
    conflicts,
  };
}
