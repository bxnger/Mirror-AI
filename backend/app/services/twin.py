"""Read models for the digital twin: CURRENT SELF and FUTURE SELF side by side (never merged)."""
from __future__ import annotations

from datetime import date

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import models as m
from . import gap as gap_service
from . import memory


def _iso(v):
    return v.isoformat() if v is not None else None


def current_state_dict(cs: m.CurrentState | None) -> dict | None:
    if cs is None:
        return None
    return {
        "value": cs.value,
        "level": cs.level,
        "source": cs.source,
        "evidence": cs.evidence,
        "recorded_at": _iso(cs.recorded_at),
    }


def future_target_dict(ft: m.FutureTarget | None) -> dict | None:
    if ft is None:
        return None
    return {
        "value": ft.target_value,
        "level": ft.target_level,
        "target_date": _iso(ft.target_date),
        "priority": ft.priority,
        "desired_outcome": ft.desired_outcome,
        "milestones": [
            {"id": ms.id, "title": ms.title, "order": ms.order, "due_date": _iso(ms.due_date),
             "done": ms.done, "done_at": _iso(ms.done_at)}
            for ms in ft.milestones
        ],
    }


def goal_snapshot(goal: m.Goal) -> dict:
    return {
        "id": goal.id,
        "title": goal.title,
        "domain": goal.domain,
        "metric_type": goal.metric_type,
        "scale": goal.scale,
        "unit": goal.unit,
        "min_value": goal.min_value,
        "max_value": goal.max_value,
        "status": goal.status,
        "current": current_state_dict(goal.current_state),
        "target": future_target_dict(goal.future_target),
    }


def active_goals(user: m.User) -> list[m.Goal]:
    return [g for g in user.goals if g.status == "active"]


def twin_view(db: Session, user: m.User) -> dict:
    goals = active_goals(user)
    p = user.current_profile
    fp = user.future_profile
    completed = db.scalar(
        select(func.count(m.PlanTask.id))
        .join(m.Plan, m.Plan.id == m.PlanTask.plan_id)
        .where(m.Plan.user_id == user.id, m.PlanTask.status.in_(["done", "partial"]))
    ) or 0
    minutes_done = db.scalar(
        select(func.coalesce(func.sum(m.PlanTask.actual_minutes), 0))
        .join(m.Plan, m.Plan.id == m.PlanTask.plan_id)
        .where(m.Plan.user_id == user.id)
    ) or 0
    achievements = [
        {"goal": g.title, "milestone": ms.title, "done_at": _iso(ms.done_at)}
        for g in goals if g.future_target
        for ms in g.future_target.milestones if ms.done
    ]
    return {
        "user": {"id": user.id, "name": user.name, "country": user.country, "is_demo": user.is_demo},
        "current_self": {
            "kind": "facts",
            "weekly_hours_available": p.weekly_hours_available if p else None,
            "study_days": list(p.study_days) if p else [],
            "max_session_minutes": p.max_session_minutes if p else None,
            "constraints": list(p.constraints) if p else [],
            "skills": [
                {"goal_id": g.id, "title": g.title, "metric_type": g.metric_type, "unit": g.unit,
                 "scale": g.scale, **(current_state_dict(g.current_state) or {"value": None, "level": None})}
                for g in goals
            ],
            "completed_tasks": int(completed),
            "completed_hours": round(int(minutes_done) / 60, 1),
            "achievements": achievements,
        },
        "future_self": {
            "kind": "desired_state",
            "vision": fp.vision if fp else None,
            "horizon_date": _iso(fp.horizon_date) if fp else None,
            "desired_achievements": list(fp.desired_achievements) if fp else [],
            "targets": [
                {"goal_id": g.id, "title": g.title, "metric_type": g.metric_type, "unit": g.unit,
                 "scale": g.scale, **(future_target_dict(g.future_target) or {})}
                for g in goals
            ],
        },
        "note": "Future Self — желаемое состояние, а не предсказание.",
    }


def gap_for_user(db: Session, user: m.User, today: date) -> dict:
    scenario = memory.chosen_scenario(db, user.id)
    goals = active_goals(user)
    allocations = None
    if scenario:
        by_goal = {a.goal_id: a.hours_per_week for a in scenario.allocations}
        allocations = {g.id: by_goal.get(g.id, 0.0) for g in goals}
    constraints = list(user.current_profile.constraints) if user.current_profile else []
    result = gap_service.analyze_twin([goal_snapshot(g) for g in goals], today, allocations, constraints)
    result["allocation_source"] = (
        {"scenario_id": scenario.id, "name": scenario.name} if scenario else None
    )
    return result
