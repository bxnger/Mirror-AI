"use client";

import { useId, type ComponentProps, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { t } from "@/i18n";
import type { ErrorCode } from "@/domain/validation";
import { Alert, Check } from "./icons";

const control =
  "w-full rounded-control border bg-surface px-3.5 text-[15px] text-ink placeholder:text-ink-3/80 transition-colors duration-150 hover:border-line-strong focus:border-path-a/70 focus:outline-none focus-visible:outline-none focus:ring-2 focus:ring-path-a/20";

export function ErrorText({ id, code }: { id: string; code?: ErrorCode | null }) {
  if (!code) return null;
  return (
    <p id={id} className="mt-1.5 flex items-center gap-1.5 text-[13px] text-risk">
      <Alert size={13} />
      {t.errors[code]}
    </p>
  );
}

interface FieldProps {
  label: ReactNode;
  hint?: ReactNode;
  error?: ErrorCode | null;
  optional?: boolean;
  className?: string;
  /** Render-prop receives the ids to wire into the control. */
  children: (ids: { id: string; describedBy: string | undefined; invalid: boolean }) => ReactNode;
  counter?: { value: number; max: number };
}

export function Field({ label, hint, error, optional, className, children, counter }: FieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errId = `${id}-err`;
  const describedBy = [hint ? hintId : null, error ? errId : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className={className}>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-[13px] font-medium text-ink-2">
          {label}
          {optional && <span className="ml-1.5 font-normal text-ink-3">· {t.common.optional}</span>}
        </label>
        {counter && (
          <span
            className={cn("tabular font-mono text-[11px]", counter.value > counter.max ? "text-risk" : "text-ink-3")}
            aria-hidden="true"
          >
            {counter.value}/{counter.max}
          </span>
        )}
      </div>
      {children({ id, describedBy, invalid: Boolean(error) })}
      {hint && !error && (
        <p id={hintId} className="mt-1.5 text-[13px] leading-snug text-ink-3">
          {hint}
        </p>
      )}
      <ErrorText id={errId} code={error} />
    </div>
  );
}

export function TextInput({ invalid, className, ...rest }: ComponentProps<"input"> & { invalid?: boolean }) {
  return (
    <input
      aria-invalid={invalid || undefined}
      className={cn(control, "h-11", invalid ? "border-risk/60" : "border-line", className)}
      {...rest}
    />
  );
}

export function TextArea({ invalid, className, ...rest }: ComponentProps<"textarea"> & { invalid?: boolean }) {
  return (
    <textarea
      aria-invalid={invalid || undefined}
      className={cn(control, "min-h-24 resize-y py-2.5 leading-relaxed", invalid ? "border-risk/60" : "border-line", className)}
      {...rest}
    />
  );
}

/* ------------------------------------------------------------- choice cards */

export interface Choice<V extends string | number> {
  value: V;
  label: string;
  hint?: string;
}

/**
 * Radio group rendered as cards. Uses native radios → arrow keys work out of the box.
 */
export function ChoiceCards<V extends string | number>({
  legend,
  name,
  options,
  value,
  onChange,
  error,
  columns = 3,
  size = "md",
}: {
  legend: ReactNode;
  name: string;
  options: Choice<V>[];
  value: V | null;
  onChange: (v: V) => void;
  error?: ErrorCode | null;
  columns?: 2 | 3 | 4;
  size?: "sm" | "md";
}) {
  const errId = useId();
  const cols = { 2: "sm:grid-cols-2", 3: "sm:grid-cols-3", 4: "grid-cols-2 sm:grid-cols-4" }[columns];
  return (
    <fieldset aria-describedby={error ? errId : undefined}>
      <legend className="mb-2 text-[13px] font-medium text-ink-2">{legend}</legend>
      <div className={cn("grid gap-2", cols)}>
        {options.map((o) => {
          const checked = value === o.value;
          return (
            <label
              key={String(o.value)}
              className={cn(
                "group relative flex cursor-pointer flex-col rounded-control border px-3.5 transition-colors duration-150 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-path-a/50",
                size === "sm" ? "py-2.5" : "py-3",
                checked ? "border-ink/70 bg-surface-2" : "border-line bg-surface hover:border-line-strong",
                error && !checked && "border-risk/40",
              )}
            >
              <input
                type="radio"
                name={name}
                value={String(o.value)}
                checked={checked}
                onChange={() => onChange(o.value)}
                className="sr-only"
              />
              <span className="flex items-center justify-between gap-2">
                <span className={cn("text-sm font-medium", checked ? "text-ink" : "text-ink-2")}>{o.label}</span>
                <span
                  aria-hidden="true"
                  className={cn(
                    "grid size-4 shrink-0 place-items-center rounded-full border transition-colors",
                    checked ? "border-ink bg-ink text-bg" : "border-line-strong",
                  )}
                >
                  {checked && <Check size={10} strokeWidth={2.4} />}
                </span>
              </span>
              {o.hint && <span className="mt-0.5 text-[12.5px] leading-snug text-ink-3">{o.hint}</span>}
            </label>
          );
        })}
      </div>
      <ErrorText id={errId} code={error} />
    </fieldset>
  );
}

/* -------------------------------------------------------------- check chips */

export function CheckChips<V extends string>({
  legend,
  options,
  value,
  onChange,
}: {
  legend: ReactNode;
  options: Choice<V>[];
  value: V[];
  onChange: (v: V[]) => void;
}) {
  return (
    <fieldset>
      <legend className="mb-2 text-[13px] font-medium text-ink-2">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const checked = value.includes(o.value);
          return (
            <label
              key={o.value}
              className={cn(
                "inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-[13px] transition-colors duration-150 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-path-a/50",
                checked ? "border-ink/60 bg-surface-3 text-ink" : "border-line bg-surface text-ink-2 hover:border-line-strong",
              )}
            >
              <input
                type="checkbox"
                className="sr-only"
                checked={checked}
                onChange={() => onChange(checked ? value.filter((x) => x !== o.value) : [...value, o.value])}
              />
              <span
                aria-hidden="true"
                className={cn(
                  "grid size-3.5 place-items-center rounded-[4px] border",
                  checked ? "border-ink bg-ink text-bg" : "border-line-strong",
                )}
              >
                {checked && <Check size={9} strokeWidth={2.6} />}
              </span>
              {o.label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

/* ------------------------------------------------------------ number stepper */

export function NumberStepper({
  id,
  value,
  onChange,
  min,
  max,
  step = 1,
  invalid,
  describedBy,
  suffix,
  decLabel,
  incLabel,
}: {
  id: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  invalid?: boolean;
  describedBy?: string;
  suffix?: string;
  decLabel: string;
  incLabel: string;
}) {
  const clamp = (n: number) => Math.min(max, Math.max(min, n));
  const btn =
    "grid h-full w-10 shrink-0 place-items-center text-ink-2 transition-colors hover:bg-surface-3 hover:text-ink disabled:opacity-30";
  return (
    <div
      className={cn(
        "flex h-11 items-stretch overflow-hidden rounded-control border bg-surface focus-within:border-path-a/70 focus-within:ring-2 focus-within:ring-path-a/20",
        invalid ? "border-risk/60" : "border-line",
      )}
    >
      <button
        type="button"
        className={cn(btn, "border-r border-line")}
        onClick={() => onChange(clamp((Number.isFinite(value) ? value : min) - step))}
        disabled={Number.isFinite(value) && value <= min}
        aria-label={decLabel}
      >
        <span aria-hidden="true" className="text-lg leading-none">−</span>
      </button>
      <div className="relative flex min-w-0 flex-1 items-center">
        <input
          id={id}
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          step={step}
          value={Number.isFinite(value) ? value : ""}
          onChange={(e) => onChange(e.target.value === "" ? Number.NaN : Number(e.target.value))}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          className="tabular h-full w-full min-w-0 bg-transparent text-center font-mono text-[15px] text-ink focus:outline-none focus-visible:outline-none"
        />
        {suffix && (
          <span aria-hidden="true" className="pointer-events-none absolute right-2.5 font-mono text-[11px] text-ink-3">
            {suffix}
          </span>
        )}
      </div>
      <button
        type="button"
        className={cn(btn, "border-l border-line")}
        onClick={() => onChange(clamp((Number.isFinite(value) ? value : min - step) + step))}
        disabled={Number.isFinite(value) && value >= max}
        aria-label={incLabel}
      >
        <span aria-hidden="true" className="text-lg leading-none">+</span>
      </button>
    </div>
  );
}
