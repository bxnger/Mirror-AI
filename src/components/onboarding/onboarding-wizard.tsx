"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { Logo } from "@/components/brand/logo";
import { Preferences } from "@/components/layout/preferences";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight, Check, Close, Plus, Pencil } from "@/components/ui/icons";
import { CheckChips, ChoiceCards, ErrorText, Field, NumberStepper, TextArea, TextInput } from "@/components/ui/form";
import type { ConstraintTag, Goal, HorizonMonths, Priority, Profile, Skill, SkillLevel, Stage } from "@/domain/types";
import { checkInt, checkText, LIMITS, type Errors } from "@/domain/validation";
import { formatNumber, t } from "@/i18n";
import { createId } from "@/lib/id";
import { cn } from "@/lib/cn";
import { actions } from "@/lib/store/use-mirror";

const T = t.onboarding;
const L = t.labels;

interface Draft {
  name: string;
  stage: Stage | null;
  mainGoal: string;
  priority: Priority | null;
  horizon: HorizonMonths | null;
  extraGoals: { id: string; title: string; priority: Priority }[];
  skills: Skill[];
  hoursPerWeek: number;
  constraints: ConstraintTag[];
  constraintNote: string;
}

const STEPS = ["goal", "skills", "time", "constraints", "review"] as const;
type StepKey = (typeof STEPS)[number];


function fromProfile(p: Profile | null): Draft {
  if (!p) {
    return {
      name: "",
      stage: null,
      mainGoal: "",
      priority: null,
      horizon: null,
      extraGoals: [],
      skills: [],
      hoursPerWeek: 10,
      constraints: [],
      constraintNote: "",
    };
  }
  const [main, ...rest] = p.goals;
  return {
    name: p.name,
    stage: p.stage,
    mainGoal: main?.title ?? "",
    priority: main?.priority ?? null,
    horizon: main?.horizonMonths ?? null,
    extraGoals: rest.map((g) => ({ id: g.id, title: g.title, priority: g.priority })),
    skills: p.skills,
    hoursPerWeek: p.hoursPerWeek,
    constraints: p.constraints,
    constraintNote: p.constraintNote,
  };
}

function validateStep(step: StepKey, d: Draft): Errors {
  const e: Errors = {};
  if (step === "goal") {
    const name = checkText(d.name, 0, 40, false);
    if (name) e.name = name;
    if (!d.stage) e.stage = "required";
    const g = checkText(d.mainGoal, LIMITS.goalMin, LIMITS.goalMax);
    if (g) e.mainGoal = g;
    if (!d.priority) e.priority = "required";
    if (!d.horizon) e.horizon = "required";
    d.extraGoals.forEach((x) => {
      const err = checkText(x.title, 3, LIMITS.goalMax);
      if (err) e[`extra.${x.id}`] = err;
    });
  }
  if (step === "skills" && d.skills.length === 0) e.skills = "min_items";
  if (step === "time") {
    const h = checkInt(d.hoursPerWeek, LIMITS.hoursMin, LIMITS.hoursMax);
    if (h) e.hoursPerWeek = h;
  }
  if (step === "constraints") {
    const n = checkText(d.constraintNote, 0, LIMITS.noteMax, false);
    if (n) e.constraintNote = n;
  }
  return e;
}

function toProfile(d: Draft, prev: Profile | null): Profile {
  const now = new Date().toISOString();
  const main: Goal = {
    id: prev?.goals[0]?.id ?? createId(),
    title: d.mainGoal.trim(),
    priority: d.priority!,
    horizonMonths: d.horizon!,
  };
  return {
    name: d.name.trim(),
    stage: d.stage!,
    goals: [
      main,
      ...d.extraGoals.map((g) => ({ id: g.id, title: g.title.trim(), priority: g.priority, horizonMonths: 12 as const })),
    ],
    skills: d.skills,
    hoursPerWeek: d.hoursPerWeek,
    constraints: d.constraints,
    constraintNote: d.constraintNote.trim(),
    createdAt: prev?.createdAt ?? now,
    updatedAt: now,
  };
}

/* =================================================================== wizard */

export function OnboardingWizard({ initial }: { initial: Profile | null }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(() => fromProfile(initial));
  const [stepIndex, setStepIndex] = useState(0);
  const [errors, setErrors] = useState<Errors>({});
  const [focusTarget, setFocusTarget] = useState<"heading" | "error" | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const step = STEPS[stepIndex];
  const isEdit = Boolean(initial);

  const update = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));

  // Move focus after a step change or a failed validation (keyboard + screen reader users).
  useEffect(() => {
    if (!focusTarget) return;
    if (focusTarget === "heading") headingRef.current?.focus();
    if (focusTarget === "error") {
      formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"], [data-invalid="true"] input')?.focus();
    }
  }, [focusTarget, stepIndex, errors]);

  function goTo(i: number) {
    setErrors({});
    setStepIndex(i);
    setFocusTarget("heading");
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const errs = validateStep(step, draft);
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      setFocusTarget("error");
      return;
    }
    if (step !== "review") {
      goTo(stepIndex + 1);
      return;
    }
    // Validate everything once more before saving (e.g. after edits from review).
    for (let i = 0; i < STEPS.length; i++) {
      const all = validateStep(STEPS[i], draft);
      if (Object.keys(all).length > 0) {
        setStepIndex(i);
        setErrors(all);
        setFocusTarget("error");
        return;
      }
    }
    actions.saveProfile(toProfile(draft, initial));
    router.push("/twin");
  }

  return (
    <div className="mx-auto grid min-h-dvh w-full max-w-[1120px] grid-cols-1 gap-0 px-4 md:px-8 lg:grid-cols-[300px_minmax(0,1fr)] lg:gap-16">
      {/* ---------------------------------------------------------------- rail */}
      <aside className="pt-5 lg:sticky lg:top-0 lg:h-dvh lg:pt-10">
        <div className="flex items-center justify-between gap-2">
          <Link href="/" className="shrink-0 rounded-md" aria-label="MIRROR AI">
            <Logo compact />
          </Link>
          <div className="flex items-center gap-3">
            {isEdit && (
              <Link href="/twin" className="text-[13px] text-ink-2 underline-offset-4 hover:text-ink hover:underline lg:hidden">
                {t.common.cancel}
              </Link>
            )}
            <Preferences compact />
          </div>
        </div>
        <div className="mt-8 hidden lg:block">
          <h1 className="font-serif text-2xl">{T.title}</h1>
          <p className="mt-2 text-[14px] text-ink-2">{T.subtitle}</p>
        </div>

        {/* Steps as a path: done = solid, current = filled, upcoming = dashed. */}
        <ol className="mt-8 hidden lg:block" aria-label={T.title}>
          {STEPS.map((key, i) => {
            const state = i < stepIndex ? "done" : i === stepIndex ? "current" : "todo";
            return (
              <li key={key} className="relative pb-6 pl-8 last:pb-0">
                {i < STEPS.length - 1 && (
                  <span
                    aria-hidden="true"
                    className={cn(
                      "absolute left-[9px] top-6 h-[calc(100%-20px)] w-0 border-l",
                      i < stepIndex ? "border-ink-3" : "border-dashed border-line-strong",
                    )}
                  />
                )}
                <span
                  aria-hidden="true"
                  className={cn(
                    "absolute left-0 top-0.5 grid size-[19px] place-items-center rounded-full border text-[10px]",
                    state === "done" && "border-ink-3 text-ink-2",
                    state === "current" && "border-ink bg-ink text-bg",
                    state === "todo" && "border-dashed border-line-strong text-ink-3",
                  )}
                >
                  {state === "done" ? <Check size={10} strokeWidth={2.2} /> : i + 1}
                </span>
                {state === "done" ? (
                  <button
                    type="button"
                    onClick={() => goTo(i)}
                    className="rounded text-left text-sm text-ink-2 hover:text-ink"
                  >
                    {T.steps[key]}
                  </button>
                ) : (
                  <span
                    aria-current={state === "current" ? "step" : undefined}
                    className={cn("text-sm", state === "current" ? "font-medium text-ink" : "text-ink-3")}
                  >
                    {T.steps[key]}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
        {isEdit && (
          <Link
            href="/twin"
            className="mt-10 hidden text-[13px] text-ink-2 underline-offset-4 hover:text-ink hover:underline lg:inline-block"
          >
            {t.common.cancel}
          </Link>
        )}

        {/* Mobile progress */}
        <div className="mt-6 lg:hidden">
          <p className="eyebrow">
            {T.stepOf(stepIndex + 1, STEPS.length)} · {T.steps[step]}
          </p>
          <div className="mt-2 grid grid-cols-5 gap-1" aria-hidden="true">
            {STEPS.map((k, i) => (
              <span key={k} className={cn("h-1 rounded-full", i <= stepIndex ? "bg-ink" : "bg-surface-3")} />
            ))}
          </div>
        </div>
      </aside>

      {/* ---------------------------------------------------------------- form */}
      <form ref={formRef} onSubmit={onSubmit} noValidate className="flex min-w-0 flex-col pb-10 pt-6 lg:pt-24">
        <div key={step} className="animate-rise">
          <p className="eyebrow hidden lg:block">{T.stepOf(stepIndex + 1, STEPS.length)}</p>
          <h2
            ref={headingRef}
            tabIndex={-1}
            className="mt-2 font-serif text-title font-normal tracking-[-0.015em] text-balance focus:outline-none"
          >
            {T[step].heading}
          </h2>
          <p className="mt-2 max-w-xl text-ink-2">{T[step].lead}</p>

          <div className="mt-8 grid max-w-2xl gap-7">
            {step === "goal" && <GoalStep draft={draft} update={update} errors={errors} />}
            {step === "skills" && <SkillsStep draft={draft} update={update} errors={errors} />}
            {step === "time" && <TimeStep draft={draft} update={update} errors={errors} />}
            {step === "constraints" && <ConstraintsStep draft={draft} update={update} errors={errors} />}
            {step === "review" && <ReviewStep draft={draft} goTo={goTo} />}
          </div>
        </div>

        <div className="sticky bottom-0 mt-10 flex max-w-2xl items-center justify-between gap-3 border-t border-line bg-bg/95 py-4 backdrop-blur lg:static lg:bg-transparent lg:backdrop-blur-none">
          <Button
            variant="ghost"
            icon={<ArrowLeft />}
            onClick={() => goTo(stepIndex - 1)}
            disabled={stepIndex === 0}
            className={cn(stepIndex === 0 && "invisible")}
          >
            {t.common.back}
          </Button>
          <Button type="submit" variant="primary" size="lg" iconRight={step === "review" ? <Check /> : <ArrowRight />}>
            {step === "review" ? (isEdit ? T.review.update : T.review.create) : t.common.next}
          </Button>
        </div>
      </form>
    </div>
  );
}

/* ==================================================================== steps */

interface StepProps {
  draft: Draft;
  update: (p: Partial<Draft>) => void;
  errors: Errors;
}

function GoalStep({ draft, update, errors }: StepProps) {
  const stageOptions = (Object.keys(L.stage) as Stage[]).map((v) => ({ value: v, label: L.stage[v] }));
  const priorityOptions = (["high", "medium", "low"] as Priority[]).map((v) => ({
    value: v,
    label: L.priority[v],
    hint: L.priorityHint[v],
  }));
  const horizonOptions = ([3, 6, 12, 24] as HorizonMonths[]).map((v) => ({ value: v, label: L.horizon[v] }));

  return (
    <>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label={T.goal.name} optional error={errors.name}>
          {(f) => (
            <TextInput
              id={f.id}
              aria-describedby={f.describedBy}
              invalid={f.invalid}
              value={draft.name}
              autoComplete="given-name"
              placeholder={T.goal.namePlaceholder}
              onChange={(e) => update({ name: e.target.value })}
            />
          )}
        </Field>
      </div>
      <ChoiceCards
        legend={T.goal.stage}
        name="stage"
        options={stageOptions}
        value={draft.stage}
        onChange={(stage) => update({ stage })}
        error={errors.stage}
        columns={4}
        size="sm"
      />
      <Field
        label={T.goal.mainGoal}
        hint={T.goal.mainGoalHint}
        error={errors.mainGoal}
        counter={{ value: draft.mainGoal.trim().length, max: LIMITS.goalMax }}
      >
        {(f) => (
          <TextArea
            id={f.id}
            aria-describedby={f.describedBy}
            invalid={f.invalid}
            rows={2}
            className="min-h-0 text-base"
            value={draft.mainGoal}
            placeholder={T.goal.mainGoalPlaceholder}
            onChange={(e) => update({ mainGoal: e.target.value })}
          />
        )}
      </Field>
      <ChoiceCards
        legend={T.goal.priority}
        name="priority"
        options={priorityOptions}
        value={draft.priority}
        onChange={(priority) => update({ priority })}
        error={errors.priority}
      />
      <ChoiceCards
        legend={T.goal.horizon}
        name="horizon"
        options={horizonOptions}
        value={draft.horizon}
        onChange={(horizon) => update({ horizon })}
        error={errors.horizon}
        columns={4}
        size="sm"
      />

      <fieldset>
        <legend className="mb-2 text-[13px] font-medium text-ink-2">
          {T.goal.extraGoals}
          <span className="ml-1.5 font-normal text-ink-3">· {t.common.optional}</span>
        </legend>
        <div className="grid gap-2">
          {draft.extraGoals.map((g, i) => (
            <div key={g.id}>
              <div className="flex gap-2">
                <TextInput
                  aria-label={`${T.goal.extraGoals} ${i + 1}`}
                  invalid={Boolean(errors[`extra.${g.id}`])}
                  aria-describedby={errors[`extra.${g.id}`] ? `err-${g.id}` : undefined}
                  value={g.title}
                  placeholder={T.goal.extraGoalPlaceholder}
                  onChange={(e) =>
                    update({
                      extraGoals: draft.extraGoals.map((x) => (x.id === g.id ? { ...x, title: e.target.value } : x)),
                    })
                  }
                />
                <select
                  aria-label={T.goal.priority}
                  value={g.priority}
                  onChange={(e) =>
                    update({
                      extraGoals: draft.extraGoals.map((x) =>
                        x.id === g.id ? { ...x, priority: e.target.value as Priority } : x,
                      ),
                    })
                  }
                  className="h-11 w-32 shrink-0 rounded-control border border-line bg-surface px-2.5 text-sm text-ink-2 hover:border-line-strong"
                >
                  {(["high", "medium", "low"] as Priority[]).map((p) => (
                    <option key={p} value={p}>
                      {L.priority[p]}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  aria-label={T.goal.removeGoal}
                  onClick={() => update({ extraGoals: draft.extraGoals.filter((x) => x.id !== g.id) })}
                  className="grid size-11 shrink-0 place-items-center rounded-control text-ink-3 hover:bg-surface-2 hover:text-ink"
                >
                  <Close />
                </button>
              </div>
              <ErrorText id={`err-${g.id}`} code={errors[`extra.${g.id}`]} />
            </div>
          ))}
          {draft.extraGoals.length < 2 && (
            <Button
              variant="ghost"
              size="sm"
              icon={<Plus size={14} />}
              className="justify-self-start"
              onClick={() =>
                update({ extraGoals: [...draft.extraGoals, { id: createId(), title: "", priority: "medium" }] })
              }
            >
              {T.goal.addGoal}
            </Button>
          )}
        </div>
      </fieldset>
    </>
  );
}

function SkillsStep({ draft, update, errors }: StepProps) {
  const [input, setInput] = useState("");
  const [inputError, setInputError] = useState<ReturnType<typeof checkText> | "duplicate">(null);

  function add(nameRaw: string) {
    const name = nameRaw.trim();
    const err = checkText(name, LIMITS.skillMin, LIMITS.skillMax);
    if (err) return setInputError(err);
    if (draft.skills.some((s) => s.name.toLowerCase() === name.toLowerCase())) return setInputError("duplicate");
    if (draft.skills.length >= LIMITS.skillsMax) return setInputError("too_long");
    update({ skills: [...draft.skills, { id: createId(), name, level: 1 }] });
    setInput("");
    setInputError(null);
  }

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      add(input);
    }
  }

  const suggestions = T.skills.suggestionsList.filter(
    (s) => !draft.skills.some((x) => x.name.toLowerCase() === s.toLowerCase()),
  );

  return (
    <>
      <Field label={T.skills.input} error={inputError}>
        {(f) => (
          <div className="flex gap-2">
            <TextInput
              id={f.id}
              aria-describedby={f.describedBy}
              invalid={f.invalid}
              value={input}
              placeholder={T.skills.inputPlaceholder}
              onChange={(e) => {
                setInput(e.target.value);
                if (inputError) setInputError(null);
              }}
              onKeyDown={onKey}
            />
            <Button onClick={() => add(input)} icon={<Plus size={14} />} className="h-11 shrink-0">
              {T.skills.add}
            </Button>
          </div>
        )}
      </Field>

      {suggestions.length > 0 && (
        <div>
          <p className="mb-2 text-[13px] text-ink-3">{T.skills.suggestions}</p>
          <div className="flex flex-wrap gap-1.5">
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => add(s)}
                className="inline-flex items-center gap-1 rounded-full border border-dashed border-line-strong px-2.5 py-1 text-[13px] text-ink-2 transition-colors hover:border-ink-3 hover:text-ink"
              >
                <Plus size={11} />
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      <div data-invalid={errors.skills ? "true" : undefined}>
        {draft.skills.length === 0 ? (
          <div className="rounded-panel border border-dashed border-line-strong px-4 py-6 text-center text-[14px] text-ink-3">
            {T.skills.empty}
            <ErrorText id="skills-err" code={errors.skills} />
          </div>
        ) : (
          <ul className="divide-y divide-line rounded-panel border border-line bg-surface">
            {draft.skills.map((s) => (
              <li key={s.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <span className="font-medium text-ink">{s.name}</span>
                <div className="flex items-center gap-2">
                  <div role="radiogroup" aria-label={`${T.skills.level}: ${s.name}`} className="flex rounded-[8px] border border-line p-0.5">
                    {([1, 2, 3] as SkillLevel[]).map((lvl) => {
                      const on = s.level === lvl;
                      return (
                        <label
                          key={lvl}
                          className={cn(
                            "cursor-pointer rounded-[6px] px-2.5 py-1 text-[12.5px] transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-path-a/50",
                            on ? "bg-surface-3 text-ink" : "text-ink-3 hover:text-ink-2",
                          )}
                        >
                          <input
                            type="radio"
                            className="sr-only"
                            name={`lvl-${s.id}`}
                            checked={on}
                            onChange={() =>
                              update({ skills: draft.skills.map((x) => (x.id === s.id ? { ...x, level: lvl } : x)) })
                            }
                          />
                          {L.skillLevel[lvl]}
                        </label>
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    aria-label={T.skills.remove(s.name)}
                    onClick={() => update({ skills: draft.skills.filter((x) => x.id !== s.id) })}
                    className="ml-auto grid size-8 place-items-center rounded-md text-ink-3 hover:bg-surface-2 hover:text-ink sm:ml-0"
                  >
                    <Close size={14} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

function TimeStep({ draft, update, errors }: StepProps) {
  const h = draft.hoursPerWeek;
  const valid = Number.isFinite(h) && h >= 1;
  const scale = T.time.scale.find((s) => (valid ? h : 0) <= s.max) ?? T.time.scale[T.time.scale.length - 1];
  return (
    <>
      <div className="rounded-panel border border-line bg-surface p-5 md:p-6">
        <div className="flex items-end justify-between gap-4">
          <p className="tabular font-serif text-[56px] leading-none tracking-tight text-ink" aria-hidden="true">
            {valid ? h : "—"}
            <span className="ml-2 font-sans text-base text-ink-3">{t.common.hPerWeek}</span>
          </p>
          <p className="pb-1.5 text-right text-[13px] text-ink-3">
            {valid ? T.time.perDay(formatNumber(h / 7)) : ""}
          </p>
        </div>
        <input
          type="range"
          min={1}
          max={60}
          value={valid ? Math.min(h, 60) : 1}
          onChange={(e) => update({ hoursPerWeek: Number(e.target.value) })}
          aria-label={T.time.label}
          className="mt-6 w-full accent-[var(--color-ink)]"
        />
        <div className="mt-1 flex justify-between font-mono text-[11px] text-ink-3" aria-hidden="true">
          <span>1</span>
          <span>20</span>
          <span>40</span>
          <span>60</span>
        </div>
        <p className="mt-4 border-t border-line pt-4 text-[14px] text-ink-2" aria-live="polite">
          {scale.text}
        </p>
      </div>
      <Field label={T.time.label} error={errors.hoursPerWeek} className="max-w-[220px]">
        {(f) => (
          <NumberStepper
            id={f.id}
            describedBy={f.describedBy}
            invalid={f.invalid}
            value={h}
            min={LIMITS.hoursMin}
            max={LIMITS.hoursMax}
            onChange={(v) => update({ hoursPerWeek: v })}
            suffix={t.common.hoursShort}
            decLabel="−1"
            incLabel="+1"
          />
        )}
      </Field>
    </>
  );
}

function ConstraintsStep({ draft, update, errors }: StepProps) {
  const options = (Object.keys(L.constraint) as ConstraintTag[]).map((v) => ({ value: v, label: L.constraint[v] }));
  return (
    <>
      <CheckChips
        legend={T.constraints.tags}
        options={options}
        value={draft.constraints}
        onChange={(constraints) => update({ constraints })}
      />
      <Field
        label={T.constraints.note}
        optional
        error={errors.constraintNote}
        counter={{ value: draft.constraintNote.trim().length, max: LIMITS.noteMax }}
      >
        {(f) => (
          <TextArea
            id={f.id}
            aria-describedby={f.describedBy}
            invalid={f.invalid}
            value={draft.constraintNote}
            placeholder={T.constraints.notePlaceholder}
            onChange={(e) => update({ constraintNote: e.target.value })}
          />
        )}
      </Field>
    </>
  );
}

function ReviewStep({ draft, goTo }: { draft: Draft; goTo: (i: number) => void }) {
  const none = <span className="text-ink-3">{T.review.none}</span>;
  const rows: { step: number; label: string; value: ReactNode }[] = [
    {
      step: 0,
      label: T.goal.mainGoal,
      value: (
        <>
          <span className="text-ink">{draft.mainGoal || "—"}</span>
          <span className="mt-1 block text-[13px] text-ink-3">
            {draft.stage && L.stage[draft.stage]} · {draft.priority && L.priority[draft.priority]} ·{" "}
            {draft.horizon && L.horizon[draft.horizon]}
          </span>
        </>
      ),
    },
    {
      step: 0,
      label: T.goal.extraGoals,
      value: draft.extraGoals.length ? draft.extraGoals.map((g) => g.title).join("; ") : none,
    },
    {
      step: 1,
      label: T.steps.skills,
      value: draft.skills.map((s) => `${s.name} · ${L.skillLevel[s.level].toLowerCase()}`).join(", "),
    },
    { step: 2, label: T.time.label, value: `${draft.hoursPerWeek} ${t.common.hoursShort}` },
    {
      step: 3,
      label: T.steps.constraints,
      value:
        draft.constraints.length || draft.constraintNote ? (
          <>
            {draft.constraints.map((c) => L.constraint[c]).join(", ")}
            {draft.constraintNote && <span className="mt-1 block text-[13px] text-ink-3">{draft.constraintNote}</span>}
          </>
        ) : (
          none
        ),
    },
  ];
  return (
    <dl className="divide-y divide-line rounded-panel border border-line bg-surface">
      {rows.map((r) => (
        <div key={r.label} className="grid gap-1 px-5 py-4 sm:grid-cols-[180px_minmax(0,1fr)_auto] sm:gap-4">
          <dt className="text-[13px] text-ink-3">{r.label}</dt>
          <dd className="min-w-0 text-[14.5px] text-ink-2 break-words">{r.value}</dd>
          <dd className="sm:text-right">
            <button
              type="button"
              onClick={() => goTo(r.step)}
              className="inline-flex items-center gap-1 rounded text-[13px] text-ink-3 hover:text-ink"
              aria-label={`${t.common.edit}: ${r.label}`}
            >
              <Pencil size={12} />
              {t.common.edit}
            </button>
          </dd>
        </div>
      ))}
    </dl>
  );
}
