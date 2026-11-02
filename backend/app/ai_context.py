"""Pure context digests for Mirror AI.

The API layer assembles a context from the deterministic services; these
helpers shape the parts the copilot needs beyond bare metrics:

* campus knowledge (inventory, facilities, dataset limits),
* explicit assumptions versus verified facts,
* plan and solver-status digests,
* student-movement insight including the walking-speed assumption,
* recommendation cards in the six-field shape the specification requires.

Nothing here computes new campus numbers. Values come from the campus model,
the metrics/schedule the caller passes in, or an existing service.
"""

from __future__ import annotations

from collections import defaultdict

from .ai_tools import status_explanation
from .campus import Campus
from .movement import DEFAULT_WALKING_SPEED_M_PER_MIN, compute_movement
from .recommendations import build_recommendations

#: Trade-off wording per recommendation family. These describe the direction of
#: the effect, never a number: the number arrives only after a scenario is run.
_TRADEOFFS = {
    "recommendation.utilization_balance": (
        "Sessions moved out of the busy building may lengthen travel for the affected cohorts; the movement "
        "engine reports the resulting distances once the scenario is simulated."
    ),
    "recommendation.seat_pressure": (
        "Opening capacity or splitting cohorts changes the timetable, so instructor and room availability must be "
        "re-checked by the optimizer."
    ),
    "recommendation.conflict_cluster": (
        "Reassigning rooms or slots can create new travel-time pressure even when it removes the collision."
    ),
    "recommendation.energy": (
        "Shifting load can increase travel distance, and the efficiency mode may reduce comfort assumptions; "
        "neither effect is measured by MIRRORWORLD."
    ),
    "recommendation.workload": (
        "Reducing an instructor's assigned hours moves the load to a colleague, whose own weekly limit then applies."
    ),
}


def knowledge_digest(campus: Campus) -> dict:
    """Campus knowledge: what exists, where, and what the dataset cannot say."""
    rooms_by_building: dict[str, list[dict]] = defaultdict(list)
    for room in campus.rooms:
        rooms_by_building[str(room.get("building_id"))].append(room)
    buildings = []
    for building in campus.buildings:
        rooms = rooms_by_building.get(str(building.get("id")), [])
        buildings.append(
            {
                "code": building.get("code"),
                "name": building.get("name"),
                "zone": building.get("zone"),
                "purpose": building.get("purpose"),
                "floors": building.get("floors"),
                "rooms": len(rooms),
                "labs": sum(1 for room in rooms if room.get("kind") == "lab"),
                "classrooms": sum(1 for room in rooms if room.get("kind") == "classroom"),
                "seats": sum(int(room.get("capacity") or 0) for room in rooms),
                "room_codes": [room.get("code") for room in rooms][:12],
                "equipment": sorted({item for room in rooms for item in (room.get("equipment") or [])})[:10],
            }
        )
    return {
        "buildings": buildings,
        "facility_types": sorted({str(room.get("kind")) for room in campus.rooms}),
        "lab_types": sorted({str(item) for room in campus.rooms for item in (room.get("lab_types") or [])}),
        "equipment": sorted({str(item) for room in campus.rooms for item in (room.get("equipment") or [])}),
        "instructors": len(campus.teachers),
        "departments": sorted({str(teacher.get("department")) for teacher in campus.teachers}),
        "cohorts": len(campus.groups),
        "courses": len(campus.courses),
        "sessions": len(campus.sessions),
        "dataset": {
            "label": None,  # filled by the caller from catalog.DATASET_LABEL
            "limits": [
                "Synthetic demo dataset, not institutional data.",
                "Footprint geometry is illustrative, not surveyed.",
                "No live sensors, no GPS and no real-time occupancy.",
            ],
        },
    }


def assumptions(campus: Campus) -> list[dict]:
    """Separate what is measured from what is assumed, in one place."""
    return [
        {
            "claim": "Campus inventory (buildings, rooms, capacities, equipment)",
            "status": "model data",
            "detail": f"Loaded from the seeded campus model: {len(campus.buildings)} buildings, {len(campus.rooms)} rooms.",
        },
        {
            "claim": "Dataset provenance",
            "status": "declared limitation",
            "detail": "The campus is a synthetic demonstration dataset. It does not describe live NITER operations.",
        },
        {
            "claim": "Floor geometry",
            "status": "illustrative",
            "detail": "Footprints are schematic boxes; the 3D twin extrudes them with one assumed storey height.",
        },
        {
            "claim": "Walking speed and distance",
            "status": "assumption",
            "detail": (
                f"Walking time uses {DEFAULT_WALKING_SPEED_M_PER_MIN:.0f} m/min (1.4 m/s pedestrian standard) over "
                "modelled distances. Movement is timetable-derived; there is no live tracking."
            ),
        },
        {
            "claim": "Energy",
            "status": "modelled",
            "detail": "kWh is room power ratings multiplied by scheduled hours, not a meter reading.",
        },
        {
            "claim": "Solver outcome",
            "status": "reported verbatim",
            "detail": "CP-SAT status is passed through unchanged; FEASIBLE is never described as OPTIMAL.",
        },
    ]


def plan_digest(plans: list) -> list[dict]:
    """Solver plans with their authoritative status and glossary entry."""
    rows = []
    for plan in plans or []:
        status = getattr(plan, "status", None)
        rows.append(
            {
                "label": getattr(plan, "label", None),
                "name": getattr(plan, "name", None),
                "strategy": getattr(plan, "strategy", None),
                "status": status,
                "solver_status": getattr(plan, "solver_status", None),
                "objective": getattr(plan, "objective", None),
                "objective_terms": getattr(plan, "objective_terms", None),
                "status_explanation": status_explanation(status),
            }
        )
    return rows


def movement_insight(campus: Campus, params: dict, limit: int = 6) -> dict:
    """Movement summary plus the transitions that need attention."""
    try:
        result = compute_movement(campus=campus, params=params)
    except Exception as error:  # noqa: BLE001 - the copilot must survive a movement failure
        return {"available": False, "reason": f"Movement engine unavailable: {error}"}

    summary = result.summary.model_dump() if hasattr(result.summary, "model_dump") else dict(result.summary)
    flagged = [
        row for row in result.transitions
        if row.tight or row.feasible is False or row.unknown_distance
    ]
    flagged.sort(key=lambda row: (row.feasible is not False, not row.tight, row.time_gap_min))
    top = [
        {
            "cohort": row.cohort_name,
            "students": row.student_count,
            "from": f"{row.from_building_name} at {row.from_time}",
            "to": f"{row.to_building_name} at {row.to_time}",
            "gap_min": row.time_gap_min,
            "distance_m": row.distance_m,
            "walking_time_min": row.walking_time_min,
            "tight": row.tight,
            "infeasible": row.feasible is False,
            "unknown_distance": row.unknown_distance,
        }
        for row in flagged[:limit]
    ]
    return {
        "available": True,
        **summary,
        "walking_speed_m_per_min": DEFAULT_WALKING_SPEED_M_PER_MIN,
        "flagged_transitions": top,
        "flagged_count": len(flagged),
        "note": (
            "Timetable-derived estimate at "
            f"{DEFAULT_WALKING_SPEED_M_PER_MIN:.0f} m/min over modelled distances. Not live tracking."
        ),
    }


def recommendation_cards(campus: Campus, metrics: dict, schedule: list[dict], limit: int = 6) -> list[dict]:
    """Recommendations in the six-field decision shape.

    Problem, evidence, action, expected benefit, trade-off and confidence all
    come from existing computed data; the trade-off is directional wording, not
    a fabricated number.
    """
    cards = []
    for item in build_recommendations(campus, metrics or {}, schedule or [])[:limit]:
        family = str(item.get("id") or "").rsplit(".", 1)[0]
        cards.append(
            {
                "id": item.get("id"),
                "problem": f"{item.get('title')} — {item.get('rationale')}",
                "title": item.get("title"),
                "evidence": item.get("evidence") or [],
                "action": item.get("action"),
                "expected_benefit": item.get("expected_effect"),
                "tradeoff": _TRADEOFFS.get(
                    family,
                    "The effect is not quantified until the change is simulated; MIRRORWORLD does not estimate it here.",
                ),
                "confidence": item.get("confidence"),
                "affected_resources": item.get("affected_resources") or [],
                "route": item.get("route"),
                "priority": item.get("priority"),
            }
        )
    return cards
