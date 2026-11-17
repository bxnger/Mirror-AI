"""Adaptive Memory: an append-only log of structured events in the database, plus a builder that
turns it into the personal context used by What If, the planner and the LLM explanation."""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import models as m

# The eight memory categories required by the product concept + a few supporting ones.
GOAL_CHANGED = "goal_changed"
SKILL_CHANGED = "skill_changed"
SCENARIO_CHOSEN = "scenario_chosen"
PLAN_GENERATED = "plan_generated"
TASK_COMPLETED = "task_completed"
REALITY_CHECK = "reality_check"
FEEDBACK = "feedback"
AVAILABILITY_CHANGED = "availability_changed"
# supporting
SCENARIO_CREATED = "scenario_created"
COMPARISON_RUN = "comparison_run"
PROPOSAL_RESOLVED = "proposal_resolved"
MILESTONE_COMPLETED = "milestone_completed"

CORE_EVENT_TYPES = [
    GOAL_CHANGED, SKILL_CHANGED, SCENARIO_CHOSEN, PLAN_GENERATED,
    TASK_COMPLETED, REALITY_CHECK, FEEDBACK, AVAILABILITY_CHANGED,
]

OBSERVATION_WINDOW = 4  # last N reality checks shape the context


def record(
    db: Session,
    user: m.User,
    event_type: str,
    payload: dict | None = None,
    *,
    goal_id: int | None = None,
    ref: object | None = None,
) -> m.MemoryEvent:
    ev = m.MemoryEvent(
        user_id=user.id,
        event_type=event_type,
        goal_id=goal_id,
        ref_type=type(ref).__name__ if ref is not None else None,
        ref_id=getattr(ref, "id", None) if ref is not None else None,
        payload=payload or {},
        is_demo=bool(user.is_demo),
    )
    db.add(ev)
    return ev


def chosen_scenario(db: Session, user_id: int) -> m.Scenario | None:
    return db.scalar(
        select(m.Scenario)
        .where(m.Scenario.user_id == user_id, m.Scenario.status == "chosen")
        .order_by(m.Scenario.id.desc())
    )


def latest_decision(db: Session, user_id: int) -> m.Decision | None:
    return db.scalar(
        select(m.Decision).where(m.Decision.user_id == user_id).order_by(m.Decision.id.desc())
    )


def observed_capacity(db: Session, user_id: int, window: int = OBSERVATION_WINDOW) -> dict:
    checks = db.scalars(
        select(m.RealityCheck)
        .where(m.RealityCheck.user_id == user_id)
        .order_by(m.RealityCheck.id.desc())
        .limit(window)
    ).all()
    if not checks:
        return {"checks": 0, "weekly_actual_hours_avg": None, "weekly_planned_hours_avg": None, "per_goal": {}}

    per_goal: dict[int, dict] = {}
    for rc in checks:
        for row in rc.per_goal:
            agg = per_goal.setdefault(int(row["goal_id"]), {"title": row.get("title"), "planned": [], "actual": []})
            agg["planned"].append(row["planned_minutes"])
            agg["actual"].append(row["actual_minutes"])
    goals_out = {}
    for gid, agg in per_goal.items():
        n = len(agg["actual"])
        planned_sum = sum(agg["planned"])
        goals_out[gid] = {
            "title": agg["title"],
            "weeks_observed": n,
            "avg_planned_hours": round(planned_sum / n / 60, 2),
            "avg_actual_hours": round(sum(agg["actual"]) / n / 60, 2),
            "avg_completion": round(sum(agg["actual"]) / planned_sum, 3) if planned_sum else None,
        }
    n = len(checks)
    return {
        "checks": n,
        "weekly_actual_hours_avg": round(sum(c.actual_minutes for c in checks) / n / 60, 2),
        "weekly_planned_hours_avg": round(sum(c.planned_minutes for c in checks) / n / 60, 2),
        "avg_completion": round(sum(c.completion_rate for c in checks) / n, 3),
        "per_goal": goals_out,
    }


def build_context(db: Session, user: m.User) -> dict:
    """Current personal context = facts + chosen decision + observed results + feedback."""
    profile = user.current_profile
    scenario = chosen_scenario(db, user.id)
    observed = observed_capacity(db, user.id)
    events = db.scalars(
        select(m.MemoryEvent).where(m.MemoryEvent.user_id == user.id).order_by(m.MemoryEvent.id)
    ).all()
    counts: dict[str, int] = {}
    for e in events:
        counts[e.event_type] = counts.get(e.event_type, 0) + 1

    feedback = [
        {"text": e.payload.get("text"), "at": e.created_at.isoformat()}
        for e in events if e.event_type == FEEDBACK and e.payload.get("text")
    ][-3:]
    availability_history = [
        {"from": e.payload.get("from"), "to": e.payload.get("to"), "at": e.created_at.isoformat()}
        for e in events if e.event_type == AVAILABILITY_CHANGED
    ]
    pending = db.scalars(
        select(m.AdaptationProposal).where(
            m.AdaptationProposal.user_id == user.id, m.AdaptationProposal.status == "pending"
        )
    ).all()

    declared = profile.weekly_hours_available if profile else None
    facts: list[str] = []
    if declared is not None:
        facts.append(f"Заявленное свободное время: {declared:g} ч/нед.")
    if scenario:
        alloc = ", ".join(f"{a.goal.title} — {a.hours_per_week:g} ч" for a in scenario.allocations)
        facts.append(f"Текущий выбранный сценарий «{scenario.name}»: {alloc}.")
    if observed["checks"]:
        facts.append(
            f"По {observed['checks']} Reality Check: в среднем выполнено "
            f"{observed['weekly_actual_hours_avg']:g} из {observed['weekly_planned_hours_avg']:g} запланированных ч/нед."
        )
        for g in observed["per_goal"].values():
            facts.append(
                f"{g['title']}: факт ~{g['avg_actual_hours']:g} ч/нед при плане {g['avg_planned_hours']:g} ч/нед."
            )
    else:
        facts.append("Фактических данных о выполнении ещё нет (Reality Check не проводился).")
    for f in feedback:
        facts.append(f"Отзыв пользователя: «{f['text']}».")

    return {
        "user_id": user.id,
        "declared_weekly_hours": declared,
        "constraints": list(profile.constraints) if profile else [],
        "chosen_scenario": (
            {
                "id": scenario.id,
                "name": scenario.name,
                "allocations": {a.goal_id: a.hours_per_week for a in scenario.allocations},
            }
            if scenario else None
        ),
        "observed": observed,
        "availability_history": availability_history,
        "recent_feedback": feedback,
        "pending_proposals": len(pending),
        "event_counts": counts,
        "facts": facts,
    }
