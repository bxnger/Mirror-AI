---
name: mirror-frontend-engineering
description: How MIRROR AI frontend code is structured — Next.js 16 App Router, TypeScript, Tailwind 4, client store, API adapter, i18n, validation, loading/error/empty states. Use when adding or changing pages, components, state, forms or backend integration in this repo.
---

# MIRROR frontend engineering

## Stack (verify in package.json before assuming)
Next.js 16.4 (App Router, Turbopack, `cacheComponents: true`), React 19.3, TypeScript strict, Tailwind CSS 4 (`@theme` tokens in `src/app/globals.css`). **No other runtime deps** — don't add packages without a clear need.
Next 16 differs from older versions: read `node_modules/next/dist/docs/` for any API you touch (see AGENTS.md).

## Layers — keep them separate
| Layer | Path | Rules |
|---|---|---|
| Domain types + pure logic | `src/domain/` | No React, no copy. Emit codes, not prose. |
| Demo fixtures | `src/fixtures/demo.ts` | Fictional data only; sets `isDemo: true` |
| API contract + adapters | `src/lib/api/` | UI calls `getApi()`, never `fetch` directly |
| App state | `src/lib/store/` | `useMirror()` + `actions` |
| Copy | `src/i18n/ru.ts` | All user-facing strings; `t` from `@/i18n` |
| Presentation | `src/components/**` | Props in, events out; no localStorage access |
| Routes | `src/app/**` | Thin: read state, render one component |

## State
- `useMirror()` returns `null` during SSR/hydration → render loading. `AppShell` already handles loading and "no profile" for routes under `src/app/(app)/`.
- Mutate only through `actions.*` (persisted to localStorage key `mirror-ai:state:v1`). Bump the version and migrate if you change the shape.
- `saveDecision` clears comparison and choice; the plan is kept until it is explicitly replaced.

## API adapter
- Interface: `MirrorApi` in `src/lib/api/types.ts`. Only `demo` exists (`demo-adapter.ts`, local rules).
- **Never invent endpoints.** The proposed remote contract lives in `docs/backend-contract.md` and must be confirmed with Erasyl before you implement `remote-adapter.ts`.
- Secrets never go into client code. Use `NEXT_PUBLIC_*` only for non-secret config.

## Forms and validation
- Rules in `src/domain/validation.ts` return `ErrorCode`s; messages come from `t.errors`.
- Validate on submit / step change, show inline errors, focus the first `[aria-invalid="true"]`.
- Use `Field` render-prop to wire `id`, `aria-describedby`, `invalid`.

## Every async UI needs
loading (disabled button + label change, `aria-busy`), error (`role="alert"` + retry), and empty (explanation + one CTA). No dead buttons: an unbuilt destination is shown as a non-interactive label, never a link.

## i18n
Russian by default (`<html lang="ru">`). To add English: create `en.ts` typed as `Dictionary` and switch in `src/i18n/index.ts`. Use `plural()`, `formatNumber()`, `formatDate()`; never hardcode strings in components.

## Responsive
Mobile first. Check 390 / 768 / 1440. Use `min-w-0` on flex/grid children holding text, `break-words` on user content. Bottom tab bar covers 72px: sticky footers use `bottom-[72px] lg:bottom-4`.

## Done means
`npx tsc --noEmit`, `npm run lint`, `npm run build` all clean (see mirror-qa-review).
