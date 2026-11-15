"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Alert, ArrowRight, Reset } from "@/components/ui/icons";
import { Field, TextArea } from "@/components/ui/form";
import { PageHeader, Tag } from "@/components/ui/surface";
import { exampleDecisionInput } from "@/fixtures/demo";
import { labTemplates, type LabTemplate } from "@/fixtures/lab-templates";
import { getActiveLocale } from "@/i18n";
import { PATH_IDS, type Decision, type PathId, type Profile } from "@/domain/types";
import { checkText, LIMITS, validateScenario, type Errors } from "@/domain/validation";
import { getApi } from "@/lib/api";
import { t } from "@/i18n";
import { cn } from "@/lib/cn";
import { createId } from "@/lib/id";
import { actions, type MirrorState } from "@/lib/store/use-mirror";
import { ComparisonView } from "./comparison-view";
import { emptyScenario, fromDraft, ScenarioForm, toDraft, type ScenarioDraft } from "./scenario-form";

const T = t.lab;
const api = getApi();

interface Draft {
  question: string;
  A: ScenarioDraft;
  B: ScenarioDraft;
}

function draftFrom(decision: Decision | null): Draft {
  if (!decision) return { question: "", A: emptyScenario(), B: emptyScenario() };
  return { question: decision.question, A: toDraft(decision.paths.A), B: toDraft(decision.paths.B) };
}

function exampleDraft(): Draft {
  const example = exampleDecisionInput(getActiveLocale());
  return {
    question: example.question,
    A: toDraft(example.paths.A),
    B: toDraft(example.paths.B),
  };
}

function templateDraft(tpl: LabTemplate): Draft {
  return {
    question: tpl.question,
    A: { ...emptyScenario(), ...tpl.A, demands: [...tpl.A.demands] },
    B: { ...emptyScenario(), ...tpl.B, demands: [...tpl.B.demands] },
  };
}

/** Where the user is in the Lab: inputs → comparison → choice. */
function LabStages({ stage }: { stage: 0 | 1 | 2 }) {
  return (
    <ol className="flex flex-wrap items-center gap-x-3 gap-y-2" aria-label={T.stagesLabel}>
      {T.stages.map((label, i) => (
        <li key={label} className="flex items-center gap-3">
          <span
            aria-current={i === stage ? "step" : undefined}
            className={cn(
              "inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.12em]",
              i === stage ? "text-ink" : i < stage ? "text-ink-2" : "text-ink-3",
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                "grid size-5 place-items-center rounded-full border text-[10px]",
                i === stage ? "border-ink bg-ink text-bg" : i < stage ? "border-ink-3" : "border-dashed border-line-strong",
              )}
            >
              {i + 1}
            </span>
            {label}
          </span>
          {i < T.stages.length - 1 && (
            <span aria-hidden="true" className={cn("h-px w-6 sm:w-10", i < stage ? "bg-ink-3" : "border-t border-dashed border-line-strong")} />
          )}
        </li>
      ))}
    </ol>
  );
}

type Status = { kind: "idle" } | { kind: "loading" } | { kind: "error"; message?: string };

export function WhatIfLab({ state }: { state: MirrorState & { profile: Profile } }) {
  const router = useRouter();
  const { profile, decision, comparison, selectedPath, plan } = state;
  const hasResult = Boolean(decision && comparison && comparison.decisionId === decision.id);

  const [editing, setEditing] = useState(!hasResult);
  const [draft, setDraft] = useState<Draft>(() => draftFrom(decision));
  const [errors, setErrors] = useState<Errors>({});
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [mobileTab, setMobileTab] = useState<PathId>("A");
  const [continuing, setContinuing] = useState(false);
  const [focusErrors, setFocusErrors] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (focusErrors === 0) return;
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [focusErrors]);

  async function runComparison(d: Decision) {
    setStatus({ kind: "loading" });
    try {
      const result = await api.compareScenarios({ profile, decision: d });
      actions.setComparison(result);
      setStatus({ kind: "idle" });
      setEditing(false);
      requestAnimationFrame(() => resultRef.current?.focus());
    } catch (err) {
      setStatus({ kind: "error", message: err instanceof Error ? err.message : undefined });
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const errs: Errors = {};
    const q = checkText(draft.question, LIMITS.questionMin, LIMITS.questionMax);
    if (q) errs.question = q;
    Object.assign(errs, validateScenario(fromDraft(draft.A), "A"), validateScenario(fromDraft(draft.B), "B"));
    setErrors(errs);
    if (Object.keys(errs).length > 0) {
      // On mobile only one path form is visible — switch to the one with errors.
      const firstPath = PATH_IDS.find((id) => Object.keys(errs).some((k) => k.startsWith(`${id}.`)));
      if (firstPath && !errs.question) setMobileTab(firstPath);
      setFocusErrors((n) => n + 1);
      return;
    }
    const next: Decision = {
      id: createId(),
      question: draft.question.trim(),
      paths: { A: fromDraft(draft.A), B: fromDraft(draft.B) },
      createdAt: new Date().toISOString(),
    };
    actions.saveDecision(next);
    void runComparison(next);
  }

  /** Builds (or reuses) the plan for the chosen path, then opens it. */
  async function onContinue() {
    if (!decision || !selectedPath) return;
    const samePlan = plan && plan.decisionId === decision.id && plan.pathId === selectedPath;
    if (samePlan) return router.push("/plan");
    if (plan && plan.tasks.some((x) => x.done) && !window.confirm(T.result.rebuildConfirm)) return;
    setContinuing(true);
    try {
      const next = await api.generatePlan({ profile, decision, pathId: selectedPath });
      actions.setPlan(next);
      router.push("/plan");
    } catch {
      setStatus({ kind: "error" });
      setContinuing(false);
    }
  }

  const errorCount = Object.keys(errors).length;
  const showResult = !editing && hasResult && decision && comparison;
  const stage: 0 | 1 | 2 = showResult ? (selectedPath ? 2 : 1) : 0;
  const planMatches = plan && decision && plan.decisionId === decision.id && plan.pathId === selectedPath;

  return (
    <div className="grid gap-8">
      <PageHeader
        eyebrow={T.eyebrow}
        title={T.title}
        lead={T.lead}
      />
      <div className="-mt-3 flex flex-col gap-3 border-y border-line py-3 md:flex-row md:items-center md:justify-between">
        <LabStages stage={stage} />
        {api.mode === "demo" && <Tag tone="future">{t.demo.modeNote}</Tag>}
      </div>

      {status.kind === "error" && (
        <div role="alert" className="flex flex-col gap-3 rounded-panel border border-risk/40 bg-risk/5 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-3">
            <Alert className="mt-1 shrink-0 text-risk" />
            <div>
              <p className="font-medium text-ink">{T.errorTitle}</p>
              <p className="text-[14px] text-ink-2">{T.errorText}</p>
            </div>
          </div>
          {decision && (
            <Button onClick={() => runComparison(decision)} icon={<Reset size={14} />}>
              {t.common.retry}
            </Button>
          )}
        </div>
      )}

      {showResult ? (
        <div ref={resultRef} tabIndex={-1} className="focus:outline-none">
          <ComparisonView
            decision={decision}
            comparison={comparison}
            profile={profile}
            chosen={selectedPath}
            onChoose={(id) => actions.selectPath(id)}
            onEdit={() => {
              setDraft(draftFrom(decision));
              setEditing(true);
            }}
            onContinue={onContinue}
            continuing={continuing}
            planNote={planMatches ? T.result.planExists : undefined}
          />
        </div>
      ) : (
        <form ref={formRef} onSubmit={onSubmit} noValidate className="grid gap-6" aria-busy={status.kind === "loading"}>
          <p className="eyebrow">{T.inputsLabel}</p>
          <div className="-mt-3 flex flex-col gap-4 rounded-panel border border-line bg-surface p-5 md:p-6">
            <Field
              label={T.question}
              error={errors.question}
              counter={{ value: draft.question.trim().length, max: LIMITS.questionMax }}
            >
              {(f) => (
                <TextArea
                  id={f.id}
                  aria-describedby={f.describedBy}
                  invalid={f.invalid}
                  rows={2}
                  className="min-h-0 resize-none font-serif text-[18px]"
                  value={draft.question}
                  placeholder={T.questionPlaceholder}
                  onChange={(e) => setDraft((d) => ({ ...d, question: e.target.value }))}
                />
              )}
            </Field>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-[12.5px] text-ink-2">{T.templates}</span>
              {labTemplates(getActiveLocale()).map((tpl) => (
                <button
                  key={tpl.id}
                  type="button"
                  onClick={() => {
                    setDraft(templateDraft(tpl));
                    setErrors({});
                  }}
                  className="rounded-full border border-dashed border-line-strong px-2.5 py-1 text-[12.5px] text-ink-2 transition-colors hover:border-ink-3 hover:text-ink"
                >
                  {tpl.label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2 border-t border-line pt-3">
              <Button size="sm" variant="ghost" onClick={() => setDraft(exampleDraft())}>
                {T.loadExample}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setDraft({ question: "", A: emptyScenario(), B: emptyScenario() });
                  setErrors({});
                }}
              >
                {T.clear}
              </Button>
            </div>
          </div>

          {/* Mobile: one path at a time; desktop: side by side */}
          <div className="grid grid-cols-2 gap-1 rounded-control border border-line bg-surface p-1 md:hidden">
            {PATH_IDS.map((id) => {
              const hasErr = Object.keys(errors).some((k) => k.startsWith(`${id}.`));
              return (
                <button
                  key={id}
                  type="button"
                  aria-pressed={mobileTab === id}
                  onClick={() => setMobileTab(id)}
                  className={cn(
                    "flex h-9 items-center justify-center gap-2 rounded-[7px] text-sm",
                    mobileTab === id ? "bg-surface-3 text-ink" : "text-ink-3",
                  )}
                >
                  <span className={cn("size-1.5 rounded-full", id === "A" ? "bg-path-a" : "bg-path-b")} />
                  {T.pathLabel(id)}
                  {hasErr && <span className="size-1.5 rounded-full bg-risk" aria-label={T.fixErrors} />}
                </button>
              );
            })}
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            {PATH_IDS.map((id) => (
              <div key={id} id={`path-form-${id}`} className={cn(mobileTab !== id && "hidden md:block")}>
                <ScenarioForm
                  id={id}
                  value={draft[id]}
                  onChange={(v) => setDraft((d) => ({ ...d, [id]: v }))}
                  errors={errors}
                  availableHours={profile.hoursPerWeek}
                />
              </div>
            ))}
          </div>

          <div className="sticky bottom-[72px] z-20 flex flex-col gap-3 rounded-panel border border-line-strong bg-surface-2/95 p-4 backdrop-blur sm:flex-row sm:items-center sm:justify-between lg:bottom-4">
            <p className="text-[13px] text-ink-3" aria-live="polite">
              {errorCount > 0 ? <span className="text-risk">{T.fixErrors}</span> : t.lab.result.disclaimer}
            </p>
            <div className="flex shrink-0 gap-2">
              {hasResult && (
                <Button variant="ghost" onClick={() => setEditing(false)}>
                  {t.common.cancel}
                </Button>
              )}
              <Button
                type="submit"
                variant="primary"
                size="lg"
                disabled={status.kind === "loading"}
                iconRight={<ArrowRight />}
              >
                {status.kind === "loading" ? T.comparing : T.compare}
              </Button>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}
