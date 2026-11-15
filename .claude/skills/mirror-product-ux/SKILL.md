---
name: mirror-product-ux
description: Product and UX rules for MIRROR AI — the Twin → What If Lab → Plan → Reality Check loop, information architecture, onboarding, scenario comparison, and how to present uncertainty without misleading predictions. Use when designing flows, copy, or deciding what a screen should show.
---

# MIRROR product UX

MIRROR is a decision tool for students and young adults, **not** a chatbot, fortune teller or motivational dashboard. Its value is linking a decision to measurable actions and outcomes.

## The loop (IA = navigation order)
1. **Двойник (Personal Twin)**: present state (stage, goal, skills, hours, constraints) plus the trajectory map. One primary CTA = the next step in the loop.
2. **What If Lab**: one decision, two paths (A/B) with identical categories. User picks a path, then the plan is generated.
3. **План (Action Plan)**: the first ≤4 weeks of tasks from the chosen path's steps, plus a weekly review task. Checkboxes persist.
4. **Reality Check**: weekly check-in (actual hours, tasks, obstacle/observation/plan change, note), Plan vs Reality chart, and the **updated scenario** (original vs current-pace timeline from `domain/reality.ts`).
5. **Future Paths** (on the Twin): the trajectory as a simulator. Sliders are a *hypothesis* (badged, never saved); a separate lane shows the chosen path at the *actual* pace from check-ins.

Data categories must stay visually distinct: user input · calculated · hypothetical (dashed/lavender, "Гипотеза") · actual history (solid sage).

The "Следующий шаг" strip on the Twin always points to the next unfinished stage.

## Onboarding
5 steps (goal → skills → time → constraints → review). Ask for a *checkable* goal. Priority and horizon are explicit choices, not defaults. Time asks for a realistic number and reflects it back ("≈ X ч в день"). Review lets the user jump back to any step. An existing profile opens in edit mode.

## Comparing paths
- Same rows for A and B: weekly hours vs available, duration and total hours, goal fit (user's own judgement), pros, cons, risks, uncertainty, tradeoffs.
- Tradeoffs are grouped by the path they favour. Never declare a "winner" or an overall score.
- Choosing is explicit (`aria-pressed` buttons). Changing inputs invalidates the previous comparison.

## Honesty rules (non-negotiable)
- No success probabilities, no "you will earn X", no predicted outcomes stated as fact.
- **Uncertainty** = a count of factors outside the user's control (selection, horizon, overload…). Always labelled "Это не вероятность успеха".
- The Future Self is labelled "Это ваша цель, а не прогноз" and drawn dashed.
- Every computed number must trace back to user input or checked tasks. Show the source tag (`Локальный расчёт по правилам · демо` vs `Анализ ИИ`).
- Demo data is always badged ("Демо-данные") and resettable in one click.
- Preferred estimate wording — ru: «Возможный сценарий», «При текущем темпе», «Расчётный срок», «Если условия сохранятся», «Это оценка, а не предсказание»; kk: «Ықтимал сценарий», «Қазіргі қарқынмен», «Есептелген мерзім», «Жағдай өзгермесе», «Бұл болжам емес, есептік бағалау»; en: "Possible scenario", "At your current pace", "Estimated timeline", "If conditions remain unchanged", "This is an estimate, not a prediction".
- Falling behind is data, not failure: no shaming copy, no red for "under plan" (use warn + explanation).

## Copy tone
Russian, plain, second person plural ("вы"), concrete verbs. Short sentences. No hype, no jargon, no emoji.

## Mobile
Lab inputs: one path at a time via an A/B toggle. Results: A and B side by side in two narrow columns (row label above). Primary actions sit in a sticky bar above the tab bar.
