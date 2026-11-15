---
name: mirror-design-system
description: MIRROR AI visual language — tokens, typography, solid/dashed metaphor, component styling, motion and anti-patterns. Use when creating or restyling any UI in this repo (pages, components, colours, spacing, icons, charts).
---

# MIRROR design system — "Two paths. One future."

Recurring metaphor: **CURRENT SELF → DECISION POINT → POSSIBLE FUTURES → REALITY**.
Every visual decision should support comparing choices, not decorate.

## Tokens (src/app/globals.css `@theme`)
| Role | Token / Tailwind | Use |
|---|---|---|
| Background | `bg-bg` #0b0f17, `bg-bg-elev` | page, sidebar, trajectory canvas |
| Surfaces | `bg-surface`, `bg-surface-2`, `bg-surface-3` | panels, selected rows, hover/track |
| Lines | `border-line`, `border-line-strong` | hairlines; strong = focus-adjacent emphasis |
| Text | `text-ink` (warm off-white), `text-ink-2`, `text-ink-3` | primary / secondary / metadata |
| Now | `now` | the present: solid, off-white |
| Path A / B | `path-a` (blue), `path-b` (apricot) | scenarios only. Blue/orange is colour-blind safe |
| Future | `future` (lavender) | the goal; **always dashed** |
| Done | `done` (sage) | real completed work only |
| Warn / Risk | `warn`, `risk` | load "tight" / overload, high-severity risks, errors |

Never introduce raw hex in components; add a token first.

## Semantic conventions (do not break)
- **Solid = known or chosen. Dashed = possible, not chosen, or a goal.** Applies to borders, connectors, chips.
- Path A is always blue, B always apricot, in every screen.
- Unchosen path after a choice: opacity ~0.5, dashed.
- `done` colour only for data that comes from checked tasks.

## Typography
- `font-serif` (Literata): page titles (`text-title`), hero (`text-display`), key statements (goal, decision question). Max one serif block per section.
- `font-sans` (Onest): all UI, 15px base. Labels 13px `text-ink-2`.
- `font-mono` (JetBrains Mono): numbers, hours, dates, `.eyebrow` labels. Add `.tabular` to numbers that change.
- All fonts carry Cyrillic subsets — keep it that way.

## Layout and spacing
- Content max width 1120px; gutters `px-4 md:px-8`. Sidebar 248px from `lg`; bottom tab bar below `lg`.
- Spacing rhythm: 4/8 multiples; section gaps `gap-6 md:gap-8`; panel padding `px-5 py-4`.
- Radius: panels `rounded-panel` (14px), controls `rounded-control` (9px), chips full.
- Prefer **one panel with hairline dividers** over many identical cards. Vary composition (12-col asymmetric 7/5).
- One `variant="primary"` (off-white) button per view = the next step.

## Motion
- `.animate-rise` for entering content (420ms ease-out-soft), stagger via `animationDelay`.
- Transitions 150–300ms on colour/opacity/width only. `prefers-reduced-motion` is globally respected.
- No looping animations, no parallax, no glow.

## Accessibility
- Visible `:focus-visible` ring (path-a). Native radios/checkboxes styled with `sr-only` + `has-[:focus-visible]`.
- Every input has a `<label>`; errors use `aria-invalid` + `aria-describedby` (use `Field`).
- Colour is never the only signal: tags carry text, the chosen path also gets a "выбран" label.
- Contrast: body text ≥ `ink-2` on surfaces; `ink-3` only for metadata.

## Anti-patterns (reject in review)
Purple→blue gradient heroes, glowing orbs, glassmorphism, emoji icons, stock AI art, decorative charts with invented data, probability-of-success percentages, three identical feature cards, huge empty dashboard zones, techno-jargon copy.

## Building blocks
`components/ui/button.tsx`, `form.tsx` (Field, TextInput, TextArea, ChoiceCards, CheckChips, NumberStepper), `surface.tsx` (Panel, Meter, Tag, PageHeader, LoadingBlock), `icons.tsx` (inline SVG, 16px grid), `trajectory/trajectory-map.tsx` (decision visual), `twin/twin-mirror.tsx` (identity visual), `brand/logo.tsx`.

## Twin visual (TwinMirror)
- Current Self: solid off-white frame, cool-blue light from below. Future Self: dashed lavender frame, lavender/apricot light, outlined monogram.
- Both frames show the **same** person; only light and material differ. Never imply a change in appearance, intelligence or worth.
- Blue/apricot here are *light*, not borders. Path A/B borders stay reserved for scenarios.
- Depth = frame rotateY + per-layer parallax (`--d`) driven by `--px/--py`; mouse only, disabled for reduced motion.
- Images: `public/twin/current-self.webp`, `future-self.webp` (brief: `docs/twin-assets.md`). Never substitute stick figures or robot SVGs.
