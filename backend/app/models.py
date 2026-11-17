"""MIRROR AI data model.

The digital twin is split into two strictly separate models:

* CURRENT SELF  - facts: `CurrentProfile` (time, constraints) + `CurrentState` (one per goal:
  the level/value the user actually has today) + completed `PlanTask`s.
* FUTURE SELF   - desired state: `FutureProfile` (vision) + `FutureTarget` (one per goal:
  target level/value, date, priority) + `Milestone`s (intermediate steps).

`Goal` is the shared anchor that links a current fact to its desired state, so the system always
knows that "Python: intermediate" in FutureTarget is a *wish*, not an acquired skill.

The Decision-to-Outcome loop is represented by foreign keys:
Scenario -> Comparison -> Decision -> Plan -> PlanTask -> RealityCheck -> AdaptationProposal,
with every step also written to `MemoryEvent` (adaptive memory).
"""
from __future__ import annotations

from datetime import date, datetime, timezone

from sqlalchemy import (
    JSON,
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base

JSONType = JSON().with_variant(JSONB(), "postgresql")


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


# --------------------------------------------------------------------------- user


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    country: Mapped[str | None] = mapped_column(String(80))
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    current_profile: Mapped[CurrentProfile | None] = relationship(
        back_populates="user", uselist=False, cascade="all, delete-orphan"
    )
    future_profile: Mapped[FutureProfile | None] = relationship(
        back_populates="user", uselist=False, cascade="all, delete-orphan"
    )
    goals: Mapped[list[Goal]] = relationship(back_populates="user", cascade="all, delete-orphan")


# --------------------------------------------------------------------------- current self


class CurrentProfile(Base):
    """CURRENT SELF: facts about time and constraints."""

    __tablename__ = "current_profiles"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), unique=True)
    weekly_hours_available: Mapped[float] = mapped_column(Float, default=0)
    study_days: Mapped[list] = mapped_column(JSONType, default=lambda: [0, 1, 2, 3, 4, 5])  # 0=Mon
    max_session_minutes: Mapped[int] = mapped_column(Integer, default=90)
    constraints: Mapped[list] = mapped_column(JSONType, default=list)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    user: Mapped[User] = relationship(back_populates="current_profile")


class Goal(Base):
    """Shared anchor between a current fact and a desired state (skill / exam / objective)."""

    __tablename__ = "goals"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(160))
    domain: Mapped[str] = mapped_column(String(40), default="other")  # exam|language|programming|other
    metric_type: Mapped[str] = mapped_column(String(20))  # numeric|level|milestones
    scale: Mapped[str | None] = mapped_column(String(40))  # cefr|proficiency (level goals)
    unit: Mapped[str | None] = mapped_column(String(40))
    min_value: Mapped[float | None] = mapped_column(Float)
    max_value: Mapped[float | None] = mapped_column(Float)
    status: Mapped[str] = mapped_column(String(20), default="active")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    user: Mapped[User] = relationship(back_populates="goals")
    current_state: Mapped[CurrentState | None] = relationship(
        back_populates="goal", uselist=False, cascade="all, delete-orphan"
    )
    future_target: Mapped[FutureTarget | None] = relationship(
        back_populates="goal", uselist=False, cascade="all, delete-orphan"
    )


class CurrentState(Base):
    """CURRENT SELF: what the user actually has today for one goal."""

    __tablename__ = "current_states"

    id: Mapped[int] = mapped_column(primary_key=True)
    goal_id: Mapped[int] = mapped_column(ForeignKey("goals.id", ondelete="CASCADE"), unique=True)
    value: Mapped[float | None] = mapped_column(Float)
    level: Mapped[str | None] = mapped_column(String(40))
    source: Mapped[str] = mapped_column(String(40), default="self_assessment")
    evidence: Mapped[str | None] = mapped_column(Text)
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    goal: Mapped[Goal] = relationship(back_populates="current_state")


# --------------------------------------------------------------------------- future self


class FutureProfile(Base):
    """FUTURE SELF: the desired state as a whole (not a prediction)."""

    __tablename__ = "future_profiles"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), unique=True)
    vision: Mapped[str | None] = mapped_column(Text)
    horizon_date: Mapped[date | None] = mapped_column(Date)
    desired_achievements: Mapped[list] = mapped_column(JSONType, default=list)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    user: Mapped[User] = relationship(back_populates="future_profile")


class FutureTarget(Base):
    """FUTURE SELF: desired level/value for one goal."""

    __tablename__ = "future_targets"

    id: Mapped[int] = mapped_column(primary_key=True)
    goal_id: Mapped[int] = mapped_column(ForeignKey("goals.id", ondelete="CASCADE"), unique=True)
    target_value: Mapped[float | None] = mapped_column(Float)
    target_level: Mapped[str | None] = mapped_column(String(40))
    target_date: Mapped[date | None] = mapped_column(Date)
    priority: Mapped[int] = mapped_column(Integer, default=3)  # 1 (low) .. 5 (high)
    desired_outcome: Mapped[str | None] = mapped_column(Text)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    goal: Mapped[Goal] = relationship(back_populates="future_target")
    milestones: Mapped[list[Milestone]] = relationship(
        back_populates="future_target", cascade="all, delete-orphan", order_by="Milestone.order"
    )


class Milestone(Base):
    """Intermediate step towards a FutureTarget. `done` is a fact recorded by the user."""

    __tablename__ = "milestones"

    id: Mapped[int] = mapped_column(primary_key=True)
    future_target_id: Mapped[int] = mapped_column(ForeignKey("future_targets.id", ondelete="CASCADE"))
    title: Mapped[str] = mapped_column(String(200))
    order: Mapped[int] = mapped_column(Integer, default=0)
    due_date: Mapped[date | None] = mapped_column(Date)
    done: Mapped[bool] = mapped_column(Boolean, default=False)
    done_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    future_target: Mapped[FutureTarget] = relationship(back_populates="milestones")


# --------------------------------------------------------------------------- simulate / decide


class Scenario(Base):
    __tablename__ = "scenarios"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    description: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default="draft")  # draft|chosen|superseded
    source: Mapped[str] = mapped_column(String(20), default="user")  # user|adaptation|demo
    parent_scenario_id: Mapped[int | None] = mapped_column(ForeignKey("scenarios.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    allocations: Mapped[list[ScenarioAllocation]] = relationship(
        back_populates="scenario", cascade="all, delete-orphan"
    )


class ScenarioAllocation(Base):
    __tablename__ = "scenario_allocations"
    __table_args__ = (UniqueConstraint("scenario_id", "goal_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    scenario_id: Mapped[int] = mapped_column(ForeignKey("scenarios.id", ondelete="CASCADE"))
    goal_id: Mapped[int] = mapped_column(ForeignKey("goals.id", ondelete="CASCADE"))
    hours_per_week: Mapped[float] = mapped_column(Float)

    scenario: Mapped[Scenario] = relationship(back_populates="allocations")
    goal: Mapped[Goal] = relationship()


class ScenarioComparison(Base):
    __tablename__ = "scenario_comparisons"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    scenario_ids: Mapped[list] = mapped_column(JSONType)
    metrics: Mapped[dict] = mapped_column(JSONType)  # deterministic calculations
    explanation: Mapped[dict] = mapped_column(JSONType)  # LLM or template explanation
    explanation_source: Mapped[str] = mapped_column(String(20))  # llm|template
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Decision(Base):
    __tablename__ = "decisions"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    scenario_id: Mapped[int] = mapped_column(ForeignKey("scenarios.id"))
    comparison_id: Mapped[int | None] = mapped_column(ForeignKey("scenario_comparisons.id"))
    source: Mapped[str] = mapped_column(String(20), default="user")  # user|adaptation
    rationale: Mapped[str | None] = mapped_column(Text)
    decided_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    scenario: Mapped[Scenario] = relationship()


# --------------------------------------------------------------------------- execute / measure / adapt


class Plan(Base):
    __tablename__ = "plans"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    decision_id: Mapped[int] = mapped_column(ForeignKey("decisions.id"))
    scenario_id: Mapped[int] = mapped_column(ForeignKey("scenarios.id"))
    previous_plan_id: Mapped[int | None] = mapped_column(ForeignKey("plans.id"))
    week_index: Mapped[int] = mapped_column(Integer, default=1)
    week_start: Mapped[date] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(20), default="active")  # active|reviewed
    planned_minutes_total: Mapped[int] = mapped_column(Integer, default=0)
    adaptation_notes: Mapped[list] = mapped_column(JSONType, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    tasks: Mapped[list[PlanTask]] = relationship(
        back_populates="plan", cascade="all, delete-orphan", order_by=lambda: [PlanTask.day_of_week, PlanTask.id]
    )
    decision: Mapped[Decision] = relationship()
    scenario: Mapped[Scenario] = relationship()


class PlanTask(Base):
    __tablename__ = "plan_tasks"

    id: Mapped[int] = mapped_column(primary_key=True)
    plan_id: Mapped[int] = mapped_column(ForeignKey("plans.id", ondelete="CASCADE"), index=True)
    goal_id: Mapped[int] = mapped_column(ForeignKey("goals.id", ondelete="CASCADE"))
    milestone_id: Mapped[int | None] = mapped_column(ForeignKey("milestones.id", ondelete="SET NULL"))
    title: Mapped[str] = mapped_column(String(200))
    day_of_week: Mapped[int] = mapped_column(Integer)  # 0=Mon
    planned_minutes: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(20), default="pending")  # pending|done|partial|skipped
    actual_minutes: Mapped[int] = mapped_column(Integer, default=0)
    is_carry_over: Mapped[bool] = mapped_column(Boolean, default=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    plan: Mapped[Plan] = relationship(back_populates="tasks")
    goal: Mapped[Goal] = relationship()


class RealityCheck(Base):
    __tablename__ = "reality_checks"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    plan_id: Mapped[int] = mapped_column(ForeignKey("plans.id"), unique=True)
    scenario_id: Mapped[int] = mapped_column(ForeignKey("scenarios.id"))
    decision_id: Mapped[int] = mapped_column(ForeignKey("decisions.id"))
    planned_minutes: Mapped[int] = mapped_column(Integer)
    actual_minutes: Mapped[int] = mapped_column(Integer)
    completion_rate: Mapped[float] = mapped_column(Float)
    per_goal: Mapped[list] = mapped_column(JSONType)
    insights: Mapped[list] = mapped_column(JSONType)
    user_feedback: Mapped[str | None] = mapped_column(Text)
    perceived_difficulty: Mapped[int | None] = mapped_column(Integer)  # 1..5
    ai_commentary: Mapped[dict | None] = mapped_column(JSONType)  # LLM or template explanation
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class AdaptationProposal(Base):
    """A change suggested from real results. Never applied without the user's confirmation."""

    __tablename__ = "adaptation_proposals"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    reality_check_id: Mapped[int] = mapped_column(ForeignKey("reality_checks.id", ondelete="CASCADE"))
    kind: Mapped[str] = mapped_column(String(40))  # adjust_allocation|update_availability
    goal_id: Mapped[int | None] = mapped_column(ForeignKey("goals.id", ondelete="CASCADE"))
    payload: Mapped[dict] = mapped_column(JSONType)
    reason: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default="pending")  # pending|accepted|rejected
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class MemoryEvent(Base):
    """Adaptive memory: append-only structured log of everything that changed."""

    __tablename__ = "memory_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    event_type: Mapped[str] = mapped_column(String(40), index=True)
    goal_id: Mapped[int | None] = mapped_column(ForeignKey("goals.id", ondelete="SET NULL"))
    ref_type: Mapped[str | None] = mapped_column(String(40))
    ref_id: Mapped[int | None] = mapped_column(Integer)
    payload: Mapped[dict] = mapped_column(JSONType, default=dict)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
