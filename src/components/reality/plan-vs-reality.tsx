"use client";

import { Meter, Tag } from "@/components/ui/surface";
import { planVsReality, recentPace, checkInsFor, type WeekStatus } from "@/domain/reality";
import type { CheckIn, Plan } from "@/domain/types";
import { formatNumber, t } from "@/i18n";
import { cn } from "@/lib/cn";

const STATUS_TONE: Record<WeekStatus, "neutral" | "warn" | "done" | "a"> = {
  none: "neutral",
  under: "warn",
  on: "done",
  over: "a",
};

/**
 * Plan vs Reality — planned hours (dashed outline) vs actual hours (solid) per week,
 * with numbers printed on every bar, so colour is never the only signal.
 */
export function PlanVsReality({ plan, checkIns }: { plan: Plan; checkIns: CheckIn[] }) {
  const P = t.reality.pvr;
  const data = planVsReality(plan, checkIns);
  const { pace, weeksUsed } = recentPace(checkInsFor(plan, checkIns));
  const max = Math.max(1, ...data.rows.map((r) => Math.max(r.plannedHours, r.actualHours ?? 0)));
  const h = (v: number) => `${Math.max(2, (v / max) * 100)}%`;

  if (data.checkedWeeks === 0) {
    return (
      <section aria-labelledby="pvr-title" className="rounded-panel border border-dashed border-line-strong px-5 py-6">
        <p className="eyebrow">{P.eyebrow}</p>
        <h2 id="pvr-title" className="mt-1 text-[15px] font-semibold text-ink">
          {P.emptyTitle}
        </h2>
        <p className="mt-1 text-[14px] text-ink-2">{P.emptyText}</p>
      </section>
    );
  }

  const description = P.chartLabel(
    data.rows
      .map((r) => P.chartRow(r.week, formatNumber(r.plannedHours), r.actualHours === null ? P.noReport : `${formatNumber(r.actualHours)}`))
      .join("; "),
  );

  return (
    <section aria-labelledby="pvr-title" className="rounded-panel border border-line bg-surface/70">
      <header className="px-5 pt-5 md:px-6">
        <p className="eyebrow">{P.eyebrow}</p>
        <h2 id="pvr-title" className="mt-1 font-serif text-[22px] leading-snug text-ink">
          {P.title}
        </h2>
      </header>

      {/* Totals */}
      <dl className="mt-4 grid gap-px overflow-hidden border-y border-line bg-line sm:grid-cols-3">
        <div className="bg-surface px-5 py-4 md:px-6">
          <dt className="eyebrow">{P.totalsHours}</dt>
          <dd className="tabular mt-1 text-ink">
            <span className="font-serif text-[26px]">{formatNumber(data.actualHoursChecked)}</span>
            <span className="text-ink-2"> / {formatNumber(data.plannedHoursChecked)} {t.common.hoursShort}</span>
          </dd>
          <Meter
            className="mt-2"
            value={data.actualHoursChecked}
            max={data.plannedHoursChecked}
            label={`${formatNumber(data.actualHoursChecked)} / ${formatNumber(data.plannedHoursChecked)}`}
            tone="done"
            overflowTone="warn"
            height={5}
          />
        </div>
        <div className="bg-surface px-5 py-4 md:px-6">
          <dt className="eyebrow">{P.totalsTasks}</dt>
          <dd className="tabular mt-1 text-ink">
            <span className="font-serif text-[26px]">{data.tasksDone}</span>
            <span className="text-ink-2"> / {data.tasksTotal}</span>
          </dd>
          <Meter className="mt-2" value={data.tasksDone} max={data.tasksTotal} label={`${data.tasksDone} / ${data.tasksTotal}`} tone="done" height={5} />
        </div>
        <div className="bg-surface px-5 py-4 md:px-6">
          <dt className="eyebrow">{P.pace}</dt>
          <dd className="mt-1 text-ink">
            {pace === null ? (
              <span className="text-[14px] text-ink-3">{P.paceNone}</span>
            ) : (
              <>
                <span className="tabular font-serif text-[26px]">{formatNumber(pace)}</span>
                <span className="text-ink-2"> {t.common.hPerWeek}</span>
                <span className="mt-1 block text-[12.5px] text-ink-3">{P.paceValue(formatNumber(pace), weeksUsed)}</span>
              </>
            )}
          </dd>
        </div>
      </dl>

      <div className="grid gap-6 px-5 pb-5 pt-5 md:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        {/* Chart */}
        <figure>
          <figcaption className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <span className="text-[13px] font-medium text-ink-2">{P.hoursChart}</span>
            <span className="flex gap-3 text-[11.5px] text-ink-2" aria-hidden="true">
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-3 rounded-[2px] border border-dashed border-ink-2" />
                {P.planned}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-3 rounded-[2px] bg-done" />
                {P.actual}
              </span>
            </span>
          </figcaption>
          <p className="sr-only">{description}</p>
          <div aria-hidden="true" className="flex h-48 items-end gap-3 border-b border-line sm:gap-5">
            {data.rows.map((r) => (
              <div key={r.week} className="flex h-full min-w-0 flex-1 items-end justify-center gap-1.5">
                <div className="flex h-full w-full max-w-9 flex-col justify-end">
                  <span className="tabular mb-1 text-center font-mono text-[10.5px] text-ink-2">{formatNumber(r.plannedHours)}</span>
                  <div className="rounded-t-[4px] border border-b-0 border-dashed border-ink-2" style={{ height: h(r.plannedHours) }} />
                </div>
                <div className="flex h-full w-full max-w-9 flex-col justify-end">
                  {r.actualHours === null ? (
                    <span className="mb-1 text-center font-mono text-[10.5px] text-ink-3">—</span>
                  ) : (
                    <>
                      <span className="tabular mb-1 text-center font-mono text-[10.5px] text-ink">{formatNumber(r.actualHours)}</span>
                      <div
                        className="rounded-t-[4px] bg-done transition-[height] duration-500 ease-out"
                        style={{ height: h(r.actualHours) }}
                      />
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div aria-hidden="true" className="mt-1.5 flex gap-3 sm:gap-5">
            {data.rows.map((r) => (
              <span key={r.week} className="flex-1 text-center font-mono text-[10.5px] text-ink-3">
                {t.reality.week(r.week)}
              </span>
            ))}
          </div>
        </figure>

        {/* Explanations */}
        <div>
          <h3 className="mb-2 text-[13px] font-medium text-ink-2">{P.explanations}</h3>
          <ol className="divide-y divide-line rounded-[12px] border border-line">
            {data.rows.map((r, i) => {
              const prev = i > 0 ? data.rows[i - 1].actualHours : null;
              const trend = r.actualHours !== null && prev !== null ? r.actualHours - prev : null;
              return (
                <li key={r.week} className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[13.5px] font-medium text-ink">{t.reality.week(r.week)}</span>
                    <Tag tone={STATUS_TONE[r.status]}>{P.status[r.status]}</Tag>
                    {r.actualHours !== null && (
                      <span className="tabular font-mono text-[11.5px] text-ink-3">
                        {formatNumber(r.actualHours)} / {formatNumber(r.plannedHours)} {t.common.hoursShort}
                      </span>
                    )}
                  </div>
                  <p className={cn("mt-1 text-[13px]", r.status === "none" ? "text-ink-3" : "text-ink-2")}>
                    {r.status === "under"
                      ? P.explain.under(formatNumber(Math.abs(r.deltaHours ?? 0)))
                      : r.status === "over"
                        ? P.explain.over(formatNumber(Math.abs(r.deltaHours ?? 0)))
                        : r.status === "on"
                          ? P.explain.on
                          : P.explain.none}
                    {trend !== null && trend !== 0 && (
                      <span className="text-ink-3"> · {P.trend(`${trend > 0 ? "+" : "−"}${formatNumber(Math.abs(trend))}`)}</span>
                    )}
                  </p>
                  {r.checkIn?.note && (
                    <p className="mt-1.5 border-l-2 border-line-strong pl-2.5 text-[13px] text-ink-2">
                      <span className="sr-only">{P.reason}: </span>
                      {r.checkIn.kind && <span className="text-ink-3">{t.reality.kinds[r.checkIn.kind]} · </span>}
                      {r.checkIn.note}
                    </p>
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </section>
  );
}
