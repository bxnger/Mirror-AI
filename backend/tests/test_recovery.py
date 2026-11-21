"""Recovery Preview: deterministic recalculation, validation, non-destructive behaviour."""
import copy

import pytest
from sqlalchemy import func, select

from app import models as m
from app.db import Base, get_db
from app.main import app
from app.recovery_schemas import RecoveryPreviewIn
from app.services import recovery

URL = "/api/recovery/preview"


def body(**over):
    b = {
        "category": "ent", "subject": "Math", "original_weekly_minutes": 360,
        "new_weekly_minutes": 180, "available_today_minutes": 30, "tasks": [],
    }
    b.update(over)
    return b


def task(id, minutes, priority=3, title=None):
    return {"id": id, "title": title or id, "planned_minutes": minutes, "priority": priority}


def by_id(resp):
    return {t["id"]: t for t in resp["tasks"]}


def check_arithmetic(r):
    s = r["summary"]
    assert s["proposed_minutes"] + s["reserve_minutes"] + s["unallocated_minutes"] == s["new_budget_minutes"]
    assert s["planning_budget_minutes"] == s["new_budget_minutes"] - s["reserve_minutes"]
    if r["tasks"]:
        assert sum(t["proposed_minutes"] for t in r["tasks"]) + s["deferred_minutes"] == s["original_workload_minutes"]
    for t in r["tasks"]:
        assert 0 <= t["proposed_minutes"] <= t["previous_minutes"]
        assert t["deferred_minutes"] == t["previous_minutes"] - t["proposed_minutes"]
        assert t["proposed_minutes"] % 5 == 0 or t["action"] == "keep"


# 1. six hours reduced to three (the demo fixture)
def test_demo_six_hours_to_three(client):
    r = client.get("/api/recovery/demo").json()
    assert r["label"] == "DEMO"
    p = r["preview"]
    check_arithmetic(p)
    s = p["summary"]
    assert (s["original_workload_minutes"], s["new_budget_minutes"]) == (360, 180)
    assert (s["reserve_minutes"], s["planning_budget_minutes"], s["proposed_minutes"]) == (15, 165, 165)
    assert (s["deferred_minutes"], s["unallocated_minutes"]) == (195, 0)
    t = by_id(p)
    assert (t["demo-mock"]["action"], t["demo-mock"]["proposed_minutes"]) == ("keep", 120)
    assert (t["demo-errors"]["action"], t["demo-errors"]["proposed_minutes"]) == ("shorten", 45)
    assert t["demo-errors"]["reason"] == "shortened_to_fit"
    assert all(t[i]["action"] == "defer" for i in ("demo-geometry", "demo-formulas", "demo-video"))
    assert p["status"] == "reduced" and p["preview"] is True and p["persisted"] is False
    assert p["next_action"] == {"kind": "start_task", "task_id": "demo-mock", "template_key": None,
                                "minutes": 10, "reason": "highest_priority_kept_task"}
    # fixture is served as-is and is the same as posting it
    assert client.post(URL, json=r["request"]).json() == p


# 2. reduced budget smaller than the planned workload
def test_budget_smaller_than_workload(client):
    r = client.post(URL, json=body(original_weekly_minutes=300, new_weekly_minutes=100, tasks=[
        task("a", 60, 3), task("b", 60, 3), task("c", 60, 3)])).json()
    check_arithmetic(r)
    assert r["summary"]["reserve_minutes"] == 10 and r["summary"]["planning_budget_minutes"] == 90
    t = by_id(r)
    assert (t["a"]["action"], t["b"]["action"], t["c"]["action"]) == ("keep", "shorten", "defer")
    assert t["b"]["proposed_minutes"] == 30
    assert "workload_exceeds_new_budget" in [w["code"] for w in r["warnings"]]


def test_original_plan_already_over_budget_is_reported(client):
    r = client.post(URL, json=body(original_weekly_minutes=120, new_weekly_minutes=120,
                                   tasks=[task("a", 100), task("b", 80)])).json()
    w = {x["code"]: x["params"] for x in r["warnings"]}
    assert w["original_plan_over_budget"] == {"workload_minutes": 180, "budget_minutes": 120, "excess_minutes": 60}


# 3. zero available time -> pause, nothing deleted
def test_zero_time_offers_pause(client):
    r = client.post(URL, json=body(new_weekly_minutes=0, available_today_minutes=0,
                                   tasks=[task("a", 60, 5), task("b", 30, 1)])).json()
    check_arithmetic(r)
    assert r["status"] == "paused"
    assert all(t["action"] == "defer" and t["reason"] == "paused_no_time" for t in r["tasks"])
    assert r["summary"]["deferred_minutes"] == 90 and r["summary"]["proposed_minutes"] == 0
    assert r["next_action"]["kind"] == "pause"
    assert "no_time_pause_suggested" in [w["code"] for w in r["warnings"]]


def test_zero_original_budget_has_no_division_by_zero(client):
    r = client.post(URL, json=body(original_weekly_minutes=0, new_weekly_minutes=60, tasks=[task("a", 30)])).json()
    assert r["summary"]["budget_change_ratio"] is None
    assert "budget_increased_no_outcome_guarantee" in [w["code"] for w in r["warnings"]]
    assert "more_time_does_not_guarantee_better_results" in r["assumptions"]


# 4. empty task list -> explicit generic template, no invented weaknesses
def test_empty_task_list_uses_generic_template(client):
    r = client.post(URL, json=body(new_weekly_minutes=120, available_today_minutes=45)).json()
    check_arithmetic(r)
    assert r["tasks"] == []
    assert [p["key"] for p in r["template_plan"]] == ["review_material", "practice_set", "check_mistakes"]
    assert sum(p["proposed_minutes"] for p in r["template_plan"]) == r["summary"]["planning_budget_minutes"] == 110
    assert "generic_template_not_based_on_known_weaknesses" in r["assumptions"]
    assert "no_tasks_generic_template" in [w["code"] for w in r["warnings"]]
    assert r["next_action"]["kind"] == "start_template" and r["next_action"]["minutes"] == 10


def test_small_budget_template_and_today_cap(client):
    r = client.post(URL, json=body(new_weekly_minutes=25, available_today_minutes=5)).json()
    check_arithmetic(r)
    assert r["summary"]["reserve_minutes"] == 0
    assert r["template_plan"] == [{"key": "review_material", "proposed_minutes": 25}]
    assert r["next_action"]["minutes"] == 5  # never more than today's time
    assert "reserve_not_feasible" in [w["code"] for w in r["warnings"]]


# 5. higher-priority work is preserved first
def test_priority_order_beats_input_order(client):
    r = client.post(URL, json=body(new_weekly_minutes=100, tasks=[
        task("low", 60, 1), task("high", 60, 5), task("mid", 60, 3)])).json()
    t = by_id(r)
    assert t["high"]["action"] == "keep" and t["high"]["rank"] == 1
    assert t["low"]["action"] == "defer"
    assert [x["id"] for x in r["tasks"]] == ["low", "high", "mid"]  # response keeps input order


def test_smaller_lower_priority_task_still_fits_after_defer(client):
    # 'big' cannot be shortened meaningfully (25 < 25% of 200 = 50) but 'small' fits fully
    r = client.post(URL, json=body(new_weekly_minutes=25, tasks=[task("big", 200, 5), task("small", 20, 1)])).json()
    t = by_id(r)
    assert (t["big"]["action"], t["big"]["reason"]) == ("defer", "deferred_below_meaningful_minimum")
    assert t["small"]["action"] == "keep"
    assert r["next_action"]["task_id"] == "small"


# 6. partial reduction only when meaningful
def test_shorten_only_when_meaningful(client):
    # remaining 15 min < 20 min minimum -> defer instead of a useless 15-minute stub
    r = client.post(URL, json=body(new_weekly_minutes=75, tasks=[task("a", 60, 5), task("b", 60, 4)])).json()
    t = by_id(r)
    assert t["a"]["action"] == "keep"
    assert (t["b"]["action"], t["b"]["proposed_minutes"]) == ("defer", 0)
    r = client.post(URL, json=body(new_weekly_minutes=90, tasks=[task("a", 60, 5), task("b", 60, 4)])).json()
    t = by_id(r)
    assert (t["b"]["action"], t["b"]["proposed_minutes"]) == ("shorten", 25)
    assert "high_priority_reduced" in [w["code"] for w in r["warnings"]]


def test_everything_fits(client):
    r = client.post(URL, json=body(new_weekly_minutes=300, tasks=[task("a", 60), task("b", 90)])).json()
    check_arithmetic(r)
    assert r["status"] == "fits" and r["summary"]["unallocated_minutes"] == 120
    assert all(t["action"] == "keep" for t in r["tasks"])


# 7. duplicate or invalid task ids
@pytest.mark.parametrize("tasks", [
    [task("a", 30), task("a", 40)],
    [task("bad id with spaces", 30)],
    [task("", 30)],
    [task("x" * 65, 30)],
])
def test_invalid_or_duplicate_ids_rejected(client, tasks):
    assert client.post(URL, json=body(tasks=tasks)).status_code == 422


# 8. negative, excessive or non-integer values
@pytest.mark.parametrize("over", [
    {"new_weekly_minutes": -1},
    {"original_weekly_minutes": 6721},
    {"available_today_minutes": 1441},
    {"new_weekly_minutes": 90.5},
    {"new_weekly_minutes": "90"},
    {"new_weekly_minutes": True},
    {"category": "gre"},
    {"subject": ""},
    {"tasks": [task("a", -5)]},
    {"tasks": [task("a", 30, priority=6)]},
    {"tasks": [task(f"t{i}", 10) for i in range(51)]},
    {"user_id": 1},  # unknown fields are rejected: no hidden personal data
])
def test_bad_values_rejected(client, over):
    assert client.post(URL, json=body(**over)).status_code == 422


def test_oversized_body_rejected(client):
    huge = body(topic="x" * 200, tasks=[task(f"t{i}", 10, title="y" * 160) for i in range(50)])
    huge["padding"] = "z" * 40000
    r = client.post(URL, json=huge)
    assert r.status_code == 413


# 9. deterministic
def test_same_input_same_output(client):
    b = body(new_weekly_minutes=140, tasks=[task("a", 50, 2), task("b", 70, 2), task("c", 40, 4)])
    first = client.post(URL, json=b).json()
    for _ in range(5):
        assert client.post(URL, json=copy.deepcopy(b)).json() == first
    direct = recovery.build_preview(RecoveryPreviewIn.model_validate(b)).model_dump()
    assert direct == first


@pytest.mark.parametrize("budget", range(0, 400, 7))
def test_invariants_hold_for_many_budgets(budget):
    req = RecoveryPreviewIn.model_validate(body(new_weekly_minutes=budget, tasks=[
        task("a", 120, 5), task("b", 45, 4), task("c", 90, 3), task("d", 0, 2), task("e", 33, 1)]))
    check_arithmetic(recovery.build_preview(req).model_dump())


# 10. no database mutations, no DB needed at all
def _counts(engine):
    with engine.connect() as conn:
        return {t.name: conn.execute(select(func.count()).select_from(t)).scalar() for t in Base.metadata.sorted_tables}


def test_preview_does_not_touch_database(client, engine):
    client.post("/api/demo/run-all")
    before = _counts(engine)
    assert before["users"] == 1 and before["plans"] == 2
    client.get("/api/recovery/demo")
    for budget in (0, 30, 180, 600):
        assert client.post(URL, json=body(new_weekly_minutes=budget, tasks=[task("a", 60)])).status_code == 200
    assert _counts(engine) == before


def test_preview_works_without_database(client):
    def broken_db():
        raise RuntimeError("database must not be used by recovery preview")
        yield  # pragma: no cover

    app.dependency_overrides[get_db] = broken_db
    assert client.post(URL, json=body(tasks=[task("a", 60)])).status_code == 200
    assert client.get("/api/recovery/demo").status_code == 200


# 11. existing planning / reality check behaviour is unchanged (full loop still green)
def test_existing_loop_still_works(client):
    res = client.post("/api/demo/run-all").json()
    plans = client.get(f"/api/users/{res['user_id']}/plans").json()
    assert [p["week_index"] for p in plans] == [1, 2]
    assert client.get(f"/api/users/{res['user_id']}/loop").json()["next"] == "execute"
    assert m.Plan  # models import unaffected
