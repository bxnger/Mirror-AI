"""Decision-to-Outcome loop orchestration: Understand -> Simulate -> Decide (Execute/Measure/Adapt
live in planner.py and reality.py). Every step reads the data written by the previous one."""
from __future__ import annotations

from datetime import date, datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import models as m
from . import explain, memory, twin, whatif
from .errors import LoopError
from .scales import SCALES, normalize_level

# --------------------------------------------------------------------------- understand


def create_user(db: Session, name: str, country: str | None = None, is_demo: bool = False) -> m.User:
    user = m.User(name=name, country=country, is_demo=is_demo)
    db.add(user)
    db.flush()
    return user


def upsert_current_profile(db: Session, user: m.User, data: dict) -> m.CurrentProfile:
    p = user.current_profile
    old_hours = p.weekly_hours_available if p else None
    if p is None:
        p = m.CurrentProfile(user_id=user.id)
        user.current_profile = p
    if data.get("weekly_hours_available") is not None:
        hours = float(data["weekly_hours_available"])
        if not 0 <= hours <= 112:
            raise LoopError("Свободное время должно быть от 0 до 112 ч/нед.", status_code=422)
        p.weekly_hours_available = hours
    if data.get("study_days") is not None:
        days = sorted({int(d) for d in data["study_days"]})
        if not days or any(d < 0 or d > 6 for d in days):
            raise LoopError("study_days — дни недели 0..6 (0 = понедельник).", status_code=422)
        p.study_days = days
    if data.get("max_session_minutes") is not None:
        p.max_session_minutes = max(20, min(240, int(data["max_session_minutes"])))
    if data.get("constraints") is not None:
        p.constraints = [str(c) for c in data["constraints"]]
    db.flush()
    if old_hours != p.weekly_hours_available:
        memory.record(db, user, memory.AVAILABILITY_CHANGED, {
            "from": old_hours, "to": p.weekly_hours_available, "source": "user",
        }, ref=p)
    return p


def upsert_future_profile(db: Session, user: m.User, data: dict) -> m.FutureProfile:
    fp = user.future_profile
    if fp is None:
        fp = m.FutureProfile(user_id=user.id)
        user.future_profile = fp
    changed = {}
    for key in ("vision", "horizon_date", "desired_achievements"):
        if key in data and data[key] is not None:
            setattr(fp, key, data[key])
            changed[key] = data[key] if key != "horizon_date" else str(data[key])
    db.flush()
    if changed:
        memory.record(db, user, memory.GOAL_CHANGED, {"scope": "future_profile", "changes": changed}, ref=fp)
    return fp


def _validate_goal_values(goal: m.Goal, value, level) -> tuple[float | None, str | None]:
    if goal.metric_type == "numeric":
        if value is None:
            return None, None
        v = float(value)
        too_low = goal.min_value is not None and v < goal.min_value
        too_high = goal.max_value is not None and v > goal.max_value
        if too_low or too_high:
            raise LoopError(
                f"Значение {v:g} вне шкалы цели [{goal.min_value}; {goal.max_value}].", status_code=422
            )
        return v, None
    if goal.metric_type == "level":
        if level is None:
            return None, None
        norm = normalize_level(goal.scale, level)
        if norm is None:
            raise LoopError(f"Уровень «{level}» не входит в шкалу {SCALES.get(goal.scale)}.", status_code=422)
        return None, norm
    return None, None


def create_goal(db: Session, user: m.User, data: dict) -> m.Goal:
    metric = data["metric_type"]
    if metric not in {"numeric", "level", "milestones"}:
        raise LoopError("metric_type: numeric | level | milestones", status_code=422)
    if metric == "level" and data.get("scale") not in SCALES:
        raise LoopError(f"Для level-цели нужна шкала: {list(SCALES)}", status_code=422)
    goal = m.Goal(
        user_id=user.id, title=data["title"], domain=data.get("domain") or "other", metric_type=metric,
        scale=data.get("scale"), unit=data.get("unit"), min_value=data.get("min_value"),
        max_value=data.get("max_value"),
    )
    db.add(goal)
    db.flush()

    cur = data.get("current")
    if cur:
        v, lvl = _validate_goal_values(goal, cur.get("value"), cur.get("level"))
        goal.current_state = m.CurrentState(
            value=v, level=lvl, source=cur.get("source") or "self_assessment", evidence=cur.get("evidence")
        )
    tgt = data.get("target")
    if tgt:
        v, lvl = _validate_goal_values(goal, tgt.get("value"), tgt.get("level"))
        ft = m.FutureTarget(
            target_value=v, target_level=lvl, target_date=tgt.get("target_date"),
            priority=max(1, min(5, int(tgt.get("priority") or 3))), desired_outcome=tgt.get("desired_outcome"),
        )
        for i, ms in enumerate(tgt.get("milestones") or []):
            ms = {"title": ms} if isinstance(ms, str) else ms
            ft.milestones.append(m.Milestone(
                title=ms["title"], order=i, due_date=ms.get("due_date"), done=bool(ms.get("done")),
                done_at=datetime.now(timezone.utc) if ms.get("done") else None,
            ))
        goal.future_target = ft
    db.flush()
    memory.record(db, user, memory.GOAL_CHANGED, {
        "action": "created", "title": goal.title, "target": twin.future_target_dict(goal.future_target),
    }, goal_id=goal.id, ref=goal)
    if goal.current_state:
        memory.record(db, user, memory.SKILL_CHANGED, {
            "action": "initial", "to": twin.current_state_dict(goal.current_state),
        }, goal_id=goal.id, ref=goal.current_state)
    return goal


def get_goal(db: Session, user: m.User, goal_id: int) -> m.Goal:
    goal = db.get(m.Goal, goal_id)
    if goal is None or goal.user_id != user.id:
        raise LoopError("Цель не найдена.", status_code=404)
    return goal


def update_current_state(db: Session, user: m.User, goal: m.Goal, data: dict) -> m.CurrentState:
    """CURRENT SELF changes only through facts the user reports (test, self-assessment)."""
    before = twin.current_state_dict(goal.current_state)
    v, lvl = _validate_goal_values(goal, data.get("value"), data.get("level"))
    cs = goal.current_state or m.CurrentState(goal_id=goal.id)
    cs.value, cs.level = v, lvl
    cs.source = data.get("source") or "self_assessment"
    cs.evidence = data.get("evidence")
    cs.recorded_at = datetime.now(timezone.utc)
    goal.current_state = cs
    db.flush()
    memory.record(db, user, memory.SKILL_CHANGED, {
        "action": "updated", "from": before, "to": twin.current_state_dict(cs),
    }, goal_id=goal.id, ref=cs)
    return cs


def update_target(db: Session, user: m.User, goal: m.Goal, data: dict) -> m.FutureTarget:
    """FUTURE SELF changes only on explicit user request (never automatically)."""
    ft = goal.future_target or m.FutureTarget(goal_id=goal.id)
    before = twin.future_target_dict(goal.future_target)
    if "value" in data or "level" in data:
        v, lvl = _validate_goal_values(goal, data.get("value"), data.get("level"))
        ft.target_value, ft.target_level = v, lvl
    if data.get("target_date") is not None:
        ft.target_date = data["target_date"]
    if data.get("priority") is not None:
        ft.priority = max(1, min(5, int(data["priority"])))
    if data.get("desired_outcome") is not None:
        ft.desired_outcome = data["desired_outcome"]
    goal.future_target = ft
    db.flush()
    memory.record(db, user, memory.GOAL_CHANGED, {
        "action": "target_updated", "from": before, "to": twin.future_target_dict(ft),
    }, goal_id=goal.id, ref=ft)
    return ft


def set_milestone(db: Session, user: m.User, milestone_id: int, done: bool) -> m.Milestone:
    ms = db.get(m.Milestone, milestone_id)
    if ms is None or ms.future_target.goal.user_id != user.id:
        raise LoopError("Этап не найден.", status_code=404)
    if ms.done != done:
        ms.done = done
        ms.done_at = datetime.now(timezone.utc) if done else None
        memory.record(db, user, memory.MILESTONE_COMPLETED if done else memory.SKILL_CHANGED, {
            "milestone": ms.title, "done": done,
        }, goal_id=ms.future_target.goal_id, ref=ms)
    db.flush()
    return ms


# --------------------------------------------------------------------------- simulate


def create_scenario(db: Session, user: m.User, name: str, allocations: list[dict],
                    description: str | None = None, source: str = "user") -> m.Scenario:
    if not allocations:
        raise LoopError("Сценарий должен содержать распределение часов.", status_code=422)
    own = {g.id for g in twin.active_goals(user)}
    sc = m.Scenario(user_id=user.id, name=name, description=description, source=source)
    seen = set()
    for a in allocations:
        gid, hours = int(a["goal_id"]), float(a["hours_per_week"])
        if gid not in own:
            raise LoopError(f"Цель {gid} не принадлежит пользователю или неактивна.", status_code=422)
        if gid in seen:
            raise LoopError(f"Цель {gid} указана дважды.", status_code=422)
        if not 0 <= hours <= 80:
            raise LoopError("Часы на цель: от 0 до 80 в неделю.", status_code=422)
        seen.add(gid)
        sc.allocations.append(m.ScenarioAllocation(goal_id=gid, hours_per_week=hours))
    db.add(sc)
    db.flush()
    memory.record(db, user, memory.SCENARIO_CREATED, {
        "scenario_id": sc.id, "name": name, "allocations": {a.goal_id: a.hours_per_week for a in sc.allocations},
    }, ref=sc)
    return sc


def get_scenario(db: Session, user: m.User, scenario_id: int) -> m.Scenario:
    sc = db.get(m.Scenario, scenario_id)
    if sc is None or sc.user_id != user.id:
        raise LoopError(f"Сценарий {scenario_id} не найден.", status_code=404)
    return sc


def build_whatif_payload(db: Session, user: m.User, scenarios: list[m.Scenario], today: date) -> dict:
    """Simulate uses the real profile: declared hours, gap, priorities, dates and observed results."""
    if user.current_profile is None:
        raise LoopError("Сначала заполните Current Self (свободное время).", stage="understand")
    gap = twin.gap_for_user(db, user, today)
    gap_by_goal = {g["goal_id"]: g for g in gap["goals"]}
    goals_info = []
    for g in twin.active_goals(user):
        ga = gap_by_goal.get(g.id, {})
        goals_info.append({
            "id": g.id, "title": g.title,
            "priority": g.future_target.priority if g.future_target else 3,
            "status": ga.get("status", "open"),
            "weeks_left": (ga.get("time") or {}).get("weeks_left"),
        })
    context = memory.build_context(db, user)
    available = user.current_profile.weekly_hours_available
    metrics = [
        whatif.scenario_metrics(
            {"id": s.id, "name": s.name, "allocations": {a.goal_id: a.hours_per_week for a in s.allocations}},
            goals_info, available, context["observed"],
        )
        for s in scenarios
    ]
    comparison = whatif.compare(metrics)
    slim_gap = {
        "goals": [
            {k: g[k] for k in ("goal_id", "title", "status", "gap", "milestones", "missing_data", "assumptions")}
            | {"target_date": (g.get("time") or {}).get("target_date"),
               "weeks_left": (g.get("time") or {}).get("weeks_left"),
               "priority": (g.get("target") or {}).get("priority")}
            for g in gap["goals"]
        ]
    }
    return {
        "profile": {
            "weekly_hours_available": available,
            "constraints": list(user.current_profile.constraints),
        },
        "gap": slim_gap,
        "scenarios": metrics,
        "comparison": comparison,
        "context": {k: context[k] for k in ("facts", "observed", "recent_feedback", "availability_history")},
    }


def compare_scenarios(db: Session, user: m.User, scenario_ids: list[int], today: date | None = None,
                      llm=None) -> m.ScenarioComparison:
    if len(scenario_ids) < 2:
        raise LoopError("Для сравнения нужно минимум два сценария.", status_code=422)
    today = today or datetime.now(timezone.utc).date()
    scenarios = [get_scenario(db, user, sid) for sid in scenario_ids]
    payload = build_whatif_payload(db, user, scenarios, today)
    explanation, source = explain.explain_comparison(payload, llm=llm)
    comp = m.ScenarioComparison(
        user_id=user.id, scenario_ids=list(scenario_ids),
        metrics={k: payload[k] for k in ("profile", "gap", "scenarios", "comparison", "context")},
        explanation=explanation, explanation_source=source,
    )
    db.add(comp)
    db.flush()
    memory.record(db, user, memory.COMPARISON_RUN, {
        "comparison_id": comp.id, "scenario_ids": list(scenario_ids), "explanation_source": source,
    }, ref=comp)
    return comp


# --------------------------------------------------------------------------- decide


def decide(db: Session, user: m.User, scenario_id: int, comparison_id: int | None = None,
           rationale: str | None = None) -> m.Decision:
    sc = get_scenario(db, user, scenario_id)
    if comparison_id is not None:
        comp = db.get(m.ScenarioComparison, comparison_id)
        if comp is None or comp.user_id != user.id:
            raise LoopError("Сравнение не найдено.", status_code=404)
        if scenario_id not in comp.scenario_ids:
            raise LoopError("Выбранный сценарий не участвовал в этом сравнении.", status_code=422)
    if user.current_profile and sum(a.hours_per_week for a in sc.allocations) > user.current_profile.weekly_hours_available:
        raise LoopError("Сценарий превышает доступное время — скорректируйте его перед выбором.", status_code=422)
    for other in db.scalars(select(m.Scenario).where(m.Scenario.user_id == user.id, m.Scenario.status == "chosen")):
        if other.id != sc.id:
            other.status = "superseded"
    sc.status = "chosen"
    d = m.Decision(user_id=user.id, scenario_id=sc.id, comparison_id=comparison_id, rationale=rationale)
    db.add(d)
    db.flush()
    memory.record(db, user, memory.SCENARIO_CHOSEN, {
        "scenario_id": sc.id, "name": sc.name, "decision_id": d.id, "comparison_id": comparison_id,
        "rationale": rationale, "allocations": {a.goal_id: a.hours_per_week for a in sc.allocations},
        "source": "user",
    }, ref=d)
    return d


# --------------------------------------------------------------------------- loop status


def loop_status(db: Session, user: m.User) -> dict:
    def last(model, *where):
        return db.scalar(select(model).where(model.user_id == user.id, *where).order_by(model.id.desc()))

    goals = twin.active_goals(user)
    comp = last(m.ScenarioComparison)
    decision = last(m.Decision)
    plan = last(m.Plan)
    rc = last(m.RealityCheck)
    adapted = last(m.AdaptationProposal, m.AdaptationProposal.status.in_(["accepted", "rejected"]))
    tasks_done = db.scalar(
        select(func.count(m.PlanTask.id))
        .join(m.Plan, m.Plan.id == m.PlanTask.plan_id)
        .where(m.Plan.user_id == user.id, m.PlanTask.status.in_(["done", "partial"]))
    ) or 0
    stages = [
        {"key": "understand", "title": "Understand", "done": bool(user.current_profile and goals
                                                                  and any(g.current_state for g in goals)
                                                                  and any(g.future_target for g in goals))},
        {"key": "simulate", "title": "Simulate", "done": comp is not None, "ref": comp.id if comp else None},
        {"key": "decide", "title": "Decide", "done": decision is not None, "ref": decision.id if decision else None},
        {"key": "execute", "title": "Execute", "done": bool(plan and tasks_done), "ref": plan.id if plan else None},
        {"key": "measure", "title": "Measure", "done": rc is not None, "ref": rc.id if rc else None},
        {"key": "adapt", "title": "Adapt", "done": adapted is not None, "ref": adapted.id if adapted else None},
    ]
    next_stage = next((s["key"] for s in stages if not s["done"]), "execute")
    return {"stages": stages, "next": next_stage}
