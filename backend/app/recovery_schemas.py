"""Pydantic schemas for the Recovery Preview API (POST /api/recovery/preview).

Units: every duration is an INTEGER number of MINUTES. Booleans, strings and fractional
numbers are rejected (strict ints). Priorities use the backend scale 1 (low) .. 5 (high).
The request carries no personal data: no name, no user id, no contact details.
"""
from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

MAX_WEEK_MINUTES = 6720  # 112 h: same ceiling as current-self weekly_hours_available
MAX_DAY_MINUTES = 1440
MAX_TASKS = 50

WeekMinutes = Annotated[int, Field(strict=True, ge=0, le=MAX_WEEK_MINUTES)]
DayMinutes = Annotated[int, Field(strict=True, ge=0, le=MAX_DAY_MINUTES)]
TaskId = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=64,
                                          pattern=r"^[A-Za-z0-9_.:\-]+$")]
ShortText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=160)]

Category = Literal["ent", "sat", "ielts", "other"]
Action = Literal["keep", "shorten", "defer"]
Status = Literal["fits", "reduced", "paused"]


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


# --------------------------------------------------------------------------- request


class RecoveryTaskIn(_Strict):
    id: TaskId
    title: ShortText
    planned_minutes: WeekMinutes
    priority: Annotated[int, Field(strict=True, ge=1, le=5)] = 3


class RecoveryPreviewIn(_Strict):
    category: Category
    subject: ShortText
    original_weekly_minutes: WeekMinutes
    new_weekly_minutes: WeekMinutes
    available_today_minutes: DayMinutes
    tasks: list[RecoveryTaskIn] = Field(default_factory=list, max_length=MAX_TASKS)
    topic: Annotated[str, StringConstraints(strip_whitespace=True, max_length=200)] | None = None

    @model_validator(mode="after")
    def _unique_ids(self) -> "RecoveryPreviewIn":
        seen: set[str] = set()
        dupes: set[str] = set()
        for t in self.tasks:
            (dupes if t.id in seen else seen).add(t.id)
        if dupes:
            dupes = sorted(dupes)
            raise ValueError(f"duplicate task ids: {', '.join(dupes)}")
        return self


# --------------------------------------------------------------------------- response


class RecoveryTaskOut(_Strict):
    id: str
    title: str
    priority: int
    rank: int = Field(description="1 = processed first (highest priority, then input order)")
    previous_minutes: int
    proposed_minutes: int
    deferred_minutes: int
    action: Action
    reason: str


class TemplateItemOut(_Strict):
    key: Literal["review_material", "practice_set", "check_mistakes"]
    proposed_minutes: int


class RecoverySummaryOut(_Strict):
    original_budget_minutes: int
    original_workload_minutes: int
    new_budget_minutes: int
    reserve_minutes: int
    planning_budget_minutes: int
    proposed_minutes: int
    unallocated_minutes: int
    deferred_minutes: int
    kept_count: int
    shortened_count: int
    deferred_count: int
    budget_change_ratio: float | None = Field(description="new / original budget; null if original is 0")


class WarningOut(_Strict):
    code: str
    params: dict[str, int | str] = Field(default_factory=dict)


class NextActionOut(_Strict):
    kind: Literal["start_task", "start_template", "schedule_next_session", "pause"]
    task_id: str | None = None
    template_key: str | None = None
    minutes: int
    reason: str


class RecoveryPreviewOut(_Strict):
    preview: Literal[True] = True
    persisted: Literal[False] = False
    algorithm_version: str
    category: Category
    subject: str
    topic: str | None
    status: Status
    summary: RecoverySummaryOut
    tasks: list[RecoveryTaskOut]
    template_plan: list[TemplateItemOut]
    warnings: list[WarningOut]
    assumptions: list[str]
    next_action: NextActionOut
