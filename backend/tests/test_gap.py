from datetime import date

from app.services.gap import NO_HOURS_MODEL_NOTE, analyze_goal, analyze_twin

TODAY = date(2026, 11, 16)


def sat(current=550, target=700, source="mock_test", hours=None):
    goal = {
        "id": 1, "title": "SAT Math", "metric_type": "numeric", "unit": "баллов",
        "min_value": 200, "max_value": 800,
        "current": {"value": current, "source": source, "recorded_at": "2026-11-10T10:00:00+00:00"},
        "target": {"value": target, "target_date": "2027-03-08", "priority": 5, "milestones": []},
    }
    return analyze_goal(goal, TODAY, hours)


def test_numeric_gap_is_measurable_difference():
    r = sat()
    assert r["status"] == "open"
    assert r["gap"]["absolute"] == 150
    assert r["gap"]["share_of_scale"] == 0.25  # 150 / (800-200)


def test_no_hours_needed_estimate_only_explicit_assumption():
    r = sat(hours=6)
    assert NO_HOURS_MODEL_NOTE in r["assumptions"]
    # only the user's own allocation is projected, never "hours required"
    assert r["time"]["weeks_left"] == 16.0
    assert r["time"]["allocated_hours_until_target"] == 96.0
    assert "hours_needed" not in str(r)


def test_numeric_achieved_and_self_assessment_flagged():
    r = sat(current=720, source="self_assessment")
    assert r["status"] == "achieved"
    assert any("Самооценка" in a for a in r["assumptions"])
    assert any("пробный тест" in a.lower() for a in r["next_actions"])


def test_level_gap_counts_steps_on_scale():
    goal = {
        "id": 2, "title": "English", "metric_type": "level", "scale": "cefr",
        "current": {"level": "B1", "source": "self_assessment"},
        "target": {"level": "B2", "target_date": None, "milestones": [{"title": "Эссе", "done": False}]},
    }
    r = analyze_goal(goal, TODAY)
    assert r["gap"]["steps"] == 1 and r["gap"]["path"] == ["B1 → B2"]
    assert r["milestones"] == {"total": 1, "done": 0, "remaining": ["Эссе"], "progress": 0.0}
    assert any("целевая дата" in m.lower() for m in r["missing_data"])


def test_current_and_future_are_not_mixed():
    """Intermediate is desired; Beginner is the fact. Gap must reflect both separately."""
    goal = {
        "id": 3, "title": "Python", "metric_type": "level", "scale": "proficiency",
        "current": {"level": "beginner", "source": "self_assessment"},
        "target": {"level": "intermediate", "milestones": []},
    }
    r = analyze_goal(goal, TODAY)
    assert r["current"]["level"] == "beginner"
    assert r["target"]["level"] == "intermediate"
    assert r["gap"]["current"] == "beginner" and r["gap"]["target"] == "intermediate"
    assert r["gap"]["steps"] == 2


def test_missing_current_reports_no_data():
    goal = {"id": 4, "title": "X", "metric_type": "numeric", "current": None,
            "target": {"value": 10, "milestones": []}}
    r = analyze_goal(goal, TODAY)
    assert r["status"] == "no_current_data" and r["gap"] is None


def test_twin_summary_counts():
    res = analyze_twin([
        {"id": 1, "title": "A", "metric_type": "numeric", "current": {"value": 5, "source": "mock_test"},
         "target": {"value": 10, "milestones": []}},
        {"id": 2, "title": "B", "metric_type": "numeric", "current": {"value": 10, "source": "mock_test"},
         "target": {"value": 10, "milestones": []}},
    ], TODAY)
    assert res["summary"] == {"total": 2, "open": 1, "achieved": 1, "needs_data": 0}
