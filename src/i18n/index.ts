/**
 * MIRROR i18n core (no dependencies).
 *
 *  - Dictionaries: ./ru.ts (source of truth, defines `Dictionary`), ./kk.ts, ./en.ts.
 *  - `t` is a type-safe, locale-aware view of the ACTIVE dictionary. Property access
 *    is resolved at read time, so `const T = t.lab` at module scope stays correct
 *    after a language switch.
 *  - Components re-render on a switch by subscribing via `useLocale()` / `useT()`
 *    (see ./use-locale.ts). Route roots and AppShell subscribe; children re-render with them.
 *  - Server render and hydration always use "ru" (static pages); the stored locale is
 *    applied right after hydration, so there is never a hydration mismatch.
 */
import { en } from "./en";
import { kk } from "./kk";
import { ru, type Dictionary } from "./ru";

export type { Dictionary };
export type Locale = "ru" | "kk" | "en";
export const LOCALES: readonly Locale[] = ["ru", "kk", "en"] as const;
export const DEFAULT_LOCALE: Locale = "ru";
export const LOCALE_STORAGE_KEY = "mirror-ai:locale";

const dictionaries: Record<Locale, Dictionary> = { ru, kk, en };

let active: Locale = DEFAULT_LOCALE;

/** Called by useLocale() during render; idempotent. */
export function setActiveLocale(locale: Locale) {
  active = locale;
}
export function getActiveLocale(): Locale {
  return active;
}
export function getDictionary(locale: Locale = active): Dictionary {
  return dictionaries[locale];
}
export function isLocale(v: unknown): v is Locale {
  return v === "ru" || v === "kk" || v === "en";
}

type Path = PropertyKey[];

function resolve(path: Path): unknown {
  let o: unknown = dictionaries[active];
  for (const k of path) o = o == null ? undefined : (o as Record<PropertyKey, unknown>)[k];
  return o;
}

const isPlainObject = (v: unknown): v is Record<PropertyKey, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);

function view(path: Path): unknown {
  return new Proxy(
    {},
    {
      get(_, key) {
        const v = resolve([...path, key]);
        return isPlainObject(v) ? view([...path, key]) : v;
      },
      has(_, key) {
        const v = resolve(path);
        return isPlainObject(v) && key in v;
      },
      ownKeys() {
        const v = resolve(path);
        return isPlainObject(v) ? Reflect.ownKeys(v) : [];
      },
      getOwnPropertyDescriptor(_, key) {
        const v = resolve(path);
        if (!isPlainObject(v) || !(key in v)) return undefined;
        const value = v[key];
        return { configurable: true, enumerable: true, writable: false, value: isPlainObject(value) ? view([...path, key]) : value };
      },
    },
  );
}

/** Locale-aware dictionary view. Prefer `useT()` in new components. */
export const t = view([]) as Dictionary;

/* ------------------------------------------------------------- formatting */

/** Plural category for the active locale (ru: one/few/many/other, kk & en: one/other). */
export function plural(n: number, forms: { one: string; few?: string; many?: string; other: string }) {
  const rule = new Intl.PluralRules(dictionaries[active].locale).select(n);
  if (rule === "one") return forms.one;
  if (rule === "few" && forms.few) return forms.few;
  if (rule === "many" && forms.many) return forms.many;
  return forms.other;
}

/** kk uses the same separators as ru ("10,5"; "1 200"). Chrome's ICU lacks kk number data, so borrow ru. */
const NUMBER_LOCALE: Record<Locale, string> = { ru: "ru-RU", kk: "ru-RU", en: "en-GB" };

export function formatNumber(n: number, maxFraction = 1) {
  return new Intl.NumberFormat(NUMBER_LOCALE[active], { maximumFractionDigits: maxFraction }).format(n);
}

const KK_MONTHS = ["қаңтар", "ақпан", "наурыз", "сәуір", "мамыр", "маусым", "шілде", "тамыз", "қыркүйек", "қазан", "қараша", "желтоқсан"];
const KK_MONTHS_SHORT = ["қаң.", "ақп.", "нау.", "сәу.", "мам.", "мау.", "шіл.", "там.", "қыр.", "қаз.", "қар.", "жел."];

/**
 * Some browsers ship ICU data without Kazakh month names (Chrome renders "M11").
 * For kk + named months we build the string ourselves: "16 қараша 2026 ж., 14:05".
 */
function formatKk(d: Date, opts: Intl.DateTimeFormatOptions): string {
  const month = (opts.month === "long" ? KK_MONTHS : KK_MONTHS_SHORT)[d.getMonth()];
  const parts: string[] = [];
  if (opts.day) parts.push(String(d.getDate()));
  parts.push(month);
  if (opts.year) parts.push(`${d.getFullYear()} ж.`);
  let out = parts.join(" ");
  if (opts.hour) {
    out += `, ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }
  return out;
}

export function formatDate(iso: string | Date, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "long" }) {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (active === "kk" && (opts.month === "long" || opts.month === "short")) return formatKk(d, opts);
  return new Intl.DateTimeFormat(dictionaries[active].locale, opts).format(d);
}
