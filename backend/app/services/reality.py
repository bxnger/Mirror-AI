"""Measure + Adapt: Reality Check over a plan, and confirmation-gated adaptation proposals."""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import models as m
from . import explain, memory
from .errors import LoopError
from .planner import WEEKDAYS_RU

UNDER_DELIVERY = 0.8
OVER_DELIVERY = 1.15
LOW_TOTAL_VS_DECLARED = 0.75


def round_half(x: float) -> float:
    return round(x * 2) / 2


def _per_goal(plan: m.Plan) -> list[dict]:
    rows: dict[int, dict] = {}
    for t in plan.tasks:
        r = rows.setdefault(t.goal_id, {
            "goal_id": t.goal_id, "title": t.goal.title, "planned_minutes": 0, "actual_minutes": 0,
            "tasks_total": 0, "tasks_done": 0, "tasks_partial": 0, "tasks_skipped": 0,
        })
        r["planned_minutes"] += t.planned_minutes
        r["actual_minutes"] += t.actual_minutes
        r["tasks_total"] += 1
        r["tasks_done"] += t.status == "done"
        r["tasks_partial"] += t.status == "partial"
        r["tasks_skipped"] += t.status in {"skipped", "pending"}
    for r in rows.values():
        r["completion"] = round(r["actual_minutes"] / r["planned_minutes"], 3) if r["planned_minutes"] else None
        r["planned_hours"] = round(r["planned_minutes"] / 60, 2)
        r["actual_hours"] = round(r["actual_minutes"] / 60, 2)
    return list(rows.values())


def _weekday_insight(plan: m.Plan) -> str | None:
    by_day: dict[int, list[int]] = {}
    for t in plan.tasks:
        d = by_day.setdefault(t.day_of_week, [0, 0])
        d[0] += t.planned_minutes
        d[1] += t.actual_minutes
    weak = [
        WEEKDAYS_RU[d] for d, (p, a) in sorted(by_day.items()) if p and a / p < 0.5
    ]
    return f"Меньше половины плана выполнено в дни: {', '.join(weak)}." if weak else None


def run_reality_check(
    db: Session, user: m.User, plan: m.Plan, feedback: str | None, difficulty: int | None, llm=None
) -> tuple[m.RealityCheck, list[m.AdaptationProposal]]:
    if plan.user_id != user.id:
        raise LoopError("План принадлежит другому пользователю.", status_code=404)
    if plan.status == "reviewed":
        raise LoopError("Reality Check по этому плану уже проведён.", stage="measure")
    if difficulty is not None and not 1 <= difficulty <= 5:
        raise LoopError("Сложность оценивается от 1 до 5.", stage="measure", status_code=422)

    per_goal = _per_goal(plan)
    planned = sum(r["planned_minutes"] for r in per_goal)
    actual = sum(r["actual_minutes"] for r in per_goal)
    capped = sum(min(r["actual_minutes"], r["planned_minutes"]) for r in per_goal)
    completion = round(capped / planned, 3) if planned else 0.0

    insights: list[str] = [
        f"Выполнено {round(actual / 60, 1):g} из {round(planned / 60, 1):g} запланированных часов "
        f"({int(completion * 100 + 0.5)}% плана)."
    ]
    for r in per_goal:
        if r["completion"] is None:
            continue
        if r["completion"] < UNDER_DELIVERY:
            insights.append(
                f"{r['title']}: {r['actual_hours']:g} из {r['planned_hours']:g} ч — ниже плана."
            )
        elif r["completion"] >= OVER_DELIVERY:
            insights.append(f"{r['title']}: {r['actual_hours']:g} ч при плане {r['planned_hours']:g} ч — больше плана.")
        else:
            insights.append(f"{r['title']}: план выполнен ({r['actual_hours']:g} из {r['planned_hours']:g} ч).")
    wd = _weekday_insight(plan)
    if wd:
        insights.append(wd)

    rc = m.RealityCheck(
        user_id=user.id, plan_id=plan.id, scenario_id=plan.scenario_id, decision_id=plan.decision_id,
        planned_minutes=planned, actual_minutes=actual, completion_rate=completion,
        per_goal=per_goal, insights=insights, user_feedback=feedback, perceived_difficulty=difficulty,
    )
    db.add(rc)
    plan.status = "reviewed"
    db.flush()

    memory.record(db, user, memory.REALITY_CHECK, {
        "plan_id": plan.id, "scenario_id": plan.scenario_id, "decision_id": plan.decision_id,
        "planned_hours": round(planned / 60, 2), "actual_hours": round(actual / 60, 2),
        "completion": completion,
        "per_goal": [{k: r[k] for k in ("goal_id", "title", "planned_hours", "actual_hours", "completion")}
                     for r in per_goal],
    }, ref=rc)
    if feedback:
        memory.record(db, user, memory.FEEDBACK, {"text": feedback, "difficulty": difficulty,
                                                  "reality_check_id": rc.id}, ref=rc)

    proposals = _make_proposals(db, user, plan, rc, per_goal)
    rc.ai_commentary = _commentary(db, user, rc, proposals, llm)
    return rc, proposals


def _commentary(db: Session, user: m.User, rc: m.RealityCheck, proposals: list[m.AdaptationProposal],
                llm=None) -> dict:
    context = memory.build_context(db, user)
    payload = {
        "reality_check": {
            "planned_hours": round(rc.planned_minutes / 60, 2),
            "actual_hours": round(rc.actual_minutes / 60, 2),
            "completion_rate": rc.completion_rate,
            "per_goal": rc.per_goal,
            "insights": rc.insights,
            "user_feedback": rc.user_feedback,
            "perceived_difficulty": rc.perceived_difficulty,
        },
        "proposals": [{"kind": p.kind, "reason": p.reason, "payload": p.payload} for p in proposals],
        "context": {k: context[k] for k in ("facts", "observed", "recent_feedback")},
    }
    data, _ = explain.explain_reality(payload, llm=llm)
    return data


def _make_proposals(db: Session, user: m.User, plan: m.Plan, rc: m.RealityCheck,
                    per_goal: list[dict]) -> list[m.AdaptationProposal]:
    """Uses the observation window from memory (incl. this check), not just one week."""
    scenario = memory.chosen_scenario(db, user.id) or plan.scenario
    alloc = {a.goal_id: a.hours_per_week for a in scenario.allocations}
    observed = memory.observed_capacity(db, user.id)
    out: list[m.AdaptationProposal] = []

    # supersede older pending proposals - the newest data wins
    for old in db.scalars(select(m.AdaptationProposal).where(
        m.AdaptationProposal.user_id == user.id, m.AdaptationProposal.status == "pending"
    )):
        old.status = "superseded"
        old.resolved_at = datetime.now(timezone.utc)

    for r in per_goal:
        gid = r["goal_id"]
        current_h = alloc.get(gid)
        obs = observed["per_goal"].get(gid)
        if current_h is None or not obs or obs["avg_completion"] is None:
            continue
        if obs["avg_completion"] < UNDER_DELIVERY:
            to_h = max(0.5, round_half(obs["avg_actual_hours"]))
            if to_h < current_h:
                out.append(m.AdaptationProposal(
                    user_id=user.id, reality_check_id=rc.id, kind="adjust_allocation", goal_id=gid,
                    payload={"scenario_id": scenario.id, "goal_title": r["title"], "from_hours": current_h,
                             "to_hours": to_h, "freed_hours": round(current_h - to_h, 2),
                             "weeks_observed": obs["weeks_observed"]},
                    reason=(
                        f"{r['title']}: запланировано {current_h:g} ч/нед, фактически в среднем "
                        f"{obs['avg_actual_hours']:g} ч/нед (недель наблюдения: {obs['weeks_observed']}). "
                        f"Предлагается планировать {to_h:g} ч/нед — реалистичную нагрузку, которую вы уже "
                        "выполняете. Освободившееся время остаётся резервом. Цель и целевой уровень не меняются."
                    ),
                ))
        elif obs["avg_completion"] >= OVER_DELIVERY:
            to_h = round_half(obs["avg_actual_hours"])
            total_after = sum(alloc.values()) - current_h + to_h
            declared = user.current_profile.weekly_hours_available if user.current_profile else None
            if to_h > current_h and (declared is None or total_after <= declared):
                out.append(m.AdaptationProposal(
                    user_id=user.id, reality_check_id=rc.id, kind="adjust_allocation", goal_id=gid,
                    payload={"scenario_id": scenario.id, "goal_title": r["title"], "from_hours": current_h,
                             "to_hours": to_h, "freed_hours": round(current_h - to_h, 2),
                             "weeks_observed": obs["weeks_observed"]},
                    reason=(
                        f"{r['title']}: вы стабильно делаете больше плана (~{obs['avg_actual_hours']:g} ч/нед "
                        f"при {current_h:g}). Можно закрепить {to_h:g} ч/нед — в пределах свободного времени."
                    ),
                ))

    declared = user.current_profile.weekly_hours_available if user.current_profile else None
    obs_total = observed["weekly_actual_hours_avg"]
    if declared and obs_total is not None and observed["checks"] >= 2 and obs_total < declared * LOW_TOTAL_VS_DECLARED:
        to_h = round_half(obs_total)
        out.append(m.AdaptationProposal(
            user_id=user.id, reality_check_id=rc.id, kind="update_availability",
            payload={"from_hours": declared, "to_hours": to_h, "checks": observed["checks"]},
            reason=(
                f"Заявлено {declared:g} ч/нед свободного времени, а за {observed['checks']} недели фактически "
                f"в среднем {obs_total:g} ч/нед. Обновить доступное время до {to_h:g} ч/нед?"
            ),
        ))
    for p in out:
        db.add(p)
    db.flush()
    return out


def resolve_proposal(db: Session, user: m.User, proposal: m.AdaptationProposal, accept: bool,
                     comment: str | None = None) -> dict:
    if proposal.user_id != user.id:
        raise LoopError("Предложение не найдено.", status_code=404)
    if proposal.status != "pending":
        raise LoopError(f"Предложение уже обработано (статус: {proposal.status}).")
    proposal.status = "accepted" if accept else "rejected"
    proposal.resolved_at = datetime.now(timezone.utc)
    result: dict = {"proposal_id": proposal.id, "status": proposal.status}

    if accept and proposal.kind == "adjust_allocation":
        base = memory.chosen_scenario(db, user.id)
        if base is None:
            raise LoopError("Нет выбранного сценария для адаптации.", stage="decide")
        n = db.query(m.Scenario).filter(m.Scenario.user_id == user.id, m.Scenario.source == "adaptation").count() + 1
        root_name = base.name.split(" · ")[0]
        new = m.Scenario(
            user_id=user.id, name=f"{root_name} · адаптация {n}", source="adaptation",
            parent_scenario_id=base.id, status="chosen",
            description=f"Создан из «{base.name}» после подтверждения предложения #{proposal.id}.",
        )
        for a in base.allocations:
            hours = proposal.payload["to_hours"] if a.goal_id == proposal.goal_id else a.hours_per_week
            new.allocations.append(m.ScenarioAllocation(goal_id=a.goal_id, hours_per_week=hours))
        base.status = "superseded"
        db.add(new)
        db.flush()
        decision = m.Decision(user_id=user.id, scenario_id=new.id, source="adaptation",
                              rationale=comment or proposal.reason)
        db.add(decision)
        db.flush()
        memory.record(db, user, memory.SCENARIO_CHOSEN, {
            "scenario_id": new.id, "decision_id": decision.id, "source": "adaptation",
            "proposal_id": proposal.id, "goal_id": proposal.goal_id,
            "from_hours": proposal.payload["from_hours"], "to_hours": proposal.payload["to_hours"],
        }, goal_id=proposal.goal_id, ref=decision)
        result.update({"new_scenario_id": new.id, "decision_id": decision.id})
    elif accept and proposal.kind == "update_availability":
        profile = user.current_profile
        old = profile.weekly_hours_available
        profile.weekly_hours_available = proposal.payload["to_hours"]
        memory.record(db, user, memory.AVAILABILITY_CHANGED, {
            "from": old, "to": profile.weekly_hours_available, "source": "adaptation_proposal",
            "proposal_id": proposal.id,
        }, ref=proposal)
        result.update({"weekly_hours_available": profile.weekly_hours_available})
    elif not accept:
        memory.record(db, user, memory.FEEDBACK, {
            "text": comment or f"Пользователь отклонил предложение: {proposal.reason}",
            "proposal_id": proposal.id, "kind": "proposal_rejected",
        }, goal_id=proposal.goal_id, ref=proposal)

    memory.record(db, user, memory.PROPOSAL_RESOLVED, {
        "proposal_id": proposal.id, "kind": proposal.kind, "accepted": accept,
    }, goal_id=proposal.goal_id, ref=proposal)
    return result
