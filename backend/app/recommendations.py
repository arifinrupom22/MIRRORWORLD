"""Evidence-based operational recommendations.

A recommendation is only emitted when a computed threshold fires. Every card
names the metric, the observed value and the comparison behind it. Generic
advice is deliberately not generated.
"""

from __future__ import annotations

from collections import defaultdict

from . import catalog
from .alerts import _building_energy
from .campus import Campus


def _resource(resource_type: str, resource_id: str, label: str, reason: str | None = None) -> dict:
    return {"type": resource_type, "id": resource_id, "label": label, "reason": reason}


def _building_utilisation(campus: Campus, schedule: list[dict], end_slot: int) -> list[dict]:
    rooms_by_building: dict[str, list[dict]] = defaultdict(list)
    for room in campus.rooms:
        rooms_by_building[str(room["building_id"])].append(room)
    occupied: dict[str, float] = defaultdict(float)
    sessions: dict[str, int] = defaultdict(int)
    for entry in schedule:
        room_id = entry.get("room_id")
        if not room_id or entry.get("day") is None or entry.get("start_slot") is None:
            continue
        room = campus.room_index.get(str(room_id))
        if not room:
            continue
        occupied[str(room["building_id"])] += (entry.get("length") or 1) * catalog.SLOT_HOURS
        sessions[str(room["building_id"])] += 1
    rows = []
    for building in campus.buildings:
        building_id = str(building["id"])
        rooms = rooms_by_building.get(building_id, [])
        available = len(rooms) * catalog.TEACHING_DAYS * (end_slot + 1) * catalog.SLOT_HOURS
        rows.append(
            {
                "building_id": building_id,
                "code": building.get("code") or building_id,
                "name": building.get("name") or building_id,
                "rooms": len(rooms),
                "sessions": sessions.get(building_id, 0),
                "occupied_hours": round(occupied.get(building_id, 0.0), 2),
                "available_hours": round(available, 2),
                "utilization_pct": round(occupied.get(building_id, 0.0) / available * 100, 2) if available else 0.0,
                "room_ids": [str(room["id"]) for room in rooms],
            }
        )
    return rows


def _conflicts_by_building(campus: Campus, metrics: dict) -> dict[str, int]:
    by_code = {room["code"]: room for room in campus.rooms}
    counts: dict[str, int] = defaultdict(int)
    for conflict in metrics.get("conflict_details", []) or []:
        sessions = conflict.get("sessions") or []
        room_code = sessions[0].get("room_code") if sessions else None
        room = by_code.get(str(room_code))
        if room:
            counts[str(room["building_id"])] += 1
    return counts


def build_recommendations(campus: Campus, metrics: dict, schedule: list[dict]) -> list[dict]:
    recommendations: list[dict] = []
    end_slot = int(metrics.get("operating_end_slot") or 6)
    buildings = _building_utilisation(campus, schedule, end_slot)
    active = [row for row in buildings if row["rooms"] and row["sessions"] > 0]
    if len(active) >= 2:
        low = min(active, key=lambda row: row["utilization_pct"])
        high = max(active, key=lambda row: row["utilization_pct"])
        spread = high["utilization_pct"] - low["utilization_pct"]
        ratio = high["utilization_pct"] / low["utilization_pct"] if low["utilization_pct"] > 0 else 99
        if spread >= 12 and ratio >= 1.25:
            recommendations.append(
                {
                    "id": "recommendation.utilization_balance",
                    "title": "Rebalance room utilisation between buildings",
                    "action": (
                        f"Consider moving selected sessions from {high['code']} to {low['code']}; "
                        "the optimizer can test whether the receiving rooms and slots are feasible."
                    ),
                    "rationale": (
                        f"{high['code']} is {high['utilization_pct']:.1f}% utilised while {low['code']} is "
                        f"{low['utilization_pct']:.1f}%, a {spread:.1f}-point spread."
                    ),
                    "evidence": [
                        {"metric": "building_utilization_pct", "value": high["utilization_pct"], "comparison": f"{high['code']} vs {low['code']} {low['utilization_pct']:.1f}%"},
                        {"metric": "utilization_spread_pct", "value": round(spread, 2), "comparison": "threshold 12 points"},
                    ],
                    "expected_effect": "Smoother room demand and less peak pressure in the busiest building.",
                    "affected_resources": [
                        _resource("building", high["building_id"], high["name"], "Over-utilised"),
                        _resource("building", low["building_id"], low["name"], "Under-utilised"),
                    ],
                    "confidence": "medium",
                    "route": "/optimizer",
                    "priority": 1,
                }
            )

    seat_util = float(metrics.get("seat_utilization_pct") or 0)
    if seat_util >= 85:
        recommendations.append(
            {
                "id": "recommendation.seat_pressure",
                "title": "Seat capacity is under sustained pressure",
                "action": "Review the largest cohorts and the smallest rooms; open capacity or split cohorts before increasing intake.",
                "rationale": f"Seat utilisation over scheduled sessions is {seat_util:.1f}%, above the 85% planning threshold.",
                "evidence": [{"metric": "seat_utilization_pct", "value": round(seat_util, 2), "comparison": "threshold 85%"}],
                "expected_effect": "Reduces the risk that an enrolment increase creates immediate capacity violations.",
                "affected_resources": [],
                "confidence": "high",
                "route": "/simulation",
                "priority": 2,
            }
        )

    conflicts = _conflicts_by_building(campus, metrics)
    for building_id, count in sorted(conflicts.items(), key=lambda item: (-item[1], item[0])):
        if count < 2:
            continue
        building = campus.building_index.get(building_id, {"id": building_id, "name": building_id, "code": building_id})
        recommendations.append(
            {
                "id": f"recommendation.conflict_cluster.{building_id}",
                "title": f"Resolve the conflict cluster in {building.get('code') or building_id}",
                "action": "Run the optimizer for this building's conflicting sessions, then verify the reassigned rooms and slots.",
                "rationale": f"{count} booking collision(s) are attributed to this building.",
                "evidence": [{"metric": "building_conflicts", "value": count, "comparison": "threshold 2"}],
                "expected_effect": "Removes a concentrated set of hard-constraint failures with one recovery run.",
                "affected_resources": [_resource("building", building_id, building.get("name") or building_id, "Conflict cluster")],
                "confidence": "high",
                "route": "/optimizer",
                "priority": 1,
            }
        )

    energy_rows = [row for row in _building_energy(campus, schedule) if row["energy_kwh"] > 0 and row["energy_per_seat"] > 0]
    if energy_rows:
        average = sum(row["energy_per_seat"] for row in energy_rows) / len(energy_rows)
        for row in sorted(energy_rows, key=lambda item: -item["energy_per_seat"]):
            ratio = row["energy_per_seat"] / average if average else 0
            if ratio < 1.3:
                continue
            recommendations.append(
                {
                    "id": f"recommendation.energy.{row['building_id']}",
                    "title": f"Shift load away from {row['code']}",
                    "action": "Test the efficiency mode or move selected sessions out of this building in the Simulation Studio.",
                    "rationale": (
                        f"{row['code']} uses {row['energy_kwh']:.0f} kWh/week and {ratio:.2f}× the campus "
                        "average modelled energy per seat."
                    ),
                    "evidence": [
                        {"metric": "building_energy_kwh", "value": row["energy_kwh"], "comparison": "weekly estimate"},
                        {"metric": "energy_per_seat_ratio", "value": round(ratio, 2), "comparison": "threshold 1.30"},
                    ],
                    "expected_effect": "Lower modelled weekly and peak demand without claiming measured savings.",
                    "affected_resources": [_resource("building", row["building_id"], row["name"], "Energy outlier")],
                    "confidence": "medium",
                    "route": "/simulation",
                    "priority": 3,
                }
            )

    for load in metrics.get("teacher_overloads", []) or []:
        recommendations.append(
            {
                "id": f"recommendation.workload.{load.get('teacher_id')}",
                "title": f"Rebalance {load.get('teacher_name')}'s workload",
                "action": "Move a session to another qualified instructor or revise the declared weekly limit in the campus model.",
                "rationale": (
                    f"{load.get('load_hours')}h is assigned against a {load.get('limit_hours')}h weekly limit."
                ),
                "evidence": [
                    {"metric": "teacher_load_hours", "value": load.get("load_hours"), "comparison": f"limit {load.get('limit_hours')}h"},
                ],
                "expected_effect": "Brings the instructor back inside the declared workload policy.",
                "affected_resources": [
                    _resource("teacher", str(load.get("teacher_id")), str(load.get("teacher_name")), "Over limit")
                ],
                "confidence": "high",
                "route": "/campus",
                "priority": 2,
            }
        )

    recommendations.sort(key=lambda item: (item["priority"], item["title"]))
    return recommendations
