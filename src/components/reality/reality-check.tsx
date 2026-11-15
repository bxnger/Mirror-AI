"use client";

import { useRef, useState, type FormEvent } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { ArrowRight, Check, Pencil } from "@/components/ui/icons";
import { ErrorText, TextArea } from "@/components/ui/form";
import { PageHeader, Tag } from "@/components/ui/surface";
import { currentWeek, weekRange } from "@/domain/plan";
import { checkInsFor, weekTasks } from "@/domain/reality";
import type { CheckIn, CheckInKind, Plan, Profile } from "@/domain/types";
import type { ErrorCode } from "@/domain/validation";
import { formatDate, formatNumber, t } from "@/i18n";
import { cn } from "@/lib/cn";
import { createId } from "@/lib/id";
import { actions, type MirrorState } from "@/lib/store/use-mirror";
import { PlanVsReality } from "./plan-vs-reality";
import { UpdatedScenario } from "./updated-scenario";

export const ACTUAL_MAX = 80;
const NOTE_MAX = 300;

/** Accepts "2,5" or "2.5"; returns NaN for anything else. */
export function parseHours(raw: string): number {
  const v = raw.trim().replace(",", ".");
  if (!/^\d{1,2}(\.\d)?$/.test(v)) return Number.NaN;
  return Number(v);
}

function validate(raw: string, note: string): { actual?: ErrorCode; note?: ErrorCode } {
  const e: { actual?: ErrorCode; note?: ErrorCode } = {};
  if (!raw.trim()) e.actual = "required";
  else {
    const n = parseHours(raw);
    if (!Number.isFinite(n) || n < 0 || n > ACTUAL_MAX) e.actual = "range";
  }
  if (note.trim().length > NOTE_MAX) e.note = "too_long";
  return e;
}

function CheckInForm({ plan, week, existing }: { plan: Plan; week: number; existing: CheckIn | null }) {
  const R = t.reality;
  const live = weekTasks(plan, week);
  const [raw, setRaw] = useState(existing ? String(existing.actualHours).replace(".", ",") : "");
  const [kind, setKind] = useState<CheckInKind | null>(existing?.kind ?? null);
  const [note, setNote] = useState(existing?.note ?? "");
  const [errors, setErrors] = useState<{ actual?: ErrorCode; note?: ErrorCode }>({});
  const [saved, setSaved] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function submit(e: FormEvent) {
    e.preventDefault();
    const errs = validate(raw, note);
    setErrors(errs);
    if (errs.actual) {
      inputRef.current?.focus();
      return;
    }
    if (errs.note) return;
    const now = new Date().toISOString();
    actions.saveCheckIn({
      id: existing?.id ?? createId(),
      planId: plan.id,
      week,
      plannedHours: live.plannedHours,
      actualHours: parseHours(raw),
      tasksDone: live.done,
      tasksTotal: live.total,
      kind,
      note: note.trim(),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    });
    setSaved(true);
  }

  return (
    <form onSubmit={submit} noValidate className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-8">
      <div className="grid content-start gap-5">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-[12px] border border-dashed border-line-strong px-4 py-3">
            <p className="eyebrow">{R.planned}</p>
            <p className="tabular mt-1 font-serif text-[28px] leading-none text-ink">
              {formatNumber(live.plannedHours)}
              <span className="ml-1 font-sans text-[14px] text-ink-3">{t.common.hoursShort}</span>
            </p>
          </div>
          <div>
            <label htmlFor={`actual-${week}`} className="eyebrow block">
              {R.actual}
            </label>
            <input
              ref={inputRef}
              id={`actual-${week}`}
              inputMode="decimal"
              autoComplete="off"
              value={raw}
              onChange={(e) => {
                setRaw(e.target.value);
                setSaved(false);
                if (errors.actual) setErrors((x) => ({ ...x, actual: undefined }));
              }}
              aria-invalid={errors.actual ? true : undefined}
              aria-describedby={errors.actual ? `actual-err-${week}` : `actual-hint-${week}`}
              placeholder="0"
              className={cn(
                "tabular mt-1 h-[52px] w-full rounded-[12px] border bg-surface px-4 font-serif text-[28px] text-ink placeholder:text-ink-3 focus:border-path-a/70 focus:outline-none focus:ring-2 focus:ring-path-a/20",
                errors.actual ? "border-risk/60" : "border-line",
              )}
            />
            {!errors.actual && (
              <p id={`actual-hint-${week}`} className="mt-1 text-[12px] text-ink-3">
                {R.actualHint}
              </p>
            )}
            <ErrorText id={`actual-err-${week}`} code={errors.actual} />
          </div>
        </div>

        <fieldset>
          <legend className="mb-2 text-[13px] font-medium text-ink-2">
            {R.kind} <span className="font-normal text-ink-3">· {t.common.optional}</span>
          </legend>
          <div className="flex flex-wrap gap-2">
            {(["obstacle", "observation", "change"] as const).map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={kind === k}
                onClick={() => {
                  setKind(kind === k ? null : k);
                  setSaved(false);
                }}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-[13px] transition-colors",
                  kind === k ? "border-ink/60 bg-surface-3 text-ink" : "border-line text-ink-2 hover:border-line-strong",
                )}
              >
                {R.kinds[k]}
              </button>
            ))}
          </div>
        </fieldset>

        <div>
          <div className="mb-1.5 flex items-baseline justify-between">
            <label htmlFor={`note-${week}`} className="text-[13px] font-medium text-ink-2">
              {R.note} <span className="font-normal text-ink-3">· {t.common.optional}</span>
            </label>
            <span className={cn("tabular font-mono text-[11px]", note.trim().length > NOTE_MAX ? "text-risk" : "text-ink-3")}>
              {note.trim().length}/{NOTE_MAX}
            </span>
          </div>
          <TextArea
            id={`note-${week}`}
            invalid={Boolean(errors.note)}
            aria-describedby={errors.note ? `note-err-${week}` : undefined}
            rows={3}
            value={note}
            placeholder={R.notePlaceholder}
            onChange={(e) => {
              setNote(e.target.value);
              setSaved(false);
            }}
          />
          <ErrorText id={`note-err-${week}`} code={errors.note} />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" variant="primary" icon={saved ? <Check size={14} /> : undefined}>
            {existing ? R.update : R.save}
          </Button>
          {existing && (
            <Button
              variant="ghost"
              onClick={() => {
                if (window.confirm(R.deleteConfirm)) actions.deleteCheckIn(existing.id);
              }}
            >
              {R.delete}
            </Button>
          )}
          <p role="status" aria-live="polite" className="text-[13px] text-done">
            {saved ? R.saved : ""}
          </p>
        </div>
      </div>

      {/* Planned tasks of the week, toggleable (same state as the Plan page) */}
      <div>
        <div className="mb-2 flex items-baseline justify-between">
          <h3 className="text-[13px] font-medium text-ink-2">{R.tasks}</h3>
          <span className="tabular font-mono text-[11.5px] text-ink-3">{R.tasksDone(live.done, live.total)}</span>
        </div>
        {live.total === 0 ? (
          <p className="text-[14px] text-ink-3">{R.tasksEmpty}</p>
        ) : (
          <ul className="divide-y divide-line rounded-[12px] border border-line">
            {live.tasks.map((task) => (
              <li key={task.id}>
                <label className="flex cursor-pointer items-start gap-3 px-4 py-2.5">
                  <input type="checkbox" checked={task.done} onChange={() => actions.toggleTask(task.id)} className="peer sr-only" />
                  <span
                    aria-hidden="true"
                    className={cn(
                      "mt-0.5 grid size-[18px] shrink-0 place-items-center rounded-[5px] border peer-focus-visible:ring-2 peer-focus-visible:ring-path-a/60",
                      task.done ? "border-done bg-done text-bg" : "border-line-strong",
                    )}
                  >
                    {task.done && <Check size={12} strokeWidth={2.4} />}
                  </span>
                  <span className={cn("min-w-0 flex-1 text-[14px] leading-snug break-words", task.done ? "text-ink-3 line-through" : "text-ink")}>
                    {task.source === "system" ? t.plan.review : task.title}
                  </span>
                  <span className="tabular shrink-0 font-mono text-[11px] text-ink-3">
                    {formatNumber(task.estimateHours)} {t.common.hoursShort}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </div>
    </form>
  );
}

export function RealityCheck({ state }: { state: MirrorState & { profile: Profile } }) {
  const R = t.reality;
  const { plan, decision, profile, checkIns } = state;
  const nowWeek = plan ? currentWeek(plan) : 1;
  const mine = plan ? checkInsFor(plan, checkIns) : [];
  // Default: the earliest past week without a report, else the current week.
  const firstMissing = plan
    ? Array.from({ length: nowWeek }, (_, i) => i + 1).find((w) => !mine.some((c) => c.week === w))
    : undefined;
  const [week, setWeek] = useState(firstMissing ?? nowWeek);
  const formRef = useRef<HTMLDivElement>(null);

  if (!plan || !decision) {
    return (
      <div className="grid gap-8">
        <PageHeader eyebrow={R.eyebrow} title={R.noPlanTitle} lead={R.noPlanText} />
        <div className="rounded-panel border border-dashed border-line-strong px-5 py-6">
          <ButtonLink href={decision ? "/plan" : "/lab"} variant="primary" iconRight={<ArrowRight />}>
            {decision ? t.twin.openPlan : t.twin.openLab}
          </ButtonLink>
        </div>
      </div>
    );
  }

  const path = decision.paths[plan.pathId];
  const existing = mine.find((c) => c.week === week) ?? null;
  const range = weekRange(plan.startDate, week);

  return (
    <div className="grid gap-6 md:gap-8">
      <PageHeader eyebrow={R.eyebrow} title={R.title} lead={R.lead} />

      {/* Week picker */}
      <div role="group" aria-label={R.weekPicker} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {Array.from({ length: plan.weeks }, (_, i) => i + 1).map((w) => {
          const has = mine.some((c) => c.week === w);
          const r = weekRange(plan.startDate, w);
          return (
            <button
              key={w}
              type="button"
              aria-pressed={week === w}
              onClick={() => setWeek(w)}
              className={cn(
                "rounded-[12px] border px-3 py-2.5 text-left transition-colors",
                week === w ? "border-ink/70 bg-surface-2" : "border-line bg-surface hover:border-line-strong",
              )}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="text-[13.5px] font-medium text-ink">{R.week(w)}</span>
                <span
                  aria-hidden="true"
                  className={cn("size-2 rounded-full", has ? "bg-done" : "border border-dashed border-ink-3")}
                />
              </span>
              <span className="mt-0.5 block font-mono text-[10.5px] text-ink-3">
                {formatDate(r.start, { day: "numeric", month: "short" })} – {formatDate(r.end, { day: "numeric", month: "short" })}
              </span>
              <span className="mt-0.5 block text-[11.5px] text-ink-2">
                {has ? R.hasCheckIn : R.noCheckIn}
                {w === nowWeek ? ` · ${R.current}` : ""}
              </span>
            </button>
          );
        })}
      </div>

      <section ref={formRef} aria-labelledby="checkin-title" className="scroll-mt-20 rounded-panel border border-line bg-surface/70 px-5 py-5 md:px-6">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="checkin-title" className="text-[15px] font-semibold text-ink">
            {R.formTitle(week)}
          </h2>
          <span className="font-mono text-[11.5px] text-ink-3">
            {formatDate(range.start, { day: "numeric", month: "long" })} – {formatDate(range.end, { day: "numeric", month: "long" })}
          </span>
        </div>
        {/* Remount per week (not per save) so the "saved" confirmation stays visible. */}
        <CheckInForm key={week} plan={plan} week={week} existing={existing} />
      </section>

      <PlanVsReality plan={plan} checkIns={checkIns} />
      <UpdatedScenario plan={plan} path={path} checkIns={checkIns} profile={profile} />

      <section aria-labelledby="history-title">
        <h2 id="history-title" className="eyebrow mb-3">
          {R.history}
        </h2>
        {mine.length === 0 ? (
          <p className="text-[14px] text-ink-3">{R.historyEmpty}</p>
        ) : (
          <ul className="grid gap-2">
            {[...mine].reverse().map((c) => (
              <li key={c.id} className="flex flex-col gap-2 rounded-[12px] border border-line px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-[14px] text-ink">
                    {R.week(c.week)}
                    <span className="tabular font-mono text-[12px] text-ink-2">
                      {R.historyItem(formatNumber(c.actualHours), formatNumber(c.plannedHours))}
                    </span>
                    {c.kind && <Tag>{R.kinds[c.kind]}</Tag>}
                  </p>
                  {c.note && <p className="mt-1 text-[13px] text-ink-2 break-words">{c.note}</p>}
                  <p className="mt-1 font-mono text-[10.5px] text-ink-3">
                    {formatDate(c.updatedAt, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<Pencil size={13} />}
                  className="self-start"
                  onClick={() => {
                    setWeek(c.week);
                    requestAnimationFrame(() => {
                      formRef.current?.scrollIntoView({ block: "start" });
                      formRef.current?.querySelector<HTMLInputElement>("input")?.focus();
                    });
                  }}
                  aria-label={`${R.edit}: ${R.week(c.week)}`}
                >
                  {R.edit}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
