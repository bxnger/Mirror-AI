import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Panel — the main content container. Prefer hairline dividers *inside* a panel
 * over nesting more panels.
 */
export function Panel({
  eyebrow,
  title,
  action,
  children,
  className,
  bodyClassName,
  as: Tag = "section",
  labelledBy,
}: {
  eyebrow?: ReactNode;
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  as?: "section" | "div" | "article";
  labelledBy?: string;
}) {
  return (
    <Tag
      aria-labelledby={labelledBy}
      className={cn("rounded-panel border border-line bg-surface/80", className)}
    >
      {(eyebrow || title || action) && (
        <header className="flex items-start justify-between gap-3 px-5 pt-4">
          <div className="min-w-0">
            {eyebrow && <p className="eyebrow">{eyebrow}</p>}
            {title && (
              <h2 id={labelledBy} className="mt-1 text-[15px] font-semibold text-ink">
                {title}
              </h2>
            )}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </header>
      )}
      <div className={bodyClassName ?? "px-5 pb-5 pt-3"}>{children}</div>
    </Tag>
  );
}

/** Horizontal bar. `value` and `max` are real quantities; the label is announced to screen readers. */
export function Meter({
  value,
  max,
  label,
  tone = "now",
  overflowTone = "risk",
  className,
  height = 6,
}: {
  value: number;
  max: number;
  label: string;
  tone?: "now" | "path-a" | "path-b" | "done" | "future";
  overflowTone?: "risk" | "warn";
  className?: string;
  height?: number;
}) {
  const pct = max <= 0 ? 0 : Math.min(100, (value / max) * 100);
  const over = value > max;
  const color = over ? `var(--color-${overflowTone})` : `var(--color-${tone})`;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.min(value, max)}
      className={cn("relative w-full overflow-hidden rounded-full bg-surface-3", className)}
      style={{ height }}
    >
      <div
        className="h-full rounded-full transition-[width] duration-500 ease-out"
        style={{ width: `${pct}%`, background: color }}
      />
    </div>
  );
}

export function Tag({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: "neutral" | "a" | "b" | "risk" | "warn" | "done" | "future";
  className?: string;
}) {
  const tones = {
    neutral: "border-line-strong text-ink-2",
    a: "border-path-a/40 text-path-a",
    b: "border-path-b/40 text-path-b",
    risk: "border-risk/40 text-risk",
    warn: "border-warn/40 text-warn",
    done: "border-done/40 text-done",
    future: "border-future/50 text-future border-dashed",
  } as const;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[11px] leading-4 tracking-wide",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function PageHeader({
  eyebrow,
  title,
  lead,
  actions,
}: {
  eyebrow: ReactNode;
  title: ReactNode;
  lead?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0 max-w-2xl">
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="mt-2 font-serif text-title font-normal tracking-[-0.015em] text-ink text-balance">{title}</h1>
        {lead && <p className="mt-2 text-ink-2 text-pretty">{lead}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

export function LoadingBlock({ label }: { label: string }) {
  return (
    <div role="status" aria-live="polite" className="grid gap-4">
      <span className="sr-only">{label}</span>
      <div className="h-8 w-56 animate-pulse rounded-md bg-surface-2" />
      <div className="h-48 animate-pulse rounded-panel bg-surface" />
      <div className="grid gap-4 md:grid-cols-3">
        <div className="h-32 animate-pulse rounded-panel bg-surface" />
        <div className="h-32 animate-pulse rounded-panel bg-surface" />
        <div className="h-32 animate-pulse rounded-panel bg-surface" />
      </div>
    </div>
  );
}
