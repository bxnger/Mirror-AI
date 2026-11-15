---
name: mirror-theming
description: MIRROR AI Dark ("Midnight Future") and Light ("paper") themes — semantic tokens, palettes, data-theme switching, no-flash boot script, preference persistence, contrast requirements and visual QA. Use when touching colours, adding UI that must work in both themes, or changing the theme switcher.
---

# MIRROR theming

## Mechanism
- Tokens are CSS variables declared in `@theme` in `src/app/globals.css` (dark = default). The light theme overrides the same variables under `:root[data-theme="light"]`. Tailwind utilities (`bg-surface`, `text-ink-2`, `border-path-a/40`) follow automatically.
- `<html data-theme>` is set **before first paint** by `THEME_BOOT_SCRIPT` (`src/lib/theme-boot.ts`, inlined in `app/layout.tsx`): the saved choice (`mirror-ai:theme`), else `prefers-color-scheme`. `<html>` has `suppressHydrationWarning`.
- `src/lib/theme.ts`: `useTheme()` / `themeStore.set()` change the attribute and persist manual choices. The switcher lives in `components/layout/preferences.tsx` (sidebar, mobile header, landing, onboarding).
- Server-safe constants go in `theme-boot.ts`; never import from a `"use client"` module into a server component.

## Palettes (semantic roles stay identical)
| Token | Dark | Light |
|---|---|---|
| bg / bg-elev | #0b0f17 / #0e131d | #f6f3ec / #efebe2 |
| surface 1-3 | #121926 · #172031 · #1e2a3e | #fbf9f4 · #f1ede4 · #e5dfd3 |
| ink / ink-2 / ink-3 | #f3f1ea / #a8b0bf / #8a93a6 | #161a23 / #454c5a / #5f6673 |
| path-a (blue) | #a3b9ff | #3a57d0 |
| path-b (apricot) | #e8b98f | #a4531a |
| future (lavender) | #c3afe4 | #6e4fb0 |
| done / warn / risk | #8fd3b6 / #e6c27a / #f0a2a2 | #2b7350 / #8a5a00 / #b8322c |

## Rules
- **No raw hex, `white` or `black` in components.** Use tokens and `color-mix(in oklab, var(--color-x) N%, transparent)` for tints.
- Primary button = `bg-ink text-bg` (inverts per theme); hover = `bg-ink/85`.
- Path A blue / Path B apricot / future dashed lavender / done sage in **both** themes.
- Charts: planned = dashed outline, actual = solid; numbers printed on bars; never colour alone.
- Contrast: text tokens ≥ 4.5:1 on `bg` and `surface` (ink-3 is the floor; don't go lighter in light mode).
- Motion: transitions on colour only; global `prefers-reduced-motion` already clamps durations.

## Visual QA
1. Clear localStorage, emulate light and dark `prefers-color-scheme`: first visit follows the system, with no flash.
2. Toggle, reload: the choice persists.
3. Check every screen in both themes at 390 / 768 / 1440: Twin, Future Paths, Lab, Plan, Reality Check (charts), onboarding, dialogs.
4. Look for invisible borders, washed-out tags and white hovers in light mode.
