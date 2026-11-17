"""MIRROR AI: Future Self - FastAPI application (single backend for every module)."""
from __future__ import annotations

from contextlib import asynccontextmanager
from datetime import date, datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import select
from sqlalchemy.orm import Session

from . import demo
from . import models as m
from . import schemas as s
from . import serializers as out
from .config import get_settings
from .db import get_db, init_db
from .services import loop, memory, planner, reality, twin
from .services.errors import LoopError

FRONTEND_DIR = Path(__file__).resolve().parents[1] / "web"


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    yield


app = FastAPI(
    title="MIRROR AI: Future Self",
    version="1.0.0",
    description="Current Self → Future Self → What If → Action Plan → Reality Check → Adaptive Memory",
    lifespan=lifespan,
)


@app.middleware("http")
async def revalidate_static(request: Request, call_next):
    """Frontend files are revalidated on every load (ETag/304), so a new version is never stale."""
    response = await call_next(request)
    if request.url.path == "/" or request.url.path.startswith("/static/"):
        response.headers["Cache-Control"] = "no-cache"
    return response


@app.exception_handler(LoopError)
async def loop_error_handler(_: Request, exc: LoopError):
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.message, "stage": exc.stage})


api = APIRouter(prefix="/api")


def today() -> date:
    return datetime.now(timezone.utc).date()


def get_user(user_id: int, db: Session) -> m.User:
    user = db.get(m.User, user_id)
    if user is None:
        raise LoopError("Пользователь не найден.", status_code=404)
    return user


# ----------------------------------------------------------------- meta


@api.get("/health")
def health(db: Session = Depends(get_db)):
    db.execute(select(1))
    settings = get_settings()
    return {
        "status": "ok",
        "database": db.get_bind().dialect.name,
        "llm": {"enabled": settings.llm_enabled, "model": settings.llm_model if settings.llm_enabled else None},
    }


# ----------------------------------------------------------------- understand: users, current & future self


@api.post("/users", status_code=201)
def create_user(body: s.UserIn, db: Session = Depends(get_db)):
    user = loop.create_user(db, body.name, body.country)
    db.commit()
    return {"id": user.id, "name": user.name, "country": user.country, "is_demo": user.is_demo}


@api.get("/users/{user_id}")
def read_user(user_id: int, db: Session = Depends(get_db)):
    return twin.twin_view(db, get_user(user_id, db))


@api.put("/users/{user_id}/current-self")
def put_current_self(user_id: int, body: s.CurrentSelfIn, db: Session = Depends(get_db)):
    user = get_user(user_id, db)
    loop.upsert_current_profile(db, user, body.model_dump(exclude_none=True))
    db.commit()
    return twin.twin_view(db, user)["current_self"]


@api.put("/users/{user_id}/future-self")
def put_future_self(user_id: int, body: s.FutureSelfIn, db: Session = Depends(get_db)):
    user = get_user(user_id, db)
    loop.upsert_future_profile(db, user, body.model_dump(exclude_none=True))
    db.commit()
    return twin.twin_view(db, user)["future_self"]


@api.get("/users/{user_id}/twin")
def read_twin(user_id: int, db: Session = Depends(get_db)):
    return twin.twin_view(db, get_user(user_id, db))


@api.post("/users/{user_id}/goals", status_code=201)
def create_goal(user_id: int, body: s.GoalIn, db: Session = Depends(get_db)):
    user = get_user(user_id, db)
    data = body.model_dump()
    if data.get("target"):
        data["target"]["milestones"] = [ms for ms in data["target"]["milestones"]]
    goal = loop.create_goal(db, user, data)
    db.commit()
    return twin.goal_snapshot(goal)


@api.get("/users/{user_id}/goals")
def list_goals(user_id: int, db: Session = Depends(get_db)):
    user = get_user(user_id, db)
    return [twin.goal_snapshot(g) for g in twin.active_goals(user)]


@api.put("/users/{user_id}/goals/{goal_id}/current")
def put_current_state(user_id: int, goal_id: int, body: s.StateIn, db: Session = Depends(get_db)):
    user = get_user(user_id, db)
    loop.update_current_state(db, user, loop.get_goal(db, user, goal_id), body.model_dump())
    db.commit()
    return twin.goal_snapshot(loop.get_goal(db, user, goal_id))


@api.put("/users/{user_id}/goals/{goal_id}/target")
def put_target(user_id: int, goal_id: int, body: s.TargetUpdateIn, db: Session = Depends(get_db)):
    user = get_user(user_id, db)
    loop.update_target(db, user, loop.get_goal(db, user, goal_id), body.model_dump(exclude_unset=True))
    db.commit()
    return twin.goal_snapshot(loop.get_goal(db, user, goal_id))


@api.put("/users/{user_id}/milestones/{milestone_id}")
def put_milestone(user_id: int, milestone_id: int, body: s.MilestoneToggleIn, db: Session = Depends(get_db)):
    user = get_user(user_id, db)
    ms = loop.set_milestone(db, user, milestone_id, body.done)
    db.commit()
    return {"id": ms.id, "title": ms.title, "done": ms.done}


@api.get("/users/{user_id}/gap")
def read_gap(user_id: int, db: Session = Depends(get_db)):
    return twin.gap_for_user(db, get_user(user_id, db), today())


# ----------------------------------------------------------------- simulate: what if lab


@api.post("/users/{user_id}/scenarios", status_code=201)
def create_scenario(user_id: int, body: s.ScenarioIn, db: Session = Depends(get_db)):
    user = get_user(user_id, db)
    sc = loop.create_scenario(db, user, body.name, [a.model_dump() for a in body.allocations], body.description)
    db.commit()
    return out.scenario_out(sc)


@api.get("/users/{user_id}/scenarios")
def list_scenarios(user_id: int, db: Session = Depends(get_db)):
    get_user(user_id, db)
    rows = db.scalars(select(m.Scenario).where(m.Scenario.user_id == user_id).order_by(m.Scenario.id)).all()
    return [out.scenario_out(sc) for sc in rows]


@api.post("/users/{user_id}/whatif/compare", status_code=201)
def compare(user_id: int, body: s.CompareIn, db: Session = Depends(get_db)):
    user = get_user(user_id, db)
    comp = loop.compare_scenarios(db, user, body.scenario_ids, today())
    db.commit()
    return out.comparison_out(comp)


@api.get("/users/{user_id}/comparisons/{comparison_id}")
def read_comparison(user_id: int, comparison_id: int, db: Session = Depends(get_db)):
    comp = db.get(m.ScenarioComparison, comparison_id)
    if comp is None or comp.user_id != user_id:
        raise LoopError("Сравнение не найдено.", status_code=404)
    return out.comparison_out(comp)


# ----------------------------------------------------------------- decide


@api.post("/users/{user_id}/decisions", status_code=201)
def create_decision(user_id: int, body: s.DecisionIn, db: Session = Depends(get_db)):
    user = get_user(user_id, db)
    d = loop.decide(db, user, body.scenario_id, body.comparison_id, body.rationale)
    db.commit()
    return out.decision_out(d)


@api.get("/users/{user_id}/decisions")
def list_decisions(user_id: int, db: Session = Depends(get_db)):
    get_user(user_id, db)
    rows = db.scalars(select(m.Decision).where(m.Decision.user_id == user_id).order_by(m.Decision.id)).all()
    return [out.decision_out(d) for d in rows]


# ----------------------------------------------------------------- execute


@api.post("/users/{user_id}/plans", status_code=201)
def generate_plan(user_id: int, body: s.PlanIn | None = None, db: Session = Depends(get_db)):
    user = get_user(user_id, db)
    plan = planner.generate_plan(db, user, body.week_start if body else None)
    db.commit()
    return out.plan_out(plan)


@api.get("/users/{user_id}/plans")
def list_plans(user_id: int, db: Session = Depends(get_db)):
    get_user(user_id, db)
    rows = db.scalars(select(m.Plan).where(m.Plan.user_id == user_id).order_by(m.Plan.id)).all()
    return [out.plan_out(p) for p in rows]


def _get_plan(db: Session, user_id: int, plan_id: int) -> m.Plan:
    plan = db.get(m.Plan, plan_id)
    if plan is None or plan.user_id != user_id:
        raise LoopError("План не найден.", status_code=404)
    return plan


@api.get("/users/{user_id}/plans/{plan_id}")
def read_plan(user_id: int, plan_id: int, db: Session = Depends(get_db)):
    return out.plan_out(_get_plan(db, user_id, plan_id))


@api.patch("/users/{user_id}/tasks/{task_id}")
def update_task(user_id: int, task_id: int, body: s.TaskUpdateIn, db: Session = Depends(get_db)):
    user = get_user(user_id, db)
    task = db.get(m.PlanTask, task_id)
    if task is None or task.plan.user_id != user.id:
        raise LoopError("Задача не найдена.", status_code=404)
    planner.update_task(db, user, task, body.status, body.actual_minutes)
    db.commit()
    return out.task_out(task)


# ----------------------------------------------------------------- measure & adapt


@api.post("/users/{user_id}/plans/{plan_id}/reality-check", status_code=201)
def reality_check(user_id: int, plan_id: int, body: s.RealityCheckIn, db: Session = Depends(get_db)):
    user = get_user(user_id, db)
    rc, proposals = reality.run_reality_check(
        db, user, _get_plan(db, user_id, plan_id), body.feedback, body.perceived_difficulty
    )
    db.commit()
    return out.reality_out(rc, proposals)


@api.get("/users/{user_id}/reality-checks")
def list_reality_checks(user_id: int, db: Session = Depends(get_db)):
    get_user(user_id, db)
    rows = db.scalars(select(m.RealityCheck).where(m.RealityCheck.user_id == user_id).order_by(m.RealityCheck.id)).all()
    result = []
    for rc in rows:
        props = db.scalars(select(m.AdaptationProposal).where(m.AdaptationProposal.reality_check_id == rc.id)).all()
        result.append(out.reality_out(rc, list(props)))
    return result


@api.get("/users/{user_id}/proposals")
def list_proposals(user_id: int, status: str | None = None, db: Session = Depends(get_db)):
    get_user(user_id, db)
    q = select(m.AdaptationProposal).where(m.AdaptationProposal.user_id == user_id)
    if status:
        q = q.where(m.AdaptationProposal.status == status)
    return [out.proposal_out(p) for p in db.scalars(q.order_by(m.AdaptationProposal.id)).all()]


def _resolve(user_id: int, proposal_id: int, accept: bool, body: s.ProposalResolveIn | None, db: Session):
    user = get_user(user_id, db)
    proposal = db.get(m.AdaptationProposal, proposal_id)
    if proposal is None:
        raise LoopError("Предложение не найдено.", status_code=404)
    result = reality.resolve_proposal(db, user, proposal, accept, body.comment if body else None)
    db.commit()
    return result


@api.post("/users/{user_id}/proposals/{proposal_id}/accept")
def accept_proposal(user_id: int, proposal_id: int, body: s.ProposalResolveIn | None = None,
                    db: Session = Depends(get_db)):
    return _resolve(user_id, proposal_id, True, body, db)


@api.post("/users/{user_id}/proposals/{proposal_id}/reject")
def reject_proposal(user_id: int, proposal_id: int, body: s.ProposalResolveIn | None = None,
                    db: Session = Depends(get_db)):
    return _resolve(user_id, proposal_id, False, body, db)


@api.post("/users/{user_id}/feedback", status_code=201)
def post_feedback(user_id: int, body: s.FeedbackIn, db: Session = Depends(get_db)):
    user = get_user(user_id, db)
    ev = memory.record(db, user, memory.FEEDBACK, {"text": body.text})
    db.commit()
    return out.memory_event_out(ev)


@api.get("/users/{user_id}/memory")
def read_memory(user_id: int, limit: int = 200, db: Session = Depends(get_db)):
    user = get_user(user_id, db)
    events = db.scalars(
        select(m.MemoryEvent).where(m.MemoryEvent.user_id == user_id).order_by(m.MemoryEvent.id.desc()).limit(limit)
    ).all()
    return {"context": memory.build_context(db, user), "events": [out.memory_event_out(e) for e in events]}


@api.get("/users/{user_id}/loop")
def read_loop(user_id: int, db: Session = Depends(get_db)):
    return loop.loop_status(db, get_user(user_id, db))


# ----------------------------------------------------------------- demo


@api.post("/demo/seed", status_code=201)
def demo_seed(db: Session = Depends(get_db)):
    user = demo.seed_demo_user(db, today())
    a, b = demo.demo_scenarios(db, user)
    db.commit()
    return {"user_id": user.id, "scenario_ids": [a.id, b.id], "label": demo.DEMO_LABEL}


@api.post("/demo/users/{user_id}/plans/{plan_id}/simulate-week")
def demo_simulate(user_id: int, plan_id: int, db: Session = Depends(get_db)):
    user = get_user(user_id, db)
    result = demo.simulate_week(db, user, _get_plan(db, user_id, plan_id))
    db.commit()
    return result


@api.post("/demo/run-all", status_code=201)
def demo_run_all(db: Session = Depends(get_db)):
    result = demo.run_full_demo(db, today())
    db.commit()
    return result


app.include_router(api)

if FRONTEND_DIR.exists():
    app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")

    @app.get("/", include_in_schema=False)
    def index():
        return FileResponse(FRONTEND_DIR / "index.html")
