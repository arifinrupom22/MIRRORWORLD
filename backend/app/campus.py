from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session as OrmSession

from . import catalog
from .models import Building, Course, GroupCourse, Room, StudentGroup, Teacher, TimetableSession


@dataclass
class Campus:
    buildings: list[dict]
    rooms: list[dict]
    teachers: list[dict]
    groups: list[dict]
    courses: list[dict]
    group_courses: list[dict]
    sessions: list[dict]
    room_index: dict[str, dict] = field(default_factory=dict)
    teacher_index: dict[str, dict] = field(default_factory=dict)
    group_index: dict[str, dict] = field(default_factory=dict)
    course_index: dict[str, dict] = field(default_factory=dict)
    building_index: dict[str, dict] = field(default_factory=dict)

    def rebuild_indexes(self) -> None:
        self.room_index = {r["id"]: r for r in self.rooms}
        self.teacher_index = {t["id"]: t for t in self.teachers}
        self.group_index = {g["id"]: g for g in self.groups}
        self.course_index = {c["id"]: c for c in self.courses}
        self.building_index = {b["id"]: b for b in self.buildings}

    def to_dict(self) -> dict:
        return {
            "campus": {
                "name": catalog.CAMPUS_NAME,
                "dataset_label": catalog.DATASET_LABEL,
                "source": "synthetic-demo",
            },
            "buildings": self.buildings,
            "rooms": self.rooms,
            "teachers": self.teachers,
            "groups": self.groups,
            "courses": self.courses,
            "group_courses": self.group_courses,
            "sessions": self.sessions,
            "days": catalog.DAYS,
            "time_slots": catalog.TIME_SLOTS,
            "distances": catalog.DISTANCES,
        }


def load_campus(db: OrmSession) -> Campus:
    campus = Campus(
        buildings=[_building_dict(b) for b in db.scalars(select(Building).order_by(Building.id)).all()],
        rooms=[_room_dict(r) for r in db.scalars(select(Room).order_by(Room.id)).all()],
        teachers=[_teacher_dict(t) for t in db.scalars(select(Teacher).order_by(Teacher.id)).all()],
        groups=[_group_dict(g) for g in db.scalars(select(StudentGroup).order_by(StudentGroup.id)).all()],
        courses=[_course_dict(c) for c in db.scalars(select(Course).order_by(Course.id)).all()],
        group_courses=[
            {"group_id": gc.group_id, "course_id": gc.course_id}
            for gc in db.scalars(select(GroupCourse).order_by(GroupCourse.id)).all()
        ],
        sessions=[
            _session_dict(s)
            for s in db.scalars(select(TimetableSession).order_by(TimetableSession.id)).all()
        ],
    )
    campus.rebuild_indexes()
    return campus


def _building_dict(b: Building) -> dict:
    return {
        "id": b.id,
        "code": b.code,
        "name": b.name,
        "zone": b.zone,
        "purpose": b.purpose,
        "floors": b.floors,
        "map": b.map,
        "accent": b.accent,
    }


def _room_dict(r: Room) -> dict:
    return {
        "id": r.id,
        "building_id": r.building_id,
        "code": r.code,
        "name": r.name,
        "kind": r.kind,
        "lab_types": r.lab_types or [],
        "capacity": r.capacity,
        "floor": r.floor,
        "power_kw": r.power_kw,
        "equipment": r.equipment or [],
        "equipment_kw": r.equipment_kw,
    }


def _teacher_dict(t: Teacher) -> dict:
    return {
        "id": t.id,
        "name": t.name,
        "department": t.department,
        "title": t.title,
        "max_weekly_hours": t.max_weekly_hours,
        "unavailable": t.unavailable or [],
    }


def _group_dict(g: StudentGroup) -> dict:
    return {
        "id": g.id,
        "name": g.name,
        "department": g.department,
        "batch": g.batch,
        "size": g.size,
        "home_building_id": g.home_building_id,
    }


def _course_dict(c: Course) -> dict:
    return {
        "id": c.id,
        "code": c.code,
        "title": c.title,
        "department": c.department,
        "teacher_id": c.teacher_id,
        "weekly_sessions": c.weekly_sessions,
        "length": c.length,
        "needs_lab": c.needs_lab,
        "required_equipment": c.required_equipment or [],
        "color": c.color,
    }


def _session_dict(s: TimetableSession) -> dict:
    return {
        "id": s.id,
        "course_id": s.course_id,
        "group_id": s.group_id,
        "sequence": s.sequence,
        "length": s.length,
        "room_id": s.room_id,
        "day": s.day,
        "start_slot": s.start_slot,
    }


def group_sizes_with_delta(groups: list[dict], delta: int) -> dict[str, int]:
    """Apply an enrolment delta proportionally, deterministically.

    Largest-remainder rounding keeps the cohort total exact. Enrolment never
    drops below 10 students per group in this model.
    """
    total = sum(g["size"] for g in groups)
    target = max(len(groups) * 10, total + delta)
    factor = target / total if total else 1.0
    raw = [(g["id"], g["size"] * factor) for g in groups]
    floors = {gid: max(10, int(value)) for gid, value in raw}
    remainder = target - sum(floors.values())
    fractions = sorted(
        ((value - int(value), gid) for gid, value in raw),
        key=lambda item: (-item[0], item[1]),
    )
    idx = 0
    while remainder > 0 and fractions:
        gid = fractions[idx % len(fractions)][1]
        floors[gid] += 1
        remainder -= 1
        idx += 1
    while remainder < 0:
        candidates = sorted((v, gid) for gid, v in floors.items() if v > 10)
        if not candidates:
            break
        gid = candidates[-1][1]
        floors[gid] -= 1
        remainder += 1
    return floors


def allowed_rooms_for_course(course: dict, room: dict, group_size: int, respect_capacity: bool = True) -> bool:
    if respect_capacity and group_size > room["capacity"]:
        return False
    if course.get("needs_lab"):
        if room["kind"] != "lab":
            return False
        if course["needs_lab"] not in (room.get("lab_types") or []):
            return False
        if any(eq not in (room.get("equipment") or []) for eq in course.get("required_equipment") or []):
            return False
    else:
        if room["kind"] != "classroom":
            return False
    return True


def teacher_available(teacher: dict, day: int, slot: int) -> bool:
    return (day, slot) not in {tuple(x) for x in teacher.get("unavailable", [])}


def session_view(campus: Campus, session: dict, group_size: int | None = None) -> dict:
    course = campus.course_index[session["course_id"]]
    group = campus.group_index[session["group_id"]]
    teacher = campus.teacher_index[course["teacher_id"]]
    room = campus.room_index.get(session.get("room_id")) if session.get("room_id") else None
    building = campus.building_index.get(room["building_id"]) if room else None
    return {
        **session,
        "course_code": course["code"],
        "course_title": course["title"],
        "course_color": course["color"],
        "needs_lab": course.get("needs_lab"),
        "teacher_id": teacher["id"],
        "teacher_name": teacher["name"],
        "group_name": group["name"],
        "department": group["department"],
        "group_size": group_size if group_size is not None else group["size"],
        "room_code": room["code"] if room else None,
        "room_name": room["name"] if room else None,
        "room_capacity": room["capacity"] if room else None,
        "room_kind": room["kind"] if room else None,
        "building_id": room["building_id"] if room else None,
        "building_name": building["name"] if building else None,
        "room_power_kw": room["power_kw"] if room else 0.0,
        "room_equipment_kw": room.get("equipment_kw", 0.0) if room else 0.0,
        "day_label": catalog.DAYS[session["day"]]["label"] if session.get("day") is not None else None,
        "slot_label": catalog.TIME_SLOTS[session["start_slot"]]["label"] if session.get("start_slot") is not None else None,
    }
