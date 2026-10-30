from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Building(Base):
    __tablename__ = "buildings"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    code: Mapped[str] = mapped_column(String)
    name: Mapped[str] = mapped_column(String)
    zone: Mapped[str] = mapped_column(String)
    purpose: Mapped[str] = mapped_column(String)
    floors: Mapped[int] = mapped_column(Integer)
    map: Mapped[dict] = mapped_column(JSON)
    accent: Mapped[str] = mapped_column(String)

    rooms: Mapped[list[Room]] = relationship(back_populates="building")


class Room(Base):
    __tablename__ = "rooms"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    building_id: Mapped[str] = mapped_column(ForeignKey("buildings.id"))
    code: Mapped[str] = mapped_column(String)
    name: Mapped[str] = mapped_column(String)
    kind: Mapped[str] = mapped_column(String)  # classroom | lab
    lab_types: Mapped[list] = mapped_column(JSON, default=list)
    capacity: Mapped[int] = mapped_column(Integer)
    floor: Mapped[int] = mapped_column(Integer)
    power_kw: Mapped[float] = mapped_column(Float)
    equipment: Mapped[list] = mapped_column(JSON, default=list)
    equipment_kw: Mapped[float] = mapped_column(Float, default=0.0)

    building: Mapped[Building] = relationship(back_populates="rooms")


class Teacher(Base):
    __tablename__ = "teachers"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String)
    department: Mapped[str] = mapped_column(String)
    title: Mapped[str] = mapped_column(String)
    max_weekly_hours: Mapped[int] = mapped_column(Integer)
    unavailable: Mapped[list] = mapped_column(JSON, default=list)  # [[day, slot], ...]


class StudentGroup(Base):
    __tablename__ = "student_groups"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String)
    department: Mapped[str] = mapped_column(String)
    batch: Mapped[str] = mapped_column(String)
    size: Mapped[int] = mapped_column(Integer)
    home_building_id: Mapped[str] = mapped_column(ForeignKey("buildings.id"))


class Course(Base):
    __tablename__ = "courses"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    code: Mapped[str] = mapped_column(String)
    title: Mapped[str] = mapped_column(String)
    department: Mapped[str] = mapped_column(String)
    teacher_id: Mapped[str] = mapped_column(ForeignKey("teachers.id"))
    weekly_sessions: Mapped[int] = mapped_column(Integer)
    length: Mapped[int] = mapped_column(Integer)
    needs_lab: Mapped[str | None] = mapped_column(String, nullable=True)
    required_equipment: Mapped[list] = mapped_column(JSON, default=list)
    color: Mapped[str] = mapped_column(String)


class GroupCourse(Base):
    __tablename__ = "group_courses"
    __table_args__ = (UniqueConstraint("group_id", "course_id", name="uq_group_course"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    group_id: Mapped[str] = mapped_column(ForeignKey("student_groups.id"))
    course_id: Mapped[str] = mapped_column(ForeignKey("courses.id"))


class TimetableSession(Base):
    __tablename__ = "timetable_entries"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    course_id: Mapped[str] = mapped_column(ForeignKey("courses.id"))
    group_id: Mapped[str] = mapped_column(ForeignKey("student_groups.id"))
    sequence: Mapped[int] = mapped_column(Integer)
    length: Mapped[int] = mapped_column(Integer)
    room_id: Mapped[str | None] = mapped_column(ForeignKey("rooms.id"), nullable=True)
    day: Mapped[int | None] = mapped_column(Integer, nullable=True)
    start_slot: Mapped[int | None] = mapped_column(Integer, nullable=True)


class Scenario(Base):
    __tablename__ = "scenarios"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String)
    kind: Mapped[str] = mapped_column(String)
    params: Mapped[dict] = mapped_column(JSON)
    status: Mapped[str] = mapped_column(String, default="simulated")
    metrics: Mapped[dict] = mapped_column(JSON, default=dict)
    schedule: Mapped[list] = mapped_column(JSON, default=list)
    affected: Mapped[dict] = mapped_column(JSON, default=dict)
    warnings: Mapped[list] = mapped_column(JSON, default=list)
    assumptions: Mapped[list] = mapped_column(JSON, default=list)
    diagnostics: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    plans: Mapped[list[ScenarioPlan]] = relationship(
        back_populates="scenario", cascade="all, delete-orphan", order_by="ScenarioPlan.label"
    )


class ScenarioPlan(Base):
    __tablename__ = "scenario_results"
    __table_args__ = (UniqueConstraint("scenario_id", "label", name="uq_scenario_plan"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    scenario_id: Mapped[str] = mapped_column(ForeignKey("scenarios.id"))
    label: Mapped[str] = mapped_column(String)
    name: Mapped[str] = mapped_column(String)
    strategy: Mapped[str] = mapped_column(String)
    status: Mapped[str] = mapped_column(String)
    solver_status: Mapped[str] = mapped_column(String)
    objective: Mapped[float | None] = mapped_column(Float, nullable=True)
    metrics: Mapped[dict] = mapped_column(JSON, default=dict)
    schedule: Mapped[list] = mapped_column(JSON, default=list)
    assignments: Mapped[list] = mapped_column(JSON, default=list)
    warnings: Mapped[list] = mapped_column(JSON, default=list)
    assumptions: Mapped[list] = mapped_column(JSON, default=list)
    audit: Mapped[dict] = mapped_column(JSON, default=dict)
    objective_terms: Mapped[dict] = mapped_column(JSON, default=dict)
    runtime_seconds: Mapped[float] = mapped_column(Float, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    scenario: Mapped[Scenario] = relationship(back_populates="plans")


class AuditLog(Base):
    __tablename__ = "audit_log"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    action: Mapped[str] = mapped_column(String)
    scenario_id: Mapped[str | None] = mapped_column(String, nullable=True)
    actor: Mapped[str] = mapped_column(String, default="demo.admin")
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    detail: Mapped[dict] = mapped_column(JSON, default=dict)
