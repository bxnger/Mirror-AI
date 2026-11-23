"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { ApiErrorNotice } from "@/components/layout/profile-gate";
import { Button } from "@/components/ui/button";
import { ArrowRight, Reset } from "@/components/ui/icons";
import { Tag } from "@/components/ui/surface";
import { TextInput } from "@/components/ui/form";
import { currentWeek } from "@/domain/plan";
import { formatMinutes, formatNumber, t } from "@/i18n";
import { ApiError } from "@/lib/api";
import {
  getRecoveryDemo,
  hoursToMinutes,
  previewRecovery,
  priorityToRecovery,
  RECOVERY_CATEGORIES,
  RECOVERY_ID_RE,
  type RecoveryCategory,
  type RecoveryPreviewIn,
  type RecoveryPreviewOut,
  type RecoveryTaskIn,
} from "@/lib/api/recovery";
import { cn } from "@/lib/cn";
import { useMirror } from "@/lib/store/use-mirror";
import { API_MODE } from "@/lib/api";
import { hasRemoteUser, sync, useSyncStatus } from "@/lib/remote/session";
import { RecoveryResult } from "./recovery-result";

const noopSubscribe = () => () => {};
const MAX_HOURS = 112; // contract: weekly 0 … 6720 min
const MAX_TASKS = 50;

type Source = "template" | "plan" | "example";

interface FormState {
  category: RecoveryCategory;
  subject: string;
  originalHours: string;
  newHours: string;
  today: string;
  topic: string;
  source: Source;
}

const EMPTY_FORM: FormState = { category: "ent", subject: "", originalHours: "", newHours: "", today: "", topic: "", source: "template" };

type FieldKey = "subject" | "originalHours" | "newHours" | "today" | "topic";
type FieldErrors = Partial<Record<FieldKey, string>>;

/** "2,5" / "2.5" → 2.5; NaN when not a plain non-negative number. */
function parseDecimal(raw: string): number {
  const v = raw.trim().replace(",", ".");
  return /^\d{1,4}(\.\d{1,2})?$/.test(v) ? Number(v) : Number.NaN;
}

const minutesToHoursText = (m: number) => formatNumber(m / 60, 2).replace(/\s/g, "");

/** Contract field name → form field (for 422 issues). */
const SERVER_FIELD: Record<string, FieldKey> = {
  subject: "subject",
  original_weekly_minutes: "originalHours",
  new_weekly_minutes: "newHours",
  available_today_minutes: "today",
  topic: "topic",
};

/**
 * Tasks of the current week from the user's saved plan — READ ONLY, and only when the
 * user explicitly picks that option. Nothing in the plan is modified.
 */
function usePlanTasks(): RecoveryTaskIn[] {
  const state = useMirror();
  const plan = state?.plan;
  if (!plan) return [];
  const week = currentWeek(plan);
  const seen = new Set<string>();
  return plan.tasks
    .filter((x) => x.week === week)
    .slice(0, MAX_TASKS)
    .map((x, i) => {
      let id = RECOVERY_ID_RE.test(x.id) ? x.id : `task-${i + 1}`;
      if (seen.has(id)) id = `task-${i + 1}-${id.slice(0, 40)}`;
      seen.add(id);
      return {
        id,
        title: (x.source === "system" ? t.plan.review : x.title).slice(0, 160),
        planned_minutes: Math.min(6720, Math.round(x.estimateHours * 60)),
        priority: priorityToRecovery(x.priority),
      };
    });
}

export function RecoveryFlow({ startWithExample = false }: { startWithExample?: boolean }) {
  const R = t.recovery;
  const F = R.form;
  const planTasks = usePlanTasks();
  const state = useMirror();
  const syncStatus = useSyncStatus();
  // Offer "my plan" only if a profile exists; the remote plan is fetched ONLY after the user picks it.
  // Hydration-safe: false on the server, real value in the browser.
  const remoteUser = useSyncExternalStore(
    noopSubscribe,
    () => API_MODE === "remote" && hasRemoteUser(),
    () => false,
  );
  const canUsePlan = Boolean(state?.plan) || remoteUser;
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [exampleTasks, setExampleTasks] = useState<RecoveryTaskIn[] | null>(null);
  const [result, setResult] = useState<{ data: RecoveryPreviewOut; example: boolean } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const seq = useRef(0); // latest request wins; older responses are dropped
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ids = { subject: useId(), original: useId(), next: useId(), today: useId(), topic: useId(), slider: useId() };

  const set = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }));
  const planLoading = form.source === "plan" && planTasks.length === 0 && syncStatus.kind === "loading";

  function validate(f: FormState): { errors: FieldErrors; body?: RecoveryPreviewIn } {
    const e: FieldErrors = {};
    const subject = f.subject.trim();
    if (!subject || subject.length > 160) e.subject = R.errors.subject;
    const orig = parseDecimal(f.originalHours);
    if (!Number.isFinite(orig) || orig < 0 || orig > MAX_HOURS) e.originalHours = R.errors.hours(MAX_HOURS);
    const next = parseDecimal(f.newHours);
    if (!Number.isFinite(next) || next < 0 || next > MAX_HOURS) e.newHours = R.errors.hours(MAX_HOURS);
    const today = f.today.trim() === "" ? Number.NaN : Number(f.today.trim());
    if (!Number.isInteger(today) || today < 0 || today > 1440) e.today = R.errors.today;
    if (f.topic.trim().length > 200) e.topic = R.errors.topic;
    if (Object.keys(e).length) return { errors: e };
    const tasks = f.source === "plan" ? planTasks : f.source === "example" ? (exampleTasks ?? []) : [];
    if (f.source === "plan" && tasks.length === 0) return { errors: e }; // nothing to send yet
    return {
      errors: e,
      body: {
        category: f.category,
        subject,
        original_weekly_minutes: hoursToMinutes(orig),
        new_weekly_minutes: hoursToMinutes(next),
        available_today_minutes: today,
        topic: f.topic.trim() || null,
        tasks,
      },
    };
  }

  const resultRef = useRef<HTMLDivElement>(null);
  /** On narrow screens the result sits below the form — bring it into view after an explicit request. */
  function revealResult() {
    if (typeof window === "undefined" || !window.matchMedia("(max-width: 1023px)").matches) return;
    const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    requestAnimationFrame(() => resultRef.current?.scrollIntoView({ block: "start", behavior: smooth ? "smooth" : "auto" }));
  }

  async function run(f: FormState, reveal = true) {
    const { errors, body } = validate(f);
    setFieldErrors(errors);
    if (!body) return;
    const my = ++seq.current;
    setLoading(true);
    setError(null);
    try {
      const data = await previewRecovery(body);
      if (my !== seq.current) return;
      setResult({ data, example: f.source === "example" });
      if (reveal) revealResult();
    } catch (e) {
      if (my !== seq.current) return;
      // Never keep showing a result that no longer matches the inputs.
      setResult(null);
      setError(e);
      if (e instanceof ApiError && e.code === "validation") {
        const fe: FieldErrors = {};
        for (const issue of e.issues) {
          const key = SERVER_FIELD[String(issue.loc[1] ?? "")];
          if (key) fe[key] = R.errors.server(R.fields[String(issue.loc[1])] ?? String(issue.loc[1]));
        }
        setFieldErrors((prev) => ({ ...prev, ...fe }));
      }
    } finally {
      if (my === seq.current) setLoading(false);
    }
  }

  async function loadExample() {
    const my = ++seq.current;
    setLoading(true);
    setError(null);
    setFieldErrors({});
    try {
      const demo = await getRecoveryDemo();
      if (my !== seq.current) return;
      const q = demo.request;
      setExampleTasks(q.tasks ?? []);
      setForm({
        category: q.category,
        subject: q.subject,
        originalHours: minutesToHoursText(q.original_weekly_minutes),
        newHours: minutesToHoursText(q.new_weekly_minutes),
        today: String(q.available_today_minutes),
        topic: q.topic ?? "",
        source: "example",
      });
      setResult({ data: demo.preview, example: true });
      revealResult();
    } catch (e) {
      if (my !== seq.current) return;
      setResult(null);
      setError(e);
    } finally {
      if (my === seq.current) setLoading(false);
    }
  }

  // /recover/example opens straight into the backend fixture.
  const started = useRef(false);
  useEffect(() => {
    if (startWithExample && !started.current) {
      started.current = true;
      void loadExample();
    }
  }, [startWithExample]);

  useEffect(() => () => {
    if (debounce.current) clearTimeout(debounce.current);
  }, []);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void run(form);
  }

  /** Slider: edit the available time and recalculate through the real backend. */
  function onSlide(hours: number) {
    const next = { ...form, newHours: String(hours).replace(".", ",") };
    setForm(next);
    if (!result) return;
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => void run(next, false), 350);
  }

  function reset() {
    seq.current++;
    setForm(EMPTY_FORM);
    setExampleTasks(null);
    setResult(null);
    setError(null);
    setFieldErrors({});
    setLoading(false);
  }

  const sliderValue = Math.min(40, Math.max(0, Number.isFinite(parseDecimal(form.newHours)) ? parseDecimal(form.newHours) : 0));
  const sourceTasks = form.source === "plan" ? planTasks : form.source === "example" ? (exampleTasks ?? []) : [];
  const fieldCls = "mt-1.5";
  const err = (k: FieldKey) =>
    fieldErrors[k] ? (
      <p id={`${k}-err`} className="mt-1 text-[12.5px] text-risk">
        {fieldErrors[k]}
      </p>
    ) : null;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)] lg:items-start lg:gap-8">
      {/* ------------------------------------------------------------- form */}
      <form onSubmit={onSubmit} noValidate aria-busy={loading} className="grid gap-4 rounded-panel border border-line bg-surface/70 px-5 py-5 lg:sticky lg:top-24">
        <h2 className="text-[15px] font-semibold text-ink">{F.title}</h2>

        <fieldset>
          <legend className="mb-1.5 text-[13px] font-medium text-ink-2">{F.category}</legend>
          <div className="grid grid-cols-4 gap-1 rounded-control border border-line bg-surface p-1">
            {RECOVERY_CATEGORIES.map((c) => (
              <label
                key={c}
                className={cn(
                  "cursor-pointer rounded-[7px] py-1.5 text-center text-[13px] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-path-a/50",
                  form.category === c ? "bg-surface-3 text-ink" : "text-ink-3 hover:text-ink-2",
                )}
              >
                <input type="radio" name="category" className="sr-only" checked={form.category === c} onChange={() => set({ category: c })} />
                {F.categories[c]}
              </label>
            ))}
          </div>
        </fieldset>

        <div>
          <label htmlFor={ids.subject} className="text-[13px] font-medium text-ink-2">
            {F.subject}
          </label>
          <TextInput
            id={ids.subject}
            className={fieldCls}
            value={form.subject}
            maxLength={160}
            placeholder={F.subjectPlaceholder}
            invalid={Boolean(fieldErrors.subject)}
            aria-describedby={fieldErrors.subject ? "subject-err" : undefined}
            onChange={(e) => set({ subject: e.target.value })}
          />
          {err("subject")}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor={ids.original} className="text-[13px] font-medium leading-tight text-ink-2">
              {F.originalHours}
            </label>
            <TextInput
              id={ids.original}
              className={cn(fieldCls, "tabular font-mono")}
              inputMode="decimal"
              value={form.originalHours}
              placeholder="6"
              invalid={Boolean(fieldErrors.originalHours)}
              aria-describedby={fieldErrors.originalHours ? "originalHours-err" : undefined}
              onChange={(e) => set({ originalHours: e.target.value })}
            />
            {err("originalHours")}
          </div>
          <div>
            <label htmlFor={ids.next} className="text-[13px] font-medium leading-tight text-ink-2">
              {F.newHours}
            </label>
            <TextInput
              id={ids.next}
              className={cn(fieldCls, "tabular font-mono")}
              inputMode="decimal"
              value={form.newHours}
              placeholder="3"
              invalid={Boolean(fieldErrors.newHours)}
              aria-describedby={fieldErrors.newHours ? "newHours-err" : undefined}
              onChange={(e) => set({ newHours: e.target.value })}
            />
            {err("newHours")}
          </div>
        </div>
        <p className="-mt-2 text-[12px] text-ink-3">{F.hoursHint}</p>

        <div>
          <label htmlFor={ids.today} className="text-[13px] font-medium text-ink-2">
            {F.today}
          </label>
          <TextInput
            id={ids.today}
            className={cn(fieldCls, "tabular font-mono")}
            inputMode="numeric"
            value={form.today}
            placeholder="30"
            invalid={Boolean(fieldErrors.today)}
            aria-describedby={fieldErrors.today ? "today-err" : undefined}
            onChange={(e) => set({ today: e.target.value })}
          />
          {err("today")}
        </div>

        <div>
          <label htmlFor={ids.topic} className="text-[13px] font-medium text-ink-2">
            {F.topic} <span className="font-normal text-ink-3">· {t.common.optional}</span>
          </label>
          <TextInput
            id={ids.topic}
            className={fieldCls}
            value={form.topic}
            maxLength={200}
            placeholder={F.topicPlaceholder}
            invalid={Boolean(fieldErrors.topic)}
            aria-describedby={fieldErrors.topic ? "topic-err" : `${ids.topic}-hint`}
            onChange={(e) => set({ topic: e.target.value })}
          />
          {err("topic") ?? (
            <p id={`${ids.topic}-hint`} className="mt-1 text-[12px] text-ink-3">
              {F.topicHint}
            </p>
          )}
        </div>

        <fieldset>
          <legend className="mb-1.5 text-[13px] font-medium text-ink-2">{F.tasksSource}</legend>
          <div className="grid gap-1.5">
            {(
              [
                { v: "template", label: F.sourceTemplate, hint: F.sourceTemplateHint, show: true },
                { v: "plan", label: planTasks.length ? F.sourcePlan(planTasks.length) : F.sourcePlanUnloaded, hint: F.sourcePlanHint, show: canUsePlan },
                { v: "example", label: `${R.source.example} (${exampleTasks?.length ?? 0})`, hint: R.source.exampleNote, show: Boolean(exampleTasks) },
              ] as const
            )
              .filter((o) => o.show)
              .map((o) => (
                <label
                  key={o.v}
                  className={cn(
                    "cursor-pointer rounded-[10px] border px-3 py-2 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-path-a/50",
                    form.source === o.v ? "border-ink/60 bg-surface-2" : "border-line hover:border-line-strong",
                  )}
                >
                  <input
                    type="radio"
                    name="source"
                    className="sr-only"
                    checked={form.source === o.v}
                    onChange={() => {
                      set({ source: o.v });
                      // Explicit opt-in: only now read the saved plan from the server.
                      if (o.v === "plan" && API_MODE === "remote" && !state?.plan) void sync();
                    }}
                  />
                  <span className="block text-[13.5px] text-ink">{o.label}</span>
                  <span className="mt-0.5 block text-[12px] leading-snug text-ink-3">{o.hint}</span>
                </label>
              ))}
          </div>
          {form.source === "plan" && planTasks.length === 0 && (
            <p className="mt-2 text-[12.5px] text-ink-3">{planLoading ? t.common.loading : F.sourcePlanEmpty}</p>
          )}
          {sourceTasks.length > 0 && (
            <ul className="mt-2 grid gap-1 text-[12.5px] text-ink-2">
              {sourceTasks.map((x) => (
                <li key={x.id} className="flex justify-between gap-2">
                  <span className="min-w-0 truncate">{x.title}</span>
                  <span className="tabular shrink-0 font-mono text-ink-3">{formatMinutes(x.planned_minutes)}</span>
                </li>
              ))}
            </ul>
          )}
        </fieldset>

        <div className="flex flex-wrap gap-2 pt-1">
          <Button type="submit" variant="primary" disabled={loading || (form.source === "plan" && planTasks.length === 0)} iconRight={<ArrowRight />}>
            {loading ? F.recalculating : F.submit}
          </Button>
          <Button variant="ghost" onClick={reset} icon={<Reset size={14} />}>
            {F.reset}
          </Button>
        </div>
        <Button variant="secondary" onClick={() => void loadExample()} disabled={loading}>
          {F.example}
        </Button>
      </form>

      {/* ----------------------------------------------------------- result */}
      <div ref={resultRef} className="grid scroll-mt-14 gap-4" aria-live="polite">
        <div className="flex flex-wrap items-center gap-2">
          {result && <Tag tone="a">{R.source.live}</Tag>}
          {result?.example && <Tag tone="warn">{R.source.example}</Tag>}
        </div>
        {result?.example && <p className="-mt-2 text-[13px] text-ink-2">{R.source.exampleNote}</p>}

        {result && (
          <div className="rounded-panel border border-line px-4 py-3">
            <label htmlFor={ids.slider} className="flex items-baseline justify-between gap-3 text-[13px] font-medium text-ink-2">
              {F.sliderLabel}
              <output htmlFor={ids.slider} className="tabular font-mono text-[15px] text-ink">
                {formatMinutes(hoursToMinutes(sliderValue))}
              </output>
            </label>
            <input
              id={ids.slider}
              type="range"
              min={0}
              max={40}
              step={0.5}
              value={sliderValue}
              onChange={(e) => onSlide(Number(e.target.value))}
              aria-valuetext={formatMinutes(hoursToMinutes(sliderValue))}
              className="mt-2 w-full accent-[var(--color-path-a)]"
            />
          </div>
        )}

        {error !== null && (
          <div className="grid gap-1.5">
            <ApiErrorNotice error={error} onRetry={() => void run(form)} />
            {error instanceof ApiError && error.code === "too_large" && <p className="text-[13px] text-ink-2">{R.errors.tooLarge}</p>}
          </div>
        )}

        {result ? (
          <div className={cn("transition-opacity", loading && "opacity-60")}>
            <RecoveryResult data={result.data} />
          </div>
        ) : (
          !error && (
            <div className="rounded-panel border border-dashed border-line-strong px-5 py-10 text-center text-[14px] text-ink-3">
              {loading ? F.recalculating : R.result.empty}
            </div>
          )
        )}
      </div>
    </div>
  );
}
