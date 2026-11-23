"use client";

import { Tag } from "@/components/ui/surface";
import { Alert, ArrowRight } from "@/components/ui/icons";
import type { RecoveryPreviewOut } from "@/lib/api/recovery";
import { formatMinutes, t } from "@/i18n";
import { cn } from "@/lib/cn";
import { BeforeAfter } from "./before-after";

const ACTION_TONE = { keep: "a", shorten: "b", defer: "neutral" } as const;

/** Resolves warning params: *_minutes → duration, task_ids → task titles from the same response. */
function warningParams(params: Record<string, number | string>, data: RecoveryPreviewOut): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(params)) {
    if (k.endsWith("_minutes") && typeof v === "number") out[k] = formatMinutes(v);
    else if (k === "task_ids")
      out[k] = String(v)
        .split(",")
        .map((id) => data.tasks.find((x) => x.id === id.trim())?.title ?? id.trim())
        .join(", ");
    else out[k] = String(v);
  }
  return out;
}

/** Title of the item next_action refers to (task title or localized template block). */
function actionSubject(data: RecoveryPreviewOut): string {
  const n = data.next_action;
  if (n.task_id) return data.tasks.find((x) => x.id === n.task_id)?.title ?? n.task_id;
  if (n.template_key) return t.recovery.template[n.template_key] ?? "";
  return "";
}

export function NextActionCard({ data }: { data: RecoveryPreviewOut }) {
  const N = t.recovery.next;
  const n = data.next_action;
  const min = formatMinutes(n.minutes);
  const text =
    n.kind === "start_task"
      ? N.kinds.start_task(actionSubject(data), min)
      : n.kind === "start_template"
        ? N.kinds.start_template(actionSubject(data), min)
        : n.kind === "schedule_next_session"
          ? N.kinds.schedule_next_session()
          : N.kinds.pause();
  const active = n.kind === "start_task" || n.kind === "start_template";
  return (
    <section
      aria-labelledby="next-action"
      className={cn(
        "rounded-panel border px-5 py-5 md:px-6",
        active ? "border-ink/40 bg-surface-2" : "border-dashed border-line-strong bg-surface",
      )}
    >
      <p className="eyebrow">{N.eyebrow}</p>
      <h2 id="next-action" className="mt-2 flex items-start gap-2 font-serif text-[22px] leading-snug text-ink md:text-[26px]">
        {active && <ArrowRight size={20} className="mt-1.5 shrink-0" />}
        <span className="min-w-0 break-words">{text}</span>
      </h2>
      {N.reasons[n.reason] && <p className="mt-2 text-[14px] text-ink-2">{N.reasons[n.reason]}</p>}
      <p className="mt-2 text-[12.5px] text-ink-3">
        {n.kind === "start_template" && `${N.genericNote} `}
        {N.noCompletion}
      </p>
    </section>
  );
}

export function RecoveryResult({ data }: { data: RecoveryPreviewOut }) {
  const R = t.recovery.result;
  const s = data.summary;
  const stats = [
    { k: R.originalBudget, v: formatMinutes(s.original_budget_minutes) },
    { k: R.newBudget, v: formatMinutes(s.new_budget_minutes), sub: s.budget_change_ratio !== null ? R.ratio(Math.round(s.budget_change_ratio * 100)) : null },
    { k: R.proposed, v: formatMinutes(s.proposed_minutes) },
    { k: R.reserve, v: formatMinutes(s.reserve_minutes) },
    { k: R.deferred, v: formatMinutes(s.deferred_minutes) },
    ...(s.unallocated_minutes > 0 ? [{ k: R.unallocated, v: formatMinutes(s.unallocated_minutes) }] : []),
  ];

  return (
    <div className="grid gap-5">
      <NextActionCard data={data} />

      <section aria-labelledby="before-after" className="rounded-panel border border-line bg-surface/70 px-5 py-5 md:px-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="before-after" className="text-[15px] font-semibold text-ink">
            {R.status[data.status]}
          </h2>
          <span className="text-[12.5px] text-ink-2">{R.counts(s.kept_count, s.shortened_count, s.deferred_count)}</span>
        </div>
        <div className="mt-4">
          <BeforeAfter data={data} />
        </div>
        <dl className={cn("mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-[10px] border border-line bg-line sm:grid-cols-3", stats.length === 5 && "xl:grid-cols-5")}>
          {stats.map((x) => (
            <div key={x.k} className="bg-surface px-3.5 py-3">
              <dt className="eyebrow">{x.k}</dt>
              <dd className="tabular mt-1 font-serif text-[20px] leading-tight text-ink">{x.v}</dd>
              {"sub" in x && x.sub && <dd className="text-[11.5px] text-ink-3">{x.sub}</dd>}
            </div>
          ))}
        </dl>
      </section>

      {data.warnings.length > 0 && (
        <section aria-labelledby="warnings" className="rounded-panel border border-warn/40 bg-warn/[0.05] px-5 py-4">
          <h2 id="warnings" className="text-[13px] font-semibold text-ink">
            {R.warningsTitle}
          </h2>
          <ul className="mt-2 grid gap-1.5">
            {data.warnings.map((w) => {
              const fn = t.recovery.warnings[w.code];
              return fn ? (
                <li key={w.code} className="flex gap-2 text-[13.5px] leading-snug text-ink-2">
                  <Alert size={14} className="mt-0.5 shrink-0 text-warn" />
                  <span className="min-w-0 break-words">{fn(warningParams(w.params, data))}</span>
                </li>
              ) : null;
            })}
          </ul>
        </section>
      )}

      {data.tasks.length > 0 && (
        <section aria-labelledby="tasks-title" className="rounded-panel border border-line bg-surface/70">
          <h2 id="tasks-title" className="px-5 pt-4 text-[15px] font-semibold text-ink md:px-6">
            {R.tasksTitle}
          </h2>
          <ol className="mt-2 divide-y divide-line">
            {data.tasks.map((task) => {
              const max = Math.max(task.previous_minutes, 1);
              return (
                <li key={task.id} className="grid gap-2 px-5 py-3.5 md:px-6">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="min-w-0 flex-1 text-[14.5px] font-medium text-ink break-words">{task.title}</span>
                    <Tag tone={ACTION_TONE[task.action]} className={task.action === "defer" ? "border-dashed" : undefined}>
                      {R.action[task.action]}
                    </Tag>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="tabular font-mono text-[13px] text-ink">
                      <span className="text-ink-2">{formatMinutes(task.previous_minutes)}</span>
                      {" → "}
                      {formatMinutes(task.proposed_minutes)}
                    </span>
                    {task.deferred_minutes > 0 && (
                      <span className="font-mono text-[11.5px] text-ink-3">
                        {R.deferred}: {formatMinutes(task.deferred_minutes)}
                      </span>
                    )}
                    <span className="font-mono text-[11px] text-ink-3">{R.priority(task.priority)}</span>
                  </div>
                  <div className="relative h-1.5 w-full max-w-sm rounded-full bg-surface-3" aria-hidden="true">
                    <div
                      className={cn("absolute inset-y-0 left-0 rounded-full transition-[width] duration-500", task.action === "shorten" ? "bg-path-b" : "bg-path-a")}
                      style={{ width: `${(task.proposed_minutes / max) * 100}%` }}
                    />
                  </div>
                  <p className="text-[12.5px] text-ink-2">
                    <span className="text-ink-3">{R.why}: </span>
                    {t.recovery.reasons[task.reason] ?? "—"}
                  </p>
                </li>
              );
            })}
          </ol>
        </section>
      )}

      {data.template_plan.length > 0 && (
        <section aria-labelledby="template-title" className="rounded-panel border border-dashed border-line-strong px-5 py-4 md:px-6">
          <h2 id="template-title" className="text-[15px] font-semibold text-ink">
            {R.templateTitle}
          </h2>
          <ol className="mt-2 grid gap-1.5">
            {data.template_plan.filter((item) => t.recovery.template[item.key]).map((item) => (
              <li key={item.key} className="flex items-baseline justify-between gap-3 text-[14px] text-ink-2">
                <span>{t.recovery.template[item.key]}</span>
                <span className="tabular font-mono text-[13px] text-ink">{formatMinutes(item.proposed_minutes)}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {data.assumptions.length > 0 && (
        <details className="group rounded-panel border border-line px-5 py-3.5 md:px-6">
          <summary className="cursor-pointer list-none text-[13px] font-medium text-ink-2 hover:text-ink">
            <span aria-hidden="true" className="mr-1.5 inline-block transition-transform group-open:rotate-90">›</span>
            {R.assumptionsTitle}
          </summary>
          <ul className="mt-2 grid gap-1 pl-4 text-[13px] text-ink-2">
            {/* Unknown codes (newer backend) are skipped, never shown raw. */}
            {data.assumptions
              .filter((a) => t.recovery.assumptions[a])
              .map((a) => (
                <li key={a} className="list-disc">
                  {t.recovery.assumptions[a]}
                </li>
              ))}
          </ul>
          <p className="mt-2 font-mono text-[10.5px] text-ink-3">{data.algorithm_version}</p>
        </details>
      )}
    </div>
  );
}
