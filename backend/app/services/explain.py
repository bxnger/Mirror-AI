"""LLM explanation layer for the What If Lab.

Division of labour:
* whatif.py computes every number (hours, shares, deltas, risks);
* this module asks Claude to EXPLAIN those numbers: advantages, trade-offs, risks,
  missing data and fit with the user's stated priorities.

Safeguards:
* the prompt forbids predictions and invented statistics; Future Self is a desired state;
* structured JSON output (json_schema) so the UI never parses free text;
* numbers in the explanation are checked against the computed payload (`numbers_check`);
* any failure (no key, network, refusal, invalid output) falls back to a deterministic
  template explanation, so the product works offline and in tests.
"""
from __future__ import annotations

import json
import logging
import re
from typing import Any

from ..config import Settings, get_settings

log = logging.getLogger("mirror.explain")

DISCLAIMER = (
    "Объяснение построено на ваших данных и расчётах системы. Это не прогноз результата и не "
    "статистический факт: Future Self — желаемое состояние, которое зависит от ваших решений."
)

EXPLANATION_SCHEMA: dict = {
    "type": "object",
    "properties": {
        "summary": {"type": "string"},
        "scenarios": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "scenario_id": {"type": "integer"},
                    "name": {"type": "string"},
                    "strengths": {"type": "array", "items": {"type": "string"}},
                    "tradeoffs": {"type": "array", "items": {"type": "string"}},
                    "risks": {"type": "array", "items": {"type": "string"}},
                },
                "required": ["scenario_id", "name", "strengths", "tradeoffs", "risks"],
                "additionalProperties": False,
            },
        },
        "priority_fit": {"type": "string"},
        "missing_data": {"type": "array", "items": {"type": "string"}},
        "assumptions": {"type": "array", "items": {"type": "string"}},
        "questions_for_user": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["summary", "scenarios", "priority_fit", "missing_data", "assumptions", "questions_for_user"],
    "additionalProperties": False,
}

SYSTEM_PROMPT = """Ты — аналитический модуль MIRROR AI (What If Lab). Пользователь сравнивает сценарии \
распределения своего времени между целями. Все числа уже посчитаны системой и переданы тебе в JSON.

Правила:
1. Объясняй только на основе переданных данных. Не придумывай новые числа, проценты, вероятности \
или «статистику» (например, «в среднем студенты набирают +X баллов за Y часов») — таких данных нет.
2. Future Self — это желаемое состояние пользователя, а не прогноз. Никогда не обещай результат и не \
предсказывай баллы, уровни или даты достижения.
3. Для каждого сценария назови сильные стороны, компромиссы (что пользователь отдаёт взамен) и риски. \
Риски из поля risks обязательно учти.
4. Отдельно объясни, какой вариант лучше соответствует ЗАЯВЛЕННЫМ приоритетам и почему — со ссылкой \
на индекс соответствия приоритетам как на эвристику, а не меру успеха.
5. Перечисли, каких данных не хватает для более уверенного вывода, и какие допущения сделаны.
6. Если есть фактические данные Reality Check (поле context.observed), опирайся на них сильнее, \
чем на заявленные пользователем часы.
7. Не принимай решение за пользователя: выбор остаётся за ним. Можешь задать 1–3 уточняющих вопроса.
8. Пиши по-русски, кратко и конкретно: 1–3 пункта в каждом списке, без воды."""


def _collect_numbers(obj: Any, out: set[float]) -> None:
    if isinstance(obj, bool) or obj is None:
        return
    if isinstance(obj, (int, float)):
        out.add(float(obj))
        if 0 <= abs(obj) <= 1:
            out.add(round(float(obj) * 100, 1))
        return
    if isinstance(obj, dict):
        for k, v in obj.items():
            _collect_numbers(v, out)
            if isinstance(k, str) and k.isdigit():
                out.add(float(k))
    elif isinstance(obj, (list, tuple)):
        for v in obj:
            _collect_numbers(v, out)
    elif isinstance(obj, str):
        for n in re.findall(r"\d+(?:[.,]\d+)?", obj):
            out.add(float(n.replace(",", ".")))


def numbers_check(explanation: dict, source_payload: dict) -> dict:
    """Flags numbers in the explanation that do not appear in the computed payload."""
    allowed: set[float] = set(float(i) for i in range(0, 11))
    _collect_numbers(source_payload, allowed)
    found: set[float] = set()
    _collect_numbers({k: v for k, v in explanation.items() if k != "scenarios"}, found)
    for sc in explanation.get("scenarios", []):
        _collect_numbers({k: v for k, v in sc.items() if k != "scenario_id"}, found)
    unverified = sorted(
        n for n in found if not any(abs(n - a) <= 0.051 or abs(n - round(a)) < 1e-9 for a in allowed)
    )
    return {"ok": not unverified, "unverified_numbers": unverified}


# --------------------------------------------------------------------------- template fallback


def _fmt_h(h: float) -> str:
    return f"{h:g} ч"


def template_explanation(payload: dict) -> dict:
    metrics: list[dict] = payload["scenarios"]
    comparison: dict = payload["comparison"]
    context: dict = payload.get("context", {})
    gap: dict = payload.get("gap", {})

    by_id = {m["scenario_id"]: m for m in metrics}
    scenarios_out = []
    for msc in metrics:
        rows = sorted(msc["allocations"], key=lambda r: -(r["priority"] or 0))
        top = rows[0] if rows else None
        strengths, tradeoffs = [], []
        if top and top["hours_per_week"] > 0:
            line = f"«{top['title']}» (приоритет {top['priority']}) получает {_fmt_h(top['hours_per_week'])}/нед"
            if top.get("hours_until_target") is not None:
                line += f" — {top['hours_until_target']:g} ч практики до целевой даты"
            strengths.append(line + ".")
        if not msc["over_capacity"] and msc["slack_hours"] > 0:
            strengths.append(f"Остаётся запас {_fmt_h(msc['slack_hours'])}/нед на непредвиденное.")
        elif not msc["over_capacity"]:
            strengths.append("Сценарий укладывается в заявленное свободное время.")
        least = min(rows, key=lambda r: r["hours_per_week"]) if rows else None
        if least and least is not top:
            tradeoffs.append(
                f"«{least['title']}» получает меньше всего времени — {_fmt_h(least['hours_per_week'])}/нед."
            )
        for d in comparison.get("diffs", []):
            if d["scenario_id"] == msc["scenario_id"]:
                base = by_id.get(d["vs_scenario_id"], {}).get("name", "базовым")
                for g in d["goals"]:
                    if g["hours_delta"] < 0:
                        tradeoffs.append(
                            f"По сравнению со сценарием «{base}» на «{g['title']}» на "
                            f"{_fmt_h(abs(g['hours_delta']))}/нед меньше."
                        )
                    elif g["hours_delta"] > 0:
                        strengths.append(
                            f"По сравнению со сценарием «{base}» на «{g['title']}» на "
                            f"{_fmt_h(g['hours_delta'])}/нед больше."
                        )
        scenarios_out.append({
            "scenario_id": msc["scenario_id"],
            "name": msc["name"],
            "strengths": strengths[:3],
            "tradeoffs": tradeoffs[:3] or ["Явных компромиссов относительно других сценариев нет."],
            "risks": [r["message"] for r in msc["risks"]][:3] or ["Существенных рисков по расчётам не выявлено."],
        })

    best_id = comparison.get("best_priority_alignment_scenario_id")
    best = by_id.get(best_id)
    if best is not None:
        others = ", ".join(
            f"«{m['name']}» — {m['priority_alignment']}" for m in metrics if m["scenario_id"] != best_id
        )
        priority_fit = (
            f"Ближе всего к заявленным приоритетам сценарий «{best['name']}» "
            f"(индекс {best['priority_alignment']}{'; ' + others if others else ''}). "
            "Индекс — эвристика соответствия долей времени приоритетам, а не вероятность успеха."
        )
    else:
        priority_fit = "Недостаточно данных о приоритетах для сравнения."

    missing: list[str] = []
    for g in gap.get("goals", []):
        for item in g.get("missing_data", []):
            if "нет выбранного сценария" not in item:
                missing.append(f"{g['title']}: {item}")
    observed = context.get("observed", {})
    if not observed.get("checks"):
        missing.append("Нет фактических данных о выполнении: расчёт опирается на заявленные часы.")

    summary_parts = [
        f"{m['name']}: {_fmt_h(m['total_hours'])}/нед из {_fmt_h(m['available_hours'])}"
        for m in metrics
    ]
    return {
        "summary": "Сравнение распределения времени — " + "; ".join(summary_parts) + ".",
        "scenarios": scenarios_out,
        "priority_fit": priority_fit,
        "missing_data": missing[:6],
        "assumptions": [
            "Часы в сценарии — это намерение, а не гарантированно выполненная работа.",
            "Система не оценивает, сколько часов нужно для прироста баллов или уровня.",
        ],
        "questions_for_user": [
            "Какая цель для вас важнее в ближайшие 4 недели?",
            "Насколько реалистичны заявленные часы с учётом учёбы и других обязательств?",
        ],
    }


# --------------------------------------------------------------------------- LLM call (shared)


def call_llm(system: str, schema: dict, payload: dict, settings: Settings) -> tuple[dict, dict]:
    """One structured-output request to Claude. Raises on refusal / truncation / invalid JSON."""
    import anthropic  # imported lazily: optional at runtime

    client = anthropic.Anthropic(timeout=settings.llm_timeout_seconds, max_retries=1)
    response = client.beta.messages.create(
        model=settings.llm_model,
        max_tokens=16000,
        betas=["server-side-fallback-2026-07-01"],
        fallbacks="default",
        output_config={
            "effort": settings.llm_effort,
            "format": {"type": "json_schema", "schema": schema},
        },
        system=system,
        messages=[{
            "role": "user",
            "content": "Данные (JSON):\n" + json.dumps(payload, ensure_ascii=False, default=str),
        }],
    )
    if response.stop_reason == "refusal":
        raise RuntimeError("LLM refused the request")
    if response.stop_reason == "max_tokens":
        raise RuntimeError("LLM output truncated")
    text = "".join(b.text for b in response.content if getattr(b, "type", None) == "text")
    data = json.loads(text)
    meta = {"model": getattr(response, "model", settings.llm_model)}
    return data, meta


def _run(payload: dict, settings: Settings | None, llm, system: str, schema: dict,
         template, required_lists: tuple[str, ...]) -> tuple[dict, str]:
    """LLM first (if enabled or injected), deterministic template on any failure."""
    settings = settings or get_settings()
    fallback_reason = None
    if llm is not None or settings.llm_enabled:
        try:
            if llm is not None:
                data, meta = llm(payload, settings)
            else:
                data, meta = call_llm(system, schema, payload, settings)
            if not isinstance(data, dict) or not all(isinstance(data.get(k), list) for k in required_lists):
                raise ValueError("LLM output does not match the schema")
            data["numbers_check"] = numbers_check(data, payload)
            data["disclaimer"] = DISCLAIMER
            data["generator"] = {"source": "llm", **meta}
            return data, "llm"
        except Exception as exc:  # noqa: BLE001 - any failure falls back to the template
            log.warning("LLM explanation failed, using template: %s", exc)
            fallback_reason = f"{type(exc).__name__}: {exc}"[:300]
    data = template(payload)
    data["numbers_check"] = numbers_check(data, payload)
    data["disclaimer"] = DISCLAIMER
    data["generator"] = {
        "source": "template",
        "reason": fallback_reason or "LLM отключён (нет ANTHROPIC_API_KEY или MIRROR_LLM=off)",
    }
    return data, "template"


def explain_comparison(payload: dict, settings: Settings | None = None, llm=None) -> tuple[dict, str]:
    """What If Lab explanation. `llm` can be injected (tests): callable(payload, settings) -> (dict, meta)."""
    return _run(payload, settings, llm, SYSTEM_PROMPT, EXPLANATION_SCHEMA, template_explanation, ("scenarios",))


# --------------------------------------------------------------------------- Reality Check commentary

REALITY_SCHEMA: dict = {
    "type": "object",
    "properties": {
        "summary": {"type": "string"},
        "what_worked": {"type": "array", "items": {"type": "string"}},
        "obstacles": {"type": "array", "items": {"type": "string"}},
        "next_week_focus": {"type": "array", "items": {"type": "string"}},
        "questions_for_user": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["summary", "what_worked", "obstacles", "next_week_focus", "questions_for_user"],
    "additionalProperties": False,
}

REALITY_PROMPT = """Ты — модуль Reality Check в MIRROR AI. Система уже сравнила план недели с фактом и \
посчитала все числа (JSON ниже), а также сформировала предложения по адаптации (proposals), которые \
применяются ТОЛЬКО после подтверждения пользователя.

Правила:
1. Опирайся только на переданные факты: часы план/факт по целям, выполненные задачи, отзыв пользователя, \
историю прошлых недель (context). Не придумывай новых чисел и статистики.
2. Не прогнозируй результат (баллы, уровни, даты). Future Self — желаемое состояние, не прогноз.
3. Не меняй цели и не предлагай изменить приоритеты или целевые уровни: такие изменения возможны только \
через proposals и решение пользователя. Можешь сослаться на proposals и объяснить их смысл.
4. next_week_focus — только тактика выполнения (порядок, длина занятий, время дня, подготовка), \
без изменения распределения часов.
5. Не ставь психологических диагнозов и не морализируй. Тон — спокойный, уважительный, конкретный.
6. Пиши по-русски, 1–3 пункта в каждом списке."""


def template_reality(payload: dict) -> dict:
    rc = payload["reality_check"]
    worked, obstacles, focus = [], [], []
    for g in rc["per_goal"]:
        c = g.get("completion")
        if c is None:
            continue
        if c >= 0.95:
            worked.append(f"{g['title']}: выполнено {g['actual_hours']:g} из {g['planned_hours']:g} ч.")
        elif c < 0.8:
            obstacles.append(f"{g['title']}: {g['actual_hours']:g} из {g['planned_hours']:g} ч — ниже плана.")
            focus.append(f"{g['title']}: начинать с короткого блока и ставить его в начало дня/недели.")
    for i in rc.get("insights", []):
        if "дни" in i:
            obstacles.append(i)
    if rc.get("user_feedback"):
        obstacles.append(f"Ваш отзыв: «{rc['user_feedback']}».")
    for p in payload.get("proposals", []):
        pl = p.get("payload") or {}
        if p.get("kind") == "adjust_allocation" and "to_hours" in pl:
            what = f"{pl.get('goal_title', 'цель')}: {pl['from_hours']:g} → {pl['to_hours']:g} ч/нед"
        elif p.get("kind") == "update_availability" and "to_hours" in pl:
            what = f"свободное время {pl['from_hours']:g} → {pl['to_hours']:g} ч/нед"
        else:
            what = "предложение по адаптации"
        focus.append(f"Ждёт вашего решения: {what} (цели не меняются без вашего подтверждения).")
    summary = rc["insights"][0] if rc.get("insights") else "Неделя завершена."
    return {
        "summary": summary,
        "what_worked": worked[:3] or ["Ни одна цель не выполнена полностью — это нормальная точка для корректировки."],
        "obstacles": obstacles[:3] or ["Существенных отклонений от плана нет."],
        "next_week_focus": focus[:3] or ["Сохранить текущий ритм."],
        "questions_for_user": ["Что больше всего помешало выполнить план?", "Какое время дня для вас самое продуктивное?"],
    }


def explain_reality(payload: dict, settings: Settings | None = None, llm=None) -> tuple[dict, str]:
    return _run(payload, settings, llm, REALITY_PROMPT, REALITY_SCHEMA, template_reality,
                ("what_worked", "obstacles", "next_week_focus"))
