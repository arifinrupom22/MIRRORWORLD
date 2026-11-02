"""Counterfactual simulation engine.

A scenario is applied to a deep copy of the baseline; the baseline itself is
never mutated. Displaced sessions, capacity pressure, facility mismatches and
conflicts are all derived from the resulting timetable.
"""

from __future__ import annotations

import math
from collections import defaultdict

from . import catalog
from .campus import Campus, group_sizes_with_delta, session_view
from .metrics import compute_metrics

LAB_AFTERNOON_MIN_SLOT = 3

ENERGY_FACTOR = {"standard": 1.0, "efficiency": 0.9}

VALID_LAB_POLICIES = {"default", "afternoon_only"}
VALID_ENERGY_MODES = {"standard", "efficiency"}


def effective_unavailable_room_ids(campus: Campus, params: dict) -> set[str]:
    """Expand room, building and laboratory-availability rules deterministically."""
    unavailable = set(params.get("unavailable_room_ids", []))
    for building_id in params.get("unavailable_building_ids", []):
        unavailable.update(
            room["id"] for room in campus.rooms if str(room["building_id"]) == str(building_id)
        )
    pct = int(params.get("lab_availability_pct", 100))
    labs = sorted((room for room in campus.rooms if room.get("kind") == "lab"), key=lambda room: room["id"])
    keep = math.ceil(len(labs) * max(0, min(100, pct)) / 100)
    unavailable.update(room["id"] for room in labs[keep:])
    return unavailable


def validate_params(campus: Campus, params: dict) -> list[str]:
    errors: list[str] = []
    rooms = set(campus.room_index)
    teachers = set(campus.teacher_index)
    buildings = set(campus.building_index)
    unknown_rooms = [rid for rid in params.get("unavailable_room_ids", []) if rid not in rooms]
    unknown_buildings = [bid for bid in params.get("unavailable_building_ids", []) if bid not in buildings]
    unknown_teachers = [tid for tid in params.get("unavailable_teacher_ids", []) if tid not in teachers]
    if unknown_rooms:
        errors.append(f"Unknown room ids: {', '.join(unknown_rooms)}.")
    if unknown_buildings:
        errors.append(f"Unknown building ids: {', '.join(unknown_buildings)}.")
    if unknown_teachers:
        errors.append(f"Unknown teacher ids: {', '.join(unknown_teachers)}.")
    delta = params.get("enrollment_delta", 0)
    if not isinstance(delta, int) or delta < -300 or delta > 600:
        errors.append("Enrollment delta must be an integer between -300 and +600.")
    if params.get("lab_policy", "default") not in VALID_LAB_POLICIES:
        errors.append("Lab policy must be 'default' or 'afternoon_only'.")
    if params.get("energy_mode", "standard") not in VALID_ENERGY_MODES:
        errors.append("Energy mode must be 'standard' or 'efficiency'.")
    end_slot = params.get("operating_end_slot", 6)
    if not isinstance(end_slot, int) or end_slot < 3 or end_slot >= len(catalog.TIME_SLOTS):
        errors.append(
            f"Operating end slot must be between 3 and {len(catalog.TIME_SLOTS) - 1}."
        )
    lab_pct = params.get("lab_availability_pct", 100)
    if not isinstance(lab_pct, int) or lab_pct < 0 or lab_pct > 100:
        errors.append("Laboratory availability must be an integer percentage between 0 and 100.")
    workload_delta = params.get("teacher_workload_delta", 0)
    if not isinstance(workload_delta, int) or workload_delta < -10 or workload_delta > 10:
        errors.append("Teacher workload delta must be an integer between -10 and +10 hours.")
    if effective_unavailable_room_ids(campus, params) >= rooms:
        errors.append("At least one room must remain available.")
    return errors


def build_context(campus: Campus, params: dict) -> dict:
    group_sizes = group_sizes_with_delta(campus.groups, params.get("enrollment_delta", 0))
    unavailable_rooms = effective_unavailable_room_ids(campus, params)
    unavailable_teachers = set(params.get("unavailable_teacher_ids", []))
    end_slot = int(params.get("operating_end_slot", 6))
    available_rooms = {r["id"] for r in campus.rooms if r["id"] not in unavailable_rooms}
    workload_delta = int(params.get("teacher_workload_delta", 0))
    teacher_limits = {
        teacher["id"]: max(1, int(teacher["max_weekly_hours"]) + workload_delta)
        for teacher in campus.teachers
    }
    return {
        "group_sizes": group_sizes,
        "unavailable_rooms": unavailable_rooms,
        "unavailable_teachers": unavailable_teachers,
        "available_rooms": available_rooms,
        "end_slot": end_slot,
        "lab_policy": params.get("lab_policy", "default"),
        "energy_mode": params.get("energy_mode", "standard"),
        "energy_factor": ENERGY_FACTOR.get(params.get("energy_mode", "standard"), 1.0),
        "removed_equipment": set(params.get("equipment_loss", [])),
        "teacher_limits": teacher_limits,
        "lab_availability_pct": int(params.get("lab_availability_pct", 100)),
        "unavailable_building_ids": list(params.get("unavailable_building_ids", [])),
    }


def apply_scenario(campus: Campus, params: dict) -> tuple[list[dict], list[dict], dict]:
    """Return sessions with displaced markers, unassigned details, and context."""
    ctx = build_context(campus, params)
    sessions: list[dict] = []
    unassigned_details: list[dict] = []

    for base in campus.sessions:
        session = dict(base)
        course = campus.course_index[session["course_id"]]
        group = campus.group_index[session["group_id"]]
        teacher = campus.teacher_index[course["teacher_id"]]
        session["group_size"] = ctx["group_sizes"][group["id"]]
        reason = None
        detail = None
        if session["room_id"] in ctx["unavailable_rooms"]:
            reason = "room_unavailable"
            detail = f"Room {campus.room_index[session['room_id']]['code']} is marked unavailable in this scenario."
        elif teacher["id"] in ctx["unavailable_teachers"]:
            reason = "teacher_unavailable"
            detail = f"{teacher['name']} is marked absent for this scenario."
        elif session["start_slot"] is not None and session["start_slot"] + session["length"] - 1 > ctx["end_slot"]:
            reason = "outside_operating_hours"
            detail = "Session falls outside the scenario's operating window."
        elif (
            ctx["lab_policy"] == "afternoon_only"
            and course.get("needs_lab")
            and session["start_slot"] is not None
            and session["start_slot"] < LAB_AFTERNOON_MIN_SLOT
        ):
            reason = "lab_policy"
            detail = "Lab policy requires all laboratory sessions to start at 13:00 or later."

        if reason:
            view = session_view(campus, session, ctx["group_sizes"][group["id"]])
            unassigned_details.append(
                {
                    "session_id": session["id"],
                    "label": f"{view['course_code']} · {view['group_name']}",
                    "reason": reason,
                    "detail": detail,
                    "group_name": view["group_name"],
                    "teacher_name": view["teacher_name"],
                    "room_code": view["room_code"],
                }
            )
            session["displaced_reason"] = reason
            session["displaced_detail"] = detail
            session["original_room_id"] = session["room_id"]
            session["room_id"] = None
            session["day"] = None
            session["start_slot"] = None
        else:
            # A teacher may be unavailable in the exact slot even when not
            # marked absent for the whole scenario; keep the session scheduled
            # so the diagnostics report the baseline availability issue.
            pass
        sessions.append(session)

    return sessions, unassigned_details, ctx


def simulate(campus: Campus, params: dict, *, name: str, kind: str | None = None) -> dict:
    errors = validate_params(campus, params)
    if errors:
        raise ValueError(" ".join(errors))

    sessions, unassigned_details, ctx = apply_scenario(campus, params)
    metrics = compute_metrics(
        campus,
        sessions,
        ctx["group_sizes"],
        energy_factor=ctx["energy_factor"],
        operating_end_slot=ctx["end_slot"],
        available_room_ids=ctx["available_rooms"],
        removed_equipment=ctx["removed_equipment"],
        teacher_limits=ctx["teacher_limits"],
    )
    affected = build_affected(campus, sessions, metrics, ctx)
    warnings = _warnings(metrics)
    assumptions = _assumptions(campus, ctx, params)

    return {
        "name": name,
        "kind": kind or infer_kind(params),
        "params": params,
        "metrics": {k: v for k, v in metrics.items() if k != "schedule"},
        "schedule": metrics["schedule"],
        "affected": affected,
        "warnings": warnings,
        "assumptions": assumptions,
        "diagnostics": {
            "baseline_immutable": True,
            "affected_session_count": len(affected["sessions"]),
            "direct_impact_count": affected["counts"]["direct"],
            "ctx": {
                "group_sizes": ctx["group_sizes"],
                "available_rooms": sorted(ctx["available_rooms"]),
                "end_slot": ctx["end_slot"],
                "energy_factor": ctx["energy_factor"],
                "removed_equipment": sorted(ctx["removed_equipment"]),
                "teacher_limits": ctx["teacher_limits"],
                "lab_availability_pct": ctx["lab_availability_pct"],
                "unavailable_building_ids": ctx["unavailable_building_ids"],
            },
        },
    }


def infer_kind(params: dict) -> str:
    if params.get("enrollment_delta"):
        return "demand"
    if (
        params.get("unavailable_room_ids")
        or params.get("unavailable_building_ids")
        or params.get("unavailable_teacher_ids")
        or params.get("equipment_loss")
        or params.get("lab_availability_pct", 100) != 100
    ):
        return "facility"
    if params.get("teacher_workload_delta"):
        return "policy"
    if params.get("lab_policy") != "default" or params.get("operating_end_slot", 6) != 6:
        return "policy"
    if params.get("energy_mode") != "standard":
        return "sustainability"
    return "compound"


def build_affected(campus: Campus, sessions: list[dict], metrics: dict, ctx: dict) -> dict:
    session_lookup = {s["id"]: s for s in sessions}
    issues: dict[str, dict] = {}

    def add_issue(session_id: str, reason: str, severity: str, detail: str, source: str, direct: bool) -> None:
        key = f"{session_id}:{source}"
        if key in issues:
            return
        raw = session_lookup.get(session_id)
        if not raw:
            return
        view = session_view(campus, raw, ctx["group_sizes"].get(raw["group_id"]))
        issues[key] = {
            "session_id": session_id,
            "label": f"{view['course_code']} · {view['group_name']}",
            "course_id": view["course_id"],
            "course_code": view["course_code"],
            "group_id": view["group_id"],
            "group_name": view["group_name"],
            "teacher_id": view["teacher_id"],
            "teacher_name": view["teacher_name"],
            "room_id": view["room_id"] or raw.get("original_room_id"),
            "room_code": view["room_code"] or (
                campus.room_index[raw["original_room_id"]]["code"] if raw.get("original_room_id") else None
            ),
            "slot_label": view.get("slot_label") or "—",
            "reason": reason,
            "severity": severity,
            "detail": detail,
            "source": source,
            "direct": direct,
        }

    reason_labels = {
        "room_unavailable": "Room unavailable",
        "teacher_unavailable": "Teacher absent",
        "outside_operating_hours": "Outside operating hours",
        "lab_policy": "Lab policy violation",
    }
    for item in metrics.get("unassigned_details", []):
        add_issue(
            item["session_id"],
            reason_labels.get(item["reason"], "Unassigned"),
            "critical",
            item.get("detail", "Session could not be placed."),
            "displacement",
            True,
        )
    for item in metrics.get("capacity_details", []):
        add_issue(
            item["session_id"],
            "Capacity violation",
            "critical",
            f"{item['group_size']} enrolled against {item['capacity']} seats in {item['room_code']}.",
            "capacity",
            False,
        )
    for item in metrics.get("facility_details", []):
        add_issue(item["session_id"], "Facility mismatch", "warning", item["reason"], "facility", False)
    for item in metrics.get("availability_details", []):
        add_issue(
            item["session_id"],
            "Teacher availability",
            "warning",
            item["reason"],
            "availability",
            False,
        )
    for conflict in metrics.get("conflict_details", []):
        for entry in conflict["sessions"]:
            add_issue(
                entry["id"],
                f"{conflict['type'].title()} conflict",
                "warning",
                f"{conflict['resource']} double-booked at {conflict['slot_label']}.",
                "conflict",
                False,
            )

    session_values = list(issues.values())
    session_values.sort(key=lambda i: (0 if i["severity"] == "critical" else 1, i["label"]))

    resources: dict[str, dict] = defaultdict(dict)
    for item in session_values:
        if item.get("room_id"):
            resources["rooms"][item["room_id"]] = {
                "id": item["room_id"],
                "label": item.get("room_code") or item["room_id"],
                "reason": item["reason"],
            }
        if item.get("teacher_id"):
            resources["teachers"][item["teacher_id"]] = {
                "id": item["teacher_id"],
                "label": item["teacher_name"],
                "reason": item["reason"],
            }
        if item.get("group_id"):
            resources["groups"][item["group_id"]] = {
                "id": item["group_id"],
                "label": item["group_name"],
                "reason": item["reason"],
            }
        resources["courses"][item["course_code"]] = {
            "id": item["course_id"],
            "label": item["course_code"],
            "reason": item["reason"],
        }
    # Include closed resources even if they have no sessions in the timetable.
    for room_id in ctx["unavailable_rooms"]:
        resources["rooms"][room_id] = {
            "id": room_id,
            "label": campus.room_index[room_id]["code"],
            "reason": "Closed for this scenario",
        }
    for teacher_id in ctx["unavailable_teachers"]:
        resources["teachers"][teacher_id] = {
            "id": teacher_id,
            "label": campus.teacher_index[teacher_id]["name"],
            "reason": "Absent for this scenario",
        }

    return {
        "sessions": session_values,
        "resources": {k: list(v.values()) for k, v in resources.items()},
        "counts": {
            "sessions": len(session_values),
            "direct": sum(1 for i in session_values if i["direct"]),
            "critical": sum(1 for i in session_values if i["severity"] == "critical"),
            "rooms": len(resources["rooms"]),
            "teachers": len(resources["teachers"]),
            "groups": len(resources["groups"]),
            "courses": len(resources["courses"]),
        },
        "by_reason": _count_by(session_values, "reason"),
    }


def _count_by(items: list[dict], key: str) -> dict:
    counts: dict[str, int] = defaultdict(int)
    for item in items:
        counts[item[key]] += 1
    return dict(sorted(counts.items(), key=lambda kv: (-kv[1], kv[0])))


def _warnings(metrics: dict) -> list[str]:
    warnings = []
    if metrics["unassigned_sessions"]:
        warnings.append(
            f"{metrics['unassigned_sessions']} session(s) are displaced and require recovery."
        )
    if metrics["capacity_violations_count"]:
        warnings.append(
            f"{metrics['capacity_violations_count']} session(s) exceed room capacity by "
            f"{metrics['capacity_violations_total']} seats in total."
        )
    if metrics["conflicts_total"]:
        warnings.append(f"{metrics['conflicts_total']} schedule conflict(s) remain in the current timetable.")
    if metrics["facility_mismatch_count"]:
        warnings.append(
            f"{metrics['facility_mismatch_count']} session(s) do not match their required laboratory or equipment."
        )
    if metrics["availability_violation_count"]:
        warnings.append(
            f"{metrics['availability_violation_count']} session(s) sit outside instructor availability."
        )
    if metrics["teacher_overload_count"]:
        warnings.append(f"{metrics['teacher_overload_count']} instructor(s) exceed weekly hour limits.")
    return warnings


def _assumptions(campus: Campus, ctx: dict, params: dict) -> list[str]:
    delta = params.get("enrollment_delta", 0)
    assumptions = [
        "Demo dataset is synthetic; every metric is computed from the MIRRORWORLD campus model, not measured institutional data.",
        "The baseline timetable is immutable; this scenario is a separate, reproducible record.",
        "Room power ratings and 1.5-hour slots drive the energy estimate; weather, partial occupancy and standby loads are not modeled.",
        "Student movement uses straight-line building distances from the documented distance matrix.",
        "Teacher availability is modelled per weekday slot; administrative duties are not represented.",
    ]
    if delta:
        assumptions.append(
            f"The {delta:+d} enrolment change is distributed proportionally across all {len(campus.groups)} groups using deterministic largest-remainder rounding."
        )
    if ctx["lab_policy"] == "afternoon_only":
        assumptions.append("Laboratory sessions are restricted to slots starting at 13:00 or later.")
    if ctx["unavailable_rooms"]:
        assumptions.append(
            f"{len(ctx['unavailable_rooms'])} room(s) are removed from both capacity and availability for this scenario."
        )
    if ctx["unavailable_building_ids"]:
        assumptions.append(
            f"Building closure expands to every room in {', '.join(ctx['unavailable_building_ids'])}."
        )
    if ctx["lab_availability_pct"] != 100:
        assumptions.append(
            f"Laboratory availability is set to {ctx['lab_availability_pct']}% of labs; the remaining labs are selected deterministically by room id."
        )
    if ctx["removed_equipment"]:
        assumptions.append(
            f"Equipment tags removed for this scenario: {', '.join(sorted(ctx['removed_equipment']))}."
        )
    if any(limit != campus.teacher_index[tid]["max_weekly_hours"] for tid, limit in ctx["teacher_limits"].items()):
        assumptions.append(
            "The teacher workload delta applies to every instructor's declared weekly limit in this scenario."
        )
    if ctx["end_slot"] != 6:
        assumptions.append(
            f"The operating window ends at {catalog.TIME_SLOTS[ctx['end_slot']]['end']}; later slots are unavailable."
        )
    if ctx["energy_mode"] == "efficiency":
        assumptions.append("Efficiency mode applies a documented 0.90 factor to the modeled room load (HVAC scheduling).")
    return assumptions
