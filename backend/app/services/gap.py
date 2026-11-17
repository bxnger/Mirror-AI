"""Gap Analysis: measurable difference between CURRENT SELF and FUTURE SELF.

Deliberately does NOT estimate "hours needed" to close a gap (e.g. hours per SAT point):
there is no validated model for that. It reports the measurable gap, remaining milestones,
time context (weeks left, hours the user has *allocated*) and explicit assumptions.
"""
from __future__ import annotations

from datetime import date, datetime, timezone
from math import floor

from .scales import SCALES, level_index, level_path

STALE_AFTER_DAYS = 45
NO_HOURS_MODEL_NOTE = (
    "Система не рассчитывает, сколько часов нужно для закрытия разрыва: "
    "для этого нет валидированной модели и достаточных данных."
)
SOURCE_RU = {
    "self_assessment": "самооценка",
    "mock_test": "пробный тест",
    "official_test": "официальный результат",
    "teacher": "оценка преподавателя",
    "demo": "DEMO-данные",
}


def _parse_date(value) -> date | None:
    if value is None or isinstance(value, date) and not isinstance(value, datetime):
        return value
    if isinstance(value, datetime):
        return value.date()
    return date.fromisoformat(str(value)[:10])


def weeks_between(today: date, target: date | None) -> float | None:
    if target is None:
        return None
    return round(max(0, (target - today).days) / 7, 1)


def analyze_goal(
    goal: dict,
    today: date,
    hours_per_week: float | None = None,
    constraints: list[str] | None = None,
) -> dict:
    current = goal.get("current")
    target = goal.get("target")
    metric = goal["metric_type"]
    assumptions: list[str] = []
    missing: list[str] = []
    next_actions: list[str] = []

    result: dict = {
        "goal_id": goal["id"],
        "title": goal["title"],
        "domain": goal.get("domain"),
        "metric_type": metric,
        "unit": goal.get("unit"),
        "current": current,
        "target": None if target is None else {k: v for k, v in target.items() if k != "milestones"},
        "gap": None,
        "milestones": None,
        "time": None,
        "status": "open",
        "constraints": list(constraints or []),
        "assumptions": assumptions,
        "missing_data": missing,
        "next_actions": next_actions,
    }

    if target is None:
        result["status"] = "no_target"
        missing.append("Не задано желаемое состояние (Future Self) для этой цели.")
        return result

    # ---- milestones (intermediate steps of the Future Self)
    milestones = target.get("milestones") or []
    if milestones:
        done = [m for m in milestones if m.get("done")]
        remaining = [m for m in milestones if not m.get("done")]
        result["milestones"] = {
            "total": len(milestones),
            "done": len(done),
            "remaining": [m["title"] for m in remaining],
            "progress": round(len(done) / len(milestones), 3),
        }
        next_actions.extend(f"Этап: {m['title']}" for m in remaining[:2])

    # ---- measurable gap
    if current is None and metric != "milestones":
        result["status"] = "no_current_data"
        missing.append("Нет текущего значения (Current Self) — разрыв нельзя измерить.")
        next_actions.insert(0, "Зафиксировать текущий уровень (тест или самооценка).")
    elif metric == "numeric":
        cur_v, tgt_v = current.get("value"), target.get("value")
        if cur_v is None or tgt_v is None:
            result["status"] = "no_current_data" if cur_v is None else "no_target"
            missing.append("Не хватает числового значения для расчёта разрыва.")
        else:
            absolute = round(tgt_v - cur_v, 2)
            lo, hi = goal.get("min_value"), goal.get("max_value")
            scale_span = (hi - lo) if lo is not None and hi is not None and hi > lo else None
            result["gap"] = {
                "kind": "numeric",
                "current": cur_v,
                "target": tgt_v,
                "absolute": absolute,
                "unit": goal.get("unit"),
                "share_of_scale": round(absolute / scale_span, 3) if scale_span else None,
                "scale": [lo, hi] if scale_span else None,
            }
            if absolute <= 0:
                result["status"] = "achieved"
    elif metric == "level":
        scale = goal.get("scale")
        ci, ti = level_index(scale, current.get("level")), level_index(scale, target.get("level"))
        if ci is None or ti is None:
            missing.append("Уровень не распознан в шкале цели.")
            result["status"] = "no_current_data" if ci is None else "no_target"
        else:
            steps = ti - ci
            result["gap"] = {
                "kind": "level",
                "current": SCALES[scale][ci],
                "target": SCALES[scale][ti],
                "steps": max(0, steps),
                "path": level_path(scale, ci, ti) if steps > 0 else [],
                "scale": SCALES[scale],
            }
            if steps <= 0:
                result["status"] = "achieved"
    elif metric == "milestones":
        ms = result["milestones"]
        if not ms:
            missing.append("Для цели не заданы промежуточные этапы.")
            result["status"] = "no_target"
        else:
            result["gap"] = {"kind": "milestones", "remaining": ms["total"] - ms["done"], "total": ms["total"]}
            if ms["done"] == ms["total"]:
                result["status"] = "achieved"

    # ---- explicit assumptions about data quality
    if current is not None:
        src = current.get("source", "self_assessment")
        assumptions.append(f"Текущее состояние основано на источнике: {SOURCE_RU.get(src, src)}.")
        if src == "self_assessment":
            assumptions.append("Самооценка может отличаться от результата объективного теста.")
        recorded = _parse_date(current.get("recorded_at"))
        if recorded and (today - recorded).days > STALE_AFTER_DAYS:
            missing.append(f"Текущие данные старше {STALE_AFTER_DAYS} дней — стоит обновить.")
            next_actions.append("Обновить текущее значение (свежий тест/оценка).")
        if metric == "numeric" and src not in {"mock_test", "official_test"}:
            next_actions.append("Сдать пробный тест, чтобы получить объективную точку отсчёта.")
    assumptions.append(NO_HOURS_MODEL_NOTE)

    # ---- time context (facts derived from dates and the user's own allocation)
    tdate = _parse_date(target.get("target_date"))
    weeks_left = weeks_between(today, tdate)
    time_ctx: dict = {
        "target_date": tdate.isoformat() if tdate else None,
        "weeks_left": weeks_left,
        "allocated_hours_per_week": hours_per_week,
        "allocated_hours_until_target": None,
    }
    if weeks_left is not None and hours_per_week is not None:
        time_ctx["allocated_hours_until_target"] = round(floor(weeks_left) * hours_per_week, 1)
    if tdate is None:
        missing.append("Не задана целевая дата.")
    elif weeks_left == 0 and result["status"] != "achieved":
        missing.append("Целевая дата уже прошла — нужно пересмотреть цель вместе с пользователем.")
    if hours_per_week is None:
        missing.append("Время на цель ещё не распределено (нет выбранного сценария).")
    elif hours_per_week == 0 and result["status"] != "achieved":
        missing.append("В выбранном сценарии на цель выделено 0 часов.")
    result["time"] = time_ctx
    return result


def analyze_twin(
    goals: list[dict],
    today: date | None = None,
    allocations: dict[int, float] | None = None,
    constraints: list[str] | None = None,
) -> dict:
    today = today or datetime.now(timezone.utc).date()
    allocations = allocations or {}
    items = [
        analyze_goal(g, today, allocations.get(g["id"]) if allocations else None, constraints)
        for g in goals
    ]
    return {
        "as_of": today.isoformat(),
        "goals": items,
        "summary": {
            "total": len(items),
            "open": sum(1 for i in items if i["status"] == "open"),
            "achieved": sum(1 for i in items if i["status"] == "achieved"),
            "needs_data": sum(1 for i in items if i["status"] in {"no_current_data", "no_target"}),
        },
        "disclaimer": "Future Self — это желаемое состояние, а не прогноз. Разрыв показывает, "
        "что измеримо отличается сейчас, без обещаний результата.",
    }
