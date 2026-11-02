"""Phase 2 regression tests: alerts, recommendations, severity and templates."""

from __future__ import annotations

from app import simulation
from app.campus import load_campus


def test_structured_alerts_are_data_derived(client):
    response = client.get("/api/alerts")
    assert response.status_code == 200
    body = response.json()
    assert body["source"] == "baseline"
    assert body["alerts"]
    assert body["counts"]["total"] == len(body["alerts"])
    for alert in body["alerts"]:
        assert alert["severity"] in {"low", "medium", "high", "critical"}
        assert alert["condition_key"]
        assert alert["fingerprint"]
        assert alert["evidence"]
        assert alert["suggested_action"]["text"]
        assert alert["suggested_action"]["route"].startswith("/")
        assert isinstance(alert["affected_resources"], list)
        assert alert["consequences"]
        assert alert["description"]


def test_alerts_can_be_computed_for_a_scenario(client):
    created = client.post(
        "/api/scenarios",
        json={
            "name": "Alert scenario",
            "params": {"unavailable_teacher_ids": ["T-01"], "unavailable_room_ids": ["AT-L1"]},
        },
    )
    assert created.status_code == 201
    scenario_id = created.json()["scenario"]["id"]
    response = client.get("/api/alerts", params={"scenario_id": scenario_id})
    assert response.status_code == 200
    body = response.json()
    assert body["source"] == "scenario"
    assert any(alert["category"] in {"Disruption", "Infrastructure"} for alert in body["alerts"])
    assert client.get("/api/alerts", params={"scenario_id": "missing"}).status_code == 404


def test_recommendations_are_evidence_based(client):
    response = client.get("/api/recommendations")
    assert response.status_code == 200
    body = response.json()
    assert body["count"] == len(body["recommendations"])
    for recommendation in body["recommendations"]:
        assert recommendation["evidence"]
        assert recommendation["action"]
        assert recommendation["rationale"]
        assert recommendation["route"].startswith("/")
        assert recommendation["confidence"] in {"high", "medium", "low"}
        for evidence in recommendation["evidence"]:
            assert "metric" in evidence and "value" in evidence


def test_severity_assessment_is_deterministic_and_monotonic(client):
    baseline = client.post("/api/assess", json={"params": {}})
    assert baseline.status_code == 200
    low = baseline.json()["assessment"]
    assert low["level"] == "low"
    assert low["score"] < 20

    increased = client.post("/api/assess", json={"params": {"enrollment_delta": 300}})
    assert increased.status_code == 200
    high = increased.json()["assessment"]
    assert high["score"] >= low["score"]
    assert high["affected"]["sessions"] >= 0
    assert high["factors"]

    labs = client.get("/api/campus").json()["rooms"]
    lab_ids = [room["id"] for room in labs if room["kind"] == "lab"]
    critical = client.post("/api/assess", json={"params": {"unavailable_room_ids": lab_ids}})
    assert critical.status_code == 200
    critical_assessment = critical.json()["assessment"]
    assert critical_assessment["level"] == "critical"
    assert any(factor["metric"] == "facility_category_loss" for factor in critical_assessment["factors"])
    assert critical_assessment["score"] >= high["score"]

    invalid = client.post("/api/assess", json={"params": {"unavailable_building_ids": ["NOPE"]}})
    assert invalid.status_code == 422


def test_seven_server_templates_are_valid(client, db):
    response = client.get("/api/templates")
    assert response.status_code == 200
    templates = response.json()["templates"]
    assert len(templates) == 7
    names = [template["name"] for template in templates]
    assert names == [
        "Enrollment Expansion",
        "Laboratory Shutdown",
        "Teacher Shortage",
        "Classroom Overcrowding",
        "Energy Conservation",
        "Emergency Campus Disruption",
        "Semester Timetable Restructuring",
    ]
    campus = load_campus(db)
    for template in templates:
        assert template["fields"]
        assert template["assumptions"]
        errors = simulation.validate_params(campus, template["params"])
        assert errors == [], (template["name"], errors)


def test_each_template_executes_and_produces_a_difference(client):
    templates = client.get("/api/templates").json()["templates"]
    for template in templates:
        created = client.post(
            "/api/scenarios",
            json={"name": f"Template · {template['name']}", "params": template["params"]},
        )
        assert created.status_code == 201, (template["name"], created.text)
        scenario = created.json()["scenario"]
        assert scenario["metrics"]["sessions_total"] == 112
        assert scenario["difference"]["available"] is True
        detail = client.get(f"/api/scenarios/{scenario['id']}/difference")
        assert detail.status_code == 200
        assert detail.json()["difference"]["changes"]


def test_extended_parameters_apply_together_without_touching_baseline(client, db):
    campus = load_campus(db)
    baseline_rooms = {room["id"]: room for room in campus.rooms}
    baseline_sessions = [dict(session) for session in campus.sessions]

    params = {
        "enrollment_delta": 150,
        "unavailable_building_ids": ["AD"],
        "lab_availability_pct": 50,
        "equipment_loss": ["cuda"],
        "teacher_workload_delta": -2,
        "unavailable_teacher_ids": ["T-01"],
        "lab_policy": "afternoon_only",
        "operating_end_slot": 7,
        "energy_mode": "efficiency",
    }
    created = client.post("/api/scenarios", json={"name": "Extended scenario", "params": params})
    assert created.status_code == 201, created.text
    scenario = created.json()["scenario"]
    state = scenario["diagnostics"]["state"]
    effective = state["effective"]
    baseline = state["baseline"]

    assert baseline["summary"]["sessions"] == len(campus.sessions)
    assert effective["summary"]["students"] == baseline["summary"]["students"] + 150
    assert effective["summary"]["available_rooms"] < baseline["summary"]["rooms"]
    assert effective["summary"]["available_labs"] < baseline["summary"]["labs"]

    closed_ad = [
        room for room in effective["rooms"]
        if room["building_id"] == "AD" and not room["available"]
    ]
    assert closed_ad, "building closure must expand to every room in AD"
    assert any("cuda" not in (room.get("equipment") or []) for room in effective["rooms"] if room["id"] == "AT-L1")

    changes = {change["id"]: change for change in scenario["difference"]["changes"]}
    assert "infrastructure.available_labs" in changes
    assert "infrastructure.building_closed.AD" in changes
    assert "policy.operating_window" in changes
    assert changes["policy.operating_window"]["after"] == "21:10"
    assert "equipment.room.AT-L1" in changes
    assert any(key.startswith("staffing.weekly_limit.") for key in changes)

    # The live baseline must not be mutated by the scenario.
    session_hash_before = [(s["id"], s["room_id"], s["day"], s["start_slot"]) for s in baseline_sessions]
    refreshed = load_campus(db)
    session_hash_after = [(s["id"], s["room_id"], s["day"], s["start_slot"]) for s in refreshed.sessions]
    assert session_hash_before == session_hash_after
    assert {room["id"]: room["capacity"] for room in refreshed.rooms} == {
        room_id: room["capacity"] for room_id, room in baseline_rooms.items()
    }
