from __future__ import annotations

import hashlib
import json
from collections import defaultdict
from datetime import datetime, timezone
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import HTMLResponse, Response
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session as OrmSession

from . import catalog, exports, graph as graph_service
from .campus import Campus, load_campus
from .db import get_db
from .explain import build_explanation, comparison_rows, recommend_plan
from .jobs import (
    JOBS,
    cancel_job,
    create_optimize_job,
    find_active_job,
    get_job,
    job_summary_for_scenario,
    simulate_mode,
)
from .models import AuditLog, Building, Course, GroupCourse, Room, Scenario, ScenarioPlan, StudentGroup, Teacher, TimetableSession
from .optimizer import _precheck, _allowed_starts, _eligible_rooms
from .schemas import GroupUpdate, OptimizeRequest, RoomUpdate, ScenarioCreate, TeacherUpdate
from .simulation import build_context, infer_kind, simulate, validate_params

router = APIRouter(prefix="/api")


def _now_iso(value: datetime | None) -> str | None:
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.isoformat()


def _baseline(db: OrmSession) -> tuple[Campus, dict, list[dict]]:
    campus = load_campus(db)
    result = simulate(campus, {}, name="Baseline", kind="baseline")
    return campus, result["metrics"], result["schedule"]


def _fingerprint(campus: Campus) -> str:
    payload = {
        "rooms": [(r["id"], r["capacity"], r["kind"], r["building_id"]) for r in campus.rooms],
        "teachers": [(t["id"], t["max_weekly_hours"], t["unavailable"]) for t in campus.teachers],
        "groups": [(g["id"], g["size"]) for g in campus.groups],
        "courses": [(c["id"], c["teacher_id"], c["weekly_sessions"], c["length"]) for c in campus.courses],
        "sessions": [(s["id"], s["room_id"], s["day"], s["start_slot"]) for s in campus.sessions],
    }
    return hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()[:16]


def _campus_payload(db: OrmSession) -> dict:
    campus, metrics, schedule = _baseline(db)
    payload = campus.to_dict()
    for room in payload["rooms"]:
        room["building_name"] = campus.building_index[room["building_id"]]["name"]
        room["building_code"] = campus.building_index[room["building_id"]]["code"]
    payload["baseline"] = {k: v for k, v in metrics.items() if k != "schedule"}
    payload["baseline_schedule"] = schedule
    payload["fingerprint"] = _fingerprint(campus)
    payload["summary"] = {
        "buildings": len(campus.buildings),
        "rooms": len(campus.rooms),
        "classrooms": sum(1 for r in campus.rooms if r["kind"] == "classroom"),
        "labs": sum(1 for r in campus.rooms if r["kind"] == "lab"),
        "teachers": len(campus.teachers),
        "groups": len(campus.groups),
        "courses": len(campus.courses),
        "sessions": len(campus.sessions),
        "students": sum(g["size"] for g in campus.groups),
        "seat_capacity": sum(r["capacity"] for r in campus.rooms),
    }
    return payload


def _scenario_summary(scenario: Scenario) -> dict:
    plans = scenario.plans or []
    return {
        "id": scenario.id,
        "name": scenario.name,
        "kind": scenario.kind,
        "status": scenario.status,
        "params": scenario.params,
        "metrics": scenario.metrics,
        "created_at": _now_iso(scenario.created_at),
        "updated_at": _now_iso(scenario.updated_at),
        "plan_count": len(plans),
        "feasible_plans": sum(1 for p in plans if p.status == "FEASIBLE"),
        "plan_labels": [p.label for p in plans],
        "headline": _scenario_headline(scenario),
    }


def _scenario_headline(scenario: Scenario) -> str:
    metrics = scenario.metrics or {}
    if scenario.status == "optimizing":
        return "Optimization running"
    if scenario.status == "infeasible":
        return "No feasible recovery found"
    if scenario.status == "failed":
        return "Run failed — configuration preserved"
    if metrics.get("unassigned_sessions"):
        return f"{metrics['unassigned_sessions']} displaced sessions · recovery required"
    if metrics.get("capacity_violations_count"):
        return f"{metrics['capacity_violations_count']} capacity violations detected"
    if metrics.get("hard_issue_count"):
        return f"{metrics['hard_issue_count']} hard issues detected"
    return "Feasible under current hard constraints"


def _plan_dict(plan: ScenarioPlan, include_schedule: bool = True) -> dict:
    data = {
        "label": plan.label,
        "name": plan.name,
        "strategy": plan.strategy,
        "status": plan.status,
        "solver_status": plan.solver_status,
        "objective": plan.objective,
        "metrics": plan.metrics,
        "assignments": plan.assignments,
        "warnings": plan.warnings,
        "assumptions": plan.assumptions,
        "audit": plan.audit,
        "objective_terms": plan.objective_terms,
        "runtime_seconds": plan.runtime_seconds,
        "created_at": _now_iso(plan.created_at),
    }
    if include_schedule:
        data["schedule"] = plan.schedule
    return data


def _scenario_detail(scenario: Scenario, baseline_metrics: dict | None = None, include_plans: bool = True) -> dict:
    data = _scenario_summary(scenario)
    data.update(
        {
            "schedule": scenario.schedule,
            "affected": scenario.affected,
            "warnings": scenario.warnings,
            "assumptions": scenario.assumptions,
            "diagnostics": scenario.diagnostics,
        }
    )
    if include_plans:
        data["plans"] = [_plan_dict(p) for p in scenario.plans]
    if baseline_metrics:
        data["baseline"] = {k: v for k, v in baseline_metrics.items() if k != "schedule"}
    job = job_summary_for_scenario(scenario.id)
    if job:
        data["job"] = job
    return data


def _stored_baseline(scenario: Scenario, fallback: dict) -> dict:
    diagnostics = scenario.diagnostics or {}
    return diagnostics.get("baseline_metrics") or fallback


def _stored_baseline_schedule(scenario: Scenario, fallback: list[dict]) -> list[dict]:
    diagnostics = scenario.diagnostics or {}
    return diagnostics.get("baseline_schedule") or fallback


# ---------------------------------------------------------------------------
# Health and campus
# ---------------------------------------------------------------------------


@router.get("/health")
def health(db: OrmSession = Depends(get_db)):
    try:
        import ortools

        version = getattr(ortools, "__version__", "9.x")
    except Exception:
        version = "unavailable"
    return {
        "status": "ok",
        "service": "MIRRORWORLD API",
        "solver": "Google OR-Tools CP-SAT",
        "solver_version": version,
        "database": "SQLite (SQLAlchemy relational schema; PostgreSQL-compatible)",
        "dataset": catalog.DATASET_LABEL,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/campus")
def get_campus(db: OrmSession = Depends(get_db)):
    return _campus_payload(db)


@router.patch("/campus/rooms/{room_id}")
def update_room(room_id: str, body: RoomUpdate, db: OrmSession = Depends(get_db)):
    room = db.get(Room, room_id)
    if room is None:
        raise HTTPException(404, "Room not found.")
    changes = {}
    if body.name is not None:
        room.name = body.name
        changes["name"] = body.name
    if body.capacity is not None:
        room.capacity = body.capacity
        changes["capacity"] = body.capacity
    if not changes:
        raise HTTPException(422, "No supported fields supplied.")
    db.add(AuditLog(action="CAMPUS_ROOM_UPDATED", detail={"room_id": room_id, "changes": changes}))
    db.commit()
    return {"ok": True, "changes": changes, "campus": _campus_payload(db)}


@router.patch("/campus/teachers/{teacher_id}")
def update_teacher(teacher_id: str, body: TeacherUpdate, db: OrmSession = Depends(get_db)):
    teacher = db.get(Teacher, teacher_id)
    if teacher is None:
        raise HTTPException(404, "Teacher not found.")
    if body.max_weekly_hours is None:
        raise HTTPException(422, "No supported fields supplied.")
    teacher.max_weekly_hours = body.max_weekly_hours
    db.add(AuditLog(action="CAMPUS_TEACHER_UPDATED", detail={"teacher_id": teacher_id, "max_weekly_hours": body.max_weekly_hours}))
    db.commit()
    return {"ok": True, "campus": _campus_payload(db)}


@router.patch("/campus/groups/{group_id}")
def update_group(group_id: str, body: GroupUpdate, db: OrmSession = Depends(get_db)):
    group = db.get(StudentGroup, group_id)
    if group is None:
        raise HTTPException(404, "Group not found.")
    if body.size is None:
        raise HTTPException(422, "No supported fields supplied.")
    group.size = body.size
    db.add(AuditLog(action="CAMPUS_GROUP_UPDATED", detail={"group_id": group_id, "size": body.size}))
    db.commit()
    return {"ok": True, "campus": _campus_payload(db)}


@router.post("/campus/reset")
def reset_campus(db: OrmSession = Depends(get_db)):
    active = [job for job in JOBS.values() if job["status"] in {"queued", "running", "cancelling"}]
    if active:
        raise HTTPException(409, "A solver job is running. Cancel it before resetting the demo dataset.")
    for model in (ScenarioPlan, Scenario, AuditLog, TimetableSession, GroupCourse, Course, StudentGroup, Teacher, Room, Building):
        db.execute(delete(model))
    db.commit()
    from .seed import seed_if_empty
    from .jobs import seed_demo_scenarios

    seed_if_empty(db)
    seed_demo_scenarios(db)
    db.add(AuditLog(action="DATASET_RESET", detail={"dataset": catalog.DATASET_LABEL}))
    db.commit()
    return {"ok": True, "message": "Demo campus, baseline timetable and seeded scenarios restored.", "campus": _campus_payload(db)}


# ---------------------------------------------------------------------------
# Overview
# ---------------------------------------------------------------------------


@router.get("/overview")
def overview(db: OrmSession = Depends(get_db)):
    campus, metrics, schedule = _baseline(db)
    payload = _campus_payload(db)
    rooms_by_building = defaultdict(list)
    for room in campus.rooms:
        rooms_by_building[room["building_id"]].append(room)
    sessions_by_building = defaultdict(list)
    for item in schedule:
        building_id = item.get("building_id")
        if building_id:
            sessions_by_building[building_id].append(item)
    conflict_buildings = defaultdict(int)
    for conflict in metrics.get("conflict_details", []):
        room_code = conflict["sessions"][0].get("room_code") if conflict.get("sessions") else None
        room = next((r for r in campus.rooms if r["code"] == room_code), None)
        if room:
            conflict_buildings[room["building_id"]] += 1
    building_rows = []
    for building in campus.buildings:
        rooms = rooms_by_building[building["id"]]
        sessions = sessions_by_building[building["id"]]
        occupied = sum((s.get("length") or 1) * 1.5 for s in sessions)
        available = len(rooms) * 5 * (metrics.get("operating_end_slot", 6) + 1) * 1.5
        building_rows.append(
            {
                **building,
                "room_count": len(rooms),
                "lab_count": sum(1 for r in rooms if r["kind"] == "lab"),
                "capacity": sum(r["capacity"] for r in rooms),
                "sessions": len(sessions),
                "occupied_hours": round(occupied, 1),
                "available_hours": round(available, 1),
                "utilization_pct": round(occupied / available * 100, 1) if available else 0.0,
                "conflicts": conflict_buildings.get(building["id"], 0),
                "room_ids": [r["id"] for r in rooms],
            }
        )

    # Heatmap uses the same baseline schedule as every table on the page.
    heatmap = []
    for day in catalog.DAYS:
        for slot in catalog.TIME_SLOTS:
            entries = [
                s
                for s in schedule
                if s.get("day") == day["index"]
                and s.get("start_slot") is not None
                and s["start_slot"] <= slot["index"] <= s["start_slot"] + (s.get("length") or 1) - 1
            ]
            used = len({s.get("room_id") for s in entries if s.get("room_id")})
            conflicts = sum(
                1
                for c in metrics.get("conflict_details", [])
                if c.get("day") == day["index"] and c.get("slot") == slot["index"]
            )
            heatmap.append(
                {
                    "day": day["index"],
                    "slot": slot["index"],
                    "sessions": len(entries),
                    "used_rooms": used,
                    "utilization_pct": round(used / len(campus.rooms) * 100, 1) if campus.rooms else 0,
                    "conflicts": conflicts,
                }
            )

    occupancy = {(day["index"], slot["index"]): 0 for day in catalog.DAYS for slot in catalog.TIME_SLOTS}
    for item in schedule:
        if item.get("day") is None or item.get("start_slot") is None:
            continue
        for offset in range(item.get("length") or 1):
            key = (item["day"], item["start_slot"] + offset)
            if key in occupancy:
                occupancy[key] += 1
    snapshot_day, snapshot_slot = max(occupancy, key=lambda key: (occupancy[key], -key[0], -key[1]))
    snapshot_entries = [
        s
        for s in schedule
        if s.get("day") == snapshot_day
        and s.get("start_slot") is not None
        and s["start_slot"] <= snapshot_slot <= s["start_slot"] + (s.get("length") or 1) - 1
    ]
    busy_rooms = {s.get("room_id") for s in snapshot_entries if s.get("room_id")}
    available_rooms = [r for r in campus.rooms if r["id"] not in busy_rooms]

    alerts = []
    for detail in metrics.get("capacity_details", []):
        alerts.append(
            {
                "id": f"capacity:{detail['session_id']}",
                "severity": "critical",
                "category": "Capacity",
                "title": f"Capacity exceeded · {detail['label']}",
                "detail": f"{detail['group_size']} students in a {detail['capacity']}-seat room ({detail['room_code']}), deficit {detail['violation']}.",
                "slot": detail.get("slot_label"),
                "action": "optimize",
            }
        )
    for conflict in metrics.get("conflict_details", []):
        labels = " × ".join(s["label"] for s in conflict.get("sessions", []))
        alerts.append(
            {
                "id": f"conflict:{conflict['type']}:{conflict['resource']}:{conflict['slot_label']}",
                "severity": "critical",
                "category": f"{conflict['type'].title()} conflict",
                "title": f"{conflict['resource']} double-booked",
                "detail": f"{labels} at {conflict['slot_label']}.",
                "slot": conflict.get("slot_label"),
                "action": "optimize",
            }
        )
    for detail in metrics.get("facility_details", []):
        alerts.append(
            {
                "id": f"facility:{detail['session_id']}",
                "severity": "warning",
                "category": "Facility",
                "title": f"Facility mismatch · {detail['label']}",
                "detail": detail.get("reason"),
                "slot": detail.get("slot_label"),
                "action": "campus",
            }
        )
    for detail in metrics.get("availability_details", []):
        alerts.append(
            {
                "id": f"availability:{detail['session_id']}:{detail['slot_label']}",
                "severity": "warning",
                "category": "Instructor",
                "title": f"Availability conflict · {detail['teacher_name']}",
                "detail": f"{detail['label']} is scheduled at {detail['slot_label']} outside the instructor's availability.",
                "slot": detail.get("slot_label"),
                "action": "optimize",
            }
        )
    for load in metrics.get("teacher_overloads", []):
        alerts.append(
            {
                "id": f"overload:{load['teacher_id']}",
                "severity": "warning",
                "category": "Workload",
                "title": f"Weekly limit exceeded · {load['teacher_name']}",
                "detail": f"{load['load_hours']}h assigned against a {load['limit_hours']}h limit.",
                "slot": None,
                "action": "campus",
            }
        )
    severity_rank = {"critical": 0, "warning": 1, "info": 2}
    alerts.sort(key=lambda a: severity_rank.get(a["severity"], 3))

    recent = db.scalars(select(Scenario).order_by(Scenario.created_at.desc()).limit(5)).all()
    recent_rows = [_scenario_summary(s) for s in recent]
    activity = db.scalars(select(AuditLog).order_by(AuditLog.timestamp.desc()).limit(8)).all()

    return {
        **payload,
        "metrics": {k: v for k, v in metrics.items() if k != "schedule"},
        "buildings_summary": building_rows,
        "heatmap": heatmap,
        "snapshot": {
            "day": snapshot_day,
            "slot": snapshot_slot,
            "label": f"{catalog.DAYS[snapshot_day]['label']} · {catalog.TIME_SLOTS[snapshot_slot]['label']}",
            "active_sessions": len(snapshot_entries),
            "available_rooms": len(available_rooms),
            "available_room_codes": [r["code"] for r in available_rooms],
            "busy_room_codes": sorted({r["code"] for r in campus.rooms if r["id"] in busy_rooms}),
        },
        "alerts": alerts[:10],
        "recent_scenarios": recent_rows,
        "activity": [
            {
                "id": entry.id,
                "action": entry.action,
                "scenario_id": entry.scenario_id,
                "actor": entry.actor,
                "timestamp": _now_iso(entry.timestamp),
                "detail": entry.detail,
            }
            for entry in activity
        ],
        "engine": {
            "solver": "CP-SAT",
            "seed": 42,
            "status": "ready",
            "job_worker": "single-process queue",
        },
    }


# ---------------------------------------------------------------------------
# Scenarios and optimization
# ---------------------------------------------------------------------------


@router.get("/scenarios")
def list_scenarios(limit: int = Query(50, ge=1, le=200), db: OrmSession = Depends(get_db)):
    scenarios = db.scalars(select(Scenario).order_by(Scenario.created_at.desc()).limit(limit)).all()
    return {"scenarios": [_scenario_summary(s) for s in scenarios], "count": len(scenarios)}


@router.post("/scenarios", status_code=201)
def create_scenario(body: ScenarioCreate, db: OrmSession = Depends(get_db)):
    campus, baseline_metrics, baseline_schedule = _baseline(db)
    params = body.params.model_dump()
    errors = validate_params(campus, params)
    if errors:
        raise HTTPException(422, " ".join(errors))
    try:
        result = simulate(campus, params, name=body.name, kind=body.kind or infer_kind(params))
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    diagnostics = dict(result["diagnostics"])
    diagnostics.update(
        {
            "baseline_metrics": {k: v for k, v in baseline_metrics.items() if k != "schedule"},
            "baseline_schedule": baseline_schedule,
            "campus_fingerprint": _fingerprint(campus),
            "created_dataset": catalog.DATASET_LABEL,
        }
    )
    scenario = Scenario(
        name=body.name,
        kind=body.kind or infer_kind(params),
        params=params,
        status="simulated",
        metrics=result["metrics"],
        schedule=result["schedule"],
        affected=result["affected"],
        warnings=result["warnings"],
        assumptions=result["assumptions"],
        diagnostics=diagnostics,
    )
    db.add(scenario)
    db.commit()
    db.refresh(scenario)
    db.add(AuditLog(action="SCENARIO_CREATED", scenario_id=scenario.id, detail={"name": scenario.name, "kind": scenario.kind}))
    db.commit()
    return {"scenario": _scenario_detail(scenario, baseline_metrics)}


@router.get("/scenarios/{scenario_id}")
def get_scenario(scenario_id: str, db: OrmSession = Depends(get_db)):
    scenario = db.get(Scenario, scenario_id)
    if scenario is None:
        raise HTTPException(404, "Scenario not found.")
    _, baseline_metrics, _ = _baseline(db)
    return {
        "scenario": _scenario_detail(
            scenario, _stored_baseline(scenario, {k: v for k, v in baseline_metrics.items() if k != "schedule"})
        )
    }


@router.post("/scenarios/{scenario_id}/optimize", status_code=202)
def optimize_scenario(scenario_id: str, body: OptimizeRequest, db: OrmSession = Depends(get_db)):
    scenario = db.get(Scenario, scenario_id)
    if scenario is None:
        raise HTTPException(404, "Scenario not found.")
    active = find_active_job(scenario_id)
    if active:
        raise HTTPException(409, f"A solver job is already {active['status']} for this scenario.")
    campus, _, _ = _baseline(db)
    errors = validate_params(campus, scenario.params)
    if errors:
        raise HTTPException(422, " ".join(errors))
    job = create_optimize_job(scenario.id, body.weights, body.time_limit)
    db.add(AuditLog(action="OPTIMIZATION_STARTED", scenario_id=scenario.id, detail={"job_id": job["id"], "time_limit": body.time_limit}))
    db.commit()
    return {"job": job}


@router.get("/jobs/{job_id}")
def poll_job(job_id: str):
    job = get_job(job_id)
    if job is None:
        raise HTTPException(404, "Job not found. It may have been cleared by a server restart.")
    return {"job": job}


@router.post("/jobs/{job_id}/cancel")
def cancel_optimize_job(job_id: str):
    job = cancel_job(job_id)
    if job is None:
        raise HTTPException(404, "Job not found.")
    return {"job": job}


# ---------------------------------------------------------------------------
# Comparison and graph
# ---------------------------------------------------------------------------


def _find_plan(scenario: Scenario, label: str | None) -> ScenarioPlan | None:
    plans = scenario.plans or []
    if not plans:
        return None
    if label:
        return next((p for p in plans if p.label == label.upper()), None)
    return next((p for p in plans if p.status == "FEASIBLE"), plans[0])


@router.get("/compare")
def compare(scenario_id: str = Query(...), plan: str | None = Query(None), db: OrmSession = Depends(get_db)):
    scenario = db.get(Scenario, scenario_id)
    if scenario is None:
        raise HTTPException(404, "Scenario not found.")
    campus, current_baseline, current_schedule = _baseline(db)
    baseline = _stored_baseline(scenario, {k: v for k, v in current_baseline.items() if k != "schedule"})
    baseline_schedule = _stored_baseline_schedule(scenario, current_schedule)
    plan_record = _find_plan(scenario, plan)
    plan_payload = _plan_dict(plan_record) if plan_record else None
    rows = comparison_rows(baseline, scenario.metrics or {}, (plan_record.metrics if plan_record and plan_record.metrics else None))
    plans_for_explain = [
        {
            "label": p.label,
            "name": p.name,
            "status": p.status,
            "metrics": p.metrics,
            "audit": p.audit,
        }
        for p in scenario.plans
    ]
    weights = ((scenario.diagnostics or {}).get("optimization") or {}).get("weights")
    explanation = build_explanation(
        baseline=baseline,
        scenario=scenario.metrics or {},
        plans=plans_for_explain,
        weights=weights,
        scenario_name=scenario.name,
    )
    return {
        "scenario": _scenario_detail(scenario, baseline),
        "baseline": {**baseline, "schedule": baseline_schedule},
        "scenario_metrics": scenario.metrics,
        "scenario_schedule": scenario.schedule,
        "plan": plan_payload,
        "rows": rows,
        "explanation": explanation,
        "recommendation": explanation.get("recommendation"),
        "plans": [
            {
                "label": p.label,
                "name": p.name,
                "status": p.status,
                "solver_status": p.solver_status,
                "metrics": p.metrics,
                "audit": p.audit,
                "objective_terms": p.objective_terms,
                "runtime_seconds": p.runtime_seconds,
            }
            for p in scenario.plans
        ],
        "dataset": {
            "label": catalog.DATASET_LABEL,
            "source": "synthetic-demo",
            "energy_model": "room power × scheduled hours",
        },
    }


@router.get("/graph")
def get_graph(scenario_id: str | None = Query(None), db: OrmSession = Depends(get_db)):
    campus, _, baseline_schedule = _baseline(db)
    scenario = None
    if scenario_id:
        record = db.get(Scenario, scenario_id)
        if record is None:
            raise HTTPException(404, "Scenario not found.")
        scenario = {
            "id": record.id,
            "affected": record.affected,
            "name": record.name,
        }
        schedule = record.schedule
    else:
        schedule = baseline_schedule
    result = graph_service.build_graph(campus, schedule, scenario)
    return result


@router.get("/graph/impact")
def graph_impact(
    node_id: str = Query(...),
    scenario_id: str | None = Query(None),
    depth: int = Query(3, ge=1, le=5),
    db: OrmSession = Depends(get_db),
):
    campus, _, baseline_schedule = _baseline(db)
    scenario = None
    schedule = baseline_schedule
    params = {}
    if scenario_id:
        record = db.get(Scenario, scenario_id)
        if record is None:
            raise HTTPException(404, "Scenario not found.")
        scenario = {"id": record.id, "affected": record.affected, "name": record.name}
        schedule = record.schedule
        params = record.params or {}
    graph = graph_service.build_graph(campus, schedule, scenario)
    try:
        result = graph_service.impact_analysis(campus, graph, node_id, params, depth)
    except KeyError as exc:
        raise HTTPException(404, f"Node {node_id} not found in the dependency graph.") from exc
    return result


# ---------------------------------------------------------------------------
# History, exports and reports
# ---------------------------------------------------------------------------


@router.get("/history")
def history(limit: int = Query(50, ge=1, le=200), db: OrmSession = Depends(get_db)):
    scenarios = db.scalars(select(Scenario).order_by(Scenario.created_at.desc()).limit(limit)).all()
    run_rows = []
    for scenario in scenarios:
        row = _scenario_summary(scenario)
        row["affected_count"] = (scenario.affected or {}).get("counts", {}).get("sessions", 0)
        row["energy_kwh"] = (scenario.metrics or {}).get("energy_kwh")
        row["solver_statuses"] = [p.solver_status for p in scenario.plans]
        row["has_plans"] = bool(scenario.plans)
        run_rows.append(row)
    logs = db.scalars(select(AuditLog).order_by(AuditLog.timestamp.desc()).limit(limit)).all()
    return {
        "runs": run_rows,
        "audit": [
            {
                "id": entry.id,
                "action": entry.action,
                "scenario_id": entry.scenario_id,
                "actor": entry.actor,
                "timestamp": _now_iso(entry.timestamp),
                "detail": entry.detail,
            }
            for entry in logs
        ],
        "counts": {
            "runs": len(run_rows),
            "optimized": sum(1 for s in scenarios if s.status == "optimized"),
            "feasible_runs": sum(1 for s in scenarios if s.status in {"optimized", "simulated"}),
        },
    }


def _attachment(filename: str) -> dict:
    return {"Content-Disposition": f"attachment; filename*=UTF-8''{quote(filename)}"}


@router.get("/export/baseline.csv")
def export_baseline(db: OrmSession = Depends(get_db)):
    _, metrics, schedule = _baseline(db)
    payload = exports.timetable_csv(schedule, "MIRRORWORLD baseline timetable · Fall 2026 Week 7")
    return Response(
        content="\ufeff" + payload,
        media_type="text/csv; charset=utf-8",
        headers=_attachment("mirrorworld-baseline-timetable.csv"),
    )


@router.get("/export/scenarios/{scenario_id}.csv")
def export_scenario(scenario_id: str, db: OrmSession = Depends(get_db)):
    scenario = db.get(Scenario, scenario_id)
    if scenario is None:
        raise HTTPException(404, "Scenario not found.")
    _, current_baseline, _ = _baseline(db)
    baseline = _stored_baseline(scenario, {k: v for k, v in current_baseline.items() if k != "schedule"})
    payload = exports.scenario_csv(
        {
            **_scenario_detail(scenario, include_plans=False),
            "created_at": _now_iso(scenario.created_at),
        },
        baseline,
        [_plan_dict(p, include_schedule=False) for p in scenario.plans],
    )
    return Response(
        content="\ufeff" + payload,
        media_type="text/csv; charset=utf-8",
        headers=_attachment(f"mirrorworld-{scenario.id[:8]}-report.csv"),
    )


@router.get("/export/scenarios/{scenario_id}/plans/{label}.csv")
def export_plan(scenario_id: str, label: str, db: OrmSession = Depends(get_db)):
    scenario = db.get(Scenario, scenario_id)
    if scenario is None:
        raise HTTPException(404, "Scenario not found.")
    plan = next((p for p in scenario.plans if p.label.lower() == label.lower()), None)
    if plan is None:
        raise HTTPException(404, "Plan not found.")
    if not plan.schedule:
        raise HTTPException(409, "This plan has no feasible schedule to export.")
    payload = exports.plan_timetable_csv(
        {"label": plan.label, "name": plan.name, "schedule": plan.schedule},
        scenario.name,
    )
    return Response(
        content="\ufeff" + payload,
        media_type="text/csv; charset=utf-8",
        headers=_attachment(f"mirrorworld-plan-{plan.label}-{scenario.id[:8]}.csv"),
    )


@router.get("/scenarios/{scenario_id}/report", response_class=HTMLResponse)
def scenario_report(scenario_id: str, db: OrmSession = Depends(get_db)):
    scenario = db.get(Scenario, scenario_id)
    if scenario is None:
        raise HTTPException(404, "Scenario not found.")
    _, current_baseline, _ = _baseline(db)
    baseline = _stored_baseline(scenario, {k: v for k, v in current_baseline.items() if k != "schedule"})
    feasible = [p for p in scenario.plans if p.status == "FEASIBLE" and p.metrics]
    recommended = recommend_plan(
        [{"label": p.label, "name": p.name, "status": p.status, "metrics": p.metrics, "audit": p.audit} for p in scenario.plans],
        ((scenario.diagnostics or {}).get("optimization") or {}).get("weights"),
    )
    selected = None
    if recommended:
        selected = next((p for p in scenario.plans if p.label == recommended["label"]), feasible[0] if feasible else None)
    rows = comparison_rows(
        baseline,
        scenario.metrics or {},
        selected.metrics if selected else None,
    )
    explanation = build_explanation(
        baseline=baseline,
        scenario=scenario.metrics or {},
        plans=[
            {"label": p.label, "name": p.name, "status": p.status, "metrics": p.metrics, "audit": p.audit}
            for p in scenario.plans
        ],
        weights=((scenario.diagnostics or {}).get("optimization") or {}).get("weights"),
        scenario_name=scenario.name,
    )
    html = exports.printable_report(
        {
            **_scenario_detail(scenario, include_plans=False),
            "created_at": _now_iso(scenario.created_at),
        },
        baseline,
        [_plan_dict(p, include_schedule=False) for p in scenario.plans],
        rows,
        explanation,
    )
    return HTMLResponse(content=html)
