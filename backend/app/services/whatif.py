"""What If Lab: deterministic scenario mathematics.

Everything numeric shown to the user is computed here. The LLM only *explains* these numbers
(see explain.py) and is never the source of a figure.
"""
from __future__ import annotations

from math import floor

THIN_ALLOCATION_HOURS = 1.5
CONCENTRATION_THRESHOLD = 0.6
UNDER_DELIVERY_RATIO = 0.85

ALIGNMENT_NOTE = (
    "Индекс соответствия приоритетам — эвристика: насколько доля часов на каждую цель совпадает "
    "с долей её приоритета (1.0 — полное совпадение). Это не вероятность успеха."
)


def _round(x: float, n: int = 2) -> float:
    return round(x + 0.0, n)


def priority_weights(goals: list[dict]) -> dict[int, float]:
    open_goals = [g for g in goals if g.get("status", "open") != "achieved"]
    total = sum(max(1, int(g.get("priority") or 3)) for g in open_goals)
    if not total:
        return {}
    return {g["id"]: max(1, int(g.get("priority") or 3)) / total for g in open_goals}


def priority_alignment(shares: dict[int, float], weights: dict[int, float]) -> float | None:
    """1 - total variation distance between hour shares and priority weights."""
    if not weights:
        return None
    keys = set(shares) | set(weights)
    tvd = 0.5 * sum(abs(shares.get(k, 0.0) - weights.get(k, 0.0)) for k in keys)
    return _round(1 - tvd, 3)


def scenario_metrics(
    scenario: dict,
    goals: list[dict],
    available_hours: float,
    observed: dict | None = None,
) -> dict:
    """scenario = {id, name, allocations: {goal_id: hours}}; goals carry priority/status/weeks_left."""
    alloc: dict[int, float] = {int(k): float(v) for k, v in scenario["allocations"].items()}
    total = _round(sum(alloc.values()), 2)
    weights = priority_weights(goals)
    shares = {gid: (h / total if total else 0.0) for gid, h in alloc.items()}
    observed = observed or {}
    per_goal_obs = observed.get("per_goal", {})

    ranked = sorted(alloc.items(), key=lambda kv: -kv[1])
    rank_of = {gid: i + 1 for i, (gid, _) in enumerate(ranked)}

    rows = []
    risks: list[dict] = []
    for g in goals:
        gid = g["id"]
        hours = alloc.get(gid, 0.0)
        weeks_left = g.get("weeks_left")
        row = {
            "goal_id": gid,
            "title": g["title"],
            "priority": g.get("priority"),
            "hours_per_week": hours,
            "share": _round(shares.get(gid, 0.0), 3),
            "priority_weight": _round(weights.get(gid, 0.0), 3),
            "rank_by_hours": rank_of.get(gid),
            "weeks_left": weeks_left,
            "hours_until_target": (
                _round(floor(weeks_left) * hours, 1) if weeks_left is not None else None
            ),
            "status": g.get("status", "open"),
        }
        rows.append(row)

        is_open = g.get("status", "open") != "achieved"
        if is_open and hours == 0:
            risks.append({
                "code": "unfunded_goal", "severity": "high" if (g.get("priority") or 3) >= 4 else "medium",
                "goal_id": gid,
                "message": f"«{g['title']}»: 0 ч/нед — цель не продвигается в этом сценарии.",
            })
        elif is_open and 0 < hours < THIN_ALLOCATION_HOURS:
            risks.append({
                "code": "thin_allocation", "severity": "low", "goal_id": gid,
                "message": f"«{g['title']}»: {hours} ч/нед — мало времени для регулярной практики "
                "(эвристика, не статистика).",
            })
        obs = per_goal_obs.get(gid) or per_goal_obs.get(str(gid))
        if obs and hours > 0 and obs.get("avg_actual_hours") is not None:
            if obs["avg_actual_hours"] < hours * UNDER_DELIVERY_RATIO:
                risks.append({
                    "code": "above_observed_goal_pace", "severity": "medium", "goal_id": gid,
                    "message": f"«{g['title']}»: по Reality Check вы фактически выполняли "
                    f"~{obs['avg_actual_hours']} ч/нед, а сценарий требует {hours} ч/нед.",
                })

    utilization = _round(total / available_hours, 3) if available_hours else None
    slack = _round(available_hours - total, 2)
    if available_hours and total > available_hours:
        risks.append({
            "code": "over_capacity", "severity": "high",
            "message": f"Сценарий требует {total} ч/нед при доступных {available_hours} ч/нед.",
        })
    elif available_hours and total == available_hours:
        risks.append({
            "code": "no_slack", "severity": "low",
            "message": "Всё свободное время распределено — нет запаса на непредвиденное.",
        })
    obs_total = observed.get("weekly_actual_hours_avg")
    if obs_total is not None and total > 0 and obs_total < total * UNDER_DELIVERY_RATIO:
        risks.append({
            "code": "above_observed_capacity", "severity": "medium",
            "message": f"По фактическим данным вы выполняли ~{obs_total} ч/нед, сценарий требует {total} ч/нед.",
        })
    top_gid = max(shares, key=shares.get) if shares else None
    max_share = shares.get(top_gid, 0.0) if top_gid is not None else 0.0
    if total and max_share > CONCENTRATION_THRESHOLD:
        titles = {g["id"]: g["title"] for g in goals}
        risks.append({
            "code": "concentration", "severity": "low", "goal_id": top_gid,
            "message": f"{round(max_share * 100)}% времени уходит на «{titles.get(top_gid, top_gid)}» — "
            "остальные цели продвигаются медленнее.",
        })

    return {
        "scenario_id": scenario["id"],
        "name": scenario["name"],
        "total_hours": total,
        "available_hours": available_hours,
        "utilization": utilization,
        "slack_hours": slack,
        "over_capacity": bool(available_hours and total > available_hours),
        "priority_alignment": priority_alignment(shares, weights),
        "allocations": rows,
        "risks": risks,
    }


def compare(metrics: list[dict]) -> dict:
    """Differences of every scenario against the first one (the baseline)."""
    if not metrics:
        return {"baseline_scenario_id": None, "diffs": []}
    base = metrics[0]
    base_rows = {r["goal_id"]: r for r in base["allocations"]}
    diffs = []
    for m in metrics[1:]:
        goal_diffs = []
        for r in m["allocations"]:
            b = base_rows.get(r["goal_id"], {})
            dh = _round(r["hours_per_week"] - b.get("hours_per_week", 0.0), 2)
            goal_diffs.append({
                "goal_id": r["goal_id"],
                "title": r["title"],
                "hours_delta": dh,
                "share_delta": _round(r["share"] - b.get("share", 0.0), 3),
                "hours_until_target_delta": (
                    _round(r["hours_until_target"] - b["hours_until_target"], 1)
                    if r.get("hours_until_target") is not None and b.get("hours_until_target") is not None
                    else None
                ),
                "rank_change": (
                    (b.get("rank_by_hours") or 0) - (r.get("rank_by_hours") or 0)
                    if b.get("rank_by_hours") and r.get("rank_by_hours") else None
                ),
            })
        diffs.append({
            "scenario_id": m["scenario_id"],
            "vs_scenario_id": base["scenario_id"],
            "total_hours_delta": _round(m["total_hours"] - base["total_hours"], 2),
            "priority_alignment_delta": (
                _round(m["priority_alignment"] - base["priority_alignment"], 3)
                if m["priority_alignment"] is not None and base["priority_alignment"] is not None else None
            ),
            "goals": goal_diffs,
            "changed_goals": [g["title"] for g in goal_diffs if g["hours_delta"] != 0],
        })

    best_alignment = max(
        (m for m in metrics if m["priority_alignment"] is not None),
        key=lambda m: m["priority_alignment"],
        default=None,
    )
    feasible = [m["scenario_id"] for m in metrics if not m["over_capacity"]]
    return {
        "baseline_scenario_id": base["scenario_id"],
        "diffs": diffs,
        "feasible_scenario_ids": feasible,
        "best_priority_alignment_scenario_id": best_alignment["scenario_id"] if best_alignment else None,
        "notes": [ALIGNMENT_NOTE],
    }
