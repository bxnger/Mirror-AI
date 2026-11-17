"""Execute: weekly Action Plan generated from the CHOSEN scenario (Decision) + adaptive memory.

What the planner adapts on its own (scheduling tactics, no confirmation needed):
* carries unfinished work from the previous week over to the front of the week;
* shortens sessions for goals where the user under-delivered (smaller, easier-to-start blocks).

What it never changes on its own: hours per goal, goals, targets, availability. Those change only
through an AdaptationProposal the user accepts (see reality.py).
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from math import ceil

from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import models as m
from . import memory
from .errors import LoopError

ADAPTIVE_SESSION_MINUTES = 45
LOW_COMPLETION = 0.8
MIN_SESSION_MINUTES = 30
WEEKDAYS_RU = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"]

TASK_TEMPLATES: dict[str, list[str]] = {
    "exam": [
        "Практика: блок заданий по слабой теме",
        "Разбор ошибок прошлой практики",
        "Пробная секция на время",
        "Теория + 10 задач по одной теме",
    ],
    "language": [
        "Аудирование + конспект",
        "Письмо: короткое эссе",
        "Лексика и грамматика",
        "Чтение статьи + пересказ",
    ],
    "programming": [
        "Теория + упражнения",
        "Мини-задачи на закрепление",
        "Работа над мини-проектом",
    ],
    "other": ["Работа над целью"],
}


def monday_of(d: date) -> date:
    return d - timedelta(days=d.weekday())


def default_week_start(today: date) -> date:
    """This week's Monday on weekdays; next Monday on the weekend (the week is almost over)."""
    return monday_of(today) + (timedelta(days=7) if today.weekday() >= 5 else timedelta(0))


def split_minutes(total: int, session: int) -> list[int]:
    """Split total minutes into the fewest sessions <= `session`, sized evenly in 5-minute steps
    (no tiny tail sessions, never longer than the session limit)."""
    if total <= 0:
        return []
    n = ceil(total / session)
    units, rest = divmod(total, 5)
    base, extra = divmod(units, n)
    parts = [(base + (1 if i < extra else 0)) * 5 for i in range(n)]
    parts[-1] += rest
    return [p for p in parts if p > 0]


def _titles_for(goal: m.Goal):
    ft = goal.future_target
    pending_ms = [ms for ms in ft.milestones if not ms.done] if ft else []
    templates = TASK_TEMPLATES.get(goal.domain, TASK_TEMPLATES["other"])
    i = 0
    while True:
        if pending_ms:
            ms = pending_ms[min(i // 2, len(pending_ms) - 1)]  # ~2 sessions per milestone
            yield f"{goal.title}: {ms.title}", ms.id
        else:
            yield f"{goal.title}: {templates[i % len(templates)]}", None
        i += 1


def _assign_days(items: list[dict], days: list[int]) -> None:
    """Greedy balancing: each session goes to the least loaded day, avoiding the same goal twice a day."""
    load = {d: 0 for d in days}
    goals_on_day: dict[int, set[int]] = {d: set() for d in days}
    # carry-overs first, then longest sessions first for better balance
    for item in sorted(items, key=lambda t: (not t["is_carry_over"], -t["planned_minutes"])):
        candidates = sorted(days, key=lambda d: (item["goal_id"] in goals_on_day[d], load[d], d))
        day = candidates[0]
        item["day_of_week"] = day
        load[day] += item["planned_minutes"]
        goals_on_day[day].add(item["goal_id"])


def _keep_title_order(items: list[dict]) -> None:
    """Day balancing may shuffle sessions; milestone titles must still follow the week in order."""
    by_goal: dict[int, list[dict]] = {}
    for it in items:
        if not it["is_carry_over"]:
            by_goal.setdefault(it["goal_id"], []).append(it)
    for group in by_goal.values():
        labels = [(it["title"], it["milestone_id"]) for it in group]  # generation order
        for it, (title, ms_id) in zip(sorted(group, key=lambda x: x["day_of_week"]), labels):
            it["title"], it["milestone_id"] = title, ms_id


def _allocation_change_note(db: Session, scenario: m.Scenario) -> str | None:
    if scenario.source != "adaptation" or not scenario.parent_scenario_id:
        return None
    parent = db.get(m.Scenario, scenario.parent_scenario_id)
    if not parent:
        return None
    before = {a.goal_id: a.hours_per_week for a in parent.allocations}
    changes = [
        f"{a.goal.title} {before.get(a.goal_id, 0):g}→{a.hours_per_week:g} ч"
        for a in scenario.allocations if before.get(a.goal_id, 0) != a.hours_per_week
    ]
    return ("Распределение обновлено после вашего подтверждения: " + ", ".join(changes) + ".") if changes else None


def generate_plan(db: Session, user: m.User, week_start: date | None = None) -> m.Plan:
    decision = memory.latest_decision(db, user.id)
    scenario = memory.chosen_scenario(db, user.id)
    if decision is None or scenario is None:
        raise LoopError("Сначала выберите сценарий (Decide), затем генерируйте план.", stage="decide")
    previous = db.scalar(select(m.Plan).where(m.Plan.user_id == user.id).order_by(m.Plan.id.desc()))
    if previous is not None and previous.status != "reviewed":
        raise LoopError(
            "Проведите Reality Check по текущему плану, прежде чем строить следующий.", stage="measure"
        )

    profile = user.current_profile
    days = sorted(set(profile.study_days)) if profile and profile.study_days else [0, 1, 2, 3, 4, 5]
    base_session = profile.max_session_minutes if profile else 90
    observed = memory.observed_capacity(db, user.id)
    per_goal_obs = observed.get("per_goal", {})

    if week_start is None:
        week_start = (previous.week_start + timedelta(days=7)) if previous else default_week_start(
            datetime.now(timezone.utc).date()
        )
    plan = m.Plan(
        user_id=user.id,
        decision_id=decision.id,
        scenario_id=scenario.id,
        previous_plan_id=previous.id if previous else None,
        week_index=(previous.week_index + 1) if previous else 1,
        week_start=week_start,
        adaptation_notes=[],
    )
    notes: list[dict] = []
    change_note = _allocation_change_note(db, scenario)
    if change_note:
        notes.append({"type": "allocation_confirmed", "text": change_note})

    items: list[dict] = []
    for alloc in scenario.allocations:
        goal = alloc.goal
        if goal.status != "active" or alloc.hours_per_week <= 0:
            continue
        budget = int(round(alloc.hours_per_week * 60))
        session = base_session
        obs = per_goal_obs.get(goal.id)
        if obs and obs.get("avg_completion") is not None and obs["avg_completion"] < LOW_COMPLETION:
            session = min(session, ADAPTIVE_SESSION_MINUTES)
            notes.append({
                "type": "shorter_sessions", "goal_id": goal.id,
                "text": f"{goal.title}: фактически выполнялось {int(obs['avg_completion'] * 100 + 0.5)}% плана — "
                f"занятия разбиты на блоки по {session} мин, чтобы их было легче начать.",
            })

        # carry-over of unfinished work from last week (inside the same hour budget)
        if previous is not None:
            unfinished = [
                t for t in previous.tasks
                if t.goal_id == goal.id and t.status in {"pending", "skipped", "partial"}
            ]
            for t in unfinished:
                remaining = max(0, t.planned_minutes - t.actual_minutes)
                take = min(remaining, session, budget)
                if take < MIN_SESSION_MINUTES:
                    continue
                title = t.title if t.title.startswith("↺") else f"↺ {t.title}"
                items.append({"goal_id": goal.id, "milestone_id": t.milestone_id, "title": title,
                              "planned_minutes": take, "is_carry_over": True})
                budget -= take
            if any(i["is_carry_over"] and i["goal_id"] == goal.id for i in items):
                notes.append({
                    "type": "carry_over", "goal_id": goal.id,
                    "text": f"{goal.title}: незавершённые задачи прошлой недели перенесены в начало недели "
                    "(в пределах выбранных часов).",
                })

        titles = _titles_for(goal)
        for minutes in split_minutes(budget, session):
            title, ms_id = next(titles)
            items.append({"goal_id": goal.id, "milestone_id": ms_id, "title": title,
                          "planned_minutes": minutes, "is_carry_over": False})

    pending = memory.build_context(db, user)["pending_proposals"]
    if pending:
        notes.append({
            "type": "pending_proposals",
            "text": f"Есть {pending} неподтверждённых предложения по адаптации — план построен по текущему "
            "выбранному сценарию, без их применения.",
        })

    _assign_days(items, days)
    _keep_title_order(items)
    for it in items:
        plan.tasks.append(m.PlanTask(**it))
    plan.planned_minutes_total = sum(it["planned_minutes"] for it in items)
    plan.adaptation_notes = notes
    db.add(plan)
    db.flush()
    memory.record(db, user, memory.PLAN_GENERATED, {
        "plan_id": plan.id, "week_index": plan.week_index, "scenario_id": scenario.id,
        "decision_id": decision.id, "planned_hours": round(plan.planned_minutes_total / 60, 2),
        "adaptations": [n["type"] for n in notes],
    }, ref=plan)
    return plan


def update_task(db: Session, user: m.User, task: m.PlanTask, status: str, actual_minutes: int | None) -> m.PlanTask:
    if task.plan.status == "reviewed":
        raise LoopError("План уже прошёл Reality Check — изменения задач закрыты.", stage="measure")
    if status not in {"pending", "done", "partial", "skipped"}:
        raise LoopError(f"Неизвестный статус задачи: {status}", stage="execute")
    if status == "done" and actual_minutes is None:
        actual_minutes = task.planned_minutes
    if status in {"skipped", "pending"}:
        actual_minutes = 0
    if status == "partial" and actual_minutes is None:
        raise LoopError("Для частичного выполнения укажите фактические минуты.", stage="execute")
    was_completed = task.status in {"done", "partial"}
    task.status = status
    task.actual_minutes = max(0, int(actual_minutes or 0))
    task.completed_at = datetime.now(timezone.utc) if status in {"done", "partial"} else None
    if status in {"done", "partial"} and not was_completed:
        memory.record(db, user, memory.TASK_COMPLETED, {
            "task_id": task.id, "plan_id": task.plan_id, "status": status,
            "planned_minutes": task.planned_minutes, "actual_minutes": task.actual_minutes,
            "weekday": WEEKDAYS_RU[task.day_of_week],
        }, goal_id=task.goal_id, ref=task)
    return task
