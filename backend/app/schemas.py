from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, field_validator


class ScenarioParams(BaseModel):
    enrollment_delta: int = Field(0, ge=-300, le=600)
    unavailable_room_ids: list[str] = Field(default_factory=list)
    unavailable_teacher_ids: list[str] = Field(default_factory=list)
    lab_policy: Literal["default", "afternoon_only"] = "default"
    operating_end_slot: int = Field(6, ge=3, le=6)
    energy_mode: Literal["standard", "efficiency"] = "standard"
    notes: str = Field("", max_length=400)

    @field_validator("unavailable_room_ids", "unavailable_teacher_ids")
    @classmethod
    def unique_ids(cls, value: list[str]) -> list[str]:
        return sorted(set(value))


class ScenarioCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=90)
    kind: Literal["demand", "facility", "policy", "sustainability", "compound"] | None = None
    params: ScenarioParams = Field(default_factory=ScenarioParams)


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
