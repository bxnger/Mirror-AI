from app.config import Settings
from app.services import explain
from app.services.whatif import compare, scenario_metrics

GOALS = [
    {"id": 1, "title": "SAT", "priority": 5, "status": "open", "weeks_left": 16},
    {"id": 2, "title": "Python", "priority": 3, "status": "open", "weeks_left": 20},
]


def payload():
    ms = [
        scenario_metrics({"id": 1, "name": "A", "allocations": {1: 6, 2: 4}}, GOALS, 12),
        scenario_metrics({"id": 2, "name": "B", "allocations": {1: 8, 2: 2}}, GOALS, 12),
    ]
    return {"profile": {"weekly_hours_available": 12}, "gap": {"goals": []}, "scenarios": ms,
            "comparison": compare(ms), "context": {"observed": {"checks": 0}, "facts": []}}


OFF = Settings(llm_mode="off")


def test_template_explanation_is_grounded():
    data, source = explain.explain_comparison(payload(), OFF)
    assert source == "template"
    assert data["generator"]["source"] == "template"
    assert [s["scenario_id"] for s in data["scenarios"]] == [1, 2]
    assert data["numbers_check"]["ok"], data["numbers_check"]
    assert "не прогноз" in data["disclaimer"]


def test_llm_path_uses_structured_output_and_checks_numbers():
    def fake_llm(p, settings):
        return {
            "summary": "A даёт 6 ч на SAT, B — 8 ч. Обычно студенты получают +120 баллов.",
            "scenarios": [{"scenario_id": 1, "name": "A", "strengths": ["баланс"], "tradeoffs": [], "risks": []},
                          {"scenario_id": 2, "name": "B", "strengths": [], "tradeoffs": [], "risks": []}],
            "priority_fit": "A", "missing_data": [], "assumptions": [], "questions_for_user": [],
        }, {"model": "fake-model"}

    data, source = explain.explain_comparison(payload(), OFF, llm=fake_llm)
    assert source == "llm" and data["generator"] == {"source": "llm", "model": "fake-model"}
    # invented statistic is flagged, computed numbers are not
    assert data["numbers_check"]["unverified_numbers"] == [120.0]


def test_llm_failure_or_refusal_falls_back_to_template():
    def refusing(p, settings):
        raise RuntimeError("LLM refused the request")

    data, source = explain.explain_comparison(payload(), OFF, llm=refusing)
    assert source == "template"
    assert "refused" in data["generator"]["reason"]


def test_llm_invalid_shape_falls_back():
    data, source = explain.explain_comparison(payload(), OFF, llm=lambda p, s: ({"summary": "x"}, {}))
    assert source == "template"


def test_system_prompt_forbids_predictions():
    assert "не прогноз" in explain.SYSTEM_PROMPT or "не обещай" in explain.SYSTEM_PROMPT
    assert "статистику" in explain.SYSTEM_PROMPT


def reality_payload():
    return {
        "reality_check": {
            "planned_hours": 12, "actual_hours": 10.5, "completion_rate": 0.875,
            "per_goal": [
                {"goal_id": 1, "title": "SAT", "planned_hours": 6, "actual_hours": 6, "completion": 1.0},
                {"goal_id": 2, "title": "Python", "planned_hours": 4, "actual_hours": 2.5, "completion": 0.625},
            ],
            "insights": ["Выполнено 10.5 из 12 запланированных часов (88% плана)."],
            "user_feedback": "Python после школы тяжело", "perceived_difficulty": 4,
        },
        "proposals": [{"kind": "adjust_allocation", "reason": "Python: 4 → 2.5 ч/нед. Детали.",
                       "payload": {"goal_title": "Python", "from_hours": 4, "to_hours": 2.5}}],
        "context": {"facts": [], "observed": {"checks": 1}, "recent_feedback": []},
    }


def test_reality_template_commentary():
    data, source = explain.explain_reality(reality_payload(), OFF)
    assert source == "template"
    assert any("SAT" in x for x in data["what_worked"])
    assert any("Python" in x for x in data["obstacles"])
    assert any("Python: 4 → 2.5 ч/нед" in x for x in data["next_week_focus"])
    assert data["numbers_check"]["ok"], data["numbers_check"]


def test_reality_llm_commentary_and_fallback():
    ok = lambda p, s: ({"summary": "Неделя: 10.5 из 12 ч.", "what_worked": ["SAT"], "obstacles": ["Python"],  # noqa: E731
                        "next_week_focus": ["короткие блоки"], "questions_for_user": []}, {"model": "fake"})
    data, source = explain.explain_reality(reality_payload(), OFF, llm=ok)
    assert source == "llm" and data["numbers_check"]["ok"]
    data, source = explain.explain_reality(reality_payload(), OFF, llm=lambda p, s: ({"summary": "x"}, {}))
    assert source == "template"
