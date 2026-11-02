"""Canonical campus and scenario state.

The Difference Engine must compare the campus as it was when a scenario was
created with the state the simulation and solver actually used. Rebuilding
that baseline from the current database later is unsafe: the campus can be
edited after the run. This module therefore produces a JSON-safe snapshot at
scenario creation time and an explicit effective state for the scenario.

Both structures are deliberately plain dictionaries. They are persisted in
``Scenario.diagnostics`` so existing databases remain readable without a
schema migration.
"""

from __future__ import annotations

from copy import deepcopy

from . import catalog
from .campus import Campus
from .simulation import apply_scenario, build_context

STATE_VERSION = 1


def campus_state(campus: Campus) -> dict:
    """Return an immutable, JSON-safe snapshot of the baseline campus."""
    groups = deepcopy(campus.groups)
    rooms = deepcopy(campus.rooms)
    return {
        "version": STATE_VERSION,
        "dataset": catalog.DATASET_LABEL,
        "campus": {
            "name": catalog.CAMPUS_NAME,
            "source": "synthetic-demo",
        },
        "days": deepcopy(catalog.DAYS),
        "time_slots": deepcopy(catalog.TIME_SLOTS),
        "distances": deepcopy(catalog.DISTANCES),
        "buildings": deepcopy(campus.buildings),
        "rooms": rooms,
        "teachers": deepcopy(campus.teachers),
        "groups": groups,
        "courses": deepcopy(campus.courses),
        "group_courses": deepcopy(campus.group_courses),
        "sessions": deepcopy(campus.sessions),
        "summary": {
            "buildings": len(campus.buildings),
            "rooms": len(rooms),
            "classrooms": sum(1 for room in rooms if room.get("kind") == "classroom"),
            "labs": sum(1 for room in rooms if room.get("kind") == "lab"),
            "seat_capacity": sum(int(room.get("capacity") or 0) for room in rooms),
            "teachers": len(campus.teachers),
            "groups": len(groups),
            "students": sum(int(group.get("size") or 0) for group in groups),
            "courses": len(campus.courses),
            "sessions": len(campus.sessions),
        },
    }


def effective_state(campus: Campus, params: dict) -> dict:
    """Return the state the simulation and solver use for ``params``.

    The baseline campus is not mutated. Closed rooms and absent instructors
    remain in the state with an explicit availability flag so the difference
    engine can explain them without guessing from the parameter list.
    """
    ctx = build_context(campus, params)
    sessions, unassigned_details, _ = apply_scenario(campus, params)
    closed_rooms = set(ctx["unavailable_rooms"])
    absent_teachers = set(ctx["unavailable_teachers"])
    removed_equipment = set(ctx.get("removed_equipment") or set())

    rooms = []
    for room in campus.rooms:
        item = deepcopy(room)
        item["available"] = room["id"] not in closed_rooms
        item["scenario_capacity"] = int(room["capacity"])
        item["equipment"] = [
            equipment for equipment in (room.get("equipment") or []) if equipment not in removed_equipment
        ]
        rooms.append(item)

    teachers = []
    for teacher in campus.teachers:
        item = deepcopy(teacher)
        item["scenario_available"] = teacher["id"] not in absent_teachers
        item["max_weekly_hours"] = int(ctx["teacher_limits"].get(teacher["id"], teacher["max_weekly_hours"]))
        teachers.append(item)

    groups = []
    for group in campus.groups:
        item = deepcopy(group)
        item["scenario_size"] = int(ctx["group_sizes"].get(group["id"], group["size"]))
        groups.append(item)

    effective_sessions = []
    for session in sessions:
        item = deepcopy(session)
        if session.get("room_id") and session.get("day") is not None and session.get("start_slot") is not None:
            item["scenario_status"] = "scheduled"
        else:
            item["scenario_status"] = "displaced"
        effective_sessions.append(item)

    end_slot = int(ctx["end_slot"])
    return {
        "version": STATE_VERSION,
        "params": deepcopy(params),
        "rooms": rooms,
        "teachers": teachers,
        "groups": groups,
        "courses": deepcopy(campus.courses),
        "sessions": effective_sessions,
        "unassigned_details": deepcopy(unassigned_details),
        "policy": {
            "lab_policy": ctx["lab_policy"],
            "operating_end_slot": end_slot,
            "operating_end_time": catalog.TIME_SLOTS[end_slot]["end"],
            "energy_mode": ctx["energy_mode"],
            "energy_factor": ctx["energy_factor"],
            "lab_availability_pct": ctx.get("lab_availability_pct", 100),
            "unavailable_building_ids": list(ctx.get("unavailable_building_ids") or []),
            "removed_equipment": sorted(removed_equipment),
        },
        "summary": {
            "rooms": len(rooms),
            "available_rooms": sum(1 for room in rooms if room["available"]),
            "classrooms": sum(1 for room in rooms if room.get("kind") == "classroom"),
            "labs": sum(1 for room in rooms if room.get("kind") == "lab"),
            "available_labs": sum(
                1 for room in rooms if room.get("kind") == "lab" and room["available"]
            ),
            "seat_capacity": sum(int(room.get("scenario_capacity") or 0) for room in rooms),
            "available_seat_capacity": sum(
                int(room.get("scenario_capacity") or 0) for room in rooms if room["available"]
            ),
            "teachers": len(teachers),
            "available_teachers": sum(1 for teacher in teachers if teacher["scenario_available"]),
            "groups": len(groups),
            "students": sum(int(group.get("scenario_size") or 0) for group in groups),
            "sessions": len(effective_sessions),
            "scheduled_sessions": sum(
                1 for session in effective_sessions if session["scenario_status"] == "scheduled"
            ),
            "displaced_sessions": sum(
                1 for session in effective_sessions if session["scenario_status"] == "displaced"
            ),
        },
    }


def scenario_state(campus: Campus, params: dict) -> dict:
    """Build the persisted baseline/effective contract for one scenario."""
    return {
        "version": STATE_VERSION,
        "baseline": campus_state(campus),
        "effective": effective_state(campus, params),
    }


def state_summary(state: dict | None) -> dict:
    """Safely read a summary from a possibly legacy or malformed snapshot."""
    if not isinstance(state, dict):
        return {}
    summary = state.get("summary")
    return summary if isinstance(summary, dict) else {}
