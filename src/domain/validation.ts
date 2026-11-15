/**
 * Form validation. Returns error *codes* keyed by field path; the UI maps codes
 * to localized messages (src/i18n). No validation library — rules are small.
 */
import type { ScenarioInput } from "./types";

export type ErrorCode =
  | "required"
  | "too_short"
  | "too_long"
  | "range"
  | "min_items"
  | "duplicate";

export type Errors = Record<string, ErrorCode>;

export const LIMITS = {
  goalMin: 8,
  goalMax: 160,
  skillMin: 2,
  skillMax: 40,
  skillsMax: 12,
  hoursMin: 1,
  hoursMax: 80,
  noteMax: 300,
  questionMin: 8,
  questionMax: 200,
  titleMin: 3,
  titleMax: 80,
  descMax: 400,
  scenarioHoursMax: 80,
  durationMin: 1,
  durationMax: 104,
  listItemMax: 140,
  listMax: 8,
} as const;

export function checkText(value: string, min: number, max: number, required = true): ErrorCode | null {
  const v = value.trim();
  if (!v) return required ? "required" : null;
  if (v.length < min) return "too_short";
  if (v.length > max) return "too_long";
  return null;
}

export function checkInt(value: number, min: number, max: number): ErrorCode | null {
  if (!Number.isFinite(value)) return "required";
  if (!Number.isInteger(value) || value < min || value > max) return "range";
  return null;
}

export function validateScenario(s: ScenarioInput, prefix: string): Errors {
  const e: Errors = {};
  const title = checkText(s.title, LIMITS.titleMin, LIMITS.titleMax);
  if (title) e[`${prefix}.title`] = title;
  const desc = checkText(s.description, 0, LIMITS.descMax, false);
  if (desc) e[`${prefix}.description`] = desc;
  const hours = checkInt(s.hoursPerWeek, 1, LIMITS.scenarioHoursMax);
  if (hours) e[`${prefix}.hoursPerWeek`] = hours;
  const dur = checkInt(s.durationWeeks, LIMITS.durationMin, LIMITS.durationMax);
  if (dur) e[`${prefix}.durationWeeks`] = dur;
  for (const key of ["pros", "cons", "steps"] as const) {
    if (s[key].length > LIMITS.listMax) e[`${prefix}.${key}`] = "too_long";
    else if (s[key].some((x) => x.length > LIMITS.listItemMax)) e[`${prefix}.${key}`] = "too_long";
  }
  return e;
}

/** Splits a multiline textarea into trimmed non-empty lines. */
export function linesOf(text: string): string[] {
  return text
    .split("\n")
    .map((l) => l.replace(/^\s*(?:[-•*]|\d+[.)])\s*/, "").trim())
    .filter(Boolean);
}
