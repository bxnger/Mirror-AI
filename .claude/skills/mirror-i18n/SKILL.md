---
name: mirror-i18n
description: MIRROR AI localization (ru default, kk, en) — dictionary structure, type-safe keys, the locale-aware `t` proxy and useT/useLocale hooks, Intl dates/numbers, Russian/Kazakh plurals, Kazakh quality rules and localization QA. Use when adding or changing any user-facing text, dates or numbers.
---

# MIRROR i18n

## Files
| Path | Role |
|---|---|
| `src/i18n/ru.ts` | Source of truth. `export type Dictionary = typeof ru`. |
| `src/i18n/kk.ts`, `src/i18n/en.ts` | `export const kk: Dictionary = {…}`. tsc fails on a missing **or** extra key. |
| `src/i18n/index.ts` | `t` (locale-aware proxy), `formatDate`, `formatNumber`, `plural`, `LOCALES`. |
| `src/i18n/use-locale.ts` | `useLocale()` (subscribe), `useT()` (subscribe + dictionary), `localeStore.set()`. |
| `src/fixtures/demo.ts`, `lab-templates.ts` | Fixture content authored per locale (`Record<Locale, …>`). |

## Rules
1. **No user-facing string literals in components.** Add the key to `ru.ts` first, then `kk.ts` and `en.ts` in the same change; `npx tsc --noEmit` proves completeness.
2. Keys: `screen.section.item` in camelCase (`reality.pvr.status.under`). Values with numbers are functions: `week: (n: number) => …`. Enum labels live in `labels.*` keyed by the domain union.
3. Domain code emits **codes + params**, never prose (`RiskCode`, `TradeoffCode`, `ErrorCode`).
4. Never translate user-entered content. Demo content is loaded in the current language once, then treated as user content.
5. A language switch must not reset state: don't key components by locale.

## How switching works
- `t.lab.title` resolves against the active dictionary **at read time**, so module-level `const T = t.lab` is safe.
- Components re-render because route roots (`app/**/page.tsx`, `AppShell`, the onboarding and welcome pages) call `useLocale()`. **A new route root must call `useLocale()`.** New leaf components may use `useT()`.
- SSR and hydration always render `ru` (static pages). The stored locale (`mirror-ai:locale`) is applied right after hydration. The boot script in `<head>` sets `<html lang>` early.

## Formatting
- Always `formatDate` / `formatNumber` from `@/i18n`; never `toLocaleString` directly.
- Kazakh month names are built manually (`formatKk`) because some browsers lack kk ICU month data and print "M11".
- Plurals: `plural(n, { one, few, many, other })`. ru uses one/few/many; en one/other; **kk has no plural agreement after numerals** ("5 апта"). Prefer short units (`ч`, `сағ`, `h`, `wk`) in chips.

## Kazakh quality
- "Сіз" form, neutral and supportive tone. Terms: Егіз, Қазіргі мен / Болашақ мен, Жоспар, апта, сағ/апта, шешім нүктесі, ықтимал сценарий, есептелген мерзім, қазіргі қарқынмен, «Бұл болжам емес, есептік бағалау».
- Don't attach case suffixes to interpolated numbers or user text (vowel harmony can't be guaranteed). Use "Орындалды: 3 / 5" or "N-апта".
- Ask a native speaker (Jangir or Eraman) to review new long copy before a demo.

## QA
- Switch RU → KK → EN on every screen: no overflow at 390px, no raw keys, no Russian left in kk/en.
- Fill half a form, switch language → values stay.
- Reload → language persists. Dates show month names in kk.
- `grep -rnP "[\x{0400}-\x{04FF}]" src --include='*.tsx'` → only fixtures and dictionaries should match.
