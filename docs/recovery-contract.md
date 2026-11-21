# Recovery Preview API — contract (P0)

Status: **implemented** on branch `feat/recovery-p0` (backend). Algorithm version: `recovery-p0.1`.
Entry question: *"My study plan changed. What should I realistically do now?"*

The endpoint is **stateless and user-less**: no user id, no database read or write, no LLM, no API key.
The same request always returns the same response.

---

## 1. Endpoints

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/recovery/preview` | Recalculate a week under a new time budget. **Preview only, nothing is saved.** |
| `GET` | `/api/recovery/demo` | DEMO fixture (6 h → 3 h) with its preview. Not real user data. |

Through the frontend proxy: `/mirror-api/recovery/preview` and `/mirror-api/recovery/demo`.

## 2. Units and conventions

- Every duration is an **integer number of minutes** (JSON number without fraction).
  `90.5`, `"90"` and `true` are rejected (`422`).
- Weekly values: `0 … 6720` (112 h). Today: `0 … 1440`. A task: `0 … 6720`.
- Priority: integer `1 … 5`, **5 = most important** (same scale as the rest of the backend;
  frontend `high / medium / low` → `5 / 3 / 1`).
- Proposed minutes are multiples of **5**, except a task kept in full, which keeps its own minutes.
- Unknown fields are rejected (`422`), so no personal data can slip in.
- Request body larger than **32 KB** → `413`.
- Response texts are **codes**; all user-facing wording lives in the frontend i18n (ru / kk / en).

## 3. Request — `RecoveryPreviewIn`

| Field | Type | Required | Notes |
|---|---|---|---|
| `category` | `"ent" \| "sat" \| "ielts" \| "other"` | yes | exam or preparation category |
| `subject` | string, 1–160 | yes | e.g. "Математика" |
| `original_weekly_minutes` | int 0–6720 | yes | the budget the old plan was made for |
| `new_weekly_minutes` | int 0–6720 | yes | time that is realistically available now |
| `available_today_minutes` | int 0–1440 | yes | used for the "start now" action |
| `tasks` | `RecoveryTaskIn[]`, 0–50 | no (default `[]`) | the planned tasks of the week |
| `topic` | string ≤ 200 or `null` | no | user's own topic / material reference; echoed back, never analysed |

`RecoveryTaskIn`

| Field | Type | Notes |
|---|---|---|
| `id` | string 1–64, `[A-Za-z0-9_.:-]` | unique within the request |
| `title` | string 1–160 | echoed back unchanged |
| `planned_minutes` | int 0–6720 | |
| `priority` | int 1–5, default 3 | |

## 4. Response — `RecoveryPreviewOut`

| Field | Type | Notes |
|---|---|---|
| `preview` | `true` | always |
| `persisted` | `false` | always: nothing was saved |
| `algorithm_version` | string | `recovery-p0.1` |
| `category`, `subject`, `topic` | echo of the request | |
| `status` | `"fits" \| "reduced" \| "paused"` | `paused` when the new budget is 0 |
| `summary` | object | see below |
| `tasks` | `RecoveryTaskOut[]` | **same order as the request** |
| `template_plan` | `TemplateItemOut[]` | only when no tasks were sent |
| `warnings` | `{code, params}[]` | see §6 |
| `assumptions` | `string[]` (codes) | see §6 |
| `next_action` | object | exactly one realistic next step |

`summary` — all integers except the ratio:

| Field | Meaning |
|---|---|
| `original_budget_minutes` | from the request |
| `original_workload_minutes` | sum of task minutes; without tasks = `original_budget_minutes` |
| `new_budget_minutes` | from the request |
| `reserve_minutes` | visible buffer, see §5 |
| `planning_budget_minutes` | `new_budget − reserve` |
| `proposed_minutes` | sum of proposed task (or template) minutes |
| `unallocated_minutes` | planning budget left unused |
| `deferred_minutes` | `workload − proposed` (tasks only) |
| `kept_count`, `shortened_count`, `deferred_count` | |
| `budget_change_ratio` | `new / original`, 3 decimals; `null` when original is 0 |

Invariants (enforced in code and tests):
`proposed + reserve + unallocated = new_budget` · `Σ task.proposed + deferred = workload` ·
`0 ≤ task.proposed ≤ task.previous` · `task.deferred = task.previous − task.proposed`.

`RecoveryTaskOut`: `id`, `title`, `priority`, `rank` (1 = processed first), `previous_minutes`,
`proposed_minutes`, `deferred_minutes`, `action` (`keep | shorten | defer`), `reason` (§6).

`TemplateItemOut`: `key` (`review_material | practice_set | check_mistakes`), `proposed_minutes`.

`next_action`: `kind` (`start_task | start_template | schedule_next_session | pause`),
`task_id` or `template_key` (or both `null` for `pause`), `minutes`, `reason` (§6).

## 5. Algorithm (deterministic)

1. `reserve = floor5(10% × new_budget)` if `new_budget ≥ 60`, else `0`.
2. `planning = new_budget − reserve`.
3. Tasks are processed by **priority 5 → 1**; equal priorities keep the request order (`rank`).
4. Task fits the remaining planning time → **keep** in full (`fits_budget`).
5. Does not fit → **shorten** to `floor5(remaining)` if that is at least
   `max(20 min, ceil(25% × planned))` (`shortened_to_fit`); otherwise **defer**
   (`deferred_below_meaningful_minimum`, or `deferred_no_budget` when nothing is left).
   Lower-priority tasks that still fit completely are kept.
6. `new_budget = 0` → every task **deferred** (`paused_no_time`), `status = "paused"`, `next_action.kind = "pause"`.
7. A task with 0 planned minutes is kept at 0 (`zero_planned`).
8. No tasks → generic study start, **not** based on any knowledge of the student:
   planning ≥ 60 → review 30% / practice 50% (+ rounding remainder) / check mistakes 20%;
   20–59 → one `review_material` block; < 20 → no template, only a short start.
9. `next_action`: about **10 minutes** (never more than today's time or the item's minutes) on the
   highest-priority kept task; if everything was deferred but time remains, a short start on the top task;
   without tasks, the first template block. Today = 0 → `schedule_next_session`.

Nothing is ever deleted or marked done. More study time is never presented as a guarantee of a better result.

## 6. Codes

**`tasks[].reason`**: `fits_budget` · `shortened_to_fit` · `deferred_no_budget` ·
`deferred_below_meaningful_minimum` · `paused_no_time` · `zero_planned`

**`warnings[].code`** (`params` in brackets):
- `original_plan_over_budget` (`workload_minutes`, `budget_minutes`, `excess_minutes`): the old plan already did not fit its own budget
- `workload_exceeds_new_budget` (`workload_minutes`, `planning_budget_minutes`)
- `no_time_pause_suggested`
- `budget_increased_no_outcome_guarantee` (`original_minutes`, `new_minutes`)
- `reserve_not_feasible` (`min_budget_minutes`): new budget below 60 min, no buffer
- `high_priority_reduced` (`task_ids`: comma-separated): a priority 4–5 task was shortened or deferred
- `today_exceeds_weekly_budget` (`today_minutes`, `weekly_minutes`)
- `no_tasks_generic_template`

**`assumptions`**: `minutes_are_focused_study_time` · `priorities_supplied_by_user` ·
`more_time_does_not_guarantee_better_results` · `deferred_tasks_are_kept_not_deleted` ·
`reserve_is_10_percent_of_new_budget` · `generic_template_not_based_on_known_weaknesses` ·
`original_workload_equals_original_budget_without_tasks`

**`next_action.reason`**: `highest_priority_kept_task` · `short_start_top_priority` ·
`generic_study_start` · `short_session_only` · `no_time_today` · `no_time_this_week`

## 7. Errors

| Status | When | Body |
|---|---|---|
| `422` | validation: types, ranges, unknown fields, empty strings, > 50 tasks, invalid or **duplicate task ids** | FastAPI format: `{"detail": [{"type", "loc", "msg", "input", …}]}` |
| `413` | body > 32 KB | `{"detail": "Request body too large (max 32768 bytes).", "stage": null}` |

Duplicate ids example: `{"detail":[{"type":"value_error","loc":["body"],"msg":"Value error, duplicate task ids: a", …}]}`.

## 8. DEMO fixture (`GET /api/recovery/demo`)

Fictional ENT math student. Planned 6 h this week, now only 3 h; 30 min free today.

Request:

```json
{
  "category": "ent",
  "subject": "Математика (DEMO)",
  "original_weekly_minutes": 360,
  "new_weekly_minutes": 180,
  "available_today_minutes": 30,
  "topic": null,
  "tasks": [
    {"id": "demo-mock",     "title": "Пробный вариант ЕНТ по математике", "planned_minutes": 120, "priority": 5},
    {"id": "demo-errors",   "title": "Разбор ошибок прошлого пробника",   "planned_minutes": 60,  "priority": 4},
    {"id": "demo-geometry", "title": "Геометрия: задачи на площади",      "planned_minutes": 90,  "priority": 3},
    {"id": "demo-formulas", "title": "Повторение формул",                 "planned_minutes": 45,  "priority": 2},
    {"id": "demo-video",    "title": "Видеоразбор новой темы",            "planned_minutes": 45,  "priority": 1}
  ]
}
```

Response (complete):

```json
{
  "preview": true,
  "persisted": false,
  "algorithm_version": "recovery-p0.1",
  "category": "ent",
  "subject": "Математика (DEMO)",
  "topic": null,
  "status": "reduced",
  "summary": {
    "original_budget_minutes": 360,
    "original_workload_minutes": 360,
    "new_budget_minutes": 180,
    "reserve_minutes": 15,
    "planning_budget_minutes": 165,
    "proposed_minutes": 165,
    "unallocated_minutes": 0,
    "deferred_minutes": 195,
    "kept_count": 1,
    "shortened_count": 1,
    "deferred_count": 3,
    "budget_change_ratio": 0.5
  },
  "tasks": [
    {"id": "demo-mock", "title": "Пробный вариант ЕНТ по математике", "priority": 5, "rank": 1,
     "previous_minutes": 120, "proposed_minutes": 120, "deferred_minutes": 0, "action": "keep", "reason": "fits_budget"},
    {"id": "demo-errors", "title": "Разбор ошибок прошлого пробника", "priority": 4, "rank": 2,
     "previous_minutes": 60, "proposed_minutes": 45, "deferred_minutes": 15, "action": "shorten", "reason": "shortened_to_fit"},
    {"id": "demo-geometry", "title": "Геометрия: задачи на площади", "priority": 3, "rank": 3,
     "previous_minutes": 90, "proposed_minutes": 0, "deferred_minutes": 90, "action": "defer", "reason": "deferred_no_budget"},
    {"id": "demo-formulas", "title": "Повторение формул", "priority": 2, "rank": 4,
     "previous_minutes": 45, "proposed_minutes": 0, "deferred_minutes": 45, "action": "defer", "reason": "deferred_no_budget"},
    {"id": "demo-video", "title": "Видеоразбор новой темы", "priority": 1, "rank": 5,
     "previous_minutes": 45, "proposed_minutes": 0, "deferred_minutes": 45, "action": "defer", "reason": "deferred_no_budget"}
  ],
  "template_plan": [],
  "warnings": [
    {"code": "workload_exceeds_new_budget", "params": {"workload_minutes": 360, "planning_budget_minutes": 165}},
    {"code": "high_priority_reduced", "params": {"task_ids": "demo-errors"}}
  ],
  "assumptions": [
    "minutes_are_focused_study_time",
    "priorities_supplied_by_user",
    "more_time_does_not_guarantee_better_results",
    "deferred_tasks_are_kept_not_deleted",
    "reserve_is_10_percent_of_new_budget"
  ],
  "next_action": {"kind": "start_task", "task_id": "demo-mock", "template_key": null, "minutes": 10,
                  "reason": "highest_priority_kept_task"}
}
```

How to read it: the mock exam (most important) stays in full (120 min); reviewing mistakes is cut from 60 to
the 45 min that are left; geometry, formulas and the video (195 min) are moved to later, not deleted;
15 min stay free as a reserve. Check: 120 + 45 = 165 planned, + 15 reserve = 180 available;
165 + 195 deferred = 360 originally planned. Start now: 10 minutes of the mock exam.

## 9. Preview vs persisted plans

- `/api/recovery/preview` **never** changes profiles, goals, scenarios, decisions, plans, proposals or memory,
  and never reads them. Covered by tests: table row counts are identical before and after, and the endpoint
  works even when the database dependency is broken.
- The existing loop is unchanged: weekly plans come only from a chosen scenario (`POST /users/{id}/plans`),
  and adaptation changes are applied only via `POST /users/{id}/proposals/{pid}/accept`.
- **Applying a preview is not implemented.** It needs extra architecture, to be designed with the frontend:
  1. an endpoint such as `POST /users/{id}/plans/{pid}/recovery` that takes the preview *request*
     (not the response), recomputes it server-side with the same algorithm version, and stores it as an
     `AdaptationProposal` of kind `recovery_reschedule` with status `pending`;
  2. on `accept`: set proposed minutes on the plan's tasks and move deferred tasks to the next plan as carry-over
     (the planner already supports carry-over), with a `MemoryEvent`;
  3. task ids in the preview would then be backend `PlanTask` ids; today they are free-form client ids.
  Until then the UI must label the result as a preview and must not imply it was saved.

## 10. Task completion (existing endpoint, unchanged route)

`PATCH /api/users/{user_id}/tasks/{task_id}` with `{"status": …, "actual_minutes": …}`:

| Request | Result |
|---|---|
| `{"status": "done"}` | done, `actual_minutes = planned_minutes` |
| `{"status": "done", "actual_minutes": 75}` | done, 75 (more than planned is allowed) |
| `{"status": "partial", "actual_minutes": 40}` | partial, 40. Must be `1 … planned − 1`, else `422` |
| `{"status": "skipped"}` | skipped, `actual_minutes = 0` (any minutes sent are ignored) |
| `{"status": "pending"}` | back to pending, `actual_minutes = 0` |

Errors: unknown status, `partial` without minutes or outside `1 … planned − 1`, `done` with `0` minutes → **`422`**
(these returned `409` or were silently accepted before this branch). A task of a plan that already passed Reality
Check → `409` (`stage: "measure"`). Unknown task or another user's task → `404`.
Response: the task object (`id`, `status`, `planned_minutes`, `actual_minutes`, `day_of_week`, `completed_at`, …).
Reality Check uses `actual_minutes`, so `partial` minutes are counted exactly.

## 11. Instructions for the frontend

1. Call `POST /mirror-api/recovery/preview` with integer minutes (`Math.round(hours * 60)`).
   It needs no backend user, so it also works in demo mode if the backend is reachable.
2. Map priorities `high / medium / low` → `5 / 3 / 1`. Send the frontend task ids as `id`
   (ensure they match `[A-Za-z0-9_.:-]{1,64}` and are unique).
3. Render `tasks` in the returned order with `action` (keep, shorten, defer) and `previous → proposed` minutes;
   show `summary.reserve_minutes` and `deferred_minutes` explicitly.
4. Translate every `reason`, `warnings[].code`, `assumptions[]` and `next_action` code in `ru / kk / en`;
   don't show raw codes. Interpolate `params`.
5. Label the screen as a preview ("Предпросмотр — ничего не сохранено"). There is no "apply" button yet (§9).
6. Show `next_action` as the single primary call to action (≈ 10 minutes).
7. Handle `422` (show which field) and `413`. No auth or user id is involved.
8. To expose `partial` completion in the plan UI: send `actual_minutes` between 1 and planned − 1.
