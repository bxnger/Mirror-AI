"""Runs the full 10-step DEMO loop against the configured database and prints a readable report.

    cd backend
    python -m scripts.run_demo
"""
from __future__ import annotations

import sys
from datetime import datetime, timezone

from app import demo, models as m, serializers as out
from app.db import SessionLocal, init_db


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    init_db()
    db = SessionLocal()
    try:
        r = demo.run_full_demo(db, datetime.now(timezone.utc).date())
        db.commit()
        print(f"[DEMO] user_id={r['user_id']}  — откройте http://localhost:8000/?user={r['user_id']}\n")

        print("3. Gap Analysis")
        for g in r["gap"]["goals"]:
            gap = g["gap"] or {}
            desc = gap.get("absolute") if gap.get("kind") == "numeric" else " , ".join(gap.get("path", []))
            print(f"   {g['title']:8} {g['status']:8} разрыв: {desc}")

        comp = db.get(m.ScenarioComparison, r["comparison_id"])
        print("\n4-5. What If Lab")
        for s in comp.metrics["scenarios"]:
            alloc = ", ".join(f"{a['title']} {a['hours_per_week']:g}ч" for a in s["allocations"])
            print(f"   {s['name']}: {alloc} | итого {s['total_hours']:g}/{s['available_hours']:g} ч | "
                  f"приоритеты {s['priority_alignment']}")
        print(f"   объяснение: {comp.explanation_source} — {comp.explanation['priority_fit']}")

        for key, title in (("plan1_id", "7-8. План недели 1"), ("plan2_id", "10. Адаптированный план недели 2")):
            p = out.plan_out(db.get(m.Plan, r[key]))
            print(f"\n{title} (сценарий «{p['scenario_name']}»)")
            for g in p["by_goal"]:
                print(f"   {g['title']:8} план {g['planned_minutes']:4} мин, факт {g['actual_minutes']:4} мин")
            for n in p["adaptation_notes"]:
                print(f"   • {n['text']}")

        rc = db.get(m.RealityCheck, r["reality_check_id"])
        print("\n9. Reality Check")
        for i in rc.insights:
            print(f"   {i}")
        for p in db.query(m.AdaptationProposal).filter_by(reality_check_id=rc.id):
            print(f"   предложение [{p.status}]: {p.reason}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
