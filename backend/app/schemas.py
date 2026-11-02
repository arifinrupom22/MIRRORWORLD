from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, field_validator


class ScenarioParams(BaseModel):
    enrollment_delta: int = Field(0, ge=-300, le=600)
    unavailable_room_ids: list[str] = Field(default_factory=list)
    unavailable_building_ids: list[str] = Field(default_factory=list)
    unavailable_teacher_ids: list[str] = Field(default_factory=list)
    lab_availability_pct: int = Field(100, ge=0, le=100)
    equipment_loss: list[str] = Field(default_factory=list)
    teacher_workload_delta: int = Field(0, ge=-10, le=10)
    lab_policy: Literal["default", "afternoon_only"] = "default"
    operating_end_slot: int = Field(6, ge=3, le=7)
    energy_mode: Literal["standard", "efficiency"] = "standard"
    notes: str = Field("", max_length=400)

    @field_validator(
        "unavailable_room_ids",
        "unavailable_building_ids",
        "unavailable_teacher_ids",
        "equipment_loss",
    )
    @classmethod
    def unique_ids(cls, value: list[str]) -> list[str]:
        return sorted(set(value))


class ScenarioCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=90)
    kind: Literal["demand", "facility", "policy", "sustainability", "compound"] | None = None
    params: ScenarioParams = Field(default_factory=ScenarioParams)


class AssessRequest(BaseModel):
    params: ScenarioParams = Field(default_factory=ScenarioParams)


class AIChatMessage(BaseModel):
    role: Literal["user", "assistant"] = "user"
    content: str = Field(..., max_length=4000)


class AIChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=2000)
    scenario_id: str | None = None
    history: list[AIChatMessage] = Field(default_factory=list, max_length=12)
    #: Intelligence mode. Server-side allowlist; an unknown value falls back to
    #: ``ask`` rather than being passed through to the prompt.
    mode: Literal["ask", "analyst", "what_if", "advisor", "research"] = "ask"


class AIProposalRequest(BaseModel):
    """A natural-language disruption to translate into a validated proposal."""

    message: str = Field(..., min_length=1, max_length=2000)
    scenario_id: str | None = None


class AIApplyRequest(BaseModel):
    """Apply a proposal. Confirmation is explicit and required."""

    proposal_id: str = Field(..., min_length=8, max_length=64)
    confirmed: bool = False


class OptimizeRequest(BaseModel):
    weights: dict[str, float] = Field(
        default_factory=lambda: {"energy": 0.25, "utilization": 0.25, "movement": 0.5}
    )
    time_limit: float = Field(6.0, ge=2.0, le=20.0)

    @field_validator("weights")
    @classmethod
    def validate_weights(cls, value: dict[str, float]) -> dict[str, float]:
        allowed = {"energy", "utilization", "movement"}
        clean = {}
        for key in allowed:
            raw = value.get(key, 0.25)
            try:
                clean[key] = max(0.0, min(1.0, float(raw)))
            except (TypeError, ValueError):
                clean[key] = 0.25
        if sum(clean.values()) <= 0:
            raise ValueError("At least one objective weight must be greater than zero.")
        return clean


class RoomUpdate(BaseModel):
    name: str | None = Field(None, min_length=2, max_length=80)
    capacity: int | None = Field(None, ge=10, le=300)


class TeacherUpdate(BaseModel):
    max_weekly_hours: int | None = Field(None, ge=1, le=40)


class GroupUpdate(BaseModel):
    size: int | None = Field(None, ge=5, le=300)


class MovementTransition(BaseModel):
    transition_id: str
    cohort_id: str
    cohort_name: str
    student_count: int
    from_session_id: str
    from_course_code: str
    from_room_id: str
    from_building_id: str
    from_building_name: str
    from_day: int
    from_slot: int
    from_time: str
    to_session_id: str
    to_course_code: str
    to_room_id: str
    to_building_id: str
    to_building_name: str
    to_day: int
    to_slot: int
    to_time: str
    time_gap_min: int
    distance_m: int | None = None
    walking_time_min: float | None = None
    feasible: bool | None = None
    tight: bool | None = None
    unknown_distance: bool = False
    same_building: bool = False
    is_cross_day: bool = False


class MovementSummary(BaseModel):
    unique_routes: int
    total_transitions: int
    total_students: int
    total_distance_m: int
    total_walking_time_min: float
    tight_transitions: int
    infeasible_transitions: int
    unknown_distance_transitions: int
    same_building_transitions: int
    cross_day_transitions: int
    warning_count: int


class MovementResponse(BaseModel):
    scenario_id: str | None = None
    day: int | None = None
    slot: int | None = None
    transitions: list[MovementTransition] = Field(default_factory=list)
    summary: MovementSummary
    warnings: list[str] = Field(default_factory=list)

