"""Integration: the whole Decision-to-Outcome loop through the HTTP API on one database.

Understand -> Simulate -> Decide -> Execute -> Measure -> Adapt, and every step must consume the
data produced by the previous one.
"""
from datetime import date, timedelta

from app.services.memory import CORE_EVENT_TYPES

TODAY = date.today()


def make_user(client, hours=12):
    uid = client.post("/api/users", json={"name": "Test student", "country": "Казахстан"}).json()["id"]
    r = client.put(f"/api/users/{uid}/current-self", json={
        "weekly_hours_available": hours, "study_days": [0, 1, 2, 3, 4, 5], "max_session_minutes": 90,
        "constraints": ["Школа до 15:00"],
    })
    assert r.status_code == 200
    client.put(f"/api/users/{uid}/future-self", json={"vision": "CS abroad", "desired_achievements": ["SAT 1400"]})
    goals = {}
    goals["SAT"] = client.post(f"/api/users/{uid}/goals", json={
        "title": "SAT", "domain": "exam", "metric_type": "numeric", "unit": "баллов",
        "min_value": 400, "max_value": 1600,
        "current": {"value": 1180, "source": "mock_test"},
        "target": {"value": 1400, "target_date": str(TODAY + timedelta(weeks=16)), "priority": 5,
                   "milestones": [{"title": "Пробный тест 1300"}]},
    }).json()["id"]
    goals["English"] = client.post(f"/api/users/{uid}/goals", json={
        "title": "English", "domain": "language", "metric_type": "level", "scale": "cefr",
        "current": {"level": "B1"}, "target": {"level": "B2", "priority": 4,
                                                "target_date": str(TODAY + timedelta(weeks=24))},
    }).json()["id"]
    goals["Python"] = client.post(f"/api/users/{uid}/goals", json={
        "title": "Python", "domain": "programming", "metric_type": "level", "scale": "proficiency",
        "current": {"level": "beginner"}, "target": {"level": "intermediate", "priority": 3,
                                                      "milestones": [{"title": "Функции"}, {"title": "Проект"}]},
    }).json()["id"]
    return uid, goals


def scenarios(client, uid, g):
    a = client.post(f"/api/users/{uid}/scenarios", json={"name": "A", "allocations": [
        {"goal_id": g["SAT"], "hours_per_week": 6}, {"goal_id": g["Python"], "hours_per_week": 4},
        {"goal_id": g["English"], "hours_per_week": 2}]}).json()
    b = client.post(f"/api/users/{uid}/scenarios", json={"name": "B", "allocations": [
        {"goal_id": g["SAT"], "hours_per_week": 8}, {"goal_id": g["Python"], "hours_per_week": 2},
        {"goal_id": g["English"], "hours_per_week": 2}]}).json()
    return a, b


def complete_week(client, uid, plan, python_goal):
    """SAT/English fully done; Python: 1 done (80), 1 partial (70), rest skipped -> 150 of 240 min."""
    py = [t for t in plan["tasks"] if t["goal_id"] == python_goal]
    assert [t["planned_minutes"] for t in py] == [80, 80, 80]
    for t in plan["tasks"]:
        if t["goal_id"] != python_goal:
            assert client.patch(f"/api/users/{uid}/tasks/{t['id']}", json={"status": "done"}).status_code == 200
    for i, t in enumerate(py):
        body = {"status": "done"} if i == 0 else {"status": "partial", "actual_minutes": 70} if i == 1 else {"status": "skipped"}
        assert client.patch(f"/api/users/{uid}/tasks/{t['id']}", json=body).status_code == 200


def test_full_decision_to_outcome_loop(client):
    # 1-2. Understand: Current Self and Future Self stored separately
    uid, g = make_user(client)
    twin = client.get(f"/api/users/{uid}/twin").json()
    py_cur = next(s for s in twin["current_self"]["skills"] if s["goal_id"] == g["Python"])
    py_fut = next(s for s in twin["future_self"]["targets"] if s["goal_id"] == g["Python"])
    assert py_cur["level"] == "beginner" and py_fut["level"] == "intermediate"
    assert twin["current_self"]["kind"] == "facts" and twin["future_self"]["kind"] == "desired_state"

    # 3. Gap analysis uses both
    gap = client.get(f"/api/users/{uid}/gap").json()
    sat_gap = next(x for x in gap["goals"] if x["goal_id"] == g["SAT"])
    assert sat_gap["gap"]["absolute"] == 220
    assert sat_gap["time"]["allocated_hours_per_week"] is None  # no decision yet

    # Execute is blocked before Decide
    r = client.post(f"/api/users/{uid}/plans", json={})
    assert r.status_code == 409 and r.json()["stage"] == "decide"

    # 4-5. Simulate: What If uses the real profile (12 h, priorities, dates)
    a, b = scenarios(client, uid, g)
    comp = client.post(f"/api/users/{uid}/whatif/compare", json={"scenario_ids": [a["id"], b["id"]]}).json()
    ma, mb = comp["metrics"]["scenarios"]
    assert ma["available_hours"] == 12 and ma["total_hours"] == 12
    assert ma["priority_alignment"] > mb["priority_alignment"]
    assert comp["explanation_source"] == "template"  # LLM disabled in tests
    assert {s["scenario_id"] for s in comp["explanation"]["scenarios"]} == {a["id"], b["id"]}
    assert comp["explanation"]["numbers_check"]["ok"]

    # 6. Decide
    d = client.post(f"/api/users/{uid}/decisions", json={
        "scenario_id": a["id"], "comparison_id": comp["id"], "rationale": "баланс"}).json()
    assert d["scenario_id"] == a["id"] and d["comparison_id"] == comp["id"]
    gap = client.get(f"/api/users/{uid}/gap").json()
    sat_gap = next(x for x in gap["goals"] if x["goal_id"] == g["SAT"])
    assert sat_gap["time"]["allocated_hours_per_week"] == 6  # gap now knows the decision

    # 7. Execute: plan generated from the chosen scenario
    plan = client.post(f"/api/users/{uid}/plans", json={}).json()
    assert plan["decision_id"] == d["id"] and plan["scenario_id"] == a["id"]
    hours = {x["goal_id"]: x["planned_minutes"] / 60 for x in plan["by_goal"]}
    assert hours == {g["SAT"]: 6, g["Python"]: 4, g["English"]: 2}
    assert all(t["day_of_week"] in range(6) for t in plan["tasks"])  # Sunday excluded by study_days
    assert any(t["title"].startswith("Python: Функции") for t in plan["tasks"])  # milestones used

    # cannot start a new week before measuring
    r = client.post(f"/api/users/{uid}/plans", json={})
    assert r.status_code == 409 and r.json()["stage"] == "measure"

    # 8. Mark tasks
    complete_week(client, uid, plan, g["Python"])

    # 9. Reality Check knows plan, scenario and decision
    rc = client.post(f"/api/users/{uid}/plans/{plan['id']}/reality-check",
                     json={"feedback": "Python после школы тяжело", "perceived_difficulty": 4}).json()
    assert (rc["plan_id"], rc["scenario_id"], rc["decision_id"]) == (plan["id"], a["id"], d["id"])
    assert rc["ai_commentary"]["generator"]["source"] == "template"
    assert any("Python" in x for x in rc["ai_commentary"]["obstacles"])
    py = next(x for x in rc["per_goal"] if x["goal_id"] == g["Python"])
    assert py["planned_minutes"] == 240 and py["actual_minutes"] == 150
    assert rc["planned_hours"] == 12 and rc["actual_hours"] == 10.5
    [prop] = rc["proposals"]
    assert prop["kind"] == "adjust_allocation" and prop["goal_id"] == g["Python"]
    assert prop["payload"]["from_hours"] == 4 and prop["payload"]["to_hours"] == 2.5
    assert prop["status"] == "pending" and prop["requires_confirmation"]

    # tasks are locked after measuring; plan can't be checked twice
    assert client.patch(f"/api/users/{uid}/tasks/{plan['tasks'][0]['id']}", json={"status": "skipped"}).status_code == 409
    assert client.post(f"/api/users/{uid}/plans/{plan['id']}/reality-check", json={}).status_code == 409

    # nothing changed without confirmation
    sc_list = client.get(f"/api/users/{uid}/scenarios").json()
    chosen = [s for s in sc_list if s["status"] == "chosen"]
    assert len(chosen) == 1 and chosen[0]["id"] == a["id"]

    # 10. Adapt: user confirms -> new scenario revision + decision -> next plan uses real results
    res = client.post(f"/api/users/{uid}/proposals/{prop['id']}/accept", json={}).json()
    assert res["status"] == "accepted"
    plan2 = client.post(f"/api/users/{uid}/plans", json={}).json()
    assert plan2["scenario_id"] == res["new_scenario_id"] and plan2["decision_id"] == res["decision_id"]
    assert plan2["previous_plan_id"] == plan["id"] and plan2["week_index"] == 2
    hours2 = {x["goal_id"]: x["planned_minutes"] / 60 for x in plan2["by_goal"]}
    assert hours2 == {g["SAT"]: 6, g["Python"]: 2.5, g["English"]: 2}
    py_tasks = [t for t in plan2["tasks"] if t["goal_id"] == g["Python"]]
    assert max(t["planned_minutes"] for t in py_tasks) <= 45  # shorter sessions after low completion
    assert any(t["is_carry_over"] for t in py_tasks)  # unfinished work carried over
    note_types = {n["type"] for n in plan2["adaptation_notes"]}
    assert {"allocation_confirmed", "shorter_sessions", "carry_over"} <= note_types

    # goals / Future Self untouched by adaptation
    twin2 = client.get(f"/api/users/{uid}/twin").json()
    assert next(s for s in twin2["future_self"]["targets"] if s["goal_id"] == g["Python"])["level"] == "intermediate"

    # Adaptive memory: observed results drive the context
    mem = client.get(f"/api/users/{uid}/memory").json()
    ctx = mem["context"]
    assert ctx["observed"]["checks"] == 1
    assert ctx["observed"]["per_goal"][str(g["Python"])]["avg_actual_hours"] == 2.5
    assert ctx["chosen_scenario"]["id"] == res["new_scenario_id"]
    assert any("Python после школы" in f for f in ctx["facts"])

    # a later What If comparison sees the real results as risks
    comp2 = client.post(f"/api/users/{uid}/whatif/compare", json={"scenario_ids": [a["id"], b["id"]]}).json()
    codes = {r["code"] for r in comp2["metrics"]["scenarios"][0]["risks"]}
    assert "above_observed_goal_pace" in codes

    # loop status: all six stages done
    loop = client.get(f"/api/users/{uid}/loop").json()
    assert all(s["done"] for s in loop["stages"]), loop


def test_memory_records_all_core_event_types(client):
    uid, g = make_user(client)
    a, b = scenarios(client, uid, g)
    client.put(f"/api/users/{uid}/goals/{g['SAT']}/current", json={"value": 1250, "source": "mock_test"})
    client.put(f"/api/users/{uid}/goals/{g['SAT']}/target", json={"priority": 4})
    client.post(f"/api/users/{uid}/decisions", json={"scenario_id": a["id"]})
    plan = client.post(f"/api/users/{uid}/plans", json={}).json()
    complete_week(client, uid, plan, g["Python"])
    client.post(f"/api/users/{uid}/plans/{plan['id']}/reality-check", json={"feedback": "ok"})
    client.put(f"/api/users/{uid}/current-self", json={"weekly_hours_available": 10})
    events = client.get(f"/api/users/{uid}/memory").json()["events"]
    types = {e["event_type"] for e in events}
    assert set(CORE_EVENT_TYPES) <= types, set(CORE_EVENT_TYPES) - types
    skill = next(e for e in events if e["event_type"] == "skill_changed" and e["payload"].get("action") == "updated")
    assert skill["payload"]["from"]["value"] == 1180 and skill["payload"]["to"]["value"] == 1250


def test_rejecting_proposal_keeps_decision_but_plan_still_adapts_tactics(client):
    uid, g = make_user(client)
    a, _ = scenarios(client, uid, g)
    client.post(f"/api/users/{uid}/decisions", json={"scenario_id": a["id"]})
    plan = client.post(f"/api/users/{uid}/plans", json={}).json()
    complete_week(client, uid, plan, g["Python"])
    rc = client.post(f"/api/users/{uid}/plans/{plan['id']}/reality-check", json={}).json()
    pid = rc["proposals"][0]["id"]
    assert client.post(f"/api/users/{uid}/proposals/{pid}/reject", json={}).json()["status"] == "rejected"
    plan2 = client.post(f"/api/users/{uid}/plans", json={}).json()
    assert plan2["scenario_id"] == a["id"]  # user's decision respected
    hours2 = {x["goal_id"]: x["planned_minutes"] / 60 for x in plan2["by_goal"]}
    assert hours2[g["Python"]] == 4
    assert "shorter_sessions" in {n["type"] for n in plan2["adaptation_notes"]}
    assert client.post(f"/api/users/{uid}/proposals/{pid}/accept", json={}).status_code == 409


def test_validation_guards(client):
    uid, g = make_user(client)
    # current/future values validated against the goal scale
    r = client.put(f"/api/users/{uid}/goals/{g['English']}/current", json={"level": "Z9"})
    assert r.status_code == 422
    r = client.put(f"/api/users/{uid}/goals/{g['SAT']}/target", json={"value": 2000})
    assert r.status_code == 422
    # over-capacity scenario can be simulated but not chosen
    over = client.post(f"/api/users/{uid}/scenarios", json={"name": "Over", "allocations": [
        {"goal_id": g["SAT"], "hours_per_week": 10}, {"goal_id": g["Python"], "hours_per_week": 5}]}).json()
    assert client.post(f"/api/users/{uid}/decisions", json={"scenario_id": over["id"]}).status_code == 422
    # other users' data is not reachable
    other, _ = make_user(client)
    assert client.post(f"/api/users/{other}/decisions", json={"scenario_id": over["id"]}).status_code == 404
    # compare needs two scenarios
    assert client.post(f"/api/users/{uid}/whatif/compare", json={"scenario_ids": [over["id"]]}).status_code == 422


def test_demo_end_to_end(client):
    res = client.post("/api/demo/run-all").json()
    uid = res["user_id"]
    twin = client.get(f"/api/users/{uid}/twin").json()
    assert twin["user"]["is_demo"] and "DEMO" in twin["user"]["name"]
    plans = client.get(f"/api/users/{uid}/plans").json()
    assert [p["week_index"] for p in plans] == [1, 2]
    p1 = {x["title"]: x for x in plans[0]["by_goal"]}
    p2 = {x["title"]: x for x in plans[1]["by_goal"]}
    assert p1["Python"]["planned_minutes"] == 240 and p1["Python"]["actual_minutes"] == 150
    assert p2["Python"]["planned_minutes"] == 150
    events = client.get(f"/api/users/{uid}/memory").json()["events"]
    assert events and all(e["is_demo"] for e in events)
    assert all(s["done"] for s in client.get(f"/api/users/{uid}/loop").json()["stages"])


def test_demo_seed_and_simulate_endpoints(client):
    seed = client.post("/api/demo/seed").json()
    uid, (a, b) = seed["user_id"], seed["scenario_ids"]
    comp = client.post(f"/api/users/{uid}/whatif/compare", json={"scenario_ids": [a, b]}).json()
    client.post(f"/api/users/{uid}/decisions", json={"scenario_id": a, "comparison_id": comp["id"]})
    plan = client.post(f"/api/users/{uid}/plans", json={}).json()
    sim = client.post(f"/api/demo/users/{uid}/plans/{plan['id']}/simulate-week").json()
    assert sim["label"] == "DEMO"
    rc = client.post(f"/api/users/{uid}/plans/{plan['id']}/reality-check", json={}).json()
    assert rc["actual_hours"] == 10.5
    # simulation is refused for real users
    real, _ = make_user(client)
    assert client.post(f"/api/demo/users/{real}/plans/{plan['id']}/simulate-week").status_code in {403, 404}


def test_health_and_frontend(client):
    h = client.get("/api/health").json()
    assert h["status"] == "ok" and h["llm"]["enabled"] is False
    page = client.get("/")
    assert page.status_code == 200 and "MIRROR AI" in page.text
