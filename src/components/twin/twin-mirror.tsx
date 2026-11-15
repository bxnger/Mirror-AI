"use client";

import Image from "next/image";
import { useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from "react";
import type { Profile } from "@/domain/types";
import { formatDate, t } from "@/i18n";
import { cn } from "@/lib/cn";
import { TWIN_ASSET_PATHS, type TwinAssets, type TwinSide } from "./twin-assets";

export type { TwinAssets } from "./twin-assets";

/**
 * TwinMirror — the identity visual of MIRROR.
 *
 * Two portrait frames facing each other across a "mirror" axis:
 *   CURRENT SELF — solid frame, cool-blue light from below, grounded.
 *   FUTURE SELF  — dashed frame, lavender/apricot light, outlined monogram — an aspiration.
 *
 * Both frames show the *same* person (same monogram / same render). Only light and
 * materiality differ — never body, face, intelligence or worth.
 *
 * Assets: /public/twin/current-self.webp and /public/twin/future-self.webp.
 * Availability is resolved on the server (see app/(app)/twin/page.tsx) and passed in,
 * so missing files are never requested. Without assets an intentional placeholder renders.
 * Asset brief: docs/twin-assets.md
 */


const M = t.twinMirror;

/** Light is built from tokens only; strengths are deliberately low (no glow). */
const LIGHT: Record<TwinSide, string> = {
  current: [
    "radial-gradient(120% 70% at 50% 112%, color-mix(in oklab, var(--color-path-a) 34%, transparent) 0%, transparent 62%)",
    "linear-gradient(180deg, color-mix(in oklab, var(--color-surface-2) 70%, transparent), transparent 55%)",
  ].join(","),
  future: [
    "radial-gradient(80% 60% at 28% 108%, color-mix(in oklab, var(--color-future) 42%, transparent) 0%, transparent 65%)",
    "radial-gradient(70% 55% at 78% 112%, color-mix(in oklab, var(--color-path-b) 26%, transparent) 0%, transparent 62%)",
  ].join(","),
};

function monogramOf(name: string) {
  const ch = name.trim().charAt(0);
  return ch ? ch.toUpperCase() : t.twinMirror.monogramFallback;
}

function addMonths(iso: string, months: number) {
  const d = new Date(iso);
  return new Date(d.getFullYear(), d.getMonth() + months, 1);
}

function Frame({
  side,
  active,
  monogram,
  hasAsset,
  stamp,
  caption,
  onSelect,
}: {
  side: TwinSide;
  active: boolean;
  monogram: string;
  hasAsset: boolean;
  stamp: string;
  caption: ReactNode;
  onSelect: () => void;
}) {
  const isFuture = side === "future";
  const label = isFuture ? M.future : M.current;
  return (
    <figure
      className={cn(
        "twin-frame min-w-0 transition-[transform,opacity,filter] duration-500 ease-[var(--ease-out-soft)]",
        // Mobile: only the active side is shown.
        !active && "hidden md:block",
        active ? "md:opacity-100" : "md:opacity-80",
      )}
      data-side={side}
      data-active={active}
      onClick={onSelect}
    >
      <div
        className={cn(
          "relative mx-auto aspect-[4/5] w-full max-w-[260px] overflow-hidden rounded-[18px] border bg-bg-elev",
          isFuture ? "border-dashed border-future/60" : "border-now/35",
        )}
      >
        {/* Light + texture (plate 0) */}
        <div aria-hidden="true" className="absolute inset-0" style={{ background: LIGHT[side] }} />
        <div aria-hidden="true" className="dot-grid absolute inset-0 opacity-40 [mask-image:linear-gradient(to_bottom,black,transparent_75%)]" />

        {/* Horizon (plate 1) — solid for the present, dashed for the goal */}
        <div
          aria-hidden="true"
          className={cn(
            "twin-plate absolute inset-x-5 bottom-[22%] border-t",
            isFuture ? "border-dashed border-future/50" : "border-now/30",
          )}
          style={{ "--d": 4 } as CSSProperties}
        />

        {/* Subject (plate 2) */}
        <div className="twin-plate absolute inset-0" style={{ "--d": 10 } as CSSProperties}>
          {hasAsset ? (
            <Image
              src={TWIN_ASSET_PATHS[side]}
              alt={isFuture ? M.altFuture : M.altCurrent}
              fill
              sizes="(min-width: 768px) 260px, 80vw"
              className="object-contain object-bottom"
              priority={side === "current"}
            />
          ) : (
            <div aria-hidden="true" className="flex h-full items-center justify-center pb-[14%]">
              <span
                className={cn(
                  "select-none font-serif text-[clamp(96px,22vw,148px)] leading-none tracking-tight",
                  isFuture ? "twin-mono-outline" : "text-now",
                )}
              >
                {monogram}
              </span>
            </div>
          )}
        </div>

        {/* Stamp (plate 3) */}
        <div
          className="twin-plate absolute inset-x-4 bottom-4 flex items-center justify-between"
          style={{ "--d": 16 } as CSSProperties}
        >
          <span className={cn("eyebrow", isFuture ? "text-future" : "text-ink-2")}>{label}</span>
          <span className="eyebrow tabular">{stamp}</span>
        </div>
      </div>
      <figcaption className="mx-auto mt-3 max-w-[260px]">{caption}</figcaption>
    </figure>
  );
}

export function TwinMirror({
  profile,
  chosenPathTitle,
  assets,
}: {
  profile: Profile;
  chosenPathTitle: string | null;
  assets: TwinAssets;
}) {
  const [active, setActive] = useState<TwinSide>("current");
  const stageRef = useRef<HTMLDivElement>(null);
  const main = profile.goals[0];
  const monogram = monogramOf(profile.name);
  const topSkills = [...profile.skills].sort((a, b) => b.level - a.level).slice(0, 3);
  const goalDate = addMonths(profile.updatedAt, main.horizonMonths);

  // Subtle 2.5D tilt following the pointer (mouse only, off for reduced motion).
  function onMove(e: PointerEvent<HTMLDivElement>) {
    if (e.pointerType !== "mouse") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const el = stageRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    el.style.setProperty("--tilt-x", `${(-y * 5).toFixed(2)}deg`);
    el.style.setProperty("--tilt-y", `${(x * 7).toFixed(2)}deg`);
    el.style.setProperty("--px", x.toFixed(3));
    el.style.setProperty("--py", y.toFixed(3));
  }
  function onLeave() {
    for (const [k, v] of [["--tilt-x", "0deg"], ["--tilt-y", "0deg"], ["--px", "0"], ["--py", "0"]]) {
      stageRef.current?.style.setProperty(k, v);
    }
  }

  const between = [
    { k: M.horizon, v: `${t.labels.horizon[main.horizonMonths]}` },
    { k: M.hours, v: `${profile.hoursPerWeek} ${t.common.hPerWeek}` },
    { k: M.path, v: chosenPathTitle ?? M.noPath, muted: !chosenPathTitle },
  ];

  return (
    <section aria-labelledby="twin-mirror-title" className="relative overflow-hidden rounded-panel border border-line bg-bg-elev">
      <div className="flex flex-col gap-3 px-5 pt-5 sm:flex-row sm:items-center sm:justify-between md:px-6">
        <div>
          <p className="eyebrow">{M.eyebrow}</p>
          <h2 id="twin-mirror-title" className="mt-1 text-[15px] font-semibold text-ink">
            {M.title}
          </h2>
        </div>
        <div className="grid grid-cols-2 gap-1 rounded-control border border-line bg-surface p-1 sm:w-auto">
          {(["current", "future"] as const).map((side) => (
            <button
              key={side}
              type="button"
              aria-pressed={active === side}
              onClick={() => setActive(side)}
              className={cn(
                "flex h-8 items-center justify-center gap-2 rounded-[7px] px-3 text-[13px] transition-colors",
                active === side ? "bg-surface-3 text-ink" : "text-ink-3 hover:text-ink-2",
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "size-1.5 rounded-full",
                  side === "current" ? "bg-now" : "border border-dashed border-future",
                )}
              />
              {side === "current" ? M.current : M.future}
            </button>
          ))}
        </div>
      </div>

      <div
        ref={stageRef}
        onPointerMove={onMove}
        onPointerLeave={onLeave}
        className="twin-stage grid gap-6 px-5 pb-6 pt-6 md:grid-cols-[minmax(0,1fr)_minmax(150px,200px)_minmax(0,1fr)] md:items-center md:gap-4 md:px-6"
        data-active={active}
      >
        <Frame
          side="current"
          active={active === "current"}
          monogram={monogram}
          hasAsset={assets.current}
          stamp={formatDate(profile.updatedAt, { day: "2-digit", month: "2-digit", year: "numeric" })}
          onSelect={() => setActive("current")}
          caption={
            <>
              <p className="text-[14px] font-medium text-ink">{t.labels.stage[profile.stage]}</p>
              <p className="mt-0.5 text-[13px] text-ink-2">{topSkills.map((s) => s.name).join(" · ")}</p>
            </>
          }
        />

        {/* Mirror axis — what actually separates the two frames (real profile data) */}
        <div className="relative order-last md:order-none">
          {/* The mirror line: solid towards the present, dashed towards the goal. */}
          <span aria-hidden="true" className="absolute right-1/2 top-1/2 hidden h-px w-[calc(50%+16px)] bg-now/30 md:block" />
          <span aria-hidden="true" className="absolute left-1/2 top-1/2 hidden w-[calc(50%+16px)] border-t border-dashed border-future/50 md:block" />
          <dl className="relative grid grid-cols-3 gap-2 rounded-[12px] border border-line bg-bg-elev p-3 md:grid-cols-1 md:gap-3 md:py-4 md:text-center">
            {between.map((row) => (
              <div key={row.k} className="min-w-0">
                <dt className="eyebrow">{row.k}</dt>
                <dd className={cn("mt-1 text-[13px] leading-snug break-words", row.muted ? "text-ink-3" : "text-ink")}>
                  {row.v}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <Frame
          side="future"
          active={active === "future"}
          monogram={monogram}
          hasAsset={assets.future}
          stamp={formatDate(goalDate, { month: "2-digit", year: "numeric" })}
          onSelect={() => setActive("future")}
          caption={
            <>
              <p className="line-clamp-2 font-serif text-[15px] leading-snug text-ink">{main.title}</p>
              <p className="mt-1 text-[12.5px] italic text-ink-2">{t.twin.map.futureNote}</p>
            </>
          }
        />
      </div>
      <p className="sr-only" aria-live="polite">
        {active === "current" ? M.current : M.future}
      </p>
    </section>
  );
}
