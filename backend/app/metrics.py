"""Transparent schedule diagnostics and KPI calculations.

Every value in this module is derived from the timetable and campus data.
Formulas follow the MIRRORWORLD documentation (Section 11); the active-room
utilisation complement is documented in the implementation report.
"""

from __future__ import annotations

from collections import defaultdict
from statistics import pstdev

from . import catalog
from .campus import Campus, session_view

MAX_DETAILS = 120


def _slot_label(day: int | None, slot: int | None) -> str:
    if day is None or slot is None:
        return "—"
    day_label = catalog.DAYS[day]["short"] if 0 <= day < len(catalog.DAYS) else "?"
    slot_label = catalog.TIME_SLOTS[slot]["label"] if 0 <= slot < len(catalog.TIME_SLOTS) else "?"
    return f"{day_label} {slot_label}"


def _pair_key(*ids: str) -> tuple:
    return tuple(sorted(ids))


def compute_metrics(
    campus: Campus,
    sessions: list[dict],
    group_sizes: dict[str, int],
    *,
    energy_factor: float = 1.0,
    operating_end_slot: int = 6,
    available_room_ids: set[str] | None = None,
    unassigned_details: list[dict] | None = None,
    removed_equipment: set[str] | None = None,
    teacher_limits: dict[str, int] | None = None,
) -> dict:
    available_room_ids = set(available_room_ids) if available_room_ids is not None else {r["id"] for r in campus.rooms}
    unassigned_details = unassigned_details or []

    views: list[dict] = []
    unassigned: list[dict] = []
    for session in sessions:
        view = session_view(campus, session, group_sizes.get(session["group_id"]))
        if session.get("room_id") and session.get("day") is not None and session.get("start_slot") is not None:
            views.append(view)
        else:
            unassigned.append(
                {
                    "session_id": view["id"],
                    "label": f"{view['course_code']} · {view['group_name']}",
                    "reason": session.get("displaced_reason") or "unassigned",
                    "detail": session.get("displaced_detail") or "No valid room/slot assigned.",
                    "group_name": view["group_name"],
                    "teacher_name": view["teacher_name"],
                }
            )
    for item in unassigned_details:
        unassigned.append(item)

    room_slot: dict[tuple, list[dict]] = defaultdict(list)
    teacher_slot: dict[tuple, list[dict]] = defaultdict(list)
    group_slot: dict[tuple, list[dict]] = defaultdict(list)
    slot_power: dict[tuple, dict[str, float]] = defaultdict(dict)

    for v in views:
        for offset in range(v["length"]):
            t = v["start_slot"] + offset
            room_slot[(v["room_id"], v["day"], t)].append(v)
            teacher_slot[(v["teacher_id"], v["day"], t)].append(v)
            group_slot[(v["group_id"], v["day"], t)].append(v)
            power = v["room_power_kw"] + (v["room_equipment_kw"] if v["needs_lab"] else 0.0)
            slot_power[(v["day"], t)][v["room_id"]] = max(slot_power[(v["day"], t)].get(v["room_id"], 0.0), power)

    conflict_map: dict[tuple, dict] = {}
    conflict_counts = {"room": 0, "teacher": 0, "group": 0}

    def register(kind: str, resource_label: str, day: int, slot: int, entries: list[dict]) -> None:
        for i in range(len(entries)):
            for j in range(i + 1, len(entries)):
                a, b = entries[i], entries[j]
                if a["id"] == b["id"]:
                    continue
                key = (kind, _pair_key(a["id"], b["id"]))
                if key in conflict_map:
                    continue
                conflict_map[key] = {
                    "type": kind,
                    "resource": resource_label,
                    "day": day,
                    "slot": slot,
                    "slot_label": _slot_label(day, slot),
                    "sessions": [
                        {
                            "id": a["id"],
                            "label": f"{a['course_code']} · {a['group_name']}",
                            "room_code": a["room_code"],
                            "teacher_name": a["teacher_name"],
                        },
                        {
                            "id": b["id"],
                            "label": f"{b['course_code']} · {b['group_name']}",
                            "room_code": b["room_code"],
                            "teacher_name": b["teacher_name"],
                        },
                    ],
                }

    for (room_id, day, slot), entries in room_slot.items():
        if len(entries) > 1:
            register("room", campus.room_index[room_id]["code"], day, slot, entries)
    for (teacher_id, day, slot), entries in teacher_slot.items():
        if len(entries) > 1:
            register("teacher", campus.teacher_index[teacher_id]["name"], day, slot, entries)
    for (group_id, day, slot), entries in group_slot.items():
        if len(entries) > 1:
            register("group", campus.group_index[group_id]["name"], day, slot, entries)

    for value in conflict_map.values():
        conflict_counts[value["type"]] += 1

    capacity_details: list[dict] = []
    capacity_total = 0
    facility_details: list[dict] = []
    availability_details: list[dict] = []
    for v in views:
        room = campus.room_index[v["room_id"]]
        if v["group_size"] > room["capacity"]:
            violation = v["group_size"] - room["capacity"]
            capacity_total += violation
            capacity_details.append(
                {
                    "session_id": v["id"],
                    "label": f"{v['course_code']} · {v['group_name']}",
                    "room_code": room["code"],
                    "group_size": v["group_size"],
                    "capacity": room["capacity"],
                    "violation": violation,
                    "slot_label": _slot_label(v["day"], v["start_slot"]),
                }
            )
        course = campus.course_index[v["course_id"]]
        mismatch_reason = None
        if course.get("needs_lab"):
            if room["kind"] != "lab":
                mismatch_reason = f"Requires a {course['needs_lab']} lab; assigned room is a classroom."
            elif course["needs_lab"] not in (room.get("lab_types") or []):
                supported = ", ".join(room.get("lab_types") or []) or "no lab types"
                mismatch_reason = f"Requires a {course['needs_lab']} lab; {room['code']} supports {supported}."
            else:
                available_equipment = set(room.get("equipment") or []) - set(removed_equipment or set())
                missing = [e for e in course.get("required_equipment") or [] if e not in available_equipment]
                if missing:
                    mismatch_reason = f"Missing equipment: {', '.join(missing)}."
        if mismatch_reason:
            facility_details.append(
                {
                    "session_id": v["id"],
                    "label": f"{v['course_code']} · {v['group_name']}",
                    "room_code": room["code"],
                    "reason": mismatch_reason,
                    "slot_label": _slot_label(v["day"], v["start_slot"]),
                }
            )
        teacher = campus.teacher_index[v["teacher_id"]]
        unavailable = {tuple(x) for x in teacher.get("unavailable", [])}
        for offset in range(v["length"]):
            if (v["day"], v["start_slot"] + offset) in unavailable:
                availability_details.append(
                    {
                        "session_id": v["id"],
                        "label": f"{v['course_code']} · {v['group_name']}",
                        "teacher_name": teacher["name"],
                        "slot_label": _slot_label(v["day"], v["start_slot"] + offset),
                        "reason": "Teacher marked unavailable in this slot.",
                    }
                )
                break

    duration_hours = sum(v["length"] * catalog.SLOT_HOURS for v in views)
    energy_kwh = 0.0
    for v in views:
        power = v["room_power_kw"] + (v["room_equipment_kw"] if v["needs_lab"] else 0.0)
        energy_kwh += v["length"] * catalog.SLOT_HOURS * power
    energy_kwh *= energy_factor

    peak_kw = 0.0
    peak_slot_label = "—"
    for (day, slot), rooms in slot_power.items():
        total = sum(rooms.values())
        if total > peak_kw:
            peak_kw = total
            peak_slot_label = _slot_label(day, slot)

    rooms_used = {v["room_id"] for v in views}
    slots_per_room = catalog.TEACHING_DAYS * (operating_end_slot + 1) * catalog.SLOT_HOURS
    available_room_hours = len(available_room_ids) * slots_per_room
    active_room_hours = max(1, len(rooms_used)) * slots_per_room
    room_utilization = (duration_hours / available_room_hours * 100) if available_room_hours else 0.0
    active_room_utilization = (duration_hours / active_room_hours * 100) if active_room_hours else 0.0

    seat_hours = sum(v["group_size"] * v["length"] * catalog.SLOT_HOURS for v in views)
    seat_capacity_hours = sum(
        (v["room_capacity"] or 0) * v["length"] * catalog.SLOT_HOURS for v in views
    )
    seat_utilization = (seat_hours / seat_capacity_hours * 100) if seat_capacity_hours else 0.0

    peak_utilization = 0.0
    peak_util_label = "—"
    for (day, slot), rooms in slot_power.items():
        if not available_room_ids:
            continue
        value = len(rooms) / len(available_room_ids) * 100
        if value > peak_utilization:
            peak_utilization = value
            peak_util_label = _slot_label(day, slot)

    teacher_hours = {t["id"]: 0.0 for t in campus.teachers}
    for v in views:
        teacher_hours[v["teacher_id"]] += v["length"] * catalog.SLOT_HOURS
    loads = list(teacher_hours.values())
    workload_std = pstdev(loads) if len(loads) > 1 else 0.0
    max_teacher_id = max(teacher_hours, key=lambda k: teacher_hours[k]) if teacher_hours else None
    limits = teacher_limits or {}
    overloaded = [
        {
            "teacher_id": tid,
            "teacher_name": campus.teacher_index[tid]["name"],
            "load_hours": round(hours, 2),
            "limit_hours": int(limits.get(tid, campus.teacher_index[tid]["max_weekly_hours"])),
        }
        for tid, hours in teacher_hours.items()
        if hours > int(limits.get(tid, campus.teacher_index[tid]["max_weekly_hours"])) + 1e-6
    ]

    movement_m = 0
    gap_hours = 0.0
    gap_pairs = 0
    group_day: dict[tuple[str, int], list[dict]] = defaultdict(list)
    for v in views:
        group_day[(v["group_id"], v["day"])].append(v)
    for (group_id, _day), entries in group_day.items():
        entries.sort(key=lambda v: v["start_slot"])
        for prev, nxt in zip(entries, entries[1:]):
            b1 = campus.room_index[prev["room_id"]]["building_id"]
            b2 = campus.room_index[nxt["room_id"]]["building_id"]
            movement_m += catalog.travel_distance(b1, b2)
            gap = (nxt["start_slot"] - (prev["start_slot"] + prev["length"])) * catalog.SLOT_HOURS
            if gap > 0:
                gap_hours += gap
                gap_pairs += 1

    students_total = sum(group_sizes.get(g["id"], g["size"]) for g in campus.groups)

    conflicts_total = sum(conflict_counts.values())
    metrics = {
        "sessions_total": len(sessions),
        "sessions_scheduled": len(views),
        "unassigned_sessions": len(sessions) - len(views),
        "conflicts_total": conflicts_total,
        "conflicts_by_type": conflict_counts,
        "conflict_details": sorted(conflict_map.values(), key=lambda c: (c["day"], c["slot"], c["type"]))[:MAX_DETAILS],
        "capacity_violations_total": capacity_total,
        "capacity_violations_count": len(capacity_details),
        "capacity_details": capacity_details[:MAX_DETAILS],
        "facility_mismatch_count": len(facility_details),
        "facility_details": facility_details[:MAX_DETAILS],
        "availability_violation_count": len(availability_details),
        "availability_details": availability_details[:MAX_DETAILS],
        "unassigned_details": unassigned[:MAX_DETAILS],
        "room_utilization_pct": round(room_utilization, 1),
        "active_room_utilization_pct": round(active_room_utilization, 1),
        "seat_utilization_pct": round(seat_utilization, 1),
        "peak_utilization_pct": round(peak_utilization, 1),
        "peak_slot_label": peak_util_label,
        "energy_kwh": round(energy_kwh, 1),
        "peak_kw": round(peak_kw, 1),
        "energy_factor": energy_factor,
        "teacher_workload_std_h": round(workload_std, 2),
        "teacher_max_load_h": round(max(loads), 2) if loads else 0.0,
        "teacher_max_load_name": campus.teacher_index[max_teacher_id]["name"] if max_teacher_id else None,
        "teacher_max_limit_h": campus.teacher_index[max_teacher_id]["max_weekly_hours"] if max_teacher_id else 0,
        "teacher_overload_count": len(overloaded),
        "teacher_overloads": overloaded,
        "teacher_loads": [
            {
                "teacher_id": t["id"],
                "teacher_name": t["name"],
                "department": t["department"],
                "load_hours": round(teacher_hours.get(t["id"], 0.0), 2),
                "limit_hours": t["max_weekly_hours"],
            }
            for t in campus.teachers
        ],
        "movement_km": round(movement_m / 1000, 2),
        "movement_metres": movement_m,
        "total_gap_hours": round(gap_hours, 1),
        "avg_gap_hours": round(gap_hours / gap_pairs, 2) if gap_pairs else 0.0,
        "gap_pairs": gap_pairs,
        "students_total": students_total,
        "rooms_total": len(campus.rooms),
        "rooms_available": len(available_room_ids),
        "rooms_used": len(rooms_used),
        "available_room_hours": round(available_room_hours, 1),
        "occupied_room_hours": round(duration_hours, 1),
        "operating_end_slot": operating_end_slot,
    }
    metrics["hard_issue_count"] = (
        conflicts_total
        + len(capacity_details)
        + len(facility_details)
        + len(availability_details)
        + metrics["unassigned_sessions"]
    )

    schedule = []
    for v in views:
        schedule.append(
            {
                **v,
                "day_label": catalog.DAYS[v["day"]]["label"],
                "slot_label": catalog.TIME_SLOTS[v["start_slot"]]["label"],
                "end_slot": v["start_slot"] + v["length"] - 1,
                "displaced": False,
                "displaced_reason": None,
            }
        )
    for item in unassigned:
        schedule.append(
            {
                "id": item.get("session_id"),
                "day": None,
                "start_slot": None,
                "length": 1,
                "displaced": True,
                "displaced_reason": item.get("reason"),
                "displaced_detail": item.get("detail"),
                "label": item.get("label"),
                "group_name": item.get("group_name"),
            }
        )
    metrics["schedule"] = schedule
    return metrics


def attach_room_power(campus: Campus, view: dict) -> dict:
    """Enrich a session view with the power values used by the energy model."""
    room = campus.room_index[view["room_id"]]
    return {**view, "room_power_kw": room["power_kw"], "room_equipment_kw": room.get("equipment_kw", 0.0)}
