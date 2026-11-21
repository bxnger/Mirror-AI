"""Recovery Preview: "My study plan changed. What should I realistically do now?"

A pure, deterministic recalculation of a weekly study plan under a new time budget.
No database, no LLM, no randomness, no clock: the same input always gives the same output.
Nothing here is persisted; it is a PREVIEW the user inspects before any future confirmation step.

Rules (all minutes are integers):
1. reserve      = 10% of the new budget rounded DOWN to 5 min, only if the new budget >= 60 min.
2. planning     = new budget - reserve.
3. Tasks are processed by priority (5 -> 1), ties keep the input order.
4. A task that fits the remaining planning budget is KEPT in full.
5. A task that does not fit is SHORTENED to the remaining time rounded down to 5 min, but only
   if that is meaningful: at least max(20 min, 25% of the task). Otherwise it is DEFERRED.
6. Deferred work is listed with its minutes; nothing is deleted or marked as done.
7. New budget 0 -> every task is deferred and the preview proposes a pause.
8. No tasks -> an explicitly generic study-start template (no claims about weaknesses).
"""
from __future__ import annotations

from ..recovery_schemas import (
    RecoveryPreviewIn,
    RecoveryPreviewOut,
)

ALGORITHM_VERSION = "recovery-p0.1"
STEP = 5                      # minutes granularity of proposed changes
RESERVE_SHARE = 0.10
RESERVE_MIN_BUDGET = 60       # below this a reserve would make the plan meaningless
MIN_MEANINGFUL = 20           # shorter than this is not worth keeping as a session
MIN_SHARE_OF_TASK = 0.25      # a shortened task keeps at least a quarter of itself
STARTER_MINUTES = 10          # the "start now" action
TEMPLATE_SPLIT = (("review_material", 30), ("practice_set", 50), ("check_mistakes", 20))

# reason codes (machine-readable; texts live in the frontend i18n)
FITS_BUDGET = "fits_budget"
SHORTENED_TO_FIT = "shortened_to_fit"
DEFERRED_NO_BUDGET = "deferred_no_budget"
DEFERRED_BELOW_MINIMUM = "deferred_below_meaningful_minimum"
PAUSED_NO_TIME = "paused_no_time"
ZERO_PLANNED = "zero_planned"


def _floor_step(minutes: int) -> int:
    return max(0, (minutes // STEP) * STEP)


def _ceil_div(a: int, b: int) -> int:
    return -(-a // b)


def reserve_for(budget: int) -> int:
    if budget < RESERVE_MIN_BUDGET:
        return 0
    return _floor_step(int(budget * RESERVE_SHARE))


def meaningful_minimum(planned: int) -> int:
    return max(MIN_MEANINGFUL, _ceil_div(planned * int(MIN_SHARE_OF_TASK * 100), 100))


def _template(planning: int) -> list[dict]:
    """Generic study start: review -> practice -> check, no knowledge of weaknesses assumed."""
    if planning >= 3 * MIN_MEANINGFUL:
        parts = [{"key": k, "proposed_minutes": _floor_step(planning * share // 100)} for k, share in TEMPLATE_SPLIT]
        parts[1]["proposed_minutes"] += planning - sum(p["proposed_minutes"] for p in parts)  # remainder -> practice
        return parts
    if planning >= MIN_MEANINGFUL:
        return [{"key": "review_material", "proposed_minutes": _floor_step(planning)}]
    return []


def _next_action(paused: bool, today: int, planning: int, first_kept: dict | None,
                 top_task: dict | None, template: list[dict]) -> dict:
    """One realistic action: about ten minutes on the most important thing that is still planned."""
    if paused:
        return {"kind": "pause", "minutes": 0, "reason": "no_time_this_week"}
    if first_kept:
        action = {"kind": "start_task", "task_id": first_kept["id"], "reason": "highest_priority_kept_task"}
        cap = first_kept["proposed_minutes"]
    elif top_task:  # everything deferred, but a little time is left: a short start on the top task
        action = {"kind": "start_task", "task_id": top_task["id"], "reason": "short_start_top_priority"}
        cap = planning
    elif template:
        action = {"kind": "start_template", "template_key": template[0]["key"], "reason": "generic_study_start"}
        cap = template[0]["proposed_minutes"]
    else:
        action = {"kind": "start_template", "template_key": "review_material", "reason": "short_session_only"}
        cap = planning
    minutes = min(STARTER_MINUTES, cap)
    if today == 0:
        return {**action, "kind": "schedule_next_session", "minutes": minutes, "reason": "no_time_today"}
    return {**action, "minutes": min(minutes, today)}


def _check(condition: bool, what: str) -> None:
    if not condition:
        raise RuntimeError(f"recovery invariant violated: {what}")


def build_preview(req: RecoveryPreviewIn) -> RecoveryPreviewOut:
    tasks = req.tasks
    original_budget = req.original_weekly_minutes
    new_budget = req.new_weekly_minutes
    paused = new_budget == 0
    reserve = 0 if paused else reserve_for(new_budget)
    planning = new_budget - reserve
    workload = sum(t.planned_minutes for t in tasks) if tasks else original_budget

    order = sorted(range(len(tasks)), key=lambda i: (-tasks[i].priority, i))
    results: dict[int, dict] = {}
    remaining = planning
    for rank, i in enumerate(order, start=1):
        t = tasks[i]
        planned = t.planned_minutes
        if paused:
            proposed, action, reason = 0, "defer", PAUSED_NO_TIME
        elif planned == 0:
            proposed, action, reason = 0, "keep", ZERO_PLANNED
        elif planned <= remaining:
            proposed, action, reason = planned, "keep", FITS_BUDGET
        else:
            candidate = _floor_step(remaining)
            if candidate >= meaningful_minimum(planned):
                proposed, action, reason = candidate, "shorten", SHORTENED_TO_FIT
            else:
                proposed, action = 0, "defer"
                reason = DEFERRED_BELOW_MINIMUM if remaining > 0 else DEFERRED_NO_BUDGET
        remaining -= proposed
        results[i] = {
            "id": t.id, "title": t.title, "priority": t.priority, "rank": rank,
            "previous_minutes": planned, "proposed_minutes": proposed,
            "deferred_minutes": planned - proposed, "action": action, "reason": reason,
        }
    task_rows = [results[i] for i in range(len(tasks))]  # response keeps the user's input order

    template = [] if tasks or paused else _template(planning)
    proposed_total = sum(r["proposed_minutes"] for r in task_rows) + sum(p["proposed_minutes"] for p in template)
    deferred_total = sum(r["deferred_minutes"] for r in task_rows)
    unallocated = new_budget - reserve - proposed_total

    counts = {a: sum(1 for r in task_rows if r["action"] == a) for a in ("keep", "shorten", "defer")}
    if paused:
        status = "paused"
    elif counts["shorten"] or counts["defer"]:
        status = "reduced"
    else:
        status = "fits"

    # ---- warnings (codes + numbers; wording belongs to the frontend)
    warnings: list[dict] = []
    if tasks and workload > original_budget:
        warnings.append({"code": "original_plan_over_budget",
                         "params": {"workload_minutes": workload, "budget_minutes": original_budget,
                                    "excess_minutes": workload - original_budget}})
    if paused:
        warnings.append({"code": "no_time_pause_suggested", "params": {}})
    elif tasks and workload > planning:
        warnings.append({"code": "workload_exceeds_new_budget",
                         "params": {"workload_minutes": workload, "planning_budget_minutes": planning}})
    if new_budget > original_budget:
        warnings.append({"code": "budget_increased_no_outcome_guarantee",
                         "params": {"original_minutes": original_budget, "new_minutes": new_budget}})
    if not paused and reserve == 0:
        warnings.append({"code": "reserve_not_feasible", "params": {"min_budget_minutes": RESERVE_MIN_BUDGET}})
    high_hit = [r["id"] for r in task_rows if r["priority"] >= 4 and r["action"] != "keep"]
    if high_hit and not paused:
        warnings.append({"code": "high_priority_reduced", "params": {"task_ids": ",".join(high_hit)}})
    if req.available_today_minutes > new_budget:
        warnings.append({"code": "today_exceeds_weekly_budget",
                         "params": {"today_minutes": req.available_today_minutes, "weekly_minutes": new_budget}})
    if not tasks:
        warnings.append({"code": "no_tasks_generic_template", "params": {}})

    assumptions = [
        "minutes_are_focused_study_time",
        "priorities_supplied_by_user",
        "more_time_does_not_guarantee_better_results",
        "deferred_tasks_are_kept_not_deleted",
    ]
    if reserve:
        assumptions.append("reserve_is_10_percent_of_new_budget")
    if not tasks:
        assumptions.append("generic_template_not_based_on_known_weaknesses")
        assumptions.append("original_workload_equals_original_budget_without_tasks")

    first_kept = next((results[i] for i in order if results[i]["proposed_minutes"] > 0), None)
    top_task = results[order[0]] if order else None
    next_action = _next_action(paused, req.available_today_minutes, planning, first_kept, top_task, template)

    summary = {
        "original_budget_minutes": original_budget,
        "original_workload_minutes": workload,
        "new_budget_minutes": new_budget,
        "reserve_minutes": reserve,
        "planning_budget_minutes": planning,
        "proposed_minutes": proposed_total,
        "unallocated_minutes": unallocated,
        "deferred_minutes": deferred_total,
        "kept_count": counts["keep"],
        "shortened_count": counts["shorten"],
        "deferred_count": counts["defer"],
        "budget_change_ratio": round(new_budget / original_budget, 3) if original_budget else None,
    }
    # arithmetic invariants: a broken rule must fail loudly, never return inconsistent numbers
    _check(proposed_total + reserve + unallocated == new_budget, "proposed + reserve + unallocated == budget")
    _check(unallocated >= 0, "unallocated >= 0")
    _check(all(0 <= r["proposed_minutes"] <= r["previous_minutes"] for r in task_rows), "0 <= proposed <= previous")
    if tasks:
        _check(sum(r["proposed_minutes"] for r in task_rows) + deferred_total == workload,
               "proposed + deferred == workload")

    return RecoveryPreviewOut(
        algorithm_version=ALGORITHM_VERSION,
        category=req.category,
        subject=req.subject,
        topic=req.topic or None,
        status=status,
        summary=summary,
        tasks=task_rows,
        template_plan=template,
        warnings=warnings,
        assumptions=assumptions,
        next_action=next_action,
    )


# --------------------------------------------------------------------------- demo fixture

DEMO_FIXTURE: dict = {
    "category": "ent",
    "subject": "Математика (DEMO)",
    "original_weekly_minutes": 360,
    "new_weekly_minutes": 180,
    "available_today_minutes": 30,
    "topic": None,
    "tasks": [
        {"id": "demo-mock", "title": "Пробный вариант ЕНТ по математике", "planned_minutes": 120, "priority": 5},
        {"id": "demo-errors", "title": "Разбор ошибок прошлого пробника", "planned_minutes": 60, "priority": 4},
        {"id": "demo-geometry", "title": "Геометрия: задачи на площади", "planned_minutes": 90, "priority": 3},
        {"id": "demo-formulas", "title": "Повторение формул", "planned_minutes": 45, "priority": 2},
        {"id": "demo-video", "title": "Видеоразбор новой темы", "planned_minutes": 45, "priority": 1},
    ],
}
