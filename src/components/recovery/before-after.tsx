"use client";

import type { RecoveryPreviewOut } from "@/lib/api/recovery";
import { formatMinutes, t } from "@/i18n";
import { cn } from "@/lib/cn";

/**
 * Before vs After — three bars on ONE scale, built only from the backend response:
 *   Before:  each task's previous minutes (+ unused original budget)
 *   After:   proposed minutes per task / template block, reserve, unallocated
 *   Moved:   deferred minutes per task
 * Patterns + labels carry meaning, never colour alone.
 */
const HATCH = (c: string) => `repeating-linear-gradient(135deg, color-mix(in oklab, ${c} 45%, transparent) 0 4px, transparent 4px 8px)`;

interface Seg {
  key: string;
  minutes: number;
  label: string;
  style: React.CSSProperties;
  className?: string;
}

function Bar({ label, total, segs, scale, marker }: { label: string; total: number; segs: Seg[]; scale: number; marker?: number }) {
  const pct = (m: number) => `${(m / scale) * 100}%`;
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <span className="eyebrow">{label}</span>
        <span className="tabular font-mono text-[13px] text-ink">{formatMinutes(total)}</span>
      </div>
      <div className="relative h-9 rounded-[8px] bg-surface-3/50" aria-hidden="true">
        <div className="absolute inset-0 flex overflow-hidden rounded-[8px]">
          {segs
            .filter((s) => s.minutes > 0)
            .map((s) => (
              <div
                key={s.key}
                title={`${s.label} · ${formatMinutes(s.minutes)}`}
                className={cn("h-full shrink-0 border-r-2 border-bg transition-[width] duration-500 ease-out last:border-r-0", s.className)}
                style={{ width: pct(s.minutes), ...s.style }}
              />
            ))}
        </div>
        {marker !== undefined && marker > 0 && (
          <span className="absolute -bottom-1 -top-1 w-0 border-l-2 border-ink" style={{ left: `calc(${pct(marker)} - 1px)` }} />
        )}
      </div>
    </div>
  );
}

export function BeforeAfter({ data }: { data: RecoveryPreviewOut }) {
  const R = t.recovery.result;
  const s = data.summary;
  const scale = Math.max(s.original_budget_minutes, s.original_workload_minutes, s.new_budget_minutes, 1);

  const before: Seg[] = data.tasks.length
    ? data.tasks.map((task) => ({
        key: task.id,
        minutes: task.previous_minutes,
        label: task.title,
        style: { background: "color-mix(in oklab, var(--color-ink-3) 55%, transparent)" },
      }))
    : [{ key: "workload", minutes: s.original_workload_minutes, label: R.workload, style: { background: "color-mix(in oklab, var(--color-ink-3) 55%, transparent)" } }];

  const after: Seg[] = [
    ...data.tasks.map((task) => ({
      key: task.id,
      minutes: task.proposed_minutes,
      label: `${task.title} · ${R.action[task.action]}`,
      style: { background: task.action === "shorten" ? "var(--color-path-b)" : "var(--color-path-a)" },
    })),
    ...data.template_plan.map((item) => ({
      key: item.key,
      minutes: item.proposed_minutes,
      label: t.recovery.template[item.key] ?? "",
      style: { background: "var(--color-path-a)" },
    })),
    { key: "reserve", minutes: s.reserve_minutes, label: R.reserve, style: { background: HATCH("var(--color-future)") }, className: "border border-dashed !border-future" },
    { key: "free", minutes: s.unallocated_minutes, label: R.unallocated, style: { background: "transparent" }, className: "border border-dashed !border-line-strong" },
  ];

  const moved: Seg[] = data.tasks
    .filter((task) => task.deferred_minutes > 0)
    .map((task) => ({
      key: task.id,
      minutes: task.deferred_minutes,
      label: task.title,
      style: { background: HATCH("var(--color-ink-3)") },
      className: "border border-dashed !border-ink-3",
    }));

  const legend = [
    { label: R.legend.kept, el: <span className="h-2.5 w-4 rounded-sm bg-path-a" /> },
    { label: R.legend.shortened, el: <span className="h-2.5 w-4 rounded-sm bg-path-b" /> },
    { label: R.legend.reserve, el: <span className="h-2.5 w-4 rounded-sm border border-dashed border-future" style={{ background: HATCH("var(--color-future)") }} /> },
    { label: R.legend.deferred, el: <span className="h-2.5 w-4 rounded-sm border border-dashed border-ink-3" style={{ background: HATCH("var(--color-ink-3)") }} /> },
  ];

  return (
    <figure className="grid gap-4">
      <figcaption className="sr-only">
        {R.chartLabel(
          `${formatMinutes(s.original_workload_minutes)} / ${formatMinutes(s.original_budget_minutes)}`,
          `${R.proposed} ${formatMinutes(s.proposed_minutes)}, ${R.reserve} ${formatMinutes(s.reserve_minutes)}, ${R.deferred} ${formatMinutes(s.deferred_minutes)}`,
        )}
      </figcaption>
      <Bar label={R.before} total={s.original_workload_minutes} segs={before} scale={scale} marker={s.original_budget_minutes} />
      <Bar label={R.after} total={s.new_budget_minutes} segs={after} scale={scale} marker={s.new_budget_minutes} />
      {s.deferred_minutes > 0 && <Bar label={R.deferred} total={s.deferred_minutes} segs={moved} scale={scale} />}
      <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-[12px] text-ink-2" aria-hidden="true">
        {legend.map((l) => (
          <li key={l.label} className="flex items-center gap-1.5">
            {l.el}
            {l.label}
          </li>
        ))}
      </ul>
    </figure>
  );
}
