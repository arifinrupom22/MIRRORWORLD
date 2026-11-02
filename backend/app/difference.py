"""Digital Twin Difference Engine.

The Difference Engine is the single source of truth for "what changed".
Alerts, severity and the natural-language layer must consume this result
instead of re-deriving scenario changes from parameter names or prose.

Every value here is computed from two serializable campus states, the
simulation's affected-session ledger, or already-computed metrics. No random
values and no language model output are used.
"""

from __future__ import annotations

from collections import defaultdict

from . import catalog

CATEGORY_LABELS = {
    "demand": "Demand",
    "infrastructure": "Infrastructure",
    "staffing": "Staffing",
    "policy": "Policy",
    "equipment": "Equipment",
    "sessions": "Timetable",
    "outcome": "Outcome",
}

DEFAULT_END_SLOT = 6
WALK_SLOT_HOURS = catalog.SLOT_HOURS


def _num(value) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _direction(before, after) -> str:
    before_num, after_num = _num(before), _num(after)
    if before_num is not None and after_num is not None:
        if after_num > before_num:
            return "increase"
        if after_num < before_num:
            return "decrease"
        return "unchanged"
    if before in (None, "", [], {}) and after not in (None, "", [], {}):
        return "added"
    if after in (None, "", [], {}) and before not in (None, "", [], {}):
        return "removed"
    return "changed"


def _delta(before, after):
    before_num, after_num = _num(before), _num(after)
    if before_num is None or after_num is None:
        return None
    return round(after_num - before_num, 2)


def _resource(resource_type: str, resource_id: str, label: str, reason: str | None = None) -> dict:
    return {
        "type": resource_type,
        "id": resource_id,
        "label": label,
        "reason": reason,
    }


def _change(
    change_id: str,
    kind: str,
    label: str,
    before,
    after,
    *,
    unit: str = "",
    description: str = "",
    affected_resources: list[dict] | None = None,
    affected_session_ids: list[str] | None = None,
    constraint_effects: list[str] | None = None,
    evidence: list[str] | None = None,
    why_it_matters: str = "",
) -> dict:
    return {
        "id": change_id,
        "kind": kind,
        "category": CATEGORY_LABELS.get(kind.split(".")[0], "Change"),
        "label": label,
        "description": description,
        "before": before,
        "after": after,
        "delta": _delta(before, after),
        "unit": unit,
        "direction": _direction(before, after),
        "affected_resources": affected_resources or [],
        "affected_session_ids": sorted(set(affected_session_ids or [])),
        "constraint_effects": constraint_effects or [],
        "evidence": evidence or [],
        "why_it_matters": why_it_matters,
    }


def _lookup(items: list[dict] | None) -> dict[str, dict]:
    return {str(item["id"]): item for item in (items or []) if item.get("id") is not None}


def _room_capacity(room: dict) -> int:
    return int(room.get("scenario_capacity") or room.get("capacity") or 0)


def _room_available(room: dict) -> bool:
    return bool(room.get("available", True))


def _group_size(group: dict) -> int:
    return int(group.get("scenario_size") or group.get("size") or 0)


def _is_lab_course(course: dict) -> bool:
    return bool(course.get("needs_lab"))


def _course_fits_room(course: dict, room: dict, size: int) -> bool:
    if not _room_available(room):
        return False
    if size > _room_capacity(room):
        return False
    if _is_lab_course(course):
        if room.get("kind") != "lab":
            return False
        if course.get("needs_lab") not in (room.get("lab_types") or []):
            return False
        if any(eq not in (room.get("equipment") or []) for eq in course.get("required_equipment") or []):
            return False
    elif room.get("kind") != "classroom":
        return False
    return True


def _session_ids_for(sessions: list[dict], predicate) -> list[str]:
    return [str(session["id"]) for session in sessions if predicate(session)]


def _session_label(session: dict, courses: dict[str, dict], groups: dict[str, dict]) -> str:
    course = courses.get(str(session.get("course_id")), {})
    group = groups.get(str(session.get("group_id")), {})
    return f"{course.get('code', session.get('course_id'))} · {group.get('name', session.get('group_id'))}"


def _affected_session_from_ledger(affected: dict | None) -> list[dict]:
    if not isinstance(affected, dict):
        return []
    sessions = affected.get("sessions")
    return sessions if isinstance(sessions, list) else []


def _metrics_value(metrics: dict | None, key: str) -> float | None:
    if not isinstance(metrics, dict):
        return None
    return _num(metrics.get(key))


def _capacity_pressure_sessions(
    baseline: dict,
    effective: dict,
    base_rooms: dict[str, dict],
    eff_rooms: dict[str, dict],
    eff_groups: dict[str, dict],
    base_sessions: dict[str, dict],
    eff_sessions: dict[str, dict],
) -> list[dict]:
    pressure = []
    for session_id, base in base_sessions.items():
        if base.get("room_id") is None or base.get("day") is None:
            continue
        room = base_rooms.get(str(base["room_id"]))
        if not room:
            continue
        group = eff_groups.get(str(base.get("group_id"))) or {}
        size = _group_size(group) if group else 0
        current_room = eff_rooms.get(str(base["room_id"]), room)
        if size > _room_capacity(room) and _room_available(current_room):
            effective_session = eff_sessions.get(session_id, base)
            pressure.append(
                {
                    "session_id": session_id,
                    "room_id": str(base["room_id"]),
                    "room_code": room.get("code") or str(base["room_id"]),
                    "group_id": str(base.get("group_id")),
                    "group_size": size,
                    "capacity": _room_capacity(room),
                    "deficit": size - _room_capacity(room),
                    "status": effective_session.get("scenario_status"),
                }
            )
    return pressure


def _closed_rooms(eff_rooms: dict[str, dict]) -> list[dict]:
    return [room for room in eff_rooms.values() if not _room_available(room)]


def _sessions_in_room(base_sessions: dict[str, dict], room_id: str) -> list[str]:
    return [
        session_id
        for session_id, session in base_sessions.items()
        if str(session.get("room_id") or "") == room_id
        and session.get("day") is not None
        and session.get("start_slot") is not None
    ]


def _sessions_for_teacher(base_sessions: dict[str, dict], courses: dict[str, dict], teacher_id: str) -> list[str]:
    course_ids = {course_id for course_id, course in courses.items() if str(course.get("teacher_id")) == teacher_id}
    return [session_id for session_id, session in base_sessions.items() if str(session.get("course_id")) in course_ids]


def _sessions_for_department(
    base_sessions: dict[str, dict],
    groups: dict[str, dict],
    department: str,
) -> list[str]:
    group_ids = {group_id for group_id, group in groups.items() if group.get("department") == department}
    return [
        session_id for session_id, session in base_sessions.items() if str(session.get("group_id")) in group_ids
    ]


def _candidate_rooms(
    course: dict,
    size: int,
    rooms: dict[str, dict],
    excluded: set[str],
    preferred_building: str | None = None,
) -> list[dict]:
    candidates = [
        room
        for room in rooms.values()
        if str(room.get("id")) not in excluded and _course_fits_room(course, room, size)
    ]
    candidates.sort(
        key=lambda room: (
            0 if preferred_building and room.get("building_id") == preferred_building else 1,
            -_room_capacity(room),
            str(room.get("code") or room.get("id")),
        )
    )
    return candidates


def _summarize(changes: list[dict], effective: dict, partial: bool, reason: str | None) -> str:
    if not changes:
        prefix = "Partial change analysis. " if partial else ""
        return prefix + "No material state changes were found between the baseline and this scenario."
    clauses = []
    for change in changes:
        if change["id"] == "demand.enrollment_total":
            verb = "increases" if change["direction"] == "increase" else "decreases"
            clauses.append(f"enrolment {verb} by {abs(int(change['delta'] or 0))}")
        elif change["id"] == "infrastructure.available_rooms":
            clauses.append(f"{abs(int(change['delta'] or 0))} room option(s) removed")
        elif change["id"] == "infrastructure.available_labs":
            clauses.append(f"{abs(int(change['delta'] or 0))} laboratory option(s) removed")
        elif change["kind"] == "staffing.teacher_unavailable":
            clauses.append(f"instructor {change['affected_resources'][0]['label'] if change['affected_resources'] else ''} unavailable")
        elif change["kind"] == "policy.operating_window":
            clauses.append(f"teaching day ends earlier at {change['after']}")
        elif change["kind"] == "policy.lab_policy":
            clauses.append("laboratory sessions restricted to afternoons")
        elif change["kind"] == "policy.energy_factor":
            clauses.append("efficiency factor applied to modelled energy")
    summary = "; ".join(dict.fromkeys(clauses))
    displaced = int(((effective.get("summary") or {}).get("displaced_sessions") or 0))
    if displaced:
        summary += f". {displaced} session(s) are displaced and require recovery"
    if partial and reason:
        summary = f"Partial change analysis ({reason}). " + summary
    return summary[:900]


def diff_states(
    baseline: dict,
    effective: dict,
    *,
    scenario_id: str | None = None,
    scenario_name: str | None = None,
    affected: dict | None = None,
    metrics: dict | None = None,
    baseline_metrics: dict | None = None,
    partial: bool = False,
    reason: str | None = None,
) -> dict:
    """Compare two canonical states and explain the operational consequences."""
    if not isinstance(baseline, dict) or not isinstance(effective, dict):
        return {
            "available": False,
            "partial": True,
            "scenario_id": scenario_id,
            "scenario_name": scenario_name,
            "reason": reason or "No state snapshot is available for this scenario.",
            "summary": "Change analysis is unavailable because the scenario has no state snapshot.",
            "assumptions": ["Legacy scenarios created before state snapshots cannot be diffed exactly."],
            "changes": [],
            "decisions": [],
            "counts": {},
        }

    base_rooms = _lookup(baseline.get("rooms"))
    eff_rooms = _lookup(effective.get("rooms"))
    base_teachers = _lookup(baseline.get("teachers"))
    eff_teachers = _lookup(effective.get("teachers"))
    base_groups = _lookup(baseline.get("groups"))
    eff_groups = _lookup(effective.get("groups"))
    courses = _lookup(baseline.get("courses")) or _lookup(effective.get("courses"))
    base_sessions = _lookup(baseline.get("sessions"))
    eff_sessions = _lookup(effective.get("sessions"))
    ledger = _affected_session_from_ledger(affected)
    ledger_ids = [str(item.get("session_id")) for item in ledger if item.get("session_id")]
    changed_group_ids = sorted(
        group_id
        for group_id in set(base_groups) | set(eff_groups)
        if _group_size(eff_groups.get(group_id, {})) != _group_size(base_groups.get(group_id, {}))
    )
    pressure = _capacity_pressure_sessions(
        baseline, effective, base_rooms, eff_rooms, eff_groups, base_sessions, eff_sessions
    )
    pressure_ids = [item["session_id"] for item in pressure]

    changes: list[dict] = []

    # ---------------------------------------------------------------- demand
    base_total = sum(_group_size(group) for group in base_groups.values())
    eff_total = sum(_group_size(group) for group in eff_groups.values())
    if eff_total != base_total:
        changes.append(
            _change(
                "demand.enrollment_total",
                "demand.enrollment",
                "Total enrolment",
                base_total,
                eff_total,
                unit="students",
                description="The number of modelled students in the scenario.",
                affected_resources=[
                    _resource("group", group_id, (eff_groups.get(group_id) or base_groups.get(group_id) or {}).get("name", group_id), "Enrolment changed")
                    for group_id in changed_group_ids
                ],
                affected_session_ids=pressure_ids,
                constraint_effects=[
                    "Room-capacity pressure increases with the same physical teaching spaces."
                    if eff_total > base_total
                    else "Capacity pressure eases, but the timetable still has to place every session."
                ],
                evidence=[
                    f"Baseline: {base_total:,} students.",
                    f"Scenario: {eff_total:,} students.",
                    f"Capacity-pressure sessions: {len(pressure)}.",
                ],
                why_it_matters=(
                    "More students competing for the same seats can push sessions over capacity or force larger rooms."
                    if eff_total > base_total
                    else "Fewer students reduce demand, but the timetable and room pool are otherwise unchanged."
                ),
            )
        )
        departments = sorted(
            {
                str(group.get("department") or "Unassigned")
                for group in list(base_groups.values()) + list(eff_groups.values())
            }
        )
        for department in departments:
            base_size = sum(
                _group_size(group) for group in base_groups.values() if group.get("department") == department
            )
            eff_size = sum(
                _group_size(group) for group in eff_groups.values() if group.get("department") == department
            )
            if eff_size == base_size:
                continue
            group_ids = sorted(
                group_id
                for group_id in set(base_groups) | set(eff_groups)
                if (base_groups.get(group_id) or eff_groups.get(group_id) or {}).get("department") == department
            )
            changes.append(
                _change(
                    f"demand.department.{department}",
                    "demand.department",
                    f"{department} enrolment",
                    base_size,
                    eff_size,
                    unit="students",
                    description=f"Enrolment change concentrated in {department}.",
                    affected_resources=[
                        _resource(
                            "group",
                            group_id,
                            (eff_groups.get(group_id) or base_groups.get(group_id) or {}).get("name", group_id),
                            "Department enrolment changed",
                        )
                        for group_id in group_ids
                    ],
                    affected_session_ids=[
                        session_id
                        for session_id in _sessions_for_department(base_sessions, base_groups, department)
                        if session_id in pressure_ids
                    ],
                    constraint_effects=["Capacity constraints are evaluated against the new cohort sizes."],
                    evidence=[f"{department}: {base_size:,} → {eff_size:,} students."],
                    why_it_matters="Cohort sizes are an input to room eligibility; this department's sessions change first.",
                )
            )

    # --------------------------------------------------------- infrastructure
    base_available_rooms = sum(1 for room in base_rooms.values() if _room_available(room))
    eff_available_rooms = sum(1 for room in eff_rooms.values() if _room_available(room))
    if eff_available_rooms != base_available_rooms:
        changes.append(
            _change(
                "infrastructure.available_rooms",
                "infrastructure.rooms",
                "Available rooms",
                base_available_rooms,
                eff_available_rooms,
                unit="rooms",
                description="Rooms that remain available to the timetable.",
                affected_resources=[
                    _resource("room", str(room["id"]), room.get("code") or str(room["id"]), "Closed")
                    for room in _closed_rooms(eff_rooms)
                ],
                affected_session_ids=_session_ids_for(
                    list(base_sessions.values()),
                    lambda session: str(session.get("room_id") or "") in {str(r["id"]) for r in _closed_rooms(eff_rooms)},
                ),
                constraint_effects=["Room non-overlap becomes tighter: fewer rooms must absorb the same sessions."],
                evidence=[f"Closed rooms: {len(_closed_rooms(eff_rooms))}."],
                why_it_matters="Every closed room removes a room-choice option and a block of seat capacity from the solver.",
            )
        )

    base_classrooms = sum(1 for room in base_rooms.values() if room.get("kind") == "classroom")
    eff_classrooms = sum(1 for room in eff_rooms.values() if room.get("kind") == "classroom" and _room_available(room))
    if eff_classrooms != base_classrooms:
        closed = [room for room in _closed_rooms(eff_rooms) if room.get("kind") == "classroom"]
        changes.append(
            _change(
                "infrastructure.available_classrooms",
                "infrastructure.classrooms",
                "Available classrooms",
                base_classrooms,
                eff_classrooms,
                unit="rooms",
                description="Classroom options available for non-laboratory teaching.",
                affected_resources=[
                    _resource("room", str(room["id"]), room.get("code") or str(room["id"]), "Classroom closed")
                    for room in closed
                ],
                affected_session_ids=_session_ids_for(
                    list(base_sessions.values()),
                    lambda session: str(session.get("room_id") or "") in {str(r["id"]) for r in closed},
                ),
                constraint_effects=["The classroom pool shrinks; capacity and no-overlap constraints tighten."],
                evidence=[f"Closed classrooms: {', '.join(room.get('code') or str(room['id']) for room in closed) or 'none'}."],
                why_it_matters="Non-lab courses can no longer use these rooms, so larger or farther rooms may be required.",
            )
        )

    base_labs = sum(1 for room in base_rooms.values() if room.get("kind") == "lab")
    eff_labs = sum(1 for room in eff_rooms.values() if room.get("kind") == "lab" and _room_available(room))
    if eff_labs != base_labs:
        closed_labs = [room for room in _closed_rooms(eff_rooms) if room.get("kind") == "lab"]
        lab_sessions = [
            session_id
            for session_id, session in base_sessions.items()
            if _is_lab_course(courses.get(str(session.get("course_id")), {}))
        ]
        changes.append(
            _change(
                "infrastructure.available_labs",
                "infrastructure.labs",
                "Available laboratories",
                base_labs,
                eff_labs,
                unit="labs",
                description="Laboratory options available for courses that require a specific lab type.",
                affected_resources=[
                    _resource("room", str(room["id"]), room.get("code") or str(room["id"]), "Laboratory closed")
                    for room in closed_labs
                ],
                affected_session_ids=lab_sessions,
                constraint_effects=[
                    "Laboratory eligibility tightens: every lab course needs a remaining room with the required type and equipment."
                ],
                evidence=[f"Closed labs: {', '.join(room.get('code') or str(room['id']) for room in closed_labs) or 'none'}."],
                why_it_matters="Laboratory sessions cannot use ordinary classrooms, so closing a lab can make a course infeasible.",
            )
        )

    base_capacity = sum(_room_capacity(room) for room in base_rooms.values())
    eff_capacity = sum(_room_capacity(room) for room in eff_rooms.values() if _room_available(room))
    if eff_capacity != base_capacity:
        changes.append(
            _change(
                "infrastructure.available_seat_capacity",
                "infrastructure.seats",
                "Available seat capacity",
                base_capacity,
                eff_capacity,
                unit="seats",
                description="Total seats in rooms that remain available.",
                affected_resources=[
                    _resource("room", str(room["id"]), room.get("code") or str(room["id"]), "Seats removed")
                    for room in _closed_rooms(eff_rooms)
                ],
                affected_session_ids=pressure_ids,
                constraint_effects=["Room-capacity constraints tighten in proportion to the lost seats."],
                evidence=[f"Closed rooms contribute {base_capacity - eff_capacity:,} seats."],
                why_it_matters="The same enrolment must fit into fewer seats, which can create capacity violations.",
            )
        )

    for room_id in sorted(eff_rooms):
        room = eff_rooms[room_id]
        base_room = base_rooms.get(room_id)
        if not base_room:
            continue
        if not _room_available(room):
            sessions = _sessions_in_room(base_sessions, room_id)
            changes.append(
                _change(
                    f"infrastructure.room_closed.{room_id}",
                    "infrastructure.room_closed",
                    f"Room {room.get('code') or room_id}",
                    "available",
                    "closed",
                    unit="status",
                    description=f"{room.get('name') or room_id} is removed from this scenario.",
                    affected_resources=[_resource("room", room_id, room.get("code") or room_id, "Closed")],
                    affected_session_ids=sessions,
                    constraint_effects=[
                        "Room non-overlap constraint no longer has this option.",
                        "Sessions in this room must be reassigned or displaced.",
                    ],
                    evidence=[
                        f"Building: {room.get('building_id')}.",
                        f"Kind: {room.get('kind')}.",
                        f"Capacity removed: {_room_capacity(base_room):,} seats.",
                        f"Baseline sessions in room: {len(sessions)}.",
                    ],
                    why_it_matters=f"{len(sessions)} baseline session(s) must find another eligible room or become displaced.",
                )
            )
        else:
            base_cap = _room_capacity(base_room)
            eff_cap = _room_capacity(room)
            if base_cap != eff_cap:
                changes.append(
                    _change(
                        f"infrastructure.room_capacity.{room_id}",
                        "infrastructure.room_capacity",
                        f"Capacity · {room.get('code') or room_id}",
                        base_cap,
                        eff_cap,
                        unit="seats",
                        description="Scenario-scoped room capacity override.",
                        affected_resources=[_resource("room", room_id, room.get("code") or room_id, "Capacity changed")],
                        affected_session_ids=_sessions_in_room(base_sessions, room_id),
                        constraint_effects=["Room-capacity eligibility changes for every session assigned here."],
                        evidence=[f"Baseline capacity {base_cap:,}; scenario capacity {eff_cap:,}."],
                        why_it_matters="A smaller room may make its assigned sessions ineligible; a larger room may admit more cohorts.",
                    )
                )
            if list(room.get("equipment") or []) != list(base_room.get("equipment") or []):
                lost = sorted(set(base_room.get("equipment") or []) - set(room.get("equipment") or []))
                gained = sorted(set(room.get("equipment") or []) - set(base_room.get("equipment") or []))
                changes.append(
                    _change(
                        f"equipment.room.{room_id}",
                        "equipment.room",
                        f"Equipment · {room.get('code') or room_id}",
                        base_room.get("equipment") or [],
                        room.get("equipment") or [],
                        unit="tags",
                        description="Equipment capability changes in this room.",
                        affected_resources=[_resource("room", room_id, room.get("code") or room_id, "Equipment changed")],
                        affected_session_ids=_sessions_in_room(base_sessions, room_id),
                        constraint_effects=["Facility eligibility changes for courses that require the affected equipment."],
                        evidence=[f"Lost: {', '.join(lost) or 'none'}. Gained: {', '.join(gained) or 'none'}."],
                        why_it_matters="A missing equipment tag can make an otherwise suitable room ineligible for a course.",
                    )
                )

    # Buildings become a single change when every room inside is closed.
    by_building: dict[str, list[dict]] = defaultdict(list)
    for room in base_rooms.values():
        by_building[str(room.get("building_id"))].append(room)
    for building_id, rooms in sorted(by_building.items()):
        closed = [
            room
            for room in rooms
            if str(room.get("id")) in eff_rooms and not _room_available(eff_rooms[str(room["id"])])
        ]
        if closed and len(closed) == len(rooms):
            building = next(
                (item for item in baseline.get("buildings", []) if str(item.get("id")) == building_id),
                {"id": building_id, "name": building_id, "code": building_id},
            )
            session_ids = []
            for room in rooms:
                session_ids.extend(_sessions_in_room(base_sessions, str(room["id"])))
            changes.append(
                _change(
                    f"infrastructure.building_closed.{building_id}",
                    "infrastructure.building_closed",
                    f"Building {building.get('code') or building_id}",
                    "available",
                    "closed",
                    unit="status",
                    description=f"All {len(rooms)} room(s) in {building.get('name') or building_id} are closed.",
                    affected_resources=[
                        _resource("building", building_id, building.get("name") or building_id, "All rooms closed")
                    ],
                    affected_session_ids=session_ids,
                    constraint_effects=["The entire building is removed from the room pool."],
                    evidence=[f"Closed rooms: {len(closed)} of {len(rooms)}."],
                    why_it_matters="A building closure removes an entire group of rooms and concentrates pressure on the rest of the campus.",
                )
            )

    # --------------------------------------------------------------- staffing
    absent = [teacher for teacher in eff_teachers.values() if not teacher.get("scenario_available", True)]
    for teacher in absent:
        teacher_id = str(teacher["id"])
        sessions = _sessions_for_teacher(base_sessions, courses, teacher_id)
        changes.append(
            _change(
                f"staffing.teacher_unavailable.{teacher_id}",
                "staffing.teacher_unavailable",
                f"Instructor {teacher.get('name') or teacher_id}",
                "available",
                "unavailable",
                unit="status",
                description="Instructor marked unavailable for the scenario.",
                affected_resources=[_resource("teacher", teacher_id, teacher.get("name") or teacher_id, "Unavailable")],
                affected_session_ids=sessions,
                constraint_effects=[
                    "Instructor non-overlap constraint loses this instructor entirely.",
                    "Every assigned session needs a substitute or a new timetable slot.",
                ],
                evidence=[f"Baseline sessions: {len(sessions)}."],
                why_it_matters=f"{len(sessions)} session(s) taught by this instructor cannot stay on the current timetable unchanged.",
            )
        )
    for teacher_id in sorted(set(base_teachers) | set(eff_teachers)):
        base_teacher = base_teachers.get(teacher_id) or {}
        eff_teacher = eff_teachers.get(teacher_id) or {}
        before_limit = base_teacher.get("max_weekly_hours")
        after_limit = eff_teacher.get("max_weekly_hours")
        if before_limit is not None and after_limit is not None and before_limit != after_limit:
            sessions = _sessions_for_teacher(base_sessions, courses, teacher_id)
            changes.append(
                _change(
                    f"staffing.weekly_limit.{teacher_id}",
                    "staffing.weekly_limit",
                    f"Weekly limit · {eff_teacher.get('name') or teacher_id}",
                    before_limit,
                    after_limit,
                    unit="hours",
                    description="Scenario-scoped instructor workload limit.",
                    affected_resources=[_resource("teacher", teacher_id, eff_teacher.get("name") or teacher_id, "Weekly limit changed")],
                    affected_session_ids=sessions,
                    constraint_effects=[
                        "Weekly teaching limits tighten." if float(after_limit) < float(before_limit) else "Weekly teaching limits loosen."
                    ],
                    evidence=[f"{before_limit}h → {after_limit}h."],
                    why_it_matters="The weekly limit is checked after assignment; with fixed session lengths it can make a workload infeasible.",
                )
            )

    # ----------------------------------------------------------------- policy
    policy = effective.get("policy") or {}
    end_slot = int(policy.get("operating_end_slot", DEFAULT_END_SLOT))
    base_end_slot = DEFAULT_END_SLOT
    if end_slot != base_end_slot:
        before_time = catalog.TIME_SLOTS[base_end_slot]["end"]
        after_time = catalog.TIME_SLOTS[end_slot]["end"]
        affected_sessions = [
            session_id
            for session_id, session in base_sessions.items()
            if session.get("start_slot") is not None
            and session.get("length")
            and int(session["start_slot"]) + int(session["length"]) - 1 > end_slot
        ]
        changes.append(
            _change(
                "policy.operating_window",
                "policy.operating_window",
                "Teaching window",
                before_time,
                after_time,
                unit="time",
                description="Latest permitted end of a teaching session.",
                affected_resources=[
                    _resource("policy", "operating_window", "Teaching window", "Operating hours changed")
                ],
                affected_session_ids=affected_sessions,
                constraint_effects=["Operating-window constraints tighten." if end_slot < base_end_slot else "Operating-window constraints loosen."],
                evidence=[
                    f"Baseline ends at {before_time}; scenario ends at {after_time}.",
                    f"Daily teaching hours: {(base_end_slot + 1) * WALK_SLOT_HOURS:.1f}h → {(end_slot + 1) * WALK_SLOT_HOURS:.1f}h.",
                ],
                why_it_matters="Sessions ending after the new boundary must be moved into the remaining day or become displaced.",
            )
        )
    lab_policy = policy.get("lab_policy", "default")
    if lab_policy != "default":
        affected = [
            session_id
            for session_id, session in base_sessions.items()
            if _is_lab_course(courses.get(str(session.get("course_id")), {}))
            and session.get("start_slot") is not None
            and int(session["start_slot"]) < 3
        ]
        changes.append(
            _change(
                "policy.lab_policy",
                "policy.lab_policy",
                "Laboratory scheduling policy",
                "any time",
                "afternoon only",
                unit="policy",
                description="Laboratory sessions may only start at 13:00 or later.",
                affected_resources=[_resource("policy", "lab_policy", "Lab policy", "Afternoon-only policy")],
                affected_session_ids=affected,
                constraint_effects=["Laboratory start domains shrink."],
                evidence=[f"Morning laboratory sessions in the baseline: {len(affected)}."],
                why_it_matters="Every morning lab session must move into the afternoon or become displaced.",
            )
        )
    energy_factor = _num(policy.get("energy_factor"))
    if energy_factor is not None and abs(energy_factor - 1.0) > 1e-9:
        changes.append(
            _change(
                "policy.energy_factor",
                "policy.energy_factor",
                "Energy factor",
                1.0,
                energy_factor,
                unit="factor",
                description="Multiplier applied to modelled room power.",
                affected_resources=[_resource("policy", "energy_factor", "Energy model", "Efficiency mode")],
                affected_session_ids=[],
                constraint_effects=["The energy objective becomes less costly; feasibility is unchanged."],
                evidence=[f"Modelled load is multiplied by {energy_factor:.2f}."],
                why_it_matters="This changes the estimated energy score and can change which recovery plan is recommended.",
            )
        )

    # --------------------------------------------------------------- timetable
    base_scheduled = sum(
        1
        for session in base_sessions.values()
        if session.get("room_id") is not None and session.get("day") is not None and session.get("start_slot") is not None
    )
    eff_scheduled = sum(1 for session in eff_sessions.values() if session.get("scenario_status") == "scheduled")
    if eff_scheduled != base_scheduled:
        displaced = [
            session_id
            for session_id, session in eff_sessions.items()
            if session.get("scenario_status") == "displaced"
        ]
        changes.append(
            _change(
                "sessions.scheduled",
                "sessions.scheduled",
                "Scheduled sessions",
                base_scheduled,
                eff_scheduled,
                unit="sessions",
                description="Sessions with a valid room and slot after the scenario is applied.",
                affected_resources=[],
                affected_session_ids=displaced,
                constraint_effects=["Displaced sessions require a recovery plan; they are not valid timetable entries."],
                evidence=[
                    f"Displaced sessions: {len(displaced)}.",
                    f"Reasons: {', '.join(f'{reason} × {count}' for reason, count in _reason_counts(effective).items()) or 'none'}.",
                ],
                why_it_matters="A session without a room and slot is not a valid schedule; the optimizer must rehouse or staff it.",
            )
        )

    # ---------------------------------------------------------------- outcome
    outcome_specs = [
        ("capacity_violations_count", "Capacity breaches", "", "lower", "Seats are insufficient for one or more cohorts."),
        ("conflicts_total", "Booking collisions", "collisions", "lower", "Resources are double-booked in the disrupted timetable."),
        ("energy_kwh", "Modelled weekly energy", "kWh", "lower", "The estimated load changes with rooms and policy."),
        ("movement_km", "Estimated weekly movement", "km", "lower", "Student travel between buildings changes with room assignment."),
        ("active_room_utilization_pct", "Active-room utilisation", "%", "higher", "The share of scheduled hours in rooms that are actually used."),
    ]
    for key, label, unit, direction, why in outcome_specs:
        before = _metrics_value(baseline_metrics, key)
        after = _metrics_value(metrics, key)
        if before is None or after is None or abs(after - before) < 1e-9:
            continue
        ids: list[str] = []
        resources: list[dict] = []
        if isinstance(metrics, dict):
            if key == "capacity_violations_count":
                for item in metrics.get("capacity_details", []) or []:
                    if item.get("session_id"):
                        ids.append(str(item["session_id"]))
                    if item.get("room_code"):
                        resources.append(_resource("room", str(item.get("room_code")), str(item.get("room_code")), "Capacity breach"))
            elif key == "conflicts_total":
                for conflict in metrics.get("conflict_details", []) or []:
                    for entry in conflict.get("sessions", []) or []:
                        if entry.get("id"):
                            ids.append(str(entry["id"]))
        changes.append(
            _change(
                f"outcome.{key}",
                f"outcome.{key}",
                label,
                round(before, 2),
                round(after, 2),
                unit=unit,
                description="Independently recomputed metric after applying the scenario.",
                affected_resources=resources[:20],
                affected_session_ids=ids or ledger_ids,
                constraint_effects=[],
                evidence=[f"Baseline {before:,.2f}; scenario {after:,.2f}."],
                why_it_matters=why,
            )
        )

    decisions = _build_decisions(
        changes=changes,
        baseline=baseline,
        effective=effective,
        base_rooms=base_rooms,
        eff_rooms=eff_rooms,
        base_sessions=base_sessions,
        eff_sessions=eff_sessions,
        courses=courses,
        eff_groups=eff_groups,
        pressure=pressure,
        metrics=metrics,
        ledger=ledger,
    )

    counts: dict[str, int] = defaultdict(int)
    for change in changes:
        counts[change["category"]] += 1
    return {
        "available": True,
        "partial": partial,
        "scenario_id": scenario_id,
        "scenario_name": scenario_name,
        "reason": reason,
        "summary": _summarize(changes, effective, partial, reason),
        "counts": dict(sorted(counts.items())),
        "changes": changes,
        "decisions": decisions,
        "assumptions": [
            "Diff values are computed from the state snapshot captured when the scenario was created.",
            "Affected sessions come from the simulation ledger and the baseline timetable; they are not estimated.",
            "Movement and energy values are modelled estimates, not measured consumption or tracking data.",
        ],
    }


def _reason_counts(effective: dict) -> dict[str, int]:
    counts: dict[str, int] = defaultdict(int)
    for item in effective.get("unassigned_details", []) or []:
        counts[str(item.get("reason") or "unassigned")] += 1
    return dict(sorted(counts.items(), key=lambda item: (-item[1], item[0])))


def _build_decisions(
    *,
    changes: list[dict],
    baseline: dict,
    effective: dict,
    base_rooms: dict[str, dict],
    eff_rooms: dict[str, dict],
    base_sessions: dict[str, dict],
    eff_sessions: dict[str, dict],
    courses: dict[str, dict],
    eff_groups: dict[str, dict],
    pressure: list[dict],
    metrics: dict | None,
    ledger: list[dict],
) -> list[dict]:
    decisions: list[dict] = []
    seen: set[str] = set()

    def add(decision_id: str, title: str, action: str, rationale: str, resources: list[dict], route: str, evidence: list[str]) -> None:
        if decision_id in seen:
            return
        seen.add(decision_id)
        decisions.append(
            {
                "id": decision_id,
                "title": title,
                "action": action,
                "rationale": rationale,
                "resources": resources,
                "route": route,
                "evidence": evidence,
            }
        )

    closed = _closed_rooms(eff_rooms)
    available_labs = [
        room for room in eff_rooms.values() if room.get("kind") == "lab" and _room_available(room)
    ]
    if closed and not available_labs:
        add(
            "decision.no_labs",
            "No laboratory remains available",
            "Reopen at least one laboratory or remove laboratory requirements before running the optimizer.",
            "Every laboratory in the campus is closed, so lab courses have no eligible room. The solver will report infeasibility rather than produce a schedule.",
            [_resource("room", str(room["id"]), room.get("code") or str(room["id"]), "Closed") for room in closed],
            "/simulation",
            [f"Available laboratories: {len(available_labs)}."],
        )

    for room in closed:
        room_id = str(room["id"])
        sessions = _sessions_in_room(base_sessions, room_id)
        if not sessions:
            continue
        course_group_pairs: dict[tuple[str, str], int] = defaultdict(int)
        for session_id in sessions:
            session = base_sessions[session_id]
            course_group_pairs[(str(session.get("course_id")), str(session.get("group_id")))] += 1
        chosen = None
        for (course_id, group_id), count in sorted(course_group_pairs.items()):
            course = courses.get(course_id) or {}
            group = eff_groups.get(group_id) or {}
            size = _group_size(group)
            candidates = _candidate_rooms(
                course,
                size,
                eff_rooms,
                excluded={room_id},
                preferred_building=str(room.get("building_id")),
            )
            if candidates:
                chosen = (course, group, count, candidates[0])
                break
        if chosen:
            course, group, count, candidate = chosen
            add(
                f"decision.reassign.{room_id}",
                f"Rehouse sessions from {room.get('code') or room_id}",
                f"Reassign {count} session(s) of {course.get('code') or 'the affected course'} to {candidate.get('code') or candidate.get('id')}.",
                f"An eligible room remains with {_room_capacity(candidate):,} seats for a cohort of {_group_size(group):,}. The optimizer must still confirm the slot.",
                [
                    _resource("room", room_id, room.get("code") or room_id, "Closed"),
                    _resource("room", str(candidate["id"]), candidate.get("code") or str(candidate["id"]), "Eligible alternative"),
                    _resource("group", str(group.get("id") or ""), group.get("name") or "Cohort", "Affected cohort"),
                ],
                "/optimizer",
                [f"Baseline sessions in the closed room: {len(sessions)}.", f"Alternative room candidates: {len(candidates)}."],
            )
        else:
            add(
                f"decision.no_replacement.{room_id}",
                f"No eligible replacement for {room.get('code') or room_id}",
                "Open another eligible room, reduce the affected cohort, or accept displacement for these sessions.",
                "The room is closed and no remaining room satisfies the course facility rules and cohort size.",
                [_resource("room", room_id, room.get("code") or room_id, "Closed")],
                "/simulation",
                [f"Baseline sessions in the closed room: {len(sessions)}."],
            )

    capacity_changed = any(
        change["id"] == "demand.enrollment_total"
        or change["kind"] in {"infrastructure.room_closed", "infrastructure.room_capacity"}
        or change["kind"] == "infrastructure.available_seat_capacity"
        for change in changes
    )
    if pressure and capacity_changed:
        deficit = sum(item["deficit"] for item in pressure)
        affected_rooms = sorted({item["room_code"] for item in pressure})
        add(
            "decision.capacity",
            "Resolve seat capacity pressure",
            f"Add at least {deficit:,} seats, split the affected cohorts, or move {len(pressure)} session(s) to larger rooms.",
            "Cohort sizes exceed the capacity of their assigned rooms after the scenario change.",
            [_resource("room", room, room, "Capacity breach") for room in affected_rooms[:12]],
            "/optimizer",
            [f"Capacity-pressure sessions: {len(pressure)}.", f"Total seat deficit: {deficit:,}."],
        )

    absent = [teacher for teacher in _lookup(effective.get("teachers")).values() if not teacher.get("scenario_available", True)]
    for teacher in absent:
        teacher_id = str(teacher["id"])
        sessions = _sessions_for_teacher(base_sessions, courses, teacher_id)
        if not sessions:
            continue
        add(
            f"decision.teacher.{teacher_id}",
            f"Cover sessions for {teacher.get('name') or teacher_id}",
            "Assign a substitute or adjust the weekly availability, then run the optimizer to rebuild the affected sessions.",
            "An unavailable instructor removes every one of their sessions from the feasible timetable until a replacement is assigned.",
            [_resource("teacher", teacher_id, teacher.get("name") or teacher_id, "Unavailable")],
            "/optimizer",
            [f"Affected sessions: {len(sessions)}."],
        )

    displaced = [
        session_id
        for session_id, session in eff_sessions.items()
        if session.get("scenario_status") == "displaced"
    ]
    if displaced:
        reasons = _reason_counts(effective)
        add(
            "decision.displaced",
            "Recover displaced sessions",
            f"Generate recovery plans for {len(displaced)} displaced session(s) after reviewing the changed constraints.",
            "Displaced sessions have no valid room and slot in the disrupted timetable and are not a usable schedule.",
            [],
            "/optimizer",
            [f"Displacement reasons: {', '.join(f'{key} × {value}' for key, value in reasons.items()) or 'unassigned'}."],
        )

    if not decisions:
        add(
            "decision.none",
            "No recovery action required",
            "Keep the current timetable; the scenario does not change state in a way that requires reassignment.",
            "No rooms, instructors, cohorts or policies changed, so the baseline and scenario are operationally identical.",
            [],
            "/simulation",
            [f"Changes detected: {len(changes)}."],
        )
    return decisions


def legacy_difference(
    campus,
    scenario,
    *,
    affected: dict | None = None,
    metrics: dict | None = None,
    baseline_metrics: dict | None = None,
) -> dict:
    """Best-effort difference for scenarios created before state snapshots.

    The current campus is used as a fallback baseline, so the result is marked
    partial. It never pretends to know the original campus exactly.
    """
    from .state import campus_state, effective_state

    baseline = campus_state(campus)
    effective = effective_state(campus, scenario.params or {})
    return diff_states(
        baseline,
        effective,
        scenario_id=scenario.id,
        scenario_name=scenario.name,
        affected=affected,
        metrics=metrics,
        baseline_metrics=baseline_metrics,
        partial=True,
        reason="This scenario predates state snapshots. The current campus is used as a fallback baseline.",
    )
