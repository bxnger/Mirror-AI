"use client";

import { useState } from "react";
import { Tag } from "@/components/ui/surface";
import { ChevronDown } from "@/components/ui/icons";
import { loadLevel } from "@/domain/analysis";

import { CheckChips, ChoiceCards, Field, NumberStepper, TextArea, TextInput } from "@/components/ui/form";
import type { DemandTag, GoalFit, PathId, ScenarioInput } from "@/domain/types";
import { LIMITS, linesOf, type Errors } from "@/domain/validation";
import { t } from "@/i18n";
import { cn } from "@/lib/cn";

const F = t.lab.fields;
const L = t.labels;
const LOAD_TONE = { fits: "done", tight: "warn", overload: "risk" } as const;

/** Form-side representation: lists are edited as multiline text. */
export interface ScenarioDraft {
  title: string;
  description: string;
  hoursPerWeek: number;
  durationWeeks: number;
  pros: string;
  cons: string;
  steps: string;
  demands: DemandTag[];
  goalFit: GoalFit;
}

export const emptyScenario = (): ScenarioDraft => ({
  title: "",
  description: "",
  hoursPerWeek: 5,
  durationWeeks: 8,
  pros: "",
  cons: "",
  steps: "",
  demands: [],
  goalFit: "partial",
});

export function toDraft(s: ScenarioInput): ScenarioDraft {
  return { ...s, pros: s.pros.join("\n"), cons: s.cons.join("\n"), steps: s.steps.join("\n") };
}

export function fromDraft(d: ScenarioDraft): ScenarioInput {
  return {
    ...d,
    title: d.title.trim(),
    description: d.description.trim(),
    pros: linesOf(d.pros),
    cons: linesOf(d.cons),
    steps: linesOf(d.steps),
  };
}

export function ScenarioForm({
  id,
  value,
  onChange,
  errors,
  availableHours,
  className,
}: {
  id: PathId;
  value: ScenarioDraft;
  onChange: (v: ScenarioDraft) => void;
  errors: Errors;
  availableHours: number;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const set = (patch: Partial<ScenarioDraft>) => onChange({ ...value, ...patch });
  const advancedKeys = ["description", "pros", "cons", "steps"];
  const isOpen = open || advancedKeys.some((k) => errors[`${id}.${k}`]);
  const counts = { steps: linesOf(value.steps).length, pros: linesOf(value.pros).length, cons: linesOf(value.cons).length };
  const summary =
    counts.steps + counts.pros + counts.cons === 0 && !value.description.trim()
      ? F.detailsEmpty
      : F.detailsSummary(counts.steps, counts.pros, counts.cons, L.goalFit[value.goalFit]);
  const load =
    Number.isFinite(value.hoursPerWeek) && value.hoursPerWeek > 0 ? loadLevel(value.hoursPerWeek / Math.max(1, availableHours)) : null;
  const e = (k: string) => errors[`${id}.${k}`];
  const accent = id === "A" ? "before:bg-path-a" : "before:bg-path-b";

  return (
    <fieldset
      className={cn(
        "relative min-w-0 rounded-panel border border-line bg-surface p-5 before:absolute before:inset-x-5 before:top-0 before:h-0.5 before:rounded-b-full md:p-6",
        accent,
        className,
      )}
    >
      <legend className="sr-only">{t.lab.pathLabel(id)}</legend>
      <p className={cn("eyebrow mb-4 flex items-center gap-2", id === "A" ? "text-path-a" : "text-path-b")} aria-hidden="true">
        <span className={cn("size-1.5 rounded-full", id === "A" ? "bg-path-a" : "bg-path-b")} />
        {t.lab.pathLabel(id)}
      </p>
      <div className="grid gap-5">
        <Field label={F.title} error={e("title")}>
          {(f) => (
            <TextInput
              id={f.id}
              aria-describedby={f.describedBy}
              invalid={f.invalid}
              value={value.title}
              placeholder={id === "A" ? F.titlePlaceholderA : F.titlePlaceholderB}
              onChange={(ev) => set({ title: ev.target.value })}
            />
          )}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={F.hours} error={e("hoursPerWeek")}>
            {(f) => (
              <NumberStepper
                id={f.id}
                describedBy={f.describedBy}
                invalid={f.invalid}
                value={value.hoursPerWeek}
                min={1}
                max={LIMITS.scenarioHoursMax}
                onChange={(v) => set({ hoursPerWeek: v })}
                decLabel={`${F.hours} −1`}
                incLabel={`${F.hours} +1`}
              />
            )}
          </Field>
          <Field label={F.duration} error={e("durationWeeks")}>
            {(f) => (
              <NumberStepper
                id={f.id}
                describedBy={f.describedBy}
                invalid={f.invalid}
                value={value.durationWeeks}
                min={LIMITS.durationMin}
                max={LIMITS.durationMax}
                onChange={(v) => set({ durationWeeks: v })}
                decLabel={`${F.duration} −1`}
                incLabel={`${F.duration} +1`}
              />
            )}
          </Field>
        </div>
        {/* Instant, honest feedback: the same load rule the comparison uses. */}
        {load && (
          <p className="-mt-2 flex flex-wrap items-center gap-2 text-[12.5px] text-ink-2" aria-live="polite">
            <Tag tone={LOAD_TONE[load]}>{L.load[load]}</Tag>
            {F.loadHint(value.hoursPerWeek, availableHours)}
          </p>
        )}
        <CheckChips
          legend={F.demands}
          options={(Object.keys(L.demand) as DemandTag[]).map((v) => ({ value: v, label: L.demand[v] }))}
          value={value.demands}
          onChange={(demands) => set({ demands })}
        />

        {/* Progressive disclosure: everything below is optional and improves the analysis. */}
        <div className="rounded-[12px] border border-dashed border-line-strong">
          <button
            type="button"
            aria-expanded={isOpen}
            aria-controls={`adv-${id}`}
            onClick={() => setOpen((o) => !o)}
            className="flex w-full items-center justify-between gap-3 rounded-[12px] px-4 py-3 text-left hover:bg-surface-2"
          >
            <span className="min-w-0">
              <span className="block text-[13.5px] font-medium text-ink">{F.details}</span>
              <span className="mt-0.5 block text-[12.5px] text-ink-2">{summary}</span>
            </span>
            <ChevronDown size={14} className={cn("shrink-0 text-ink-3 transition-transform", isOpen && "rotate-180")} />
          </button>
          <div id={`adv-${id}`} hidden={!isOpen} className="grid gap-5 border-t border-line px-4 pb-4 pt-4">
            <Field label={F.description} optional error={e("description")}>
              {(f) => (
                <TextArea
                  id={f.id}
                  aria-describedby={f.describedBy}
                  invalid={f.invalid}
                  rows={2}
                  className="min-h-0"
                  value={value.description}
                  placeholder={F.descriptionPlaceholder}
                  onChange={(ev) => set({ description: ev.target.value })}
                />
              )}
            </Field>
            <ChoiceCards
              legend={F.goalFit}
              name={`fit-${id}`}
              options={(["direct", "partial", "indirect"] as GoalFit[]).map((v) => ({ value: v, label: L.goalFit[v] }))}
              value={value.goalFit}
              onChange={(goalFit) => set({ goalFit })}
              size="sm"
            />
            {(["steps", "pros", "cons"] as const).map((k) => (
              <Field key={k} label={F[k]} hint={k === "steps" ? F.stepsHint : F.listHint} optional error={e(k)}>
                {(f) => (
                  <TextArea
                    id={f.id}
                    aria-describedby={f.describedBy}
                    invalid={f.invalid}
                    rows={3}
                    value={value[k]}
                    placeholder={F[`${k}Placeholder`]}
                    onChange={(ev) => set({ [k]: ev.target.value })}
                  />
                )}
              </Field>
            ))}
          </div>
        </div>
      </div>
    </fieldset>
  );
}
