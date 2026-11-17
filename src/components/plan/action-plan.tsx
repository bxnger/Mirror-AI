"use client";

import { useState, type FormEvent } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { ArrowRight, Check, Close, IconBranch, Plus } from "@/components/ui/icons";
import { Meter, PageHeader, Tag } from "@/components/ui/surface";
import { currentWeek, summarize, weekRange } from "@/domain/plan";
import type { Plan, PlanTask, Priority, Profile } from "@/domain/types";
import { checkText } from "@/domain/validation";
import { formatDate, formatNumber, t } from "@/i18n";
import { ApiErrorNotice } from "@/components/layout/profile-gate";
import { commands } from "@/lib/store/commands";
import { useCommand } from "@/lib/store/use-command";
import { cn } from "@/lib/cn";
import { createId } from "@/lib/id";
import { actions, type MirrorState } from "@/lib/store/use-mirror";

const T = t.plan;
const L = t.labels;
const PRIORITY_TONE = { high: "risk", medium: "warn", low: "neutral" } as const;

function TaskRow({ task, onToggle, busy }: { task: PlanTask; onToggle: (id: string) => void; busy: boolean }) {
  const title = task.source === "system" ? T.review : task.title;
  const disabled = busy || Boolean(task.locked);
  return (
    <li className="group flex items-start gap-3 px-4 py-3 md:px-5">
      <label className={cn("flex min-w-0 flex-1 items-start gap-3", disabled ? "cursor-default" : "cursor-pointer")}>
        <input
          type="checkbox"
          checked={task.done}
          disabled={disabled}
          onChange={() => onToggle(task.id)}
          className="peer sr-only"
        />
        <span
          aria-hidden="true"
          className={cn(
            "mt-0.5 grid size-[18px] shrink-0 place-items-center rounded-[5px] border transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-path-a/60",
            task.done ? "border-done bg-done text-bg" : "border-line-strong group-hover:border-ink-3",
          )}
        >
          {task.done && <Check size={12} strokeWidth={2.4} />}
        </span>
        <span className="min-w-0">
          <span className={cn("block text-[14.5px] leading-snug break-words", task.done ? "text-ink-3 line-through" : "text-ink")}>
            {title}
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-1.5">
            {task.dayOfWeek !== undefined && (
              <span className="font-mono text-[11px] text-ink-2">{t.remote.days[task.dayOfWeek]}</span>
            )}
            <Tag tone={PRIORITY_TONE[task.priority]}>{L.priority[task.priority]}</Tag>
            <span className="tabular font-mono text-[11px] text-ink-3">
              {formatNumber(task.estimateHours)} {t.common.hoursShort}
            </span>
          </span>
        </span>
      </label>
      {task.source === "user" && (
        <button
          type="button"
          onClick={() => actions.removeTask(task.id)}
          aria-label={T.removeTask(title)}
          className="grid size-8 shrink-0 place-items-center rounded-md text-ink-3 hover:bg-surface-2 hover:text-ink"
        >
          <Close size={14} />
        </button>
      )}
    </li>
  );
}

function AddTask({ week }: { week: number }) {
  const [title, setTitle] = useState("");
  const [hours, setHours] = useState(1);
  const [priority, setPriority] = useState<Priority>("medium");
  const [error, setError] = useState<string | null>(null);

  function submit(e: FormEvent) {
    e.preventDefault();
    const err = checkText(title, 2, 140);
    if (err) return setError(t.errors[err]);
    actions.addTask({
      id: createId(),
      title: title.trim(),
      week,
      priority,
      estimateHours: hours,
      done: false,
      doneAt: null,
      source: "user",
    });
    setTitle("");
    setError(null);
  }

  const id = `add-${week}`;
  return (
    <form onSubmit={submit} noValidate className="border-t border-line px-4 py-3 md:px-5">
      <div className="flex flex-col gap-2 sm:flex-row">
        <label htmlFor={id} className="sr-only">
          {T.taskTitle}
        </label>
        <input
          id={id}
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            if (error) setError(null);
          }}
          placeholder={T.taskPlaceholder}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-err` : undefined}
          className="h-9 w-full min-w-0 shrink-0 rounded-[8px] sm:w-auto sm:flex-1 border border-line bg-bg px-3 text-[14px] text-ink placeholder:text-ink-3 focus:border-path-a/70 focus:outline-none"
        />
        <div className="flex gap-2">
          <select
            aria-label={T.taskHours}
            value={hours}
            onChange={(e) => setHours(Number(e.target.value))}
            className="h-9 rounded-[8px] border border-line bg-bg px-2 text-[13px] text-ink-2"
          >
            {[0.5, 1, 1.5, 2, 3, 4, 6].map((h) => (
              <option key={h} value={h}>
                {formatNumber(h)} {t.common.hoursShort}
              </option>
            ))}
          </select>
          <select
            aria-label={T.taskPriority}
            value={priority}
            onChange={(e) => setPriority(e.target.value as Priority)}
            className="h-9 rounded-[8px] border border-line bg-bg px-2 text-[13px] text-ink-2"
          >
            {(["high", "medium", "low"] as Priority[]).map((p) => (
              <option key={p} value={p}>
                {L.priority[p]}
              </option>
            ))}
          </select>
          <Button type="submit" size="sm" className="h-9" icon={<Plus size={14} />}>
            {t.common.add}
          </Button>
        </div>
      </div>
      {error && (
        <p id={`${id}-err`} className="mt-1.5 text-[13px] text-risk">
          {error}
        </p>
      )}
    </form>
  );
}

function PlanView({ plan, state }: { plan: Plan; state: MirrorState }) {
  const path = state.decision?.paths[plan.pathId];
  const cmd = useCommand();
  const remote = state.remote;
  const toggle = (id: string) => void cmd.run(() => commands.toggleTask(id));
  const total = summarize(plan.tasks);
  const now = currentWeek(plan);
  const weeks = Array.from({ length: plan.weeks }, (_, i) => i + 1);
  const color = plan.pathId === "A" ? "bg-path-a" : "bg-path-b";

  return (
    <div className="grid gap-6 md:gap-8">
      <PageHeader
        eyebrow={T.eyebrow}
        title={T.title}
        lead={
          <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className={cn("size-2 rounded-full", color)} aria-hidden="true" />
            {T.lead(path?.title ?? t.lab.pathLabel(plan.pathId))}
            <span className="text-ink-3">· {T.budget(plan.weeklyBudgetHours)}</span>
          </span>
        }
        actions={
          <ButtonLink href="/lab" variant="secondary" icon={<IconBranch />}>
            {t.nav.lab}
          </ButtonLink>
        }
      />

      <section aria-label={T.progress} className="rounded-panel border border-line bg-surface px-5 py-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="eyebrow">{T.progress}</p>
            <p className="tabular mt-1 font-serif text-[34px] leading-none">
              {Math.round(total.ratio * 100)}
              <span className="text-[18px] text-ink-3">%</span>
            </p>
          </div>
          <p className="tabular text-right text-[13px] text-ink-3">
            {t.twin.progressOf(total.done, total.total)}
            <br />
            {t.twin.progressHours(formatNumber(total.doneHours), formatNumber(total.plannedHours))}
          </p>
        </div>
        <Meter className="mt-3" value={total.done} max={total.total} label={t.twin.progressOf(total.done, total.total)} tone="done" />
        <p className="mt-2 text-[12px] text-ink-3">{T.saved}</p>
      </section>

      {cmd.error !== null && <ApiErrorNotice error={cmd.error} />}
      {remote && <p className="-mt-2 text-[13px] text-ink-3">{t.remote.tasksByServer}</p>}

      <ol className="grid gap-5">
        {weeks.map((w) => {
          const tasks = plan.tasks.filter((x) => x.week === w);
          const s = summarize(tasks);
          const { start, end } = weekRange(plan.startDate, w);
          const over = s.plannedHours > plan.weeklyBudgetHours;
          return (
            <li key={w} className={cn("rounded-panel border bg-surface/70", w === now ? "border-line-strong" : "border-line")}>
              <header className="flex flex-wrap items-center justify-between gap-2 px-4 pb-2 pt-4 md:px-5">
                <div className="flex items-center gap-2.5">
                  <h2 className="text-[15px] font-semibold text-ink">{T.week(w)}</h2>
                  <span className="font-mono text-[11.5px] text-ink-3">
                    {formatDate(start, { day: "numeric", month: "short" })} – {formatDate(end, { day: "numeric", month: "short" })}
                  </span>
                  {w === now && <Tag tone="a">{T.current}</Tag>}
                </div>
                <span className={cn("tabular font-mono text-[11.5px]", over ? "text-warn" : "text-ink-3")}>
                  {over
                    ? T.overBudget(formatNumber(s.plannedHours), plan.weeklyBudgetHours)
                    : `${s.done}/${s.total} · ${formatNumber(s.plannedHours)} ${t.common.hoursShort}`}
                </span>
              </header>
              <ul className="divide-y divide-line">
                {tasks.map((task) => (
                  <TaskRow key={task.id} task={task} onToggle={toggle} busy={cmd.pending} />
                ))}
              </ul>
              {remote ? (
                tasks.some((x) => x.locked) && <p className="border-t border-line px-4 py-2.5 text-[12.5px] text-ink-3 md:px-5">{t.remote.weekLocked}</p>
              ) : (
                <AddTask week={w} />
              )}
            </li>
          );
        })}
      </ol>
      <NextWeek state={state} />
    </div>
  );
}

/** Remote: after Reality Check of the latest week, the server builds the next one. */
export function NextWeek({ state }: { state: MirrorState }) {
  const cmd = useCommand();
  if (!state.remote?.latestPlanReviewed) return null;
  return (
    <div className="flex flex-col gap-2 rounded-panel border border-dashed border-line-strong px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-[13.5px] text-ink-2">{t.remote.nextWeekHint}</p>
      <Button variant="primary" disabled={cmd.pending} onClick={() => void cmd.run(() => commands.nextWeek())} iconRight={<ArrowRight />}>
        {cmd.pending ? t.common.loading : t.remote.nextWeek}
      </Button>
      {cmd.error !== null && <ApiErrorNotice error={cmd.error} />}
    </div>
  );
}

export function ActionPlan({ state }: { state: MirrorState & { profile: Profile } }) {
  const cmd = useCommand();
  const { plan, decision, selectedPath, profile } = state;

  if (plan) return <PlanView plan={plan} state={state} />;

  function create() {
    if (!decision || !selectedPath) return;
    void cmd.run(() => commands.createPlan({ profile, decision, pathId: selectedPath }));
  }

  const ready = Boolean(decision && selectedPath);
  return (
    <div className="grid gap-8">
      <PageHeader eyebrow={T.eyebrow} title={T.emptyTitle} lead={ready ? t.twin.nextChosen : T.emptyText} />
      <div className="flex flex-col items-start gap-3 rounded-panel border border-dashed border-line-strong px-5 py-6">
        {ready ? (
          <Button variant="primary" onClick={create} disabled={cmd.pending} iconRight={<ArrowRight />}>
            {cmd.pending ? t.common.loading : t.lab.result.toPlan}
          </Button>
        ) : (
          <ButtonLink href="/lab" variant="primary" iconRight={<ArrowRight />}>
            {T.toLab}
          </ButtonLink>
        )}
        {cmd.error !== null && <ApiErrorNotice error={cmd.error} />}
      </div>
    </div>
  );
}
