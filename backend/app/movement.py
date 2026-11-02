"""Student movement service for MIRRORWORLD.

Computes timetable-based pedestrian movement flows between campus buildings
during session transitions, evaluates walking feasibility, identifies tight
transitions, and detects missing distance data.
"""

from __future__ import annotations

from collections import defaultdict

from . import catalog
from .campus import Campus
from .schemas import MovementResponse, MovementSummary, MovementTransition
from .state import effective_state

DEFAULT_WALKING_SPEED_M_PER_MIN = 84.0  # 1.4 m/s pedestrian standard


def _time_str_to_min(time_str: str) -> int:
    """Convert 'HH:MM' string to minutes from midnight."""
    hours, minutes = map(int, time_str.split(":"))
    return hours * 60 + minutes


def compute_movement(
    campus: Campus,
    params: dict | None = None,
    day: int | None = None,
    slot: int | None = None,
    scenario_id: str | None = None,
) -> MovementResponse:
    """Compute student transitions across scheduled timetable sessions."""
    params = params or {}
    effective = effective_state(campus, params)
    effective_sessions = effective.get("sessions", [])
    group_sizes = {
        g["id"]: int(g.get("scenario_size", g.get("size", 0)))
        for g in effective.get("groups", [])
    }

    warnings: list[str] = []
    all_transitions: list[MovementTransition] = []

    # Group sessions by cohort (student group)
    cohort_sessions_map: dict[str, list[dict]] = defaultdict(list)
    for session in effective_sessions:
        cohort_sessions_map[session["group_id"]].append(session)

    # Validate each cohort's sequence
    for group_id, sessions in cohort_sessions_map.items():
        cohort = campus.group_index.get(group_id, {})
        cohort_name = cohort.get("name", group_id)
        student_count = group_sizes.get(group_id, cohort.get("size", 0))

        # Sort chronologically by day, start_slot, and id
        sessions_sorted = sorted(
            sessions,
            key=lambda s: (
                s.get("day") if s.get("day") is not None else -1,
                s.get("start_slot") if s.get("start_slot") is not None else -1,
                s.get("id", ""),
            ),
        )

        # Inspect consecutive sessions strictly (A -> B -> C: if B is displaced,
        # we do not connect A directly to C, but omit A->B and B->C)
        for i in range(len(sessions_sorted) - 1):
            s1 = sessions_sorted[i]
            s2 = sessions_sorted[i + 1]

            # Check eligibility: displaced, unassigned, or missing schedule details
            if (
                s1.get("scenario_status") == "displaced"
                or not s1.get("room_id")
                or s1.get("day") is None
                or s1.get("start_slot") is None
            ):
                warnings.append(
                    f"Cohort {cohort_name}: Session {s1.get('id', 'unassigned')} is displaced or has no room; transition omitted."
                )
                continue

            if (
                s2.get("scenario_status") == "displaced"
                or not s2.get("room_id")
                or s2.get("day") is None
                or s2.get("start_slot") is None
            ):
                warnings.append(
                    f"Cohort {cohort_name}: Session {s2.get('id', 'unassigned')} is displaced or has no room; transition omitted."
                )
                continue

            # Check room validity
            room1 = campus.room_index.get(s1["room_id"])
            room2 = campus.room_index.get(s2["room_id"])
            if not room1 or not room2:
                warnings.append(
                    f"Cohort {cohort_name}: Unknown room reference ({s1.get('room_id')} or {s2.get('room_id')})."
                )
                continue

            d1 = s1["day"]
            d2 = s2["day"]

            # Validate day boundaries
            if d1 < 0 or d1 >= len(catalog.DAYS) or d2 < 0 or d2 >= len(catalog.DAYS):
                warnings.append(
                    f"Cohort {cohort_name}: Invalid day index ({d1} or {d2})."
                )
                continue

            # Rule: Do not generate transitions across the weekly boundary
            # (e.g. Fri -> Mon or any backwards-in-week transition).
            if d2 < d1:
                warnings.append(
                    f"Cohort {cohort_name}: Transition across weekly boundary ({catalog.DAYS[d1]['label']} to {catalog.DAYS[d2]['label']}) omitted."
                )
                continue
            if d2 == d1 and s2['start_slot'] <= s1['start_slot']:
                continue
            if (d2 - d1) >= catalog.TEACHING_DAYS - 1:
                warnings.append(
                    f"Cohort {cohort_name}: Transition across weekly boundary ({catalog.DAYS[d1]['label']} to {catalog.DAYS[d2]['label']}) omitted."
                )
                continue

            slot1_start = s1["start_slot"]

            slot1_len = s1.get("length", 1)
            slot1_end = slot1_start + slot1_len - 1

            slot2_start = s2["start_slot"]
            slot2_len = s2.get("length", 1)
            slot2_end = slot2_start + slot2_len - 1

            if (
                slot1_start < 0
                or slot1_end >= len(catalog.TIME_SLOTS)
                or slot2_start < 0
                or slot2_end >= len(catalog.TIME_SLOTS)
            ):
                warnings.append(
                    f"Cohort {cohort_name}: Session slot index out of range ({slot1_start}..{slot1_end} or {slot2_start}..{slot2_end})."
                )
                continue

            # Calculate precise start and end times using TIME_SLOTS catalog
            s1_end_time_str = catalog.TIME_SLOTS[slot1_end]["end"]
            s2_start_time_str = catalog.TIME_SLOTS[slot2_start]["start"]
            s1_end_min = _time_str_to_min(s1_end_time_str)
            s2_start_min = _time_str_to_min(s2_start_time_str)

            if d1 == d2:
                is_cross_day = False
                gap_min = s2_start_min - s1_end_min
                if gap_min < 0:
                    warnings.append(
                        f"Cohort {cohort_name}: Overlapping sessions on {catalog.DAYS[d1]['label']} between {s1['id']} and {s2['id']} (overlap of {-gap_min} min); omitted."
                    )
                    continue
                time_gap_min = gap_min
            else:
                is_cross_day = True
                # Transitions that wrap across the weekly boundary (for example
                # Friday back to Monday) are already omitted above. For same-week
                # cross-day transitions, compute the gap using calendar minutes.
                time_gap_min = (
                    (24 * 60 - s1_end_min)
                    + ((d2 - d1 - 1) * 24 * 60)
                    + s2_start_min
                )

            # Building resolution
            b1_id = room1["building_id"]
            b2_id = room2["building_id"]
            b1_name = campus.building_index.get(b1_id, {}).get("name", b1_id)
            b2_name = campus.building_index.get(b2_id, {}).get("name", b2_id)
            same_building = b1_id == b2_id

            # Distance resolution
            has_configured_distance = (
                b1_id in catalog.DISTANCES and b2_id in catalog.DISTANCES[b1_id]
            )

            if has_configured_distance:
                distance_m = catalog.DISTANCES[b1_id][b2_id]
                unknown_distance = False
                walking_time_min = round(
                    distance_m / DEFAULT_WALKING_SPEED_M_PER_MIN, 2
                )
                feasible = bool(walking_time_min <= time_gap_min)
                tight = bool(time_gap_min <= 2 * walking_time_min)
            elif same_building:
                # Same building without explicit catalog distance entry is legitimately zero distance
                distance_m = 0
                unknown_distance = False
                walking_time_min = 0.0
                feasible = True
                tight = False
            else:
                # Inter-building transition with missing distance in catalog
                distance_m = None
                unknown_distance = True
                walking_time_min = None
                feasible = None
                tight = None
                warnings.append(
                    f"Cohort {cohort_name}: Missing distance entry between {b1_id} and {b2_id}; transition marked unverified."
                )

            course1 = campus.course_index.get(s1["course_id"], {})
            course2 = campus.course_index.get(s2["course_id"], {})

            all_transitions.append(
                MovementTransition(
                    transition_id=f"{group_id}_{s1['id']}_{s2['id']}",
                    cohort_id=group_id,
                    cohort_name=cohort_name,
                    student_count=student_count,
                    from_session_id=s1["id"],
                    from_course_code=course1.get("code", s1["course_id"]),
                    from_room_id=s1["room_id"],
                    from_building_id=b1_id,
                    from_building_name=b1_name,
                    from_day=d1,
                    from_slot=slot1_end,
                    from_time=s1_end_time_str,
                    to_session_id=s2["id"],
                    to_course_code=course2.get("code", s2["course_id"]),
                    to_room_id=s2["room_id"],
                    to_building_id=b2_id,
                    to_building_name=b2_name,
                    to_day=d2,
                    to_slot=slot2_start,
                    to_time=s2_start_time_str,
                    time_gap_min=time_gap_min,
                    distance_m=distance_m,
                    walking_time_min=walking_time_min,
                    feasible=feasible,
                    tight=tight,
                    unknown_distance=unknown_distance,
                    same_building=same_building,
                    is_cross_day=is_cross_day,
                )
            )

    # Filter transitions if requested by day and/or slot
    filtered = all_transitions
    if day is not None:
        filtered = [
            t
            for t in filtered
            if (t.to_day == day if t.is_cross_day else t.from_day == day)
        ]
    if slot is not None:
        # Match transitions into the requested slot
        filtered = [t for t in filtered if t.to_slot == slot]

    # Summary metrics
    unique_routes = len(
        set((t.from_building_id, t.to_building_id) for t in filtered)
    )
    total_transitions = len(filtered)
    total_students = sum(t.student_count for t in filtered)
    # Student-distance in student-metres and student walking time in student-minutes
    total_distance_m = sum(
        t.distance_m * t.student_count for t in filtered if t.distance_m is not None
    )
    total_walking_time_min = round(
        sum(
            t.walking_time_min * t.student_count
            for t in filtered
            if t.walking_time_min is not None
        ),
        2,
    )
    tight_transitions = sum(1 for t in filtered if t.tight is True)
    infeasible_transitions = sum(1 for t in filtered if t.feasible is False)
    unknown_distance_transitions = sum(1 for t in filtered if t.unknown_distance)
    same_building_transitions = sum(1 for t in filtered if t.same_building)
    cross_day_transitions = sum(1 for t in filtered if t.is_cross_day)

    summary = MovementSummary(
        unique_routes=unique_routes,
        total_transitions=total_transitions,
        total_students=total_students,
        total_distance_m=total_distance_m,
        total_walking_time_min=total_walking_time_min,
        tight_transitions=tight_transitions,
        infeasible_transitions=infeasible_transitions,
        unknown_distance_transitions=unknown_distance_transitions,
        same_building_transitions=same_building_transitions,
        cross_day_transitions=cross_day_transitions,
        warning_count=len(warnings),
    )

    return MovementResponse(
        scenario_id=scenario_id,
        day=day,
        slot=slot,
        transitions=filtered,
        summary=summary,
        warnings=warnings,
    )
