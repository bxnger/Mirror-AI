"""Request bodies (responses are plain dicts built in serializers.py)."""
from __future__ import annotations

from datetime import date

from pydantic import BaseModel, Field


class UserIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    country: str | None = None


class CurrentSelfIn(BaseModel):
    weekly_hours_available: float | None = Field(default=None, ge=0, le=112)
    study_days: list[int] | None = None
    max_session_minutes: int | None = Field(default=None, ge=20, le=240)
    constraints: list[str] | None = None


class FutureSelfIn(BaseModel):
    vision: str | None = None
    horizon_date: date | None = None
    desired_achievements: list[str] | None = None


class StateIn(BaseModel):
    value: float | None = None
    level: str | None = None
    source: str | None = None
    evidence: str | None = None


class MilestoneIn(BaseModel):
    title: str
    due_date: date | None = None
    done: bool = False


class TargetIn(BaseModel):
    value: float | None = None
    level: str | None = None
    target_date: date | None = None
    priority: int | None = Field(default=3, ge=1, le=5)
    desired_outcome: str | None = None
    milestones: list[MilestoneIn] = []


class TargetUpdateIn(BaseModel):
    value: float | None = None
    level: str | None = None
    target_date: date | None = None
    priority: int | None = Field(default=None, ge=1, le=5)
    desired_outcome: str | None = None


class GoalIn(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    domain: str = "other"
    metric_type: str
    scale: str | None = None
    unit: str | None = None
    min_value: float | None = None
    max_value: float | None = None
    current: StateIn | None = None
    target: TargetIn | None = None


class MilestoneToggleIn(BaseModel):
    done: bool


class AllocationIn(BaseModel):
    goal_id: int
    hours_per_week: float = Field(ge=0, le=80)


class ScenarioIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str | None = None
    allocations: list[AllocationIn]


class CompareIn(BaseModel):
    scenario_ids: list[int] = Field(min_length=2, max_length=4)


class DecisionIn(BaseModel):
    scenario_id: int
    comparison_id: int | None = None
    rationale: str | None = None


class PlanIn(BaseModel):
    week_start: date | None = None


class TaskUpdateIn(BaseModel):
    status: str
    actual_minutes: int | None = Field(default=None, ge=0, le=1440)


class RealityCheckIn(BaseModel):
    feedback: str | None = None
    perceived_difficulty: int | None = Field(default=None, ge=1, le=5)


class ProposalResolveIn(BaseModel):
    comment: str | None = None


class FeedbackIn(BaseModel):
    text: str = Field(min_length=1, max_length=2000)
