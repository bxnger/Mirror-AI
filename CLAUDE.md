@AGENTS.md

# MIRROR AI — frontend

AI-powered Future Self Simulator. Loop: Personal Twin → What If Lab → Action Plan → Reality Check → updated Twin.
This repo is the **frontend** (owner: Samir). Backend, LLM and DB belong to Erasyl; don't modify backend systems or invent endpoints.

## Commands
```bash
npm run dev          # http://localhost:3000
npx tsc --noEmit     # typecheck
npm run lint
npm run build
```

## Map
- Routes: `src/app/page.tsx` (welcome), `onboarding/`, `(app)/twin|lab|plan|reality` (wrapped by `AppShell`).
- Domain logic (pure, no React): `src/domain/` — `analysis.ts` (A/B rules), `simulation.ts` (Future Paths), `reality.ts` (plan vs actual, updated timeline), `plan.ts`, `validation.ts`, `types.ts`.
- State: `src/lib/store/` (localStorage v2 + migration, `useMirror()`, `actions`; demo backs up real data under `mirror-ai:backup:v1`). **All data-changing UI calls go through `commands` (`src/lib/store/commands.ts`)**, which dispatch to local actions (demo) or the backend.
- Backend integration: `src/lib/api/http.ts` (same-origin `/mirror-api` → `next.config.ts` rewrite), `src/lib/remote/` (`session.ts` sync and operations, pure `mapping.ts`). Mode: `NEXT_PUBLIC_MIRROR_API_MODE=remote`. In remote mode the backend owns the data; never persist the server cache.
- Pages gate themselves with `<ProfileGate>` (loading / backend error / no profile). `AppShell` must always render `children`, otherwise Next can't validate instant navigation.
- i18n: `src/i18n/{ru,kk,en}.ts` (ru is the type source), `t` / `useT()` / `useLocale()`. No hardcoded UI strings.
- Themes: `data-theme` on `<html>`, tokens in `globals.css`, boot script `src/lib/theme-boot.ts`.
- Demo data (per locale): `src/fixtures/demo.ts`.
- Twin identity visual: `src/components/twin/twin-mirror.tsx`; assets in `public/twin/` (brief: `docs/twin-assets.md`, not provided yet).
- Lab templates (starting points, not data): `src/fixtures/lab-templates.ts`.
- Screenshots of the latest QA pass: `docs/screenshots/`.
- Backend contract as implemented + mismatches: `docs/backend-contract.md`.

## Non-negotiables
- No fabricated metrics, success probabilities or predictions shown as fact. Estimates say "Если условия сохранятся / Это оценка, а не предсказание". Demo data always badged.
- Hypothetical (Future Paths sliders) never writes to the profile or the chosen path; demo never overwrites real data.
- Every new string in ru + kk + en; every new screen checked in both themes.
- Solid = known/chosen, dashed = possible/goal. Path A blue, B apricot — everywhere.
- No dead buttons, no placeholder pages, no horizontal overflow at 390px.
- No new dependencies without a clear need.

## Skills
- `mirror-design-system`: tokens, typography, visual rules.
- `mirror-frontend-engineering`: architecture, state, API adapter, forms.
- `mirror-product-ux`: the loop, the comparison UX, honesty rules.
- `mirror-qa-review`: checks to run before calling anything done.
- `mirror-i18n`: locales, dictionary structure, formatting, Kazakh quality.
- `mirror-theming`: dark/light tokens, switching, contrast, visual QA.

## Deadlines
Nov 17, 2026: pre-defense — full loop incl. Future Paths, Reality Check, demo, RU/KK/EN, dark/light (done). Nov 24: backend integration (branch `feat/frontend-backend-integration`), polish.
