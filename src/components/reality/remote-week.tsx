"use client";

import { useState, type FormEvent } from "react";
import { ApiErrorNotice } from "@/components/layout/profile-gate";
import { Button } from "@/components/ui/button";
import { Check } from "@/components/ui/icons";
import { TextArea } from "@/components/ui/form";
import { Tag } from "@/components/ui/surface";
import { weekTasks } from "@/domain/reality";
import type { CheckIn, CheckInKind, Plan } from "@/domain/types";
import { formatNumber, t } from "@/i18n";
import { cn } from "@/lib/cn";
import type { RemoteMeta } from "@/lib/remote/types";
import { commands } from "@/lib/store/commands";
import { useCommand } from "@/lib/store/use-command";

const NOTE_MAX = 300;

/**
 * Remote-mode week: the backend computes actual hours from task statuses, so the user
 * ticks tasks, adds context and submits. A submitted check-in is read-only (backend has
 * no edit endpoint); its review and adaptation proposals appear below.
 */
export function RemoteWeek({
  plan,
  week,
  existing,
  remote,
}: {
  plan: Plan;
  week: number;
  existing: CheckIn | null;
  remote: RemoteMeta;
}) {
  const R = t.reality;
  const RR = t.remote.reality;
  const live = weekTasks(plan, week);
  const isLatest = week === remote.planIds.length;
  const doneHours = live.tasks.filter((x) => x.done).reduce((s, x) => s + x.estimateHours, 0);
  const [kind, setKind] = useState<CheckInKind | null>(null);
  const [note, setNote] = useState("");
  const [difficulty, setDifficulty] = useState<number | null>(null);
  const submit = useCommand();
  const toggle = useCommand();

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (note.trim().length > NOTE_MAX) return;
    void submit.run(() =>
      commands.saveCheckIn(
        {
          id: "",
          planId: plan.id,
          week,
          plannedHours: live.plannedHours,
          actualHours: doneHours,
          tasksDone: live.done,
          tasksTotal: live.total,
          kind,
          note,
          createdAt: "",
          updatedAt: "",
        },
        { difficulty },
      ),
    );
  }

  const tasksList = (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="text-[13px] font-medium text-ink-2">{R.tasks}</h3>
        <span className="tabular font-mono text-[11.5px] text-ink-3">{R.tasksDone(live.done, live.total)}</span>
      </div>
      <ul className="divide-y divide-line rounded-[12px] border border-line">
        {live.tasks.map((task) => {
          const disabled = Boolean(task.locked) || toggle.pending;
          return (
            <li key={task.id}>
              <label className={cn("flex items-start gap-3 px-4 py-2.5", disabled ? "cursor-default" : "cursor-pointer")}>
                <input
                  type="checkbox"
                  checked={task.done}
                  disabled={disabled}
                  onChange={() => void toggle.run(() => commands.toggleTask(task.id))}
                  className="peer sr-only"
                />
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
                  {task.dayOfWeek !== undefined && <span className="mr-1.5 font-mono text-[11px] text-ink-2 no-underline">{t.remote.days[task.dayOfWeek]}</span>}
                  {task.title}
                </span>
                <span className="tabular shrink-0 font-mono text-[11px] text-ink-3">
                  {formatNumber(task.estimateHours)} {t.common.hoursShort}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      {toggle.error !== null && (
        <div className="mt-2">
          <ApiErrorNotice error={toggle.error} />
        </div>
      )}
    </div>
  );

  if (existing) {
    return (
      <div className="grid gap-5">
        <div className="grid gap-5 lg:grid-cols-2 lg:gap-8">
          <div className="grid content-start gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-[12px] border border-dashed border-line-strong px-4 py-3">
                <p className="eyebrow">{R.planned}</p>
                <p className="tabular mt-1 font-serif text-[28px] leading-none text-ink">{formatNumber(existing.plannedHours)}</p>
              </div>
              <div className="rounded-[12px] border border-line px-4 py-3">
                <p className="eyebrow">{RR.actualFromTasks}</p>
                <p className="tabular mt-1 font-serif text-[28px] leading-none text-ink">{formatNumber(existing.actualHours)}</p>
              </div>
            </div>
            {existing.kind && <Tag className="self-start">{R.kinds[existing.kind]}</Tag>}
            {existing.note && <p className="text-[14px] text-ink-2 break-words">{existing.note}</p>}
            <p className="text-[12.5px] text-ink-3">{RR.readOnly}</p>
          </div>
          {tasksList}
        </div>
        <WeekReviewPanel remote={remote} week={week} />
      </div>
    );
  }

  if (!isLatest) return <p className="text-[14px] text-ink-3">{RR.notLatest}</p>;

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-5 lg:grid-cols-2 lg:gap-8">
      <div className="grid content-start gap-5">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-[12px] border border-dashed border-line-strong px-4 py-3">
            <p className="eyebrow">{R.planned}</p>
            <p className="tabular mt-1 font-serif text-[28px] leading-none text-ink">{formatNumber(live.plannedHours)}</p>
          </div>
          <div className="rounded-[12px] border border-line px-4 py-3" aria-live="polite">
            <p className="eyebrow">{RR.actualFromTasks}</p>
            <p className="tabular mt-1 font-serif text-[28px] leading-none text-ink">{formatNumber(doneHours)}</p>
          </div>
        </div>
        <p className="-mt-2 text-[12.5px] text-ink-3">{RR.actualHint}</p>

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
                onClick={() => setKind(kind === k ? null : k)}
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

        <fieldset>
          <legend className="mb-2 text-[13px] font-medium text-ink-2">
            {RR.difficulty} <span className="font-normal text-ink-3">· {t.common.optional}</span>
          </legend>
          <div className="flex flex-wrap gap-1.5">
            {RR.difficultyScale.map((label, i) => (
              <button
                key={label}
                type="button"
                aria-pressed={difficulty === i + 1}
                onClick={() => setDifficulty(difficulty === i + 1 ? null : i + 1)}
                className={cn(
                  "rounded-[8px] border px-2.5 py-1 text-[12.5px] transition-colors",
                  difficulty === i + 1 ? "border-ink/60 bg-surface-3 text-ink" : "border-line text-ink-2 hover:border-line-strong",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </fieldset>

        <div>
          <div className="mb-1.5 flex items-baseline justify-between">
            <label htmlFor={`rnote-${week}`} className="text-[13px] font-medium text-ink-2">
              {R.note} <span className="font-normal text-ink-3">· {t.common.optional}</span>
            </label>
            <span className={cn("tabular font-mono text-[11px]", note.trim().length > NOTE_MAX ? "text-risk" : "text-ink-3")}>
              {note.trim().length}/{NOTE_MAX}
            </span>
          </div>
          <TextArea
            id={`rnote-${week}`}
            rows={3}
            invalid={note.trim().length > NOTE_MAX}
            value={note}
            placeholder={R.notePlaceholder}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" variant="primary" disabled={submit.pending || note.trim().length > NOTE_MAX}>
            {submit.pending ? t.common.loading : RR.submit}
          </Button>
        </div>
        {submit.error !== null && <ApiErrorNotice error={submit.error} />}
      </div>
      {tasksList}
    </form>
  );
}

/** Backend review of a week + adaptation proposals that need the user's confirmation. */
function WeekReviewPanel({ remote, week }: { remote: RemoteMeta; week: number }) {
  const RR = t.remote.reality;
  const review = remote.reviews[week];
  const proposals = remote.proposals.filter((p) => p.week === week);
  const cmd = useCommand();
  if (!review) return null;
  const list = (title: string, items: string[]) =>
    items.length > 0 && (
      <div>
        <h4 className="text-[12.5px] font-medium text-ink-2">{title}</h4>
        <ul className="mt-1 grid gap-1">
          {items.map((x) => (
            <li key={x} className="text-[13.5px] leading-snug text-ink-2 break-words">
              {x}
            </li>
          ))}
        </ul>
      </div>
    );
  return (
    <section aria-labelledby={`review-${week}`} className="grid gap-4 rounded-[12px] border border-line px-4 py-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={`review-${week}`} className="text-[14px] font-semibold text-ink">
          {RR.review} · {RR.completion(Math.round(review.completionRate * 100))}
        </h3>
        <Tag tone={review.commentarySource === "llm" ? "a" : "neutral"}>
          {review.commentarySource === "llm" ? RR.sourceLlm : RR.sourceTemplate}
        </Tag>
      </div>
      {review.summary && <p className="text-[14px] text-ink">{review.summary}</p>}
      <div className="grid gap-4 md:grid-cols-2">
        {list(RR.insights, review.insights)}
        {list(RR.whatWorked, review.whatWorked)}
        {list(RR.obstacles, review.obstacles)}
        {list(RR.nextFocus, review.nextFocus)}
        {list(RR.questions, review.questions)}
      </div>

      {proposals.length > 0 && (
        <div className="border-t border-line pt-3">
          <h4 className="text-[13px] font-semibold text-ink">{RR.proposals}</h4>
          <p className="text-[12.5px] text-ink-3">{RR.proposalsNote}</p>
          <ul className="mt-2 grid gap-2">
            {proposals.map((p) => (
              <li key={p.id} className="rounded-[10px] border border-dashed border-future/50 px-3 py-2.5">
                {p.title && p.fromHours !== null && p.toHours !== null && (
                  <p className="font-mono text-[12.5px] text-future">
                    {RR.allocation(p.title, formatNumber(p.fromHours), formatNumber(p.toHours))}
                  </p>
                )}
                <p className="mt-1 text-[13px] leading-snug text-ink-2 break-words">{p.reason}</p>
                {p.status === "pending" ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button size="sm" variant="primary" disabled={cmd.pending} onClick={() => void cmd.run(() => commands.resolveProposal(p.id, true))}>
                      {RR.accept}
                    </Button>
                    <Button size="sm" variant="ghost" disabled={cmd.pending} onClick={() => void cmd.run(() => commands.resolveProposal(p.id, false))}>
                      {RR.reject}
                    </Button>
                  </div>
                ) : (
                  <Tag className="mt-2" tone={p.status === "accepted" ? "done" : "neutral"}>
                    {RR.status[p.status] ?? p.status}
                  </Tag>
                )}
              </li>
            ))}
          </ul>
          {cmd.error !== null && (
            <div className="mt-2">
              <ApiErrorNotice error={cmd.error} />
            </div>
          )}
        </div>
      )}
    </section>
  );
}
