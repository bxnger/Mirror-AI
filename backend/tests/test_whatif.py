from app.services.whatif import compare, priority_alignment, scenario_metrics

GOALS = [
    {"id": 1, "title": "SAT", "priority": 5, "status": "open", "weeks_left": 16},
    {"id": 2, "title": "Python", "priority": 3, "status": "open", "weeks_left": 20},
    {"id": 3, "title": "English", "priority": 4, "status": "open", "weeks_left": 24},
]
A = {"id": 10, "name": "A", "allocations": {1: 6, 2: 4, 3: 2}}
B = {"id": 11, "name": "B", "allocations": {1: 8, 2: 2, 3: 2}}


def by_goal(m, gid):
    return next(r for r in m["allocations"] if r["goal_id"] == gid)


def test_hours_shares_and_load():
    m = scenario_metrics(A, GOALS, 12)
    assert m["total_hours"] == 12 and m["utilization"] == 1.0 and m["slack_hours"] == 0
    assert by_goal(m, 1)["share"] == 0.5
    assert by_goal(m, 1)["hours_until_target"] == 96  # 16 weeks * 6 h
    assert by_goal(m, 1)["rank_by_hours"] == 1
    assert not m["over_capacity"]
    assert {r["code"] for r in m["risks"]} == {"no_slack"}


def test_scenario_difference_against_baseline():
    ma, mb = scenario_metrics(A, GOALS, 12), scenario_metrics(B, GOALS, 12)
    diff = compare([ma, mb])["diffs"][0]
    deltas = {g["goal_id"]: g["hours_delta"] for g in diff["goals"]}
    assert deltas == {1: 2, 2: -2, 3: 0}
    assert diff["total_hours_delta"] == 0
    assert set(diff["changed_goals"]) == {"SAT", "Python"}
    sat_delta = next(g for g in diff["goals"] if g["goal_id"] == 1)
    assert sat_delta["hours_until_target_delta"] == 32  # 16 weeks * 2 h


def test_priority_alignment_prefers_matching_distribution():
    ma, mb = scenario_metrics(A, GOALS, 12), scenario_metrics(B, GOALS, 12)
    assert ma["priority_alignment"] == 0.833
    assert mb["priority_alignment"] == 0.75
    assert compare([ma, mb])["best_priority_alignment_scenario_id"] == 10
    assert priority_alignment({1: 0.5, 2: 0.5}, {1: 0.5, 2: 0.5}) == 1.0


def test_over_capacity_and_unfunded_goal_risks():
    m = scenario_metrics({"id": 1, "name": "X", "allocations": {1: 10, 2: 4}}, GOALS, 12)
    codes = {r["code"] for r in m["risks"]}
    assert m["over_capacity"] and "over_capacity" in codes
    unfunded = next(r for r in m["risks"] if r["code"] == "unfunded_goal")
    assert unfunded["goal_id"] == 3 and unfunded["severity"] == "high"
    assert compare([m])["feasible_scenario_ids"] == []


def test_observed_results_from_memory_create_risks():
    observed = {"weekly_actual_hours_avg": 9.0, "per_goal": {2: {"avg_actual_hours": 2.5}}}
    m = scenario_metrics(A, GOALS, 12, observed)
    codes = {r["code"] for r in m["risks"]}
    assert "above_observed_capacity" in codes
    goal_risk = next(r for r in m["risks"] if r["code"] == "above_observed_goal_pace")
    assert goal_risk["goal_id"] == 2


def test_concentration_and_thin_allocation():
    m = scenario_metrics({"id": 1, "name": "X", "allocations": {1: 9, 2: 1, 3: 2}}, GOALS, 12)
    codes = {r["code"] for r in m["risks"]}
    assert "concentration" in codes and "thin_allocation" in codes
