# Frontend ↔ backend contract (as implemented)

Status: **integrated** against the FastAPI backend in `backend/` (verified on a running server, 2026-11-17).
The earlier frontend proposal (`/api/compare`, `/api/plan`, …) was never implemented. The frontend now
adapts to the real API below. Nothing in `backend/` was changed.

## Transport
- The browser calls the same origin: `/mirror-api/*`. `next.config.ts` rewrites this to
  `${MIRROR_BACKEND_URL}/api/*`, so there is no CORS and no backend URL or credential in the browser.
- `src/lib/api/http.ts` normalizes errors: `network`, `timeout`, `unavailable` (the proxy can't reach the
  backend), `validation` (422), `conflict` (409, e.g. a loop-order rule), `not_found`, `server`.
  The backend's `detail` text is shown to the user.

## Endpoints used
| Frontend action | Backend call |
|---|---|
| Onboarding (create) | `POST /users` → `PUT /users/{id}/current-self` → `PUT /users/{id}/future-self` |
| Onboarding (edit) | `PUT current-self`, `PUT future-self` |
| Load everything (sync) | `GET /twin`, `/scenarios`, `/decisions`, `/plans`, `/reality-checks`, `/comparisons/{id}` |
| What If compare | `POST /goals` (one track goal per path, reused if the path is unchanged) → 2× `POST /scenarios` → `POST /whatif/compare` |
| Choose path | `POST /decisions` |
| Plan / next week | `POST /plans` |
| Tick a task | `PATCH /tasks/{id}` `{status: done \| pending}` |
| Reality Check | `POST /plans/{pid}/reality-check` `{feedback, perceived_difficulty}` |
| Adaptation | `POST /proposals/{id}/accept` · `/reject` |

## How frontend concepts map to backend data
| Frontend | Backend |
|---|---|
| Profile goals (titles) | `future_self.vision` (main goal) + `desired_achievements` (all goal titles) + `horizon_date` |
| Free hours, constraints | `current_self.weekly_hours_available`, `constraints` (localized labels + note) |
| Lab path A/B | one `Goal` (`domain: "path"`, `metric_type: "milestones"`, milestones = path steps, target date = duration) + one `Scenario` allocating the path's hours to it |
| Chosen path | latest `Decision` whose scenario (or its adaptation revision, via `parent_scenario_id`) belongs to the current A/B |
| Plan week *n* | backend plan *n* of that decision chain; tasks keep `day_of_week`; reviewed plans are read-only |
| Check-in week *n* | Reality Check of plan *n* (planned and actual hours computed by the backend from task statuses) |
| Confirmed adaptation | accepted `adjust_allocation` → the new scenario revision's hours become the path's hours/week |

## Ownership
- **Remote mode** (`NEXT_PUBLIC_MIRROR_API_MODE=remote`): the backend is the source of truth. The store is an
  in-memory cache rebuilt on every sync and never written to localStorage. Old local data is ignored
  (never uploaded or merged).
- localStorage keeps only `mirror-ai:remote-user` (which backend user this browser uses),
  `mirror-ai:remote-ext:v1:<userId>` (fields the backend lacks, see below), and UI preferences
  (language and theme).
- **Demo** stays local and fictional in both modes; it never calls the backend.
- If the backend fails, the UI shows an error with a retry button and never falls back to fictional data.
  A `404` on the user means it no longer exists (e.g. the DB was reset): the browser disconnects.

## Mismatches found and how they were resolved
1. **Documented vs real API**: the old proposal didn't match the implementation. → The adapter targets the real routes; this file replaces the proposal.
2. **`POST /goals` returns `id`**, not `goal_id` (the twin uses `goal_id`). → Typed separately (`BGoal`).
3. **No CORS** on the backend. → Same-origin proxy via Next rewrites (no backend change).
4. **Scenario model**: the backend scenario is an *allocation of hours across goals*; the frontend path is an *alternative with duration, steps, pros/cons*. → Path = one track goal + one scenario. Path details (description, pros/cons, demands, goal fit) stay in the local extension.
5. **Mapping artefacts in risks**: with one goal per path, `unfunded_goal` (the other path) and `concentration` (100% on one goal) would fire on every comparison. → Filtered in `src/lib/remote/mapping.ts`, with a comment. The priority-alignment index is not shown, because it is meaningless with one goal per scenario.
6. **Actual hours**: the backend derives them from task statuses; there is no manual input. → In remote mode the Reality Check form is "tick tasks + note + difficulty"; the manual hours field exists only in demo mode.
7. **Check-in editing/deleting**: no endpoint. → Remote check-ins are read-only (labelled in the UI).
8. **Plan horizon**: the backend plans one week at a time and the next requires Reality Check (`409`). → The frontend shows the weeks that exist plus a "build next week's plan" button.
9. **Missing fields**: stage, skills, constraint tags, goal priorities, path details. → Kept in `remote-ext` per user id (never mixed between users).
10. **No delete or archive** for goals or users, and no name update. → Editing the profile doesn't rename the backend user; changed paths create new track goals and the old ones stay active.
11. **Partial task completion** (`partial` + minutes) is not exposed in the UI yet (done/pending only).

## Recovery Preview (P0) and task status
- `POST /recovery/preview`, `GET /recovery/demo` are used as documented in `docs/recovery-contract.md` (guest `/recover`, example `/recover/example`).
- `PATCH /tasks/{id}` now exposes `partial` (1…planned−1 minutes) and `skipped` in the remote plan UI; resolves item 11 below.

## Requests for the backend (Erasyl)
- Optional fields or endpoints for: stage, skills (beyond goal states), scenario metadata (duration, pros/cons, demands), user rename, goal archive.
- `PATCH /reality-checks/{id}` if editing check-ins should be possible.
- Auth or user scoping before any public deployment (today any id is readable).
- CORS is only needed if the frontend and backend are deployed on different origins without a proxy.
