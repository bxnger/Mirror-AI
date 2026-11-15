import type { ReactNode } from "react";
import type { PathId } from "@/domain/types";
import { cn } from "@/lib/cn";
import { t } from "@/i18n";

/**
 * The signature MIRROR visual: CURRENT SELF → DECISION POINT → POSSIBLE FUTURES → GOAL.
 *
 * Conventions (shared with the rest of the UI):
 *   solid line/border  = known / chosen
 *   dashed line/border = possible / not chosen / the goal (not a prediction)
 *
 * Layout: horizontal from `md`, vertical below. Connectors are small SVGs that live
 * in their own grid tracks, so they never have to measure the DOM.
 */

export interface TrajectoryNode {
  title: string;
  meta?: ReactNode;
}

export interface TrajectoryPath extends TrajectoryNode {
  footer?: ReactNode;
}

interface Props {
  now: TrajectoryNode;
  decisionLabel?: string;
  paths: Partial<Record<PathId, TrajectoryPath>> | null;
  chosen: PathId | null;
  future: TrajectoryNode;
  emptyPaths?: ReactNode;
  className?: string;
  ariaLabel: string;
}

const PATH_COLOR: Record<PathId, string> = { A: "var(--color-path-a)", B: "var(--color-path-b)" };

function strokeFor(id: PathId, chosen: PathId | null) {
  return {
    stroke: PATH_COLOR[id],
    strokeDasharray: chosen === id ? undefined : "3 4",
    opacity: chosen && chosen !== id ? 0.3 : 0.9,
  };
}

/** Connector between decision and paths (split) or paths and future (merge). */
function Connector({
  kind,
  hasPaths,
  chosen,
}: {
  kind: "lead" | "split" | "merge";
  hasPaths: boolean;
  chosen: PathId | null;
}) {
  const common = {
    fill: "none",
    strokeWidth: 1.5,
    vectorEffect: "non-scaling-stroke" as const,
    strokeLinecap: "round" as const,
  };
  const neutral = { stroke: "var(--color-ink-3)", strokeDasharray: kind === "lead" ? undefined : "3 4" };

  // Horizontal (md+): x runs 0→100 left→right. Paths sit at y=25 (A) and y=75 (B).
  // Vertical (<md): y runs 0→100 top→bottom. Paths sit at x=25 (A) and x=75 (B).
  const h =
    kind === "lead" || !hasPaths
      ? [{ d: "M0 50 H100", s: neutral }]
      : kind === "split"
        ? [
            { d: "M0 50 C50 50 50 25 100 25", s: strokeFor("A", chosen) },
            { d: "M0 50 C50 50 50 75 100 75", s: strokeFor("B", chosen) },
          ]
        : [
            { d: "M0 25 C50 25 50 50 100 50", s: strokeFor("A", chosen) },
            { d: "M0 75 C50 75 50 50 100 50", s: strokeFor("B", chosen) },
          ];
  const v =
    kind === "lead" || !hasPaths
      ? [{ d: "M50 0 V100", s: neutral }]
      : kind === "split"
        ? [
            { d: "M50 0 C50 50 25 50 25 100", s: strokeFor("A", chosen) },
            { d: "M50 0 C50 50 75 50 75 100", s: strokeFor("B", chosen) },
          ]
        : [
            { d: "M25 0 C25 50 50 50 50 100", s: strokeFor("A", chosen) },
            { d: "M75 0 C75 50 50 50 50 100", s: strokeFor("B", chosen) },
          ];

  return (
    <div aria-hidden="true" className="relative h-8 w-full md:h-auto md:w-full">
      <svg className="absolute inset-0 hidden h-full w-full md:block" viewBox="0 0 100 100" preserveAspectRatio="none">
        {h.map((p) => (
          <path key={p.d} d={p.d} {...common} {...p.s} />
        ))}
      </svg>
      <svg className="absolute inset-0 h-full w-full md:hidden" viewBox="0 0 100 100" preserveAspectRatio="none">
        {v.map((p) => (
          <path key={p.d} d={p.d} {...common} {...p.s} />
        ))}
      </svg>
    </div>
  );
}

function NodeCard({
  eyebrow,
  node,
  variant,
  delay = 0,
  badge,
}: {
  eyebrow: string;
  node: TrajectoryNode & { footer?: ReactNode };
  variant: "now" | "A" | "B" | "future";
  delay?: number;
  badge?: ReactNode;
}) {
  const styles = {
    now: "border-now/70 bg-surface-2",
    A: "border-path-a/50 bg-surface",
    B: "border-path-b/50 bg-surface",
    future: "border-future/60 border-dashed bg-transparent",
  }[variant];
  const dot = {
    now: "bg-now",
    A: "bg-path-a",
    B: "bg-path-b",
    future: "border border-dashed border-future bg-transparent",
  }[variant];
  return (
    <div
      className={cn("animate-rise relative min-w-0 rounded-[12px] border px-3.5 py-3", styles)}
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="eyebrow flex items-center gap-1.5">
          <span aria-hidden="true" className={cn("inline-block size-1.5 rounded-full", dot)} />
          {eyebrow}
        </p>
        {badge}
      </div>
      <p className="mt-1.5 line-clamp-3 text-[14px] font-medium leading-snug text-ink">{node.title}</p>
      {node.meta && <div className="mt-1 text-[12.5px] leading-snug text-ink-2">{node.meta}</div>}
      {node.footer && <div className="mt-2.5">{node.footer}</div>}
    </div>
  );
}

export function TrajectoryMap({ now, decisionLabel, paths, chosen, future, emptyPaths, className, ariaLabel }: Props) {
  const hasPaths = Boolean(paths?.A && paths?.B);
  const pathVariant = (id: PathId, dimmed: boolean) => (
    <div key={id} className={cn("min-w-0 transition-opacity duration-300", dimmed && "opacity-55")}>
      <NodeCard
        eyebrow={t.lab.pathLabel(id)}
        node={paths![id]!}
        variant={id}
        delay={160 + (id === "A" ? 0 : 60)}
        badge={
          chosen === id ? (
            <span
              className="rounded-full px-1.5 py-px font-mono text-[10px] text-bg"
              style={{ background: PATH_COLOR[id] }}
            >
              {t.twin.map.chosen}
            </span>
          ) : null
        }
      />
    </div>
  );

  return (
    <figure
      aria-label={ariaLabel}
      className={cn(
        "dot-grid relative grid rounded-panel border border-line bg-bg-elev p-4 md:p-6",
        // vertical stack on mobile; 7 tracks horizontally on md+
        "grid-cols-1 md:grid-cols-[minmax(0,1fr)_32px_auto_32px_minmax(0,1.15fr)_32px_minmax(0,1fr)] md:items-stretch",
        className,
      )}
    >
      <div className="flex min-w-0 flex-col justify-center">
        <NodeCard eyebrow={t.twin.map.now} node={now} variant="now" />
      </div>

      <Connector kind="lead" hasPaths={hasPaths} chosen={chosen} />

      <div className="flex flex-col items-center justify-center gap-2 py-1 text-center md:w-[92px]">
        <span aria-hidden="true" className="block size-3.5 rotate-45 border-[1.5px] border-ink bg-bg" />
        <span className="eyebrow leading-tight">{decisionLabel ?? t.twin.map.decision}</span>
      </div>

      <Connector kind="split" hasPaths={hasPaths} chosen={chosen} />

      <div className="grid min-w-0 grid-cols-2 gap-3 md:grid-cols-1 md:grid-rows-2 md:gap-4">
        {hasPaths ? (
          (["A", "B"] as const).map((id) => pathVariant(id, Boolean(chosen && chosen !== id)))
        ) : (
          <div className="col-span-2 flex items-center justify-center rounded-[12px] border border-dashed border-line-strong px-4 py-5 text-center text-[13px] text-ink-3 md:col-span-1 md:row-span-2">
            {emptyPaths ?? t.twin.map.noDecision}
          </div>
        )}
      </div>

      <Connector kind="merge" hasPaths={hasPaths} chosen={chosen} />

      <div className="flex min-w-0 flex-col justify-center">
        <NodeCard eyebrow={t.twin.map.future} node={future} variant="future" delay={260} />
      </div>
    </figure>
  );
}
