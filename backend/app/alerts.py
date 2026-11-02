"""Structured, evidence-based campus alerts.

Alerts are computed, never stored as prose. Each alert carries the condition
that fired, the resources involved, the modelled consequence, a concrete next
action and the metric evidence behind it. Suggested rooms are checked for
capacity and facility eligibility; the optimizer still has to confirm the slot.

The current API surface is additive: legacy fields (``detail``, ``slot``,
``action``) are retained so existing screens keep working while the richer
fields are adopted.
"""

from __future__ import annotations

import hashlib
from collections import defaultdict
from datetime import datetime, timezone

from . import catalog
from .campus import Campus, allowed_rooms_for_course

SEVERITY_RANK = {"critical": 0, "high": 1, "medium": 2, "low": 3}
SEVERITY_LABEL = {"critical": "Critical", "high": "High", "medium": "Medium", "low": "Low"}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _fingerprint(*parts) -> str:
    return hashlib.sha256("|".join(str(part) for part in parts).encode()).hexdigest()[:16]


def _resource(resource_type: str, resource_id: str, label: str, reason: str | None = None) -> dict:
    return {"type": resource_type, "id": resource_id, "label": label, "reason": reason}


def _alert(
    *,
    alert_id: str,
    condition_key: str,
    severity: str,
    category: str,
    title: str,
    description: str,
    affected_resources: list[dict],
    consequences: str,
    action_text: str,
    action_route: str,
    evidence: list[dict],
    slot: str | None = None,
) -> dict:
    return {
        "id": alert_id,
        "condition_key": condition_key,
        "severity": severity,
        "severity_label": SEVERITY_LABEL.get(severity, severity.title()),
        "category": category,
        "title": title,
        "description": description,
        "detail": description,
        "affected_resources": affected_resources,
        "consequences": consequences,
        "suggested_action": {"text": action_text, "route": action_route},
        "action": "optimize" if action_route == "/optimizer" else "campus" if action_route == "/campus" else "simulate",
        "evidence": evidence,
        "slot": slot,
        "detected_at": _now(),
        "fingerprint": _fingerprint(condition_key, sorted(r["id"] for r in affected_resources), slot),
    }


def _entry_lookup(schedule: list[dict]) -> dict[str, dict]:
    return {str(entry["id"]): entry for entry in schedule if entry.get("id")}


def _room_by_code(campus: Campus) -> dict[str, dict]:
    return {room["code"]: room for room in campus.rooms}


def _course(campus: Campus, entry: dict | None) -> dict:
    if not entry:
        return {}
    return campus.course_index.get(str(entry.get("course_id")), {})


def _group(campus: Campus, entry: dict | None) -> dict:
    if not entry:
        return {}
    return campus.group_index.get(str(entry.get("group_id")), {})


def _teacher(campus: Campus, entry: dict | None) -> dict:
    course = _course(campus, entry)
    return campus.teacher_index.get(str(course.get("teacher_id")), {})


def _capacity_severity(deficit: int, capacity: int) -> str:
    ratio = deficit / max(1, capacity)
    if deficit >= 20 or ratio >= 0.25:
        return "critical"
    if deficit >= 10 or ratio >= 0.10:
        return "high"
    return "medium"


def _share_severity(share: float) -> str:
    if share >= 0.25:
        return "critical"
    if share >= 0.10:
        return "high"
    if share > 0:
        return "medium"
    return "low"


def _larger_room(
    campus: Campus,
    course: dict,
    group_size: int,
    current_code: str | None,
    kind: str = "classroom",
) -> dict | None:
    candidates = []
    for room in campus.rooms:
        if room["code"] == current_code or room["kind"] != kind:
            continue
        if allowed_rooms_for_course(course, room, group_size):
            candidates.append(room)
    candidates.sort(key=lambda room: (room["capacity"], room["code"]))
    return candidates[0] if candidates else None


def _building_energy(campus: Campus, schedule: list[dict]) -> list[dict]:
    energy: dict[str, float] = defaultdict(float)
    seats: dict[str, int] = defaultdict(int)
    rooms: dict[str, set[str]] = defaultdict(set)
    for room in campus.rooms:
        seats[room["building_id"]] += int(room["capacity"])
    for entry in schedule:
        room_id = entry.get("room_id")
        if not room_id or entry.get("day") is None or entry.get("start_slot") is None:
            continue
        room = campus.room_index.get(str(room_id))
        if not room:
            continue
        power = room["power_kw"] + (room.get("equipment_kw", 0.0) if _course(campus, entry).get("needs_lab") else 0.0)
        energy[room["building_id"]] += (entry.get("length") or 1) * catalog.SLOT_HOURS * power
        rooms[room["building_id"]].add(str(room_id))
    rows = []
    for building in campus.buildings:
        building_id = str(building["id"])
        seat_count = seats.get(building_id, 0)
        rows.append(
            {
                "building_id": building_id,
                "code": building.get("code") or building_id,
                "name": building.get("name") or building_id,
                "energy_kwh": round(energy.get(building_id, 0.0), 2),
                "seats": seat_count,
                "energy_per_seat": round(energy.get(building_id, 0.0) / seat_count, 4) if seat_count else 0.0,
                "room_ids": sorted(rooms.get(building_id, set())),
            }
        )
    return rows


def build_alerts(
    campus: Campus,
    metrics: dict,
    schedule: list[dict],
    scenario: dict | None = None,
) -> list[dict]:
    """Build alerts from the computed metrics, schedule and optional scenario."""
    alerts: list[dict] = []
    entries = _entry_lookup(schedule)
    rooms_by_code = _room_by_code(campus)
    total_sessions = max(1, int(metrics.get("sessions_total") or 1))

    # --------------------------------------------------------- capacity
    by_room: dict[str, list[dict]] = defaultdict(list)
    for detail in metrics.get("capacity_details", []) or []:
        by_room[str(detail.get("room_code") or "unknown")].append(detail)
    for room_code, details in sorted(by_room.items()):
        details.sort(key=lambda item: (-int(item.get("group_size") or 0), str(item.get("session_id"))))
        worst = details[0]
        room = rooms_by_code.get(room_code)
        group_size = int(worst.get("group_size") or 0)
        capacity = int(worst.get("capacity") or (room or {}).get("capacity") or 0)
        deficit = max(0, group_size - capacity)
        session_ids = [str(item.get("session_id")) for item in details if item.get("session_id")]
        groups = []
        for session_id in session_ids:
            entry = entries.get(session_id)
            group = _group(campus, entry)
            if group and group["id"] not in {item["id"] for item in groups}:
                groups.append(_resource("group", str(group["id"]), group.get("name") or str(group["id"]), "Capacity pressure"))
        worst_entry = entries.get(str(worst.get("session_id")))
        course = _course(campus, worst_entry)
        candidate = _larger_room(campus, course, group_size, room_code, kind=(room or {}).get("kind", "classroom"))
        if candidate:
            action = (
                f"Move {len(details)} session(s) from {room_code} to {candidate['code']} "
                f"({candidate['capacity']} seats) or split the cohort. The optimizer must confirm the slot."
            )
        else:
            action = (
                f"No larger eligible room remains for {group_size} students. Reduce the cohort or open additional capacity."
            )
        severity = _capacity_severity(deficit, capacity)
        alerts.append(
            _alert(
                alert_id=f"capacity:{room_code}",
                condition_key=f"capacity:{room_code}",
                severity=severity,
                category="Capacity",
                title=f"{room_code} over capacity · {SEVERITY_LABEL[severity]}",
                description=(
                    f"{len(details)} session(s) exceed capacity in {room_code}; the worst is "
                    f"{group_size} students against {capacity} seats (deficit {deficit})."
                ),
                affected_resources=[_resource("room", str(room["id"]), room_code, "Over capacity") for room in [room] if room]
                + groups[:6],
                consequences="Affected sessions cannot be delivered as assigned; students may be moved or turned away.",
                action_text=action,
                action_route="/optimizer",
                evidence=[
                    {"metric": "group_size", "value": group_size, "comparison": f"> capacity {capacity}"},
                    {"metric": "capacity_deficit", "value": deficit, "comparison": f"{len(details)} session(s)"},
                ],
                slot=worst.get("slot_label"),
            )
        )

    # --------------------------------------------------------- conflicts
    # A slot that holds three or more sessions produces one pair-wise conflict
    # per two sessions. Those pairs describe a single double-booking condition,
    # so they are merged into one alert per (type, resource, slot). Without this
    # grouping the alert list repeats identical ids and affected resources.
    conflict_groups: dict[tuple[str, str, str | None], list[dict]] = {}
    for conflict in metrics.get("conflict_details", []) or []:
        group_key = (
            str(conflict.get("type") or "resource"),
            str(conflict.get("resource") or "resource"),
            conflict.get("slot_label"),
        )
        conflict_groups.setdefault(group_key, []).append(conflict)

    for (conflict_type, resource_label, slot_label), conflicts in conflict_groups.items():
        sessions: list[dict] = []
        seen_sessions: set[str] = set()
        for conflict in conflicts:
            for item in conflict.get("sessions") or []:
                session_id = str(item.get("id") or "")
                if session_id and session_id in seen_sessions:
                    continue
                if session_id:
                    seen_sessions.add(session_id)
                sessions.append(item)
        affected = [
            _resource(conflict_type, f"{conflict_type}:{resource_label}", resource_label, "Double-booked"),
        ]
        seen_resources = {(conflict_type, f"{conflict_type}:{resource_label}")}
        for session_id in seen_sessions:
            entry = entries.get(session_id)
            group = _group(campus, entry)
            if not group:
                continue
            resource_key = ("group", str(group["id"]))
            if resource_key in seen_resources:
                continue
            seen_resources.add(resource_key)
            affected.append(_resource("group", str(group["id"]), group.get("name") or str(group["id"]), "Affected cohort"))
        severity = "critical" if conflict_type == "room" else "high"
        labels = [str(item.get("label", "session")) for item in sessions]
        alerts.append(
            _alert(
                alert_id=f"conflict:{conflict_type}:{resource_label}:{slot_label}",
                condition_key=f"conflict:{conflict_type}:{resource_label}",
                severity=severity,
                category=f"{conflict_type.title()} conflict",
                title=f"{resource_label} double-booked · {SEVERITY_LABEL[severity]}",
                description=(
                    f"{' and '.join(dict.fromkeys(labels))} share {resource_label} at {slot_label}."
                ),
                affected_resources=affected,
                consequences="At least one session must move; the current timetable cannot deliver both sessions in this resource.",
                action_text="Run the recovery optimizer to rehouse one of the conflicting sessions, then verify the new slot.",
                action_route="/optimizer",
                evidence=[
                    {"metric": "conflict_count", "value": len(sessions), "comparison": f"at {slot_label}"},
                ],
                slot=slot_label,
            )
        )

    # --------------------------------------------------------- facilities
    for detail in metrics.get("facility_details", []) or []:
        entry = entries.get(str(detail.get("session_id")))
        course = _course(campus, entry)
        group = _group(campus, entry)
        group_size = int((entry or {}).get("group_size") or group.get("size") or 0)
        current = rooms_by_code.get(str(detail.get("room_code"))) or {}
        candidate = None
        if course.get("needs_lab"):
            candidate = _larger_room(campus, course, group_size, detail.get("room_code"), kind="lab")
        severity = "high" if candidate is None else "medium"
        action = (
            f"Move the session to {candidate['code']} ({candidate['capacity']} seats, matching lab/equipment) and recheck the slot."
            if candidate
            else "No eligible laboratory matches the required type and equipment. Open a suitable lab or relax the requirement."
        )
        alerts.append(
            _alert(
                alert_id=f"facility:{detail.get('session_id')}",
                condition_key=f"facility:{detail.get('session_id')}",
                severity=severity,
                category="Facility",
                title=f"Facility mismatch · {detail.get('label')}",
                description=str(detail.get("reason") or "The assigned room does not satisfy the course facility requirement."),
                affected_resources=[
                    _resource("room", str(current.get("id") or detail.get("room_code")), str(detail.get("room_code")), "Mismatch"),
                    *([_resource("course", str(course.get("id")), course.get("code") or "course", "Requirement")] if course else []),
                ],
                consequences="The session cannot be taught with the equipment or laboratory type assumed by the curriculum.",
                action_text=action,
                action_route="/optimizer",
                evidence=[
                    {"metric": "required_lab", "value": course.get("needs_lab") or "none", "comparison": f"room {detail.get('room_code')}"},
                ],
                slot=detail.get("slot_label"),
            )
        )

    # ------------------------------------------------------ availability
    for detail in metrics.get("availability_details", []) or []:
        entry = entries.get(str(detail.get("session_id")))
        teacher = _teacher(campus, entry)
        alerts.append(
            _alert(
                alert_id=f"availability:{detail.get('session_id')}:{detail.get('slot_label')}",
                condition_key=f"availability:{teacher.get('id') or detail.get('teacher_name')}",
                severity="high",
                category="Instructor",
                title=f"Availability conflict · {detail.get('teacher_name')}",
                description=f"{detail.get('label')} is scheduled at {detail.get('slot_label')} outside the instructor's declared availability.",
                affected_resources=[
                    _resource("teacher", str(teacher.get("id") or detail.get("teacher_name")), str(detail.get("teacher_name")), "Unavailable")
                ],
                consequences="The instructor is not available at the assigned time; the session needs a new slot or a substitute.",
                action_text="Create an instructor-unavailability scenario or move the session to a declared available slot.",
                action_route="/simulation",
                evidence=[
                    {"metric": "slot", "value": detail.get("slot_label"), "comparison": "outside availability"},
                ],
                slot=detail.get("slot_label"),
            )
        )

    # --------------------------------------------------------- workload
    for load in metrics.get("teacher_overloads", []) or []:
        excess = float(load.get("load_hours") or 0) - float(load.get("limit_hours") or 0)
        severity = "high" if excess >= 2 else "medium"
        alerts.append(
            _alert(
                alert_id=f"overload:{load.get('teacher_id')}",
                condition_key=f"overload:{load.get('teacher_id')}",
                severity=severity,
                category="Workload",
                title=f"Weekly limit exceeded · {load.get('teacher_name')}",
                description=f"{load.get('load_hours')}h assigned against a {load.get('limit_hours')}h weekly limit.",
                affected_resources=[
                    _resource("teacher", str(load.get("teacher_id")), str(load.get("teacher_name")), "Over limit")
                ],
                consequences="The instructor's declared workload limit is exceeded, which may create an industrial or quality risk.",
                action_text="Rebalance sessions to another qualified instructor or revise the declared weekly limit in the campus model.",
                action_route="/campus",
                evidence=[
                    {"metric": "load_hours", "value": load.get("load_hours"), "comparison": f"limit {load.get('limit_hours')}h"},
                ],
            )
        )

    # ----------------------------------------------------------- energy
    energy_rows = _building_energy(campus, schedule)
    positive = [row for row in energy_rows if row["energy_kwh"] > 0 and row["energy_per_seat"] > 0]
    if positive:
        average = sum(row["energy_per_seat"] for row in positive) / len(positive)
        for row in positive:
            ratio = row["energy_per_seat"] / average if average else 0
            if ratio < 1.25:
                continue
            severity = "critical" if ratio >= 1.6 else "high" if ratio >= 1.35 else "medium"
            alerts.append(
                _alert(
                    alert_id=f"energy:{row['building_id']}",
                    condition_key=f"energy:{row['building_id']}",
                    severity=severity,
                    category="Energy",
                    title=f"Modelled energy outlier · {row['code']}",
                    description=(
                        f"{row['code']} uses {row['energy_kwh']:.0f} kWh/week across {row['seats']} seats "
                        f"({ratio:.2f}× the campus average per seat)."
                    ),
                    affected_resources=[_resource("building", row["building_id"], row["name"], "Energy outlier")],
                    consequences="The building contributes disproportionately to modelled peak and weekly energy demand.",
                    action_text="Shift selected sessions out of this building or apply the efficiency scenario mode; recheck the modelled result.",
                    action_route="/simulation",
                    evidence=[
                        {"metric": "energy_kwh", "value": row["energy_kwh"], "comparison": "weekly model estimate"},
                        {"metric": "energy_per_seat", "value": row["energy_per_seat"], "comparison": f"campus average {average:.2f}"},
                    ],
                )
            )

    # ------------------------------------------------------ scenario impact
    if scenario:
        affected = scenario.get("affected") or {}
        sessions = affected.get("sessions") or []
        counts: dict[str, int] = defaultdict(int)
        for item in sessions:
            if item.get("reason"):
                counts[str(item["reason"])] += 1
        for reason, count in sorted(counts.items(), key=lambda item: (-item[1], item[0])):
            share = count / total_sessions
            severity = _share_severity(share)
            alerts.append(
                _alert(
                    alert_id=f"disruption:{reason}",
                    condition_key=f"disruption:{reason}",
                    severity=severity,
                    category="Infrastructure" if "room" in reason.lower() else "Disruption",
                    title=f"{reason.replace('_', ' ').title()} affects {count} session(s) · {SEVERITY_LABEL[severity]}",
                    description=(
                        f"{count} session(s) ({share:.1%} of the weekly timetable) are affected by "
                        f"{reason.replace('_', ' ')} in the active scenario."
                    ),
                    affected_resources=[],
                    consequences="Affected sessions cannot be delivered as currently assigned and require recovery.",
                    action_text="Review the difference report and generate recovery plans for the disrupted sessions.",
                    action_route="/optimizer",
                    evidence=[
                        {"metric": "affected_sessions", "value": count, "comparison": f"{share:.1%} of {total_sessions}"},
                    ],
                )
            )

    # Deduplicate on condition key + resource set, keeping the most severe.
    deduped: dict[str, dict] = {}
    for alert in alerts:
        key = alert["fingerprint"]
        if key not in deduped or SEVERITY_RANK[alert["severity"]] < SEVERITY_RANK[deduped[key]["severity"]]:
            deduped[key] = alert
    result = list(deduped.values())
    result.sort(key=lambda item: (SEVERITY_RANK[item["severity"]], item["category"], item["title"]))
    return result


def alert_counts(alerts: list[dict]) -> dict:
    counts = {level: 0 for level in SEVERITY_RANK}
    categories: dict[str, int] = defaultdict(int)
    for alert in alerts:
        counts[alert["severity"]] = counts.get(alert["severity"], 0) + 1
        categories[alert["category"]] += 1
    return {
        "total": len(alerts),
        "by_severity": counts,
        "by_category": dict(sorted(categories.items())),
    }
