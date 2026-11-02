"""Phase 1 regression tests: state snapshots, Difference Engine and fallback.

These tests exercise real computations. They do not assert on prose templates
or UI labels; they check exact values, determinism, audit results and API
contracts.
"""

from __future__ import annotations

import json

import pytest

from app import graph as graph_service
from app import simulation
from app.campus import allowed_rooms_for_course
from app.difference import diff_states
from app.models import Scenario
from app.optimizer import solve_plans
from app.state import scenario_state


def _scenario_result(campus, params):
    return simulation.simulate(campus, params, name="Phase 1 probe", kind="compound")


def _metrics(result):
    return {k: v for k, v in result["metrics"].items() if k != "schedule"}


def _by_id(difference):
    return {change["id"]: change for change in difference["changes"]}


def test_state_snapshot_is_json_safe_and_baseline_immutable(campus):
    closed_room = next(room["id"] for room in campus.rooms if room["kind"] == "lab")
    params = {
        "enrollment_delta": 100,
        "unavailable_room_ids": [closed_room],
        "unavailable_teacher_ids": [],
    }
    state = scenario_state(campus, params)
    round_tripped = json.loads(json.dumps(state))

    baseline = round_tripped["baseline"]
    effective = round_tripped["effective"]
    assert baseline["summary"]["students"] == sum(group["size"] for group in campus.groups)
    assert effective["summary"]["students"] == baseline["summary"]["students"] + 100
    assert baseline["summary"]["sessions"] == len(campus.sessions)
    assert effective["summary"]["sessions"] == len(campus.sessions)

    closed = next(room for room in effective["rooms"] if room["id"] == closed_room)
    assert closed["available"] is False
    assert next(room for room in baseline["rooms"] if room["id"] == closed_room).get("available", True) is True

    # The baseline session records are untouched even though the effective
    # records for sessions in the closed room are displaced.
    base_room_by_session = {session["id"]: session["room_id"] for session in baseline["sessions"]}
    for session in effective["sessions"]:
        if session.get("scenario_status") == "displaced":
            assert base_room_by_session[session["id"]] is not None
            assert session["room_id"] is None
        else:
            assert session["room_id"] is not None


def test_difference_enrollment_plus_200_and_two_room_closures(campus, baseline_metrics):
    closed_rooms = ["AT-104", "FL-102"]
    params = {
        "enrollment_delta": 200,
        "unavailable_room_ids": closed_rooms,
        "unavailable_teacher_ids": [],
    }
    state = scenario_state(campus, params)
    result = _scenario_result(campus, params)
    difference = diff_states(
        state["baseline"],
        state["effective"],
        scenario_id="probe",
        scenario_name="Probe",
        affected=result["affected"],
        metrics=_metrics(result),
        baseline_metrics={k: v for k, v in baseline_metrics.items() if k != "schedule"},
    )
    changes = _by_id(difference)
    assert difference["available"] is True
    assert difference["partial"] is False

    enrollment = changes["demand.enrollment_total"]
    assert enrollment["before"] == 1128
    assert enrollment["after"] == 1328
    assert enrollment["delta"] == 200
    assert enrollment["unit"] == "students"

    rooms = changes["infrastructure.available_rooms"]
    assert rooms["before"] == 24
    assert rooms["after"] == 22
    assert rooms["delta"] == -2
    assert {resource["id"] for resource in rooms["affected_resources"]} == set(closed_rooms)

    seat_capacity = changes["infrastructure.available_seat_capacity"]
    assert seat_capacity["before"] == sum(room["capacity"] for room in campus.rooms)
    assert seat_capacity["after"] == seat_capacity["before"] - sum(
        campus.room_index[room_id]["capacity"] for room_id in closed_rooms
    )

    for room_id in closed_rooms:
        assert changes[f"infrastructure.room_closed.{room_id}"]["after"] == "closed"
        assert changes[f"infrastructure.room_closed.{room_id}"]["affected_session_ids"]

    # Displaced sessions in the state and the simulation ledger reconcile.
    displaced = [
        session["id"]
        for session in state["effective"]["sessions"]
        if session["scenario_status"] == "displaced"
    ]
    assert len(displaced) == result["metrics"]["unassigned_sessions"]
    assert changes["sessions.scheduled"]["before"] - changes["sessions.scheduled"]["after"] == len(displaced)

    # Decisons must mention resources that actually exist.
    room_ids = {room["id"] for room in campus.rooms}
    for decision in difference["decisions"]:
        for resource in decision["resources"]:
            if resource["type"] == "room" and resource["id"].startswith(("AT-", "FL-", "AD-", "TS-")):
                assert resource["id"] in room_ids

    # Deterministic output.
    again = diff_states(
        state["baseline"],
        state["effective"],
        scenario_id="probe",
        scenario_name="Probe",
        affected=result["affected"],
        metrics=_metrics(result),
        baseline_metrics={k: v for k, v in baseline_metrics.items() if k != "schedule"},
    )
    assert json.dumps(again, sort_keys=True) == json.dumps(difference, sort_keys=True)


def test_difference_zero_change_is_explicit(campus, baseline_metrics):
    state = scenario_state(campus, {})
    baseline = {k: v for k, v in baseline_metrics.items() if k != "schedule"}
    difference = diff_states(
        state["baseline"],
        state["effective"],
        scenario_name="No change",
        metrics=baseline,
        baseline_metrics=baseline,
    )
    assert difference["changes"] == []
    assert difference["decisions"]
    assert difference["decisions"][0]["id"] == "decision.none"
    assert "No material state changes" in difference["summary"]


def test_difference_reports_lab_and_teacher_constraints(campus, baseline_metrics):
    labs = [room["id"] for room in campus.rooms if room["kind"] == "lab"]
    teacher = campus.teachers[0]["id"]
    params = {"unavailable_room_ids": labs, "unavailable_teacher_ids": [teacher]}
    state = scenario_state(campus, params)
    result = _scenario_result(campus, params)
    difference = diff_states(
        state["baseline"],
        state["effective"],
        affected=result["affected"],
        metrics=_metrics(result),
        baseline_metrics={k: v for k, v in baseline_metrics.items() if k != "schedule"},
    )
    changes = _by_id(difference)
    assert changes["infrastructure.available_labs"]["after"] == 0
    assert changes[f"staffing.teacher_unavailable.{teacher}"]["after"] == "unavailable"
    assert any(decision["id"] == "decision.no_labs" for decision in difference["decisions"])
    assert any(decision["id"] == f"decision.teacher.{teacher}" for decision in difference["decisions"])


def test_difference_endpoint_and_legacy_partial(client, db, campus, baseline_metrics):
    created = client.post(
        "/api/scenarios",
        json={"name": "Phase 1 API diff", "params": {"enrollment_delta": 25}},
    )
    assert created.status_code == 201, created.text
    scenario = created.json()["scenario"]
    assert scenario["difference"]["available"] is True
    assert scenario["difference"]["changes"]

    endpoint = client.get(f"/api/scenarios/{scenario['id']}/difference")
    assert endpoint.status_code == 200
    assert endpoint.json()["difference"]["changes"]

    assert client.get("/api/scenarios/does-not-exist/difference").status_code == 404

    # A scenario without a state snapshot must return partial evidence, not 500.
    result = _scenario_result(campus, {"enrollment_delta": 10})
    legacy = Scenario(
        name="Legacy scenario",
        kind="demand",
        params={"enrollment_delta": 10},
        status="simulated",
        metrics=_metrics(result),
        schedule=result["schedule"],
        affected=result["affected"],
        warnings=result["warnings"],
        assumptions=result["assumptions"],
        diagnostics={"baseline_metrics": {k: v for k, v in baseline_metrics.items() if k != "schedule"}},
    )
    db.add(legacy)
    db.commit()
    legacy_resp = client.get(f"/api/scenarios/{legacy.id}/difference")
    assert legacy_resp.status_code == 200
    legacy_diff = legacy_resp.json()["difference"]
    assert legacy_diff["available"] is True
    assert legacy_diff["partial"] is True
    assert legacy_diff["changes"]


def test_solver_constructive_fallback_is_verified(campus, monkeypatch):
    from ortools.sat.python import cp_model

    monkeypatch.setattr(cp_model.CpSolver, "Solve", lambda self, model, *args, **kwargs: cp_model.UNKNOWN)
    outcome = solve_plans(campus, {}, None, 1.0)
    assert len(outcome["plans"]) == 3
    for plan in outcome["plans"]:
        assert plan["status"] == "FEASIBLE_HEURISTIC"
        assert plan["source"] == "constructive_fallback"
        assert plan["solver_status"] == "UNKNOWN"
        assert plan["audit"]["passed"] is True
        assert len(plan["schedule"]) == len(campus.sessions)
        assert any("constructive" in warning.lower() for warning in plan["warnings"])


def test_solver_never_returns_unknown_without_schedule(campus):
    outcome = solve_plans(campus, {}, None, 1.0)
    for plan in outcome["plans"]:
        if plan["status"] == "UNKNOWN":
            assert not plan.get("schedule")
        elif plan["status"] in {"FEASIBLE", "FEASIBLE_HEURISTIC"}:
            assert plan["audit"]["passed"] is True
            assert len(plan["schedule"]) == len(campus.sessions)
            assert plan["metrics"]["unassigned_sessions"] == 0
        elif plan["status"] == "INFEASIBLE":
            assert not plan.get("schedule")


def test_impact_alternatives_use_the_course_cohort(campus):
    graph = graph_service.build_graph(campus, campus.sessions, None)
    used_rooms = {session["room_id"] for session in campus.sessions if session.get("room_id")}
    room_node = next(
        node for node in graph["nodes"] if node["type"] == "room" and node["raw_id"] in used_rooms
    )
    model = graph_service.impact_analysis(campus, graph, room_node["id"], {}, 3)
    assert model["alternatives"]
    for alternative in model["alternatives"]:
        course = next(
            (item for item in campus.courses if item["code"] == alternative["course_code"]),
            None,
        )
        assert course is not None
        room = campus.room_index[alternative["room_id"]]
        group_sizes = [
            link["group_id"] for link in campus.group_courses if link["course_id"] == course["id"]
        ]
        required = max(
            campus.group_index[group_id]["size"] for group_id in group_sizes
        )
        assert alternative["capacity"] >= required
        assert allowed_rooms_for_course(course, room, required)
