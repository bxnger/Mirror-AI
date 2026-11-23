"use client";

import { useId, useState, type FormEvent } from "react";
import { ApiErrorNotice } from "@/components/layout/profile-gate";
import { Button } from "@/components/ui/button";
import type { PlanTask } from "@/domain/types";
import { t } from "@/i18n";
import type { TaskStatus } from "@/lib/remote/session";
import { commands } from "@/lib/store/commands";
import { useCommand } from "@/lib/store/use-command";
import { cn } from "@/lib/cn";

const STATUSES: TaskStatus[] = ["pending", "done", "partial", "skipped"];

/**
 * Remote-mode task status (PATCH /tasks/{id}, contract §10).
 *  done    → backend sets actual = planned (never sends 0)
 *  partial → requires 1 … planned−1 minutes, validated before sending
 *  skipped / pending → 0 minutes (nothing sent)
 * Locked after Reality Check (backend returns 409 otherwise).
 */
export function TaskStatusControl({ task, title }: { task: PlanTask; title: string }) {
  const S = t.taskStatus;
  const cmd = useCommand();
  const id = useId();
  const planned = task.plannedMinutes ?? Math.round(task.estimateHours * 60);
  const saved = task.status ?? (task.done ? "done" : "pending");
  const [draft, setDraft] = useState<TaskStatus | null>(null);
  const [minutes, setMinutes] = useState(String(task.status === "partial" ? (task.actualMinutes ?? "") : ""));
  const status = draft ?? saved;
  const maxPartial = planned - 1;
  const partialPossible = maxPartial >= 1;
  const parsed = /^\d{1,4}$/.test(minutes.trim()) ? Number(minutes.trim()) : Number.NaN;
  const partialValid = Number.isInteger(parsed) && parsed >= 1 && parsed <= maxPartial;
  const locked = Boolean(task.locked);

  function choose(next: TaskStatus) {
    if (next === "partial") {
      setDraft("partial"); // needs minutes before saving
      return;
    }
    setDraft(null);
    void cmd.run(() => commands.setTaskStatus(task.id, next));
  }

  function savePartial(e: FormEvent) {
    e.preventDefault();
    if (!partialValid || cmd.pending) return;
    void cmd.run(async () => {
      await commands.setTaskStatus(task.id, "partial", parsed);
      setDraft(null);
    });
  }

  return (
    <div className="grid gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={id} className="sr-only">
          {S.label(title)}
        </label>
        <select
          id={id}
          value={status}
          disabled={locked || cmd.pending}
          onChange={(e) => choose(e.target.value as TaskStatus)}
          className={cn(
            "h-8 rounded-[8px] border bg-surface px-2 text-[12.5px] text-ink disabled:opacity-60",
            status === "done" ? "border-done/60" : status === "partial" ? "border-path-b/60" : "border-line",
          )}
        >
          {STATUSES.filter((s) => s !== "partial" || partialPossible).map((s) => (
            <option key={s} value={s}>
              {S[s]}
            </option>
          ))}
        </select>
        {saved === "partial" && draft === null && task.actualMinutes !== undefined && (
          <span className="tabular font-mono text-[11.5px] text-ink-2">{S.actualOf(task.actualMinutes, planned)}</span>
        )}
        {cmd.pending && <span className="text-[11.5px] text-ink-3">{t.common.loading}</span>}
      </div>
      {draft === "partial" && !locked && (
        <form onSubmit={savePartial} noValidate className="flex flex-wrap items-end gap-2">
          <div>
            <label htmlFor={`${id}-min`} className="block text-[11.5px] text-ink-2">
              {S.minutesLabel}
            </label>
            <input
              id={`${id}-min`}
              inputMode="numeric"
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
              aria-invalid={minutes !== "" && !partialValid ? true : undefined}
              aria-describedby={`${id}-hint`}
              className={cn(
                "tabular mt-0.5 h-8 w-20 rounded-[8px] border bg-surface px-2 font-mono text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-path-a/30",
                minutes !== "" && !partialValid ? "border-risk/60" : "border-line",
              )}
            />
          </div>
          <Button type="submit" size="sm" variant="primary" disabled={!partialValid || cmd.pending}>
            {S.save}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setDraft(null)}>
            {t.common.cancel}
          </Button>
          <p id={`${id}-hint`} className={cn("w-full text-[11.5px]", minutes !== "" && !partialValid ? "text-risk" : "text-ink-3")}>
            {S.partialHint(maxPartial)}
          </p>
        </form>
      )}
      {cmd.error !== null && <ApiErrorNotice error={cmd.error} />}
    </div>
  );
}
