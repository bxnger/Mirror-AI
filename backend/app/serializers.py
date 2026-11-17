from __future__ import annotations

from datetime import timedelta

from . import models as m
from .services.planner import WEEKDAYS_RU


def _iso(v):
    return v.isoformat() if v is not None else None


def scenario_out(sc: m.Scenario) -> dict:
    return {
        "id": sc.id,
        "name": sc.name,
        "description": sc.description,
        "status": sc.status,
        "source": sc.source,
        "parent_scenario_id": sc.parent_scenario_id,
        "total_hours": round(sum(a.hours_per_week for a in sc.allocations), 2),
        "allocations": [
            {"goal_id": a.goal_id, "title": a.goal.title, "hours_per_week": a.hours_per_week}
            for a in sc.allocations
        ],
        "created_at": _iso(sc.created_at),
    }


def comparison_out(c: m.ScenarioComparison) -> dict:
    return {
        "id": c.id,
        "scenario_ids": c.scenario_ids,
        "metrics": c.metrics,
        "explanation": c.explanation,
        "explanation_source": c.explanation_source,
        "created_at": _iso(c.created_at),
    }


def decision_out(d: m.Decision) -> dict:
    return {
        "id": d.id,
        "scenario_id": d.scenario_id,
        "scenario_name": d.scenario.name if d.scenario else None,
        "comparison_id": d.comparison_id,
        "source": d.source,
        "rationale": d.rationale,
        "decided_at": _iso(d.decided_at),
    }


def task_out(t: m.PlanTask) -> dict:
    return {
        "id": t.id,
        "goal_id": t.goal_id,
        "goal_title": t.goal.title,
        "milestone_id": t.milestone_id,
        "title": t.title,
        "day_of_week": t.day_of_week,
        "day_label": WEEKDAYS_RU[t.day_of_week],
        "planned_minutes": t.planned_minutes,
        "actual_minutes": t.actual_minutes,
        "status": t.status,
        "is_carry_over": t.is_carry_over,
        "completed_at": _iso(t.completed_at),
    }


def plan_out(p: m.Plan) -> dict:
    by_goal: dict[int, dict] = {}
    for t in p.tasks:
        g = by_goal.setdefault(t.goal_id, {"goal_id": t.goal_id, "title": t.goal.title,
                                           "planned_minutes": 0, "actual_minutes": 0, "tasks": 0})
        g["planned_minutes"] += t.planned_minutes
        g["actual_minutes"] += t.actual_minutes
        g["tasks"] += 1
    return {
        "id": p.id,
        "week_index": p.week_index,
        "week_start": _iso(p.week_start),
        "week_end": _iso(p.week_start + timedelta(days=6)),
        "status": p.status,
        "decision_id": p.decision_id,
        "scenario_id": p.scenario_id,
        "scenario_name": p.scenario.name if p.scenario else None,
        "previous_plan_id": p.previous_plan_id,
        "planned_minutes_total": p.planned_minutes_total,
        "actual_minutes_total": sum(t.actual_minutes for t in p.tasks),
        "by_goal": list(by_goal.values()),
        "adaptation_notes": p.adaptation_notes,
        "tasks": [task_out(t) for t in sorted(p.tasks, key=lambda t: (t.day_of_week, t.id or 0))],
    }


def proposal_out(pr: m.AdaptationProposal) -> dict:
    return {
        "id": pr.id,
        "reality_check_id": pr.reality_check_id,
        "kind": pr.kind,
        "goal_id": pr.goal_id,
        "payload": pr.payload,
        "reason": pr.reason,
        "status": pr.status,
        "requires_confirmation": True,
        "resolved_at": _iso(pr.resolved_at),
    }


def reality_out(rc: m.RealityCheck, proposals: list[m.AdaptationProposal]) -> dict:
    return {
        "id": rc.id,
        "plan_id": rc.plan_id,
        "scenario_id": rc.scenario_id,
        "decision_id": rc.decision_id,
        "planned_hours": round(rc.planned_minutes / 60, 2),
        "actual_hours": round(rc.actual_minutes / 60, 2),
        "completion_rate": rc.completion_rate,
        "per_goal": rc.per_goal,
        "insights": rc.insights,
        "user_feedback": rc.user_feedback,
        "perceived_difficulty": rc.perceived_difficulty,
        "proposals": [proposal_out(p) for p in proposals],
        "ai_commentary": rc.ai_commentary,
        "created_at": _iso(rc.created_at),
    }


def memory_event_out(e: m.MemoryEvent) -> dict:
    return {
        "id": e.id,
        "event_type": e.event_type,
        "goal_id": e.goal_id,
        "ref_type": e.ref_type,
        "ref_id": e.ref_id,
        "payload": e.payload,
        "is_demo": e.is_demo,
        "created_at": _iso(e.created_at),
    }
