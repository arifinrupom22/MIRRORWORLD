"""Impact severity assessment.

The rubric is deliberately published and deterministic. It combines only
values returned by the simulation and the recomputed baseline metrics; the
scenario name, analyst note and any language model output are ignored.
"""

from __future__ import annotations

from .campus import Campus
from .simulation import build_context, simulate

LEVELS = ("low", "medium", "high", "critical")


def _level(score: float) -> str:
    if score < 20:
        return "low"
    if score < 45:
        return "medium"
    if score < 70:
        return "high"
    return "critical"


def assess_severity(campus: Campus, params: dict) -> dict:
    baseline = simulate(campus, {}, name="Baseline", kind="baseline")
    scenario = simulate(campus, params, name="Assessment", kind="assessment")
    ctx = build_context(campus, params)
    base_metrics = baseline["metrics"]
    metrics = scenario["metrics"]
    affected = scenario["affected"]

    total_sessions = max(1, int(metrics.get("sessions_total") or 1))
    displaced = int(metrics.get("unassigned_sessions") or 0)
    affected_sessions = int(affected["counts"].get("sessions") or 0)
    capacity_deficit = int(metrics.get("capacity_violations_total") or 0)
    conflicts = int(metrics.get("conflicts_total") or 0)
    total_seats = max(1, sum(int(room["capacity"]) for room in campus.rooms))
    closed_rooms = len(ctx["unavailable_rooms"])
    absent_teachers = len(ctx["unavailable_teachers"])
    total_rooms = max(1, len(campus.rooms))
    total_teachers = max(1, len(campus.teachers))
    lab_ids = [room["id"] for room in campus.rooms if room.get("kind") == "lab"]
    classroom_ids = [room["id"] for room in campus.rooms if room.get("kind") == "classroom"]
    labs_lost = bool(lab_ids) and all(room_id in ctx["unavailable_rooms"] for room_id in lab_ids)
    classrooms_lost = bool(classroom_ids) and all(
        room_id in ctx["unavailable_rooms"] for room_id in classroom_ids
    )
    category_loss = labs_lost or classrooms_lost

    displaced_share = displaced / total_sessions
    affected_share = affected_sessions / total_sessions
    capacity_share = min(1.0, capacity_deficit / total_seats)
    conflict_share = min(1.0, conflicts / total_sessions)
    closed_share = closed_rooms / total_rooms
    absent_share = absent_teachers / total_teachers
    energy_before = float(base_metrics.get("energy_kwh") or 0)
    energy_after = float(metrics.get("energy_kwh") or 0)
    energy_change = abs(energy_after - energy_before) / energy_before if energy_before else 0.0

    factors = [
        {
            "metric": "displaced_share",
            "label": "Displaced sessions",
            "value": round(displaced_share * 100, 1),
            "unit": "%",
            "threshold": "weight 45",
            "contribution": round(min(45.0, displaced_share * 45), 2),
            "description": f"{displaced} of {total_sessions} weekly sessions have no valid room and slot.",
        },
        {
            "metric": "affected_share",
            "label": "Affected sessions",
            "value": round(affected_share * 100, 1),
            "unit": "%",
            "threshold": "weight 20",
            "contribution": round(min(20.0, affected_share * 20), 2),
            "description": f"{affected_sessions} sessions appear in the affected ledger.",
        },
        {
            "metric": "capacity_deficit",
            "label": "Seat deficit",
            "value": capacity_deficit,
            "unit": "seats",
            "threshold": "weight 15",
            "contribution": round(min(15.0, capacity_share * 30), 2),
            "description": f"{capacity_deficit} seats of capacity pressure across scheduled sessions.",
        },
        {
            "metric": "conflict_rate",
            "label": "Booking collisions",
            "value": conflicts,
            "unit": "collisions",
            "threshold": "weight 10",
            "contribution": round(min(10.0, conflict_share * 20), 2),
            "description": f"{conflicts} room, instructor or cohort collisions remain.",
        },
        {
            "metric": "facility_category_loss",
            "label": "Room category exhausted",
            "value": 1 if category_loss else 0,
            "unit": "category",
            "threshold": "weight 60 when every laboratory or every classroom is closed",
            "contribution": 60.0 if category_loss else 0.0,
            "description": (
                "Every laboratory is unavailable; laboratory courses have no compliant room."
                if labs_lost
                else "Every classroom is unavailable; classroom courses have no compliant room."
                if classrooms_lost
                else "At least one room of each category remains available."
            ),
        },
        {
            "metric": "closed_room_share",
            "label": "Closed rooms",
            "value": round(closed_share * 100, 1),
            "unit": "%",
            "threshold": "weight 10",
            "contribution": round(min(10.0, closed_share * 20), 2),
            "description": f"{closed_rooms} of {total_rooms} rooms are removed from this scenario.",
        },
        {
            "metric": "absent_teacher_share",
            "label": "Absent instructors",
            "value": round(absent_share * 100, 1),
            "unit": "%",
            "threshold": "weight 5",
            "contribution": round(min(5.0, absent_share * 15), 2),
            "description": f"{absent_teachers} of {total_teachers} instructors are marked unavailable.",
        },
        {
            "metric": "energy_change_share",
            "label": "Modelled energy change",
            "value": round(energy_change * 100, 1),
            "unit": "%",
            "threshold": "weight 5",
            "contribution": round(min(5.0, energy_change * 10), 2),
            "description": f"Estimated weekly energy changes from {energy_before:,.0f} to {energy_after:,.0f} kWh.",
        },
    ]

    score = round(min(100.0, sum(factor["contribution"] for factor in factors)), 1)
    level = _level(score)
    if not ctx["available_rooms"]:
        level = "critical"
        score = 100.0
    summary = (
        f"Preliminary impact: {level.upper()} ({score:.1f}/100). "
        f"{affected_sessions} affected session(s), {displaced} displaced, "
        f"{capacity_deficit} seats of capacity pressure and {conflicts} remaining collision(s)."
    )
    return {
        "level": level,
        "score": score,
        "factors": factors,
        "summary": summary,
        "evidence": [
            {"metric": factor["metric"], "value": factor["value"], "unit": factor["unit"], "contribution": factor["contribution"]}
            for factor in factors
        ],
        "affected": {
            "sessions": affected_sessions,
            "direct": int(affected["counts"].get("direct") or 0),
            "displaced": displaced,
            "rooms": len(ctx["unavailable_rooms"]),
            "teachers": len(ctx["unavailable_teachers"]),
            "groups": int(affected["counts"].get("groups") or 0),
        },
        "assumptions": [
            "Preliminary assessment uses the simulation engine, not the optimizer, so it does not assume a recovery exists.",
            "The severity score is a weighted planning rubric, not a probability or a monetary loss estimate.",
            "Campus data is synthetic; energy and movement values are modelled estimates.",
        ],
    }
