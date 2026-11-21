# Architecture review: Lab path → backend goal mapping

Context: `src/lib/remote/mapping.ts` and `docs/backend-contract.md` (mismatches 4, 5, 10).
Not changed in Recovery P0; no independently critical bug was found that would require it.

## 1. Is "one Lab path = one backend Goal" semantically correct?

**No, it is a workaround that works only because of how the UI uses it.**

- In the backend, a `Scenario` is an *allocation of one shared weekly budget across goals that are pursued at the
  same time*, and a `Goal` is a *thing the student wants to reach* (it has a current state, a target and a gap).
- A Lab path (A/B) is an *alternative way to reach the same goal*: the student will follow one of them, not both.
- Mapping each path to its own `Goal` (`domain: "path"`, `metric_type: "milestones"`) and each scenario to fund
  exactly one of these goals makes the backend believe the student has two concurrent goals, each with 0 hours in
  the other scenario.
- Side effects:
  - Both path goals stay `active`: Gap Analysis, twin `skills/targets`, What-If priority weights and the memory
    context include options as if they were goals.
  - Because there is no archive endpoint, every changed path creates a new goal and the old ones stay active
    (contract mismatch 10), so this set grows over time.
  - The priority-alignment index becomes meaningless (correctly hidden by the frontend).

## 2. Can the suppressed `unfunded_goal` / `concentration` warnings hide genuine risks?

**Yes, in some cases.** The frontend drops these codes for every comparison and also removes explanation lines
matching `/100%|0 ч\/нед — цель не продвигается/`.

- A path with **0 hours/week** funds its own goal with 0 h. That is a real `unfunded_goal` (the path cannot progress)
  and is hidden today. `over_capacity` is not filtered, but "too little time" is.
- If the backend user has **real goals** besides path goals (possible via the API, demo console or a future
  feature), their `unfunded_goal` and a genuine `concentration` are hidden too.
- The **text regex** is brittle: it depends on Russian template wording, so it silently stops working for LLM
  explanations or other locales. It also removes any strength or trade-off that happens to contain "100%".
- Not hidden: `over_capacity`, `no_slack`, `thin_allocation`, `above_observed_capacity`, `above_observed_goal_pace`.

Severity: medium, not critical for the defense demo (paths always have hours in the UI), but it can mislead a real
user who enters 0 h for a path or uses the API directly.

## 3. Minimal longer-term fix

1. **Backend (small, backward compatible).** `POST /users/{id}/whatif/compare` accepts
   `"mode": "allocation" | "alternatives"` (default `allocation`, current behaviour). In `alternatives` mode each
   scenario is evaluated only against the goals it funds: no `unfunded_goal` for goals funded only by the other
   scenarios, no `concentration`, priority alignment `null`, while `unfunded_goal` *within* the scenario (0 h) stays.
   The response echoes `mode`. About 30 lines in `whatif.py` / `loop.py`, plus tests.
2. **Backend.** `PATCH /users/{id}/goals/{gid}` with `{"status": "archived"}` (the model already has `Goal.status`
   and every read path already filters `active`). The frontend archives a replaced path goal.
3. **Frontend.** Filter risks by `code` only and delete the text regex; in `alternatives` mode no filtering is needed.

Longer term: a first-class `Decision` with `alternatives[]` in the backend (path title, duration, steps, pros/cons),
which would also absorb the `remote-ext` local fields (contract mismatch 9).
