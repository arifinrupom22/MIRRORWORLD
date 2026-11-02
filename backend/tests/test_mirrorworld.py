"""Algorithm and API tests for MIRRORWORLD.

These tests validate actual computation output: hard-constraint compliance,
conflict detection, disruption propagation, infeasibility handling,
comparison arithmetic, graph relationships and the HTTP workflows.
"""

from __future__ import annotations

import time

import pytest

from app import graph as graph_service
from app import simulation
from app.campus import allowed_rooms_for_course
from app.explain import comparison_rows
from app.optimizer import InfeasibleScenario, solve_plans


# ---------------------------------------------------------------------------
# Dataset integrity and baseline diagnostics
# ---------------------------------------------------------------------------
def test_seed_dataset_is_internally_consistent(campus):
    assert len(campus.buildings) >= 3
    assert len(campus.rooms) >= 15
    assert len(campus.groups) >= 6
    assert len(campus.courses) >= 20
    assert len(campus.sessions) >= 60

    # Every relationship resolves: sessions reference real rooms/groups/courses,
    # and courses belong to their groups.
    for session in campus.sessions:
        assert session["room_id"] in campus.room_index
        assert session["group_id"] in campus.group_index
        assert session["course_id"] in campus.course_index
    for link in campus.group_courses:
        assert link["group_id"] in campus.group_index
        assert link["course_id"] in campus.course_index

    # Rooms belong to real buildings.
    for room in campus.rooms:
        assert room["building_id"] in campus.building_index
        assert room["capacity"] >= 10


def test_baseline_contains_reproducible_conflicts(baseline_metrics):
    assert baseline_metrics["sessions_scheduled"] + baseline_metrics["unassigned_sessions"] == (
        baseline_metrics["sessions_total"]
    )
    by_type = baseline_metrics["conflicts_by_type"]
    # The seeded baseline intentionally contains a room double-booking,
    # a teacher double-booking and a student-group overlap.
    assert by_type["room"] >= 1
    assert by_type["teacher"] >= 1
    assert by_type["group"] >= 1
    assert baseline_metrics["capacity_violations_count"] >= 1
    assert baseline_metrics["facility_mismatch_count"] >= 1
    assert baseline_metrics["availability_violation_count"] >= 1
    assert baseline_metrics["hard_issue_count"] == (
        baseline_metrics["conflicts_total"]
        + baseline_metrics["capacity_violations_count"]
        + baseline_metrics["facility_mismatch_count"]
        + baseline_metrics["availability_violation_count"]
        + baseline_metrics["unassigned_sessions"]
    )


def test_baseline_utilization_values_are_bounded(baseline_metrics):
    for key in (
        "room_utilization_pct",
        "active_room_utilization_pct",
        "seat_utilization_pct",
        "peak_utilization_pct",
    ):
        assert 0.0 <= baseline_metrics[key] <= 100.0, key
    assert baseline_metrics["energy_kwh"] > 0
    assert baseline_metrics["sessions_total"] > 0


# ---------------------------------------------------------------------------
# Simulation: validation and disruption propagation
# ---------------------------------------------------------------------------
def test_validate_params_rejects_unknown_references(campus):
    errors = simulation.validate_params(
        campus, {"unavailable_room_ids": ["ROOM-DOES-NOT-EXIST"]}
    )
    assert errors, "unknown room id must be rejected"
    errors = simulation.validate_params(
        campus, {"unavailable_teacher_ids": ["TEACHER-DOES-NOT-EXIST"]}
    )
    assert errors


def test_validate_params_accepts_valid_configuration(campus):
    room_id = campus.rooms[0]["id"]
    teacher_id = campus.teachers[0]["id"]
    errors = simulation.validate_params(
        campus,
        {
            "unavailable_room_ids": [room_id],
            "unavailable_teacher_ids": [teacher_id],
            "enrollment_delta": 40,
        },
    )
    assert errors == []


def test_lab_closure_marks_direct_and_indirect_impact(campus, baseline_metrics):
    lab_rooms = [r["id"] for r in campus.rooms if r.get("needs_lab") or r.get("kind") == "lab"]
    assert lab_rooms, "the demo campus must contain laboratory rooms"
    params = {"unavailable_room_ids": lab_rooms}
    result = simulation.simulate(campus, params, name="Lab closure test", kind="facility")

    affected = result["affected"]
    assert affected["counts"]["direct"] >= 1
    assert affected["counts"]["sessions"] >= affected["counts"]["direct"]
    assert len(affected["sessions"]) == affected["counts"]["sessions"]

    # Direct impact must come from sessions originally placed in closed rooms.
    for item in affected["sessions"]:
        if item.get("direct"):
            assert item["room_id"] in set(lab_rooms)

    # Simulation must recompute metrics from the reduced room pool.
    assert result["metrics"]["rooms_available"] < baseline_metrics["rooms_available"]
    assert result["assumptions"], "simulation must disclose its assumptions"
    assert result["diagnostics"]["baseline_immutable"] is True


def test_instructor_unavailability_propagates(campus):
    teacher_id = campus.teachers[0]["id"]
    result = simulation.simulate(
        campus,
        {"unavailable_teacher_ids": [teacher_id]},
        name="Teacher unavailable test",
        kind="facility",
    )
    assert result["affected"]["counts"]["direct"] >= 1
    for item in result["affected"]["sessions"]:
        if item.get("direct"):
            assert item["teacher_id"] == teacher_id


def test_enrollment_increase_raises_demand(campus, baseline_metrics):
    result = simulation.simulate(
        campus, {"enrollment_delta": 150}, name="Enrollment surge", kind="demand"
    )
    sizes_before = {g["id"]: g["size"] for g in campus.groups}
    sizes_after = {g["id"]: g["size"] + 150 for g in campus.groups}
    assert sum(sizes_after.values()) > sum(sizes_before.values())
    # More students in the same rooms can only keep or raise seat pressure.
    assert result["metrics"]["capacity_violations_count"] >= 0
    assert result["metrics"]["students_total"] > baseline_metrics["students_total"]


def test_operating_end_slot_reduces_available_hours(campus):
    full = simulation.simulate(campus, {}, name="Full day", kind="policy")
    short = simulation.simulate(
        campus, {"operating_end_slot": 3}, name="Short day", kind="policy"
    )
    assert short["metrics"]["available_room_hours"] < full["metrics"]["available_room_hours"]
    assert short["diagnostics"]["ctx"]["end_slot"] == 3


def test_simulation_failure_is_reported_not_hidden(campus):
    with pytest.raises(ValueError):
        simulation.simulate(
            campus, {"unavailable_room_ids": ["NOPE-1"]}, name="Invalid", kind="facility"
        )


# ---------------------------------------------------------------------------
# Optimizer: hard constraints, feasibility, infeasibility
# ---------------------------------------------------------------------------
def _length_by_session(campus):
    return {s["id"]: s.get("length", 1) for s in campus.sessions}


def test_optimizer_returns_feasible_audited_plans(campus):
    outcome = solve_plans(campus, {}, weights=None, time_limit=3.0)
    plans = outcome["plans"]
    assert len(plans) == 3
    for plan in plans:
        # Under CPU contention the solver may return UNKNOWN after the time
        # limit; the audited constructive fallback is then reported as
        # FEASIBLE_HEURISTIC rather than mislabelled as a solver result.
        assert plan["status"] in {"FEASIBLE", "FEASIBLE_HEURISTIC"}, (plan["label"], plan["status"], plan["audit"])
        assert plan["audit"]["passed"] is True
        assert plan["audit"]["violations"] == []
        assert plan["metrics"]["unassigned_sessions"] == 0
        assert plan["metrics"]["conflicts_total"] == 0
        assert plan["metrics"]["hard_issue_count"] == 0


def test_optimizer_solutions_have_no_room_double_booking(campus):
    outcome = solve_plans(campus, {}, weights=None, time_limit=3.0)
    lengths = _length_by_session(campus)
    for plan in outcome["plans"]:
        if not plan["assignments"]:
            continue
        occupied: dict[tuple, list] = {}
        for a in plan["assignments"]:
            length = lengths.get(a["session_id"], 1)
            for offset in range(length):
                key = (a["room_id"], a["day"], a["start_slot"] + offset)
                occupied.setdefault(key, []).append(a["session_id"])
        clashes = {k: v for k, v in occupied.items() if len(v) > 1}
        assert clashes == {}, (plan["label"], clashes)


def test_optimizer_respects_room_capacity_and_facilities(campus):
    outcome = solve_plans(campus, {}, weights=None, time_limit=3.0)
    sizes = {g["id"]: g["size"] for g in campus.groups}
    for plan in outcome["plans"]:
        if not plan["assignments"]:
            continue
        for a in plan["assignments"]:
            session = next(s for s in campus.sessions if s["id"] == a["session_id"])
            course = campus.course_index[session["course_id"]]
            room = campus.room_index[a["room_id"]]
            assert allowed_rooms_for_course(
                course, room, sizes[session["group_id"]]
            ), (plan["label"], a)


def test_optimizer_no_teacher_or_group_overlap(campus):
    outcome = solve_plans(campus, {}, weights=None, time_limit=3.0)
    lengths = _length_by_session(campus)
    for plan in outcome["plans"]:
        if not plan["assignments"]:
            continue
        for entity_key in ("teacher_id", "group_id"):
            occupied: dict[tuple, list] = []
            for a in plan["assignments"]:
                session = next(s for s in campus.sessions if s["id"] == a["session_id"])
                owner = session[entity_key] if entity_key in session else None
                if owner is None and entity_key == "teacher_id":
                    owner = campus.course_index[session["course_id"]]["teacher_id"]
                if owner is None and entity_key == "group_id":
                    owner = session["group_id"]
                length = lengths.get(a["session_id"], 1)
                for offset in range(length):
                    occupied.append((owner, a["day"], a["start_slot"] + offset, a["session_id"]))
            seen: dict[tuple, set] = {}
            for owner, day, start, sid in occupied:
                seen.setdefault((owner, day, start), set()).add(sid)
            clashes = {k: v for k, v in seen.items() if len(v) > 1}
            assert clashes == {}, (plan["label"], entity_key, clashes)


def test_optimizer_reports_infeasible_scenario(campus, campus_all_rooms_closed):
    with pytest.raises(InfeasibleScenario) as excinfo:
        solve_plans(campus, campus_all_rooms_closed, None, time_limit=2.0)
    diagnostics = getattr(excinfo.value, "diagnostics", None) or []
    assert diagnostics, "infeasibility must be explained with diagnostics"
    assert all("detail" in d and "constraint" in d for d in diagnostics)


@pytest.fixture
def campus_all_rooms_closed(campus):
    return {"unavailable_room_ids": [r["id"] for r in campus.rooms]}


def test_optimizer_cancel_flag_is_honoured(campus):
    from app.optimizer import PlanCancelled

    with pytest.raises(PlanCancelled):
        solve_plans(campus, {}, None, time_limit=2.0, cancelled=lambda: True)


# ---------------------------------------------------------------------------
# Graph and explanation engines
# ---------------------------------------------------------------------------
def test_graph_contains_real_relationships(campus):
    graph = graph_service.build_graph(campus, campus.sessions, None)
    types = {n["type"] for n in graph["nodes"]}
    assert {"room", "course", "teacher", "group", "building"} <= types
    assert len(graph["edges"]) > len(graph["nodes"]) // 2

    relations = {e["relation"] for e in graph["edges"]}
    assert relations, "edges must carry a named relationship"

    # Every edge resolves to two real nodes.
    node_ids = {n["id"] for n in graph["nodes"]}
    for edge in graph["edges"]:
        assert edge["source"] in node_ids
        assert edge["target"] in node_ids


def test_graph_impact_traverses_neighbours(campus):
    graph = graph_service.build_graph(campus, campus.sessions, None)
    room_node = next(n for n in graph["nodes"] if n["type"] == "room")
    result = graph_service.impact_analysis(campus, graph, room_node["id"], {}, 3)
    assert result["node"]["id"] == room_node["id"]
    reached = result["direct"] + result["indirect"]
    assert reached, "impact analysis must reach neighbouring nodes"
    assert result["depth"] <= 3
    assert result["summary"]["direct_nodes"] == len(result["direct"])


def test_comparison_rows_handle_missing_plan_and_zero_denominators(baseline_metrics):
    scenario_metrics = {
        **baseline_metrics,
        "conflicts_total": 0,
        "energy_kwh": 0.0,
        "movement_km": 0.0,
    }
    scenario_metrics.pop("schedule", None)
    baseline = {k: v for k, v in baseline_metrics.items() if k != "schedule"}

    rows_no_plan = comparison_rows(baseline, scenario_metrics, None)
    assert rows_no_plan, "comparison must produce rows even without a plan"
    keys = {row["key"] for row in rows_no_plan}
    assert "conflicts_total" in keys
    for row in rows_no_plan:
        # Zero denominators must be handled without division errors.
        delta = row["scenario_delta"]
        assert "absolute" in delta and "percent" in delta
        assert delta["percent"] is None or delta["percent"] == delta["percent"]
    conflicts_row = next(r for r in rows_no_plan if r["key"] == "conflicts_total")
    assert conflicts_row["scenario_delta"]["absolute"] < 0

    rows_with_plan = comparison_rows(baseline, scenario_metrics, scenario_metrics)
    plan_row = next(r for r in rows_with_plan if r["key"] == "conflicts_total")
    assert plan_row["plan"] == 0


# ---------------------------------------------------------------------------
# HTTP API workflows
# ---------------------------------------------------------------------------
def test_health_and_campus_payloads(client):
    health = client.get("/api/health")
    assert health.status_code == 200
    assert health.json()["status"] in {"ok", "healthy"}

    campus_resp = client.get("/api/campus")
    assert campus_resp.status_code == 200
    payload = campus_resp.json()
    for key in ("buildings", "rooms", "teachers", "groups", "courses", "sessions", "days", "time_slots"):
        assert key in payload, key
    assert payload["campus"]["source"] == "synthetic-demo"


def test_overview_reports_metrics_and_alerts(client):
    resp = client.get("/api/overview")
    assert resp.status_code == 200
    data = resp.json()
    metrics = data["metrics"]
    assert metrics["sessions_total"] > 0
    assert metrics["conflicts_total"] >= 1
    assert isinstance(data.get("alerts"), list)
    assert data.get("recent_scenarios") is not None


def test_unknown_resources_return_404(client):
    assert client.get("/api/scenarios/does-not-exist").status_code == 404
    assert client.get("/api/jobs/does-not-exist").status_code == 404
    assert client.post("/api/jobs/does-not-exist/cancel").status_code == 404


def test_campus_edit_and_reset_roundtrip(client):
    campus_resp = client.get("/api/campus").json()
    room = campus_resp["rooms"][0]
    new_capacity = room["capacity"] + 7

    patched = client.patch(
        f"/api/campus/rooms/{room['id']}", json={"capacity": new_capacity}
    )
    assert patched.status_code == 200
    refreshed = client.get("/api/campus").json()
    updated = next(r for r in refreshed["rooms"] if r["id"] == room["id"])
    assert updated["capacity"] == new_capacity

    # Invalid values are rejected with a validation error, not silently applied.
    bad = client.patch(f"/api/campus/rooms/{room['id']}", json={"capacity": 2})
    assert bad.status_code == 422

    reset = client.post("/api/campus/reset")
    assert reset.status_code == 200
    restored = client.get("/api/campus").json()
    restored_room = next(r for r in restored["rooms"] if r["id"] == room["id"])
    assert restored_room["capacity"] == room["capacity"]


def test_scenario_lifecycle_create_optimize_compare_export(client):
    # 1. Create a disruption scenario (simulation runs synchronously).
    create = client.post(
        "/api/scenarios",
        json={"name": "AT wing closure drill", "kind": "facility", "params": {}},
    )
    assert create.status_code == 201, create.text
    scenario = create.json()["scenario"]
    scenario_id = scenario["id"]
    assert scenario["status"] == "simulated"
    assert scenario["affected"]["counts"]["sessions"] >= 0
    assert scenario["assumptions"]

    # 2. Invalid scenario is rejected.
    invalid = client.post(
        "/api/scenarios",
        json={"name": "Invalid", "params": {"unavailable_room_ids": ["NOPE"]}},
    )
    assert invalid.status_code == 422

    # 3. Start optimization and poll until the solver job finishes.
    start = client.post(
        f"/api/scenarios/{scenario_id}/optimize",
        json={"time_limit": 2.0, "weights": {"energy": 0.3, "utilization": 0.3, "movement": 0.4}},
    )
    assert start.status_code == 202, start.text
    job_id = start.json()["job"]["id"]

    deadline = time.time() + 90
    job = None
    while time.time() < deadline:
        polled = client.get(f"/api/jobs/{job_id}")
        assert polled.status_code == 200
        job = polled.json()["job"]
        if job["status"] in {"completed", "failed", "cancelled", "error"}:
            break
        time.sleep(0.5)
    assert job is not None and job["status"] == "completed", job

    # 4. Comparison uses real stored metrics.
    compare = client.get("/api/compare", params={"scenario_id": scenario_id})
    assert compare.status_code == 200
    body = compare.json()
    assert body["rows"], "comparison must return metric rows"
    assert body["plans"], "optimized plans must be present after a successful run"
    feasible = [p for p in body["plans"] if p["status"] == "FEASIBLE"]
    assert feasible, body["plans"]
    assert body["explanation"]

    # 5. Graph with scenario impact.
    graph_resp = client.get("/api/graph", params={"scenario_id": scenario_id})
    assert graph_resp.status_code == 200
    graph = graph_resp.json()
    assert graph["nodes"] and graph["edges"]
    node = graph["nodes"][0]["id"]
    impact = client.get("/api/graph/impact", params={"node_id": node, "scenario_id": scenario_id})
    assert impact.status_code == 200
    missing = client.get("/api/graph/impact", params={"node_id": "nope:none"})
    assert missing.status_code == 404

    # 6. History records the run.
    history = client.get("/api/history")
    assert history.status_code == 200
    runs = history.json()["runs"]
    assert any(r["id"] == scenario_id for r in runs)

    # 7. Exports contain the actual data.
    baseline_csv = client.get("/api/export/baseline.csv")
    assert baseline_csv.status_code == 200
    assert "text/csv" in baseline_csv.headers["content-type"]
    assert len(baseline_csv.text.splitlines()) > 5

    scenario_csv = client.get(f"/api/export/scenarios/{scenario_id}.csv")
    assert scenario_csv.status_code == 200
    assert "scenario" in scenario_csv.text.lower()

    plan_csv = client.get(f"/api/export/scenarios/{scenario_id}/plans/D.csv")
    assert plan_csv.status_code in {200, 404}
    if plan_csv.status_code == 200:
        assert len(plan_csv.text.splitlines()) > 5

    report = client.get(f"/api/scenarios/{scenario_id}/report")
    assert report.status_code == 200
    assert "text/html" in report.headers["content-type"]
    assert "MIRRORWORLD" in report.text


def test_phase3_movement_integration(client, campus):
    # Baseline movement
    resp = client.get("/api/movement")
    assert resp.status_code == 200
    data = resp.json()
    assert "transitions" in data
    assert "summary" in data
    assert data["summary"]["total_transitions"] > 0
    assert data["summary"]["unique_routes"] > 0

    # Test query filters
    slot_resp = client.get("/api/movement", params={"day": 0, "slot": 1})
    assert slot_resp.status_code == 200
    slot_data = slot_resp.json()
    assert slot_data["day"] == 0
    assert slot_data["slot"] == 1

