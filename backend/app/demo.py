"""DEMO DATA for the defense: a student from Kazakhstan (SAT 1400, English B1->B2, Python basics,
12 free hours per week). Every value here is demonstration data and is labelled as such."""
from __future__ import annotations

from datetime import date, timedelta

from sqlalchemy.orm import Session

from . import models as m
from .services import loop, planner, reality

DEMO_LABEL = "DEMO"


def seed_demo_user(db: Session, today: date) -> m.User:
    """Steps 1-2 of the demo: Current Self + Future Self."""
    user = loop.create_user(db, "Айгерим (DEMO)", "Казахстан", is_demo=True)
    loop.upsert_current_profile(db, user, {
        "weekly_hours_available": 12,
        "study_days": [0, 1, 2, 3, 4, 5],
        "max_session_minutes": 90,
        "constraints": [
            "Школа в будни до 15:00 (DEMO)",
            "Воскресенье — день отдыха (DEMO)",
        ],
    })
    loop.upsert_future_profile(db, user, {
        "vision": "Поступить на Computer Science в зарубежный университет (DEMO-цель).",
        "horizon_date": today + timedelta(weeks=26),
        "desired_achievements": ["SAT 1400+", "English B2", "Первый собственный проект на Python"],
    })
    loop.create_goal(db, user, {
        "title": "SAT", "domain": "exam", "metric_type": "numeric", "unit": "баллов",
        "min_value": 400, "max_value": 1600,
        "current": {"value": 1180, "source": "mock_test",
                    "evidence": "DEMO: пробный тест (Math 600 + R&W 580)"},
        "target": {"value": 1400, "target_date": today + timedelta(weeks=16), "priority": 5,
                   "desired_outcome": "Результат SAT 1400 для подачи документов",
                   "milestones": [
                       {"title": "Диагностика слабых тем Math", "done": True},
                       {"title": "Reading & Writing: стратегии по типам вопросов"},
                       {"title": "Пробный тест ≥ 1300"},
                       {"title": "Пробный тест ≥ 1400"},
                   ]},
    })
    loop.create_goal(db, user, {
        "title": "English", "domain": "language", "metric_type": "level", "scale": "cefr",
        "current": {"level": "B1", "source": "self_assessment",
                    "evidence": "DEMO: самооценка + школьная оценка"},
        "target": {"level": "B2", "target_date": today + timedelta(weeks=24), "priority": 4,
                   "desired_outcome": "Свободно читать учебные тексты и писать эссе",
                   "milestones": [
                       {"title": "Лексика B2: 500 слов"},
                       {"title": "Writing: 8 эссе с проверкой"},
                       {"title": "Пробный тест уровня B2"},
                   ]},
    })
    loop.create_goal(db, user, {
        "title": "Python", "domain": "programming", "metric_type": "level", "scale": "proficiency",
        "current": {"level": "beginner", "source": "self_assessment",
                    "evidence": "DEMO: прошла вводный урок"},
        "target": {"level": "elementary", "target_date": today + timedelta(weeks=20), "priority": 3,
                   "desired_outcome": "Освоить основы программирования и сделать мини-проект",
                   "milestones": [
                       {"title": "Переменные и типы данных", "done": True},
                       {"title": "Условия и циклы"},
                       {"title": "Функции"},
                       {"title": "Списки и словари"},
                       {"title": "Мини-проект: консольное приложение"},
                   ]},
    })
    db.flush()
    return user


def demo_scenarios(db: Session, user: m.User) -> tuple[m.Scenario, m.Scenario]:
    goals = {g.title: g.id for g in user.goals}
    a = loop.create_scenario(db, user, "Сценарий A · Баланс", [
        {"goal_id": goals["SAT"], "hours_per_week": 6},
        {"goal_id": goals["Python"], "hours_per_week": 4},
        {"goal_id": goals["English"], "hours_per_week": 2},
    ], description="DEMO: равномерное развитие трёх целей", source="demo")
    b = loop.create_scenario(db, user, "Сценарий B · Фокус на SAT", [
        {"goal_id": goals["SAT"], "hours_per_week": 8},
        {"goal_id": goals["Python"], "hours_per_week": 2},
        {"goal_id": goals["English"], "hours_per_week": 2},
    ], description="DEMO: максимум времени на ближайший дедлайн", source="demo")
    return a, b


def simulate_week(db: Session, user: m.User, plan: m.Plan) -> dict:
    """DEMO execution: deterministic, clearly labelled pattern.

    Week 1: SAT and English done in full; Python - 2.5 of 4 h (first session done, second partial,
    the rest skipped). Later weeks: everything done except the last Python session (partial).
    """
    if not user.is_demo:
        raise loop.LoopError("Симуляция доступна только для DEMO-пользователя.", status_code=403)
    python_tasks = sorted((t for t in plan.tasks if t.goal.title == "Python"), key=lambda t: (t.day_of_week, t.id))
    for t in plan.tasks:
        if t.status != "pending":
            continue
        if t.goal.title != "Python":
            planner.update_task(db, user, t, "done", None)
    week1_python_target = 150  # minutes, DEMO
    done_so_far = 0
    for i, t in enumerate(python_tasks):
        if t.status != "pending":
            done_so_far += t.actual_minutes
            continue
        if plan.week_index == 1:
            left = week1_python_target - done_so_far
            if left >= t.planned_minutes:
                planner.update_task(db, user, t, "done", None)
            elif left > 0:
                planner.update_task(db, user, t, "partial", left)
            else:
                planner.update_task(db, user, t, "skipped", None)
            done_so_far += t.actual_minutes
        else:
            if i < len(python_tasks) - 1:
                planner.update_task(db, user, t, "done", None)
            else:
                planner.update_task(db, user, t, "partial", max(15, t.planned_minutes // 2))
    db.flush()
    return {"plan_id": plan.id, "label": DEMO_LABEL,
            "note": "Отметки выполнения сгенерированы как DEMO-данные."}


def run_full_demo(db: Session, today: date, llm=None) -> dict:
    """All 10 demo steps end-to-end (used by the CLI script and integration tests)."""
    user = seed_demo_user(db, today)                                     # 1-2
    gap = loop.twin.gap_for_user(db, user, today)                       # 3
    a, b = demo_scenarios(db, user)
    comp = loop.compare_scenarios(db, user, [a.id, b.id], today, llm)   # 4-5
    decision = loop.decide(db, user, a.id, comp.id,                     # 6
                           "DEMO: хочу развивать все три цели, SAT остаётся главным приоритетом")
    plan1 = planner.generate_plan(db, user, planner.default_week_start(today))  # 7
    simulate_week(db, user, plan1)                                      # 8
    rc, proposals = reality.run_reality_check(                          # 9
        db, user, plan1, "DEMO: Python тяжело заходит после школы, длинные занятия не успеваю.", 4
    )
    resolved = [reality.resolve_proposal(db, user, p, accept=True) for p in proposals
                if p.kind == "adjust_allocation"]
    plan2 = planner.generate_plan(db, user)                             # 10
    db.flush()
    return {
        "user_id": user.id, "gap": gap, "scenario_ids": [a.id, b.id], "comparison_id": comp.id,
        "decision_id": decision.id, "plan1_id": plan1.id, "reality_check_id": rc.id,
        "proposal_ids": [p.id for p in proposals], "resolved": resolved, "plan2_id": plan2.id,
    }
