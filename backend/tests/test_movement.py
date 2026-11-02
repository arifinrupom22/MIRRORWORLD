"""Comprehensive test suite for Phase 3: Student Movement Service and API.

Validates:
1. Baseline pedestrian movement transitions and summary metrics.
2. Same-building vs inter-building distance resolution.
3. Missing distance producing null walking_time_min, feasible, and tight.
4. Session eligibility: displaced/invalid sessions excluded, never skipping B to connect A->C.
5. Weekly boundary cases (no Friday->Monday wrap-around transitions).
6. Overlapping session detection and exclusion with warning.
7. Time slot gap accuracy using catalog.TIME_SLOTS start/end (not naive hours).
8. HTTP endpoint GET /api/movement validation, query filtering, and error handling.
"""

from __future__ import annotations

import copy
import pytest
from fastapi.testclient import TestClient

from app import catalog
from app.campus import Campus
from app.movement import _time_str_to_min, compute_movement
from app.schemas import MovementResponse


def test_time_str_to_min():
    assert _time_str_to_min("08:00") == 480
    assert _time_str_to_min("09:30") == 570
    assert _time_str_to_min("09:40") == 580
    # Gap between slot 0 end (09:30) and slot 1 start (09:40) is exactly 10 minutes
    assert _time_str_to_min("09:40") - _time_str_to_min("09:30") == 10


def test_baseline_movement_computation(campus: Campus):
    response = compute_movement(campus, params={})
    assert isinstance(response, MovementResponse)
    assert response.summary.total_transitions > 0
    assert response.summary.unique_routes > 0
    assert response.summary.total_students > 0
    assert response.summary.total_distance_m > 0
    assert response.summary.total_walking_time_min > 0

    # Every transition must satisfy structural integrity
    for t in response.transitions:
        assert t.cohort_id in campus.group_index
        assert t.from_room_id in campus.room_index
        assert t.to_room_id in campus.room_index
        assert t.from_building_id in campus.building_index
        assert t.to_building_id in campus.building_index
        assert t.time_gap_min >= 0


def test_same_building_vs_inter_building(campus: Campus):
    # In catalog.DISTANCES, same-building distance is 40m
    response = compute_movement(campus, params={})
    same_bldg = [t for t in response.transitions if t.same_building]
    inter_bldg = [t for t in response.transitions if not t.same_building]

    if same_bldg:
        for t in same_bldg:
            assert t.from_building_id == t.to_building_id
            assert t.unknown_distance is False
            assert t.distance_m is not None
            assert t.walking_time_min is not None
            assert t.feasible is True

    if inter_bldg:
        for t in inter_bldg:
            assert t.from_building_id != t.to_building_id
            if not t.unknown_distance:
                assert t.distance_m == catalog.travel_distance(
                    t.from_building_id, t.to_building_id
                )
                expected_walk = round(t.distance_m / 84.0, 2)
                assert t.walking_time_min == expected_walk
                assert t.feasible == (expected_walk <= t.time_gap_min)
                assert t.tight == (t.time_gap_min <= 2 * expected_walk)


def test_missing_distance_produces_nulls_and_warning():
    # Build synthetic campus with a pair of buildings having no catalog distance
    mock_campus = Campus(
        buildings=[
            {
                "id": "B1",
                "code": "B1",
                "name": "Building 1",
                "zone": "North",
                "purpose": "Test",
                "floors": 1,
                "map": {"x": 0, "y": 0, "w": 100, "h": 100},
                "accent": "#fff",
            },
            {
                "id": "B_UNKNOWN",
                "code": "BU",
                "name": "Unknown Dist Block",
                "zone": "South",
                "purpose": "Test",
                "floors": 1,
                "map": {"x": 200, "y": 200, "w": 100, "h": 100},
                "accent": "#fff",
            },
        ],
        rooms=[
            {
                "id": "R1",
                "building_id": "B1",
                "code": "R1",
                "name": "Room 1",
                "kind": "classroom",
                "capacity": 50,
                "floor": 1,
                "power_kw": 1.0,
            },
            {
                "id": "R_UNK",
                "building_id": "B_UNKNOWN",
                "code": "RU",
                "name": "Room Unknown",
                "kind": "classroom",
                "capacity": 50,
                "floor": 1,
                "power_kw": 1.0,
            },
        ],
        teachers=[{"id": "T1", "name": "Teacher 1", "max_weekly_hours": 20}],
        groups=[{"id": "G1", "name": "Group 1", "size": 30}],
        courses=[
            {
                "id": "C1",
                "code": "C1",
                "teacher_id": "T1",
                "length": 1,
                "weekly_sessions": 2,
            }
        ],
        group_courses=[{"group_id": "G1", "course_id": "C1"}],
        sessions=[
            {
                "id": "S1",
                "course_id": "C1",
                "group_id": "G1",
                "room_id": "R1",
                "day": 0,
                "start_slot": 0,
                "length": 1,
            },
            {
                "id": "S2",
                "course_id": "C1",
                "group_id": "G1",
                "room_id": "R_UNK",
                "day": 0,
                "start_slot": 1,
                "length": 1,
            },
        ],
    )
    mock_campus.rebuild_indexes()

    resp = compute_movement(mock_campus, params={})
    assert len(resp.transitions) == 1
    t = resp.transitions[0]
    assert t.unknown_distance is True
    assert t.distance_m is None
    assert t.walking_time_min is None
    assert t.feasible is None
    assert t.tight is None
    assert resp.summary.unknown_distance_transitions == 1
    assert any("Missing distance entry" in w for w in resp.warnings)


def test_displaced_intervening_session_does_not_skip(campus: Campus):
    """If a cohort has sessions A, B, C, and B is displaced, A must not connect to C."""
    mock_campus = Campus(
        buildings=copy.deepcopy(campus.buildings),
        rooms=copy.deepcopy(campus.rooms),
        teachers=copy.deepcopy(campus.teachers),
        groups=[{"id": "G_TEST", "name": "Test Group", "size": 25}],
        courses=copy.deepcopy(campus.courses[:3]),
        group_courses=[
            {"group_id": "G_TEST", "course_id": campus.courses[0]["id"]},
            {"group_id": "G_TEST", "course_id": campus.courses[1]["id"]},
            {"group_id": "G_TEST", "course_id": campus.courses[2]["id"]},
        ],
        sessions=[
            {
                "id": "S_A",
                "course_id": campus.courses[0]["id"],
                "group_id": "G_TEST",
                "room_id": "AT-101",
                "day": 0,
                "start_slot": 0,
                "length": 1,
            },
            {
                "id": "S_B_DISPLACED",
                "course_id": campus.courses[1]["id"],
                "group_id": "G_TEST",
                "room_id": None,  # Displaced/unassigned
                "day": 0,
                "start_slot": 1,
                "length": 1,
                "scenario_status": "displaced",
            },
            {
                "id": "S_C",
                "course_id": campus.courses[2]["id"],
                "group_id": "G_TEST",
                "room_id": "FL-101",
                "day": 0,
                "start_slot": 2,
                "length": 1,
            },
        ],
    )
    mock_campus.rebuild_indexes()

    resp = compute_movement(mock_campus, params={})
    # There should be NO transition directly between S_A and S_C!
    assert len(resp.transitions) == 0
    assert any("displaced or has no room" in w for w in resp.warnings)


def test_no_weekly_boundary_transitions():
    """Transitions must not cross from Friday back to Monday (or backwards in days)."""
    mock_campus = Campus(
        buildings=[
            {
                "id": "AT",
                "code": "AT",
                "name": "Alan Turing",
                "zone": "North",
                "purpose": "CS",
                "floors": 1,
                "map": {"x": 0, "y": 0, "w": 100, "h": 100},
                "accent": "#fff",
            }
        ],
        rooms=[
            {
                "id": "AT-101",
                "building_id": "AT",
                "code": "AT-101",
                "name": "101",
                "kind": "classroom",
                "capacity": 40,
                "floor": 1,
                "power_kw": 1.0,
            }
        ],
        teachers=[{"id": "T1", "name": "Teacher 1", "max_weekly_hours": 20}],
        groups=[{"id": "G1", "name": "Group 1", "size": 30}],
        courses=[
            {
                "id": "C1",
                "code": "C1",
                "teacher_id": "T1",
                "length": 1,
                "weekly_sessions": 2,
            }
        ],
        group_courses=[{"group_id": "G1", "course_id": "C1"}],
        sessions=[
            {
                "id": "S_FRI",
                "course_id": "C1",
                "group_id": "G1",
                "room_id": "AT-101",
                "day": 4,  # Friday
                "start_slot": 5,
                "length": 1,
            },
            {
                "id": "S_MON_NEXT",
                "course_id": "C1",
                "group_id": "G1",
                "room_id": "AT-101",
                "day": 0,  # Monday (wrapped)
                "start_slot": 0,
                "length": 1,
            },
        ],
    )
    mock_campus.rebuild_indexes()

    resp = compute_movement(mock_campus, params={})
    # Friday -> Monday is across weekly boundary; must be omitted
    assert len(resp.transitions) == 0
    assert any("weekly boundary" in w for w in resp.warnings)


def test_overlapping_sessions_excluded():
    mock_campus = Campus(
        buildings=[
            {
                "id": "AT",
                "code": "AT",
                "name": "Alan Turing",
                "zone": "North",
                "purpose": "CS",
                "floors": 1,
                "map": {"x": 0, "y": 0, "w": 100, "h": 100},
                "accent": "#fff",
            }
        ],
        rooms=[
            {
                "id": "AT-101",
                "building_id": "AT",
                "code": "AT-101",
                "name": "101",
                "kind": "classroom",
                "capacity": 40,
                "floor": 1,
                "power_kw": 1.0,
            }
        ],
        teachers=[{"id": "T1", "name": "Teacher 1", "max_weekly_hours": 20}],
        groups=[{"id": "G1", "name": "Group 1", "size": 30}],
        courses=[
            {
                "id": "C1",
                "code": "C1",
                "teacher_id": "T1",
                "length": 2,
                "weekly_sessions": 2,
            }
        ],
        group_courses=[{"group_id": "G1", "course_id": "C1"}],
        sessions=[
            {
                "id": "S1",
                "course_id": "C1",
                "group_id": "G1",
                "room_id": "AT-101",
                "day": 1,
                "start_slot": 0,
                "length": 2,  # Ends at slot 1 end (11:10)
            },
            {
                "id": "S2",
                "course_id": "C1",
                "group_id": "G1",
                "room_id": "AT-101",
                "day": 1,
                "start_slot": 1,  # Overlaps! Starts at 09:40
                "length": 1,
            },
        ],
    )
    mock_campus.rebuild_indexes()

    resp = compute_movement(mock_campus, params={})
    assert len(resp.transitions) == 0
    assert any("Overlapping sessions" in w for w in resp.warnings)


def test_movement_filtering_by_day_and_slot(campus: Campus):
    # Retrieve all
    all_resp = compute_movement(campus, params={})
    # Filter day 0, slot 1
    slot_resp = compute_movement(campus, params={}, day=0, slot=1)

    assert slot_resp.day == 0
    assert slot_resp.slot == 1
    for t in slot_resp.transitions:
        assert t.to_slot == 1
        if t.is_cross_day:
            assert t.to_day == 0
        else:
            assert t.from_day == 0


def test_movement_api_endpoint(client: TestClient):
    # 1. Baseline movement via query param endpoint
    resp = client.get("/api/movement")
    assert resp.status_code == 200
    body = resp.json()
    assert "transitions" in body
    assert "summary" in body
    assert "warnings" in body
    assert body["summary"]["total_transitions"] > 0

    # 2. Filtered by day and slot
    filtered_resp = client.get("/api/movement", params={"day": 0, "slot": 1})
    assert filtered_resp.status_code == 200
    filtered_body = filtered_resp.json()
    assert filtered_body["day"] == 0
    assert filtered_body["slot"] == 1

    # 3. Invalid day parameter
    err_day = client.get("/api/movement", params={"day": 10})
    assert err_day.status_code == 422

    # 4. Invalid slot parameter
    err_slot = client.get("/api/movement", params={"slot": 99})
    assert err_slot.status_code == 422

    # 5. Non-existent scenario_id on /api/movement
    err_scen = client.get("/api/movement", params={"scenario_id": "nonexistent-id"})
    assert err_scen.status_code == 404

    # 6. Valid scenario via GET /api/scenarios/{scenario_id}/movement
    scenarios_resp = client.get("/api/scenarios")
    assert scenarios_resp.status_code == 200
    scenarios = scenarios_resp.json()["scenarios"]
    assert len(scenarios) > 0
    scenario_id = scenarios[0]["id"]

    scen_resp = client.get(f"/api/scenarios/{scenario_id}/movement")
    assert scen_resp.status_code == 200
    scen_body = scen_resp.json()
    assert scen_body["scenario_id"] == scenario_id
    assert "transitions" in scen_body
    assert "summary" in scen_body
    assert scen_body["summary"]["total_transitions"] > 0

    # 7. Valid scenario with day and slot filters on /api/scenarios/{scenario_id}/movement
    scen_filter_resp = client.get(
        f"/api/scenarios/{scenario_id}/movement", params={"day": 0, "slot": 1}
    )
    assert scen_filter_resp.status_code == 200
    assert scen_filter_resp.json()["day"] == 0
    assert scen_filter_resp.json()["slot"] == 1

    # 8. Missing scenario on GET /api/scenarios/{scenario_id}/movement returns 404
    missing_scen = client.get("/api/scenarios/missing-uuid-12345/movement")
    assert missing_scen.status_code == 404
    assert "not found" in missing_scen.json()["detail"].lower()


def test_student_weighted_metric_aggregation(campus: Campus):
    """Verify exact student-weighted distance and walking time formulas."""
    # 1. Baseline campus (all distances known)
    resp = compute_movement(campus, params={})
    expected_student_distance = sum(
        t.distance_m * t.student_count
        for t in resp.transitions
        if t.distance_m is not None
    )
    expected_student_time = round(
        sum(
            t.walking_time_min * t.student_count
            for t in resp.transitions
            if t.walking_time_min is not None
        ),
        2,
    )
    assert resp.summary.total_distance_m == expected_student_distance
    assert resp.summary.total_walking_time_min == expected_student_time
    assert resp.summary.total_students == sum(t.student_count for t in resp.transitions)

    # 2. Synthetic campus with mixed known and unknown distance transitions
    mock_campus = Campus(
        buildings=[
            {
                "id": "B_KNOWN",
                "code": "BK",
                "name": "Known",
                "zone": "N",
                "purpose": "T",
                "floors": 1,
                "map": {"x": 0, "y": 0, "w": 100, "h": 100},
                "accent": "#fff",
            },
            {
                "id": "B_UNKNOWN",
                "code": "BU",
                "name": "Unknown",
                "zone": "S",
                "purpose": "T",
                "floors": 1,
                "map": {"x": 200, "y": 200, "w": 100, "h": 100},
                "accent": "#fff",
            },
        ],
        rooms=[
            {
                "id": "R_K1",
                "building_id": "B_KNOWN",
                "code": "RK1",
                "name": "Room K1",
                "kind": "classroom",
                "capacity": 50,
                "floor": 1,
                "power_kw": 1.0,
            },
            {
                "id": "R_K2",
                "building_id": "B_KNOWN",
                "code": "RK2",
                "name": "Room K2",
                "kind": "classroom",
                "capacity": 50,
                "floor": 1,
                "power_kw": 1.0,
            },
            {
                "id": "R_U",
                "building_id": "B_UNKNOWN",
                "code": "RU",
                "name": "Room U",
                "kind": "classroom",
                "capacity": 50,
                "floor": 1,
                "power_kw": 1.0,
            },
        ],
        teachers=[{"id": "T1", "name": "Teacher 1", "max_weekly_hours": 20}],
        groups=[
            {"id": "G_K", "name": "Group Known", "size": 25},
            {"id": "G_U", "name": "Group Unknown", "size": 35},
        ],
        courses=[
            {
                "id": "C1",
                "code": "C1",
                "teacher_id": "T1",
                "length": 1,
                "weekly_sessions": 2,
            },
            {
                "id": "C2",
                "code": "C2",
                "teacher_id": "T1",
                "length": 1,
                "weekly_sessions": 2,
            },
        ],
        group_courses=[
            {"group_id": "G_K", "course_id": "C1"},
            {"group_id": "G_U", "course_id": "C2"},
        ],
        sessions=[
            {
                "id": "SK1",
                "course_id": "C1",
                "group_id": "G_K",
                "room_id": "R_K1",
                "day": 0,
                "start_slot": 0,
                "length": 1,
            },
            {
                "id": "SK2",
                "course_id": "C1",
                "group_id": "G_K",
                "room_id": "R_K2",
                "day": 0,
                "start_slot": 1,
                "length": 1,
            },
            {
                "id": "SU1",
                "course_id": "C2",
                "group_id": "G_U",
                "room_id": "R_K1",
                "day": 0,
                "start_slot": 0,
                "length": 1,
            },
            {
                "id": "SU2",
                "course_id": "C2",
                "group_id": "G_U",
                "room_id": "R_U",
                "day": 0,
                "start_slot": 1,
                "length": 1,
            },
        ],
    )
    mock_campus.rebuild_indexes()
    mixed_resp = compute_movement(mock_campus, params={})
    assert mixed_resp.summary.total_transitions == 2
    assert mixed_resp.summary.unknown_distance_transitions == 1

    known_t = next(t for t in mixed_resp.transitions if not t.unknown_distance)
    unk_t = next(t for t in mixed_resp.transitions if t.unknown_distance)
    assert unk_t.distance_m is None
    assert unk_t.walking_time_min is None
    assert unk_t.feasible is None
    assert unk_t.tight is None

    # Total distance and walking time only aggregate known-distance transitions
    assert mixed_resp.summary.total_distance_m == (
        known_t.distance_m * known_t.student_count
    )
    assert mixed_resp.summary.total_walking_time_min == round(
        known_t.walking_time_min * known_t.student_count, 2
    )
    # Total students is the sum across all transitions (both known and unknown)
    assert mixed_resp.summary.total_students == (
        known_t.student_count + unk_t.student_count
    )

