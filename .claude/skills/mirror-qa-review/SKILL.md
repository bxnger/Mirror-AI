---
name: mirror-qa-review
description: QA and demo-readiness checklist for MIRROR AI — build/lint/typecheck, core flow walkthrough, mobile and accessibility checks, regression and live-demo readiness. Use before saying a feature is done, before a defense/demo, or when asked to test or review the frontend.
---

# MIRROR QA review

Report only what you actually ran or saw. If a check was skipped, say so.

## 1. Static checks (must be clean)
```bash
npx tsc --noEmit
npm run lint
npm run build
```

## 2. Core flow (run against `npx next start`)
1. `/` → "Открыть демо-профиль" → lands on `/twin`, demo badge visible.
2. `/lab` → "Сравнить пути" → result renders, source tag shows demo.
3. Choose A or B → "Перейти к плану" → `/plan` with 4 weeks of tasks.
4. Check a task → reload → still checked. Add a task → it persists and can be deleted.
5. `/twin` shows the chosen path solid, "Факт x/y", and progress equal to checked/total.
6. "Начать со своими данными" → onboarding is empty; complete all 5 steps → `/twin`.
7. Validation: empty step 1, no skills, a duplicate skill, 0 hours, an empty Lab form. Each shows an inline error and focuses the first invalid field.
8. "Сбросить данные" → confirm → `/`.
9. Future Paths: move sliders → "Гипотеза" badge, saved `profile.hoursPerWeek` unchanged in localStorage; "Вернуть мои данные" resets.
10. Reality Check: save, edit, delete a check-in; invalid ("abc", 99) shows inline error; 0 h everywhere → "zero pace" message, no NaN/∞.
11. Demo with real data present → confirm dialog → real data parked in `mirror-ai:backup:v1` → "Выйти из демо" restores it.
12. RU/KK/EN and dark/light on every screen; both persist after reload (see mirror-i18n, mirror-theming).

Domain unit checks can run without a test framework: Node ≥ 23 strips TS types; register a small resolve hook for the `@/` alias and `import` the functions from `src/domain`.

## 3. Layout
Widths 390, 768, 1440: no horizontal overflow (`scrollWidth > clientWidth`), nothing hidden behind the bottom tab bar, long user text wraps.

## 4. Accessibility
Keyboard-only pass: skip link, nav, radios with arrows, checkboxes with space, visible focus everywhere. Labels on all inputs and icon buttons. Not colour-only.

## 5. Honesty and regressions
No percentages except task completion. Future Self dashed and labelled. No link to an unbuilt page. No console errors.

## Screenshot tooling
No Playwright in the repo. Headless Chrome via CDP works with Node ≥ 22 using the built-in `WebSocket`. A throwaway driver script can launch `Google Chrome --headless=new --remote-debugging-port=…`, then navigate, click, and capture `Page.captureScreenshot`. Keep such scripts out of the repo. Save review screenshots to `docs/screenshots/` (named `<width>-<nn>-<screen>.png`). Kill the previous Chrome before reusing a debugging port, or the script attaches to the old browser and its localStorage.
Reduced motion: emulate `prefers-reduced-motion: reduce` via `Emulation.setEmulatedMedia` and confirm transitions ≈ 1ms and no pointer tilt on TwinMirror.

## Demo readiness
Fresh browser profile, demo loaded, a dry run of the 3-minute flow above, and a fallback: reset → demo again.
