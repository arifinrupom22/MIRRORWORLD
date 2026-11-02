"""Server-side scenario templates.

Each template derives its defaults from the current campus and returns a full
``ScenarioParams`` object. The frontend can load the parameters and let the
administrator edit them before running the real simulation.
"""

from __future__ import annotations

from collections import Counter

from .campus import Campus
from .schemas import ScenarioParams


def _params(**overrides) -> dict:
    base = ScenarioParams().model_dump()
    base.update(overrides)
    return base


def _field(key: str, label: str, value, unit: str = "", source: str = "campus") -> dict:
    return {"key": key, "label": label, "value": value, "unit": unit, "source": source}


def _lab_session_counts(campus: Campus) -> Counter:
    counts: Counter = Counter()
    for session in campus.sessions:
        room = campus.room_index.get(str(session.get("room_id")))
        if room and room.get("kind") == "lab":
            counts[str(room["id"])] += 1
    return counts


def _teacher_session_counts(campus: Campus) -> Counter:
    counts: Counter = Counter()
    for session in campus.sessions:
        course = campus.course_index.get(str(session.get("course_id")))
        if course:
            counts[str(course.get("teacher_id"))] += 1
    return counts


def build_templates(campus: Campus) -> list[dict]:
    total_students = sum(group["size"] for group in campus.groups)
    lab_counts = _lab_session_counts(campus)
    teacher_counts = _teacher_session_counts(campus)
    labs = [room for room in campus.rooms if room.get("kind") == "lab"]
    classrooms = [room for room in campus.rooms if room.get("kind") == "classroom"]
    buildings = sorted(campus.buildings, key=lambda item: str(item["id"]))

    biggest_lab = max(labs, key=lambda room: (lab_counts.get(str(room["id"]), 0), room["capacity"]), default=None)
    busiest_teachers = [
        teacher
        for teacher, _count in sorted(
            teacher_counts.items(), key=lambda item: (-item[1], item[0])
        )[:2]
        if teacher in campus.teacher_index
    ]
    smallest_classrooms = sorted(classrooms, key=lambda room: (room["capacity"], room["code"]))[:2]
    busiest_building = max(
        buildings,
        key=lambda building: sum(
            1 for room in campus.rooms if room["building_id"] == building["id"]
        ),
        default=None,
    )

    templates = []

    templates.append(
        {
            "id": "enrollment_expansion",
            "name": "Enrollment Expansion",
            "description": "Increase intake while holding the physical room pool fixed.",
            "category": "Demand",
            "params": _params(enrollment_delta=max(50, round(total_students * 0.18 / 10) * 10)),
            "fields": [
                _field("enrollment_delta", "Student increase", max(50, round(total_students * 0.18 / 10) * 10), "students"),
            ],
            "assumptions": [
                "The increase is distributed proportionally across all cohorts by the simulation engine.",
                "No new rooms or instructors are added.",
            ],
        }
    )

    lab_params = _params(unavailable_room_ids=[str(biggest_lab["id"])] if biggest_lab else [])
    templates.append(
        {
            "id": "laboratory_shutdown",
            "name": "Laboratory Shutdown",
            "description": "Remove the laboratory with the largest timetabled load.",
            "category": "Infrastructure",
            "params": lab_params,
            "fields": [
                _field(
                    "unavailable_room_ids",
                    "Laboratory",
                    biggest_lab["code"] if biggest_lab else "none available",
                    source="campus",
                )
            ],
            "assumptions": [
                "The laboratory is removed from both capacity and slot eligibility for the whole scenario.",
                "No equipment is reassigned to another room.",
            ],
        }
    )

    templates.append(
        {
            "id": "teacher_shortage",
            "name": "Teacher Shortage",
            "description": "Simulate the absence of the two most heavily timetabled instructors.",
            "category": "Staffing",
            "params": _params(unavailable_teacher_ids=busiest_teachers),
            "fields": [
                _field(
                    "unavailable_teacher_ids",
                    "Absent instructors",
                    ", ".join(campus.teacher_index[t]["name"] for t in busiest_teachers) or "none",
                    source="campus",
                )
            ],
            "assumptions": ["No substitute instructor is invented; affected sessions must be rehoused to an available teacher’s course structure or shown as displaced."],
        }
    )

    classroom_ids = [str(room["id"]) for room in smallest_classrooms]
    templates.append(
        {
            "id": "classroom_overcrowding",
            "name": "Classroom Overcrowding",
            "description": "Add students and remove the smallest classrooms to expose seat pressure.",
            "category": "Infrastructure",
            "params": _params(enrollment_delta=100, unavailable_room_ids=classroom_ids),
            "fields": [
                _field("enrollment_delta", "Student increase", 100, "students"),
                _field(
                    "unavailable_room_ids",
                    "Closed classrooms",
                    ", ".join(room["code"] for room in smallest_classrooms) or "none",
                    source="campus",
                ),
            ],
            "assumptions": ["The smallest classrooms are chosen by seat capacity, then room code."],
        }
    )

    templates.append(
        {
            "id": "energy_conservation",
            "name": "Energy Conservation",
            "description": "Apply the efficiency factor and end teaching one slot earlier.",
            "category": "Policy",
            "params": _params(energy_mode="efficiency", operating_end_slot=5),
            "fields": [
                _field("energy_mode", "Energy mode", "efficiency", source="policy"),
                _field("operating_end_slot", "Teaching window end", "17:50", source="policy"),
            ],
            "assumptions": [
                "Efficiency mode applies a documented 0.90 factor to modelled room load.",
                "The teaching day ends after slot 5 (17:50), not the default 19:30.",
            ],
        }
    )

    templates.append(
        {
            "id": "emergency_campus_disruption",
            "name": "Emergency Campus Disruption",
            "description": "Combine a building outage, instructor absence and afternoon-only laboratories.",
            "category": "Emergency",
            "params": _params(
                unavailable_building_ids=[str(busiest_building["id"])] if busiest_building else [],
                unavailable_teacher_ids=busiest_teachers[:1],
                lab_policy="afternoon_only",
            ),
            "fields": [
                _field(
                    "unavailable_building_ids",
                    "Closed building",
                    busiest_building["name"] if busiest_building else "none",
                    source="campus",
                ),
                _field("unavailable_teacher_ids", "Absent instructor", campus.teacher_index[busiest_teachers[0]]["name"] if busiest_teachers else "none", source="campus"),
                _field("lab_policy", "Laboratory policy", "afternoon only", source="policy"),
            ],
            "assumptions": ["All rooms in the selected building are removed; no room is opened elsewhere."],
        }
    )

    templates.append(
        {
            "id": "semester_restructuring",
            "name": "Semester Timetable Restructuring",
            "description": "Compress the teaching day, restrict laboratories to the afternoon and remove one room.",
            "category": "Policy",
            "params": _params(
                operating_end_slot=5,
                lab_policy="afternoon_only",
                unavailable_room_ids=[str(smallest_classrooms[0]["id"])] if smallest_classrooms else [],
            ),
            "fields": [
                _field("operating_end_slot", "Teaching window end", "17:50", source="policy"),
                _field("lab_policy", "Laboratory policy", "afternoon only", source="policy"),
                _field("unavailable_room_ids", "Closed room", smallest_classrooms[0]["code"] if smallest_classrooms else "none", source="campus"),
            ],
            "assumptions": [
                "Session lengths are not changed in this build; the restructured week is expressed as a shorter operating window plus laboratory timing and one room closure.",
            ],
        }
    )

    return templates
