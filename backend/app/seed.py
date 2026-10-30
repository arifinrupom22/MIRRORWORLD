"""Deterministic seed builder for the MIRRORWORLD demo campus."""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session as OrmSession

from . import catalog
from .campus import allowed_rooms_for_course, teacher_available
from .models import (
    Building,
    Course,
    GroupCourse,
    Room,
    StudentGroup,
    Teacher,
    TimetableSession,
)


# These placements intentionally reproduce a small, auditable set of baseline
# problems for the demonstration. They are documented in README and tests.
PINNED_SESSIONS = [
    # room double-booking: two groups in AT-103 Monday 08:00
    ("CS-305", "CSE-24", 1, "AT-103", 0, 0),
    ("EE-201", "EEE-21", 1, "AT-103", 0, 0),
    # teacher double-booking: Dr. Imran Hossain teaches two sections at once
    ("CS-302", "CSE-21", 1, "FL-105", 1, 1),
    ("CS-302", "CSE-23", 1, "FL-103", 1, 1),
    # student-group overlap: CSE-22 has two classes Thursday 11:20
    ("CS-301", "CSE-22", 1, "AT-102", 3, 2),
    ("CS-305", "CSE-22", 1, "AT-103", 3, 2),
    # capacity violation: 52 students placed in a 32-seat room
    ("BIO-201", "BIO-21", 1, "AD-101", 2, 2),
    # facility mismatch: a two-slot biology lab placed in a lecture room
    ("BIO-L205", "BIO-22", 1, "AD-103", 3, 3),
    # availability violation: teacher unavailable Friday 16:20
    ("EE-201", "EEE-23", 2, "FL-104", 4, 5),
    # fully valid pinned lab session
    ("CS-402", "CSE-21", 1, "FL-L1", 0, 2),
]


def seed_if_empty(db: OrmSession) -> bool:
    if db.scalar(select(func.count()).select_from(Building)):
        return False

    for b in catalog.BUILDINGS:
        db.add(
            Building(
                id=b["id"],
                code=b["code"],
                name=b["name"],
                zone=b["zone"],
                purpose=b["purpose"],
                floors=b["floors"],
                map=b["map"],
                accent=b["accent"],
            )
        )
    db.flush()

    for r in catalog.ROOMS:
        db.add(
            Room(
                id=r["id"],
                building_id=r["building_id"],
                code=r["code"],
                name=r["name"],
                kind=r["kind"],
                lab_types=r["lab_types"],
                capacity=r["capacity"],
                floor=r["floor"],
                power_kw=r["power_kw"],
                equipment=r["equipment"],
                equipment_kw=r["equipment_kw"],
            )
        )
    for t in catalog.TEACHERS:
        db.add(
            Teacher(
                id=t["id"],
                name=t["name"],
                department=t["department"],
                title=t["title"],
                max_weekly_hours=t["max_weekly_hours"],
                unavailable=t["unavailable"],
            )
        )
    for g in catalog.GROUPS:
        db.add(
            StudentGroup(
                id=g["id"],
                name=g["name"],
                department=g["department"],
                batch=g["batch"],
                size=g["size"],
                home_building_id=g["home_building_id"],
            )
        )
    for c in catalog.COURSES:
        db.add(
            Course(
                id=c["id"],
                code=c["code"],
                title=c["title"],
                department=c["department"],
                teacher_id=c["teacher_id"],
                weekly_sessions=c["weekly_sessions"],
                length=c["length"],
                needs_lab=c["needs_lab"],
                required_equipment=c["required_equipment"],
                color=c["color"],
            )
        )
    db.flush()

    for group_id, course_ids in catalog.GROUP_COURSES.items():
        for course_id in course_ids:
            db.add(GroupCourse(group_id=group_id, course_id=course_id))
    db.flush()

    sessions = _build_sessions()
    for s in sessions:
        db.add(TimetableSession(**s))
    db.commit()
    return True


def _build_sessions() -> list[dict]:
    group_by_name = {g["name"]: g for g in catalog.GROUPS}
    course_by_code = {c["code"]: c for c in catalog.COURSES}
    room_by_id = {r["id"]: r for r in catalog.ROOMS}
    teacher_by_id = {t["id"]: t for t in catalog.TEACHERS}

    # Build the full session catalogue.
    sessions: list[dict] = []
    for group in catalog.GROUPS:
        for course_id in catalog.GROUP_COURSES[group["id"]]:
            course = catalog.COURSE_INDEX[course_id]
            for seq in range(1, course["weekly_sessions"] + 1):
                sessions.append(
                    {
                        "id": f"{course['code']}__{group['id']}__S{seq}",
                        "course_id": course_id,
                        "group_id": group["id"],
                        "sequence": seq,
                        "length": course["length"],
                        "room_id": None,
                        "day": None,
                        "start_slot": None,
                    }
                )

    by_course_group = {(s["course_id"], s["group_id"], s["sequence"]): s for s in sessions}
    pinned_ids: set[str] = set()
    room_busy: dict[tuple[str, int, int], int] = {}
    teacher_busy: set[tuple[str, int, int]] = set()
    group_busy: set[tuple[str, int, int]] = set()
    room_usage: dict[str, int] = {r["id"]: 0 for r in catalog.ROOMS}

    for course_code, group_name, seq, room_id, day, slot in PINNED_SESSIONS:
        course = course_by_code[course_code]
        group = group_by_name[group_name]
        session = by_course_group.get((course["id"], group["id"], seq))
        if not session:
            raise RuntimeError(f"Invalid pinned session {course_code}/{group_name}/S{seq}")
        room = room_by_id[room_id]
        session["room_id"] = room_id
        session["day"] = day
        session["start_slot"] = slot
        pinned_ids.add(session["id"])
        for offset in range(session["length"]):
            t = slot + offset
            room_busy[(room_id, day, t)] = room_busy.get((room_id, day, t), 0) + 1
            teacher_busy.add((course["teacher_id"], day, t))
            group_busy.add((group["id"], day, t))
        room_usage[room_id] += 1

    # Assign remaining sessions greedily, spreading them across the estate.
    remaining = [s for s in sessions if s["id"] not in pinned_ids]
    remaining.sort(
        key=lambda s: (
            -catalog.COURSE_INDEX[s["course_id"]]["length"],
            -catalog.GROUP_INDEX[s["group_id"]]["size"],
            s["course_id"],
            s["group_id"],
            s["sequence"],
        )
    )

    for session in remaining:
        course = catalog.COURSE_INDEX[session["course_id"]]
        group = catalog.GROUP_INDEX[session["group_id"]]
        teacher = teacher_by_id[course["teacher_id"]]
        length = session["length"]
        best: tuple[float, str, int, int] | None = None
        for day in range(5):
            for slot in range(0, 7 - length + 1):
                if any((group["id"], day, slot + off) in group_busy for off in range(length)):
                    continue
                if any((teacher["id"], day, slot + off) in teacher_busy for off in range(length)):
                    continue
                if any(not teacher_available(teacher, day, slot + off) for off in range(length)):
                    continue
                for room in catalog.ROOMS:
                    if not allowed_rooms_for_course(course, room, group["size"]):
                        continue
                    if any((room["id"], day, slot + off) in room_busy for off in range(length)):
                        continue
                    capacity_slack = room["capacity"] - group["size"]
                    distance = catalog.travel_distance(group["home_building_id"], room["building_id"])
                    cost = (
                        capacity_slack * 0.55
                        + room_usage[room["id"]] * 6.0
                        + distance * 0.04
                        + slot * 0.3
                    )
                    if best is None or cost < best[0]:
                        best = (cost, room["id"], day, slot)
        if best is None:
            # Fallback: keep the timetable complete and let diagnostics report
            # the placement. This branch is not expected on the seed dataset.
            room = next(
                (r for r in catalog.ROOMS if allowed_rooms_for_course(course, r, group["size"], respect_capacity=False)),
                catalog.ROOMS[0],
            )
            best = (0.0, room["id"], 0, 0)

        _, room_id, day, slot = best
        session["room_id"] = room_id
        session["day"] = day
        session["start_slot"] = slot
        for off in range(length):
            t = slot + off
            room_busy[(room_id, day, t)] = room_busy.get((room_id, day, t), 0) + 1
            teacher_busy.add((course["teacher_id"], day, t))
            group_busy.add((group["id"], day, t))
        room_usage[room_id] += 1

    return sessions
