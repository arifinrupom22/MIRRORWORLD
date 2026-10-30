"""OR-Tools CP-SAT scheduling engine.

Model
-----
* ``room[s, r]`` is a Boolean: session *s* uses room *r*.
* ``start[s]`` is an integer global slot index (day * 7 + slot).
* Optional room intervals plus mandatory teacher and student-group intervals
  are handled by ``AddNoOverlap``.

This compact formulation keeps the weekly timetable solvable in seconds while
enforcing every documented hard constraint. A deterministic constructive pass
provides the solver with a valid incumbent; CP-SAT is still responsible for the
final plan and its objective value.
"""

from __future__ import annotations

import time
from collections import defaultdict
from dataclasses import dataclass

from ortools.sat.python import cp_model

from . import catalog
from .campus import Campus, allowed_rooms_for_course, teacher_available
from .metrics import compute_metrics
from .simulation import apply_scenario

SOLVER_SEED = 42
WEIGHT_KEYS = ("energy", "utilization", "movement")


class PlanCancelled(Exception):
    pass


class InfeasibleScenario(Exception):
    def __init__(self, message: str, diagnostics: list[dict]):
        super().__init__(message)
        self.diagnostics = diagnostics


@dataclass
class PlanSpec:
    label: str
    name: str
    strategy: str
    modifiers: dict


PLAN_SPECS = [
    PlanSpec("B", "Maximize space utilization", "utilization_first", {"utilization": 1.0, "energy": 0.0, "movement": 0.0}),
    PlanSpec("C", "Minimize energy demand", "energy_first", {"energy": 1.0, "utilization": 0.0, "movement": 0.0}),
    PlanSpec("D", "Balanced recovery", "balanced", {k: 1 / 3 for k in WEIGHT_KEYS}),
]


def normalize_weights(weights: dict | None) -> dict:
    values = {}
    for key in WEIGHT_KEYS:
        raw = (weights or {}).get(key, 0.34)
        try:
            value = float(raw)
        except (TypeError, ValueError):
            value = 0.34
        values[key] = max(0.0, min(1.0, value))
    if sum(values.values()) <= 0:
        values = {k: 1 / 3 for k in WEIGHT_KEYS}
    return values


def strategy_weights(weights: dict, spec: PlanSpec) -> dict:
    """Plans B and C are fixed strategy presets; Plan D follows user weights."""
    if spec.label == "D":
        source = weights
    else:
        source = spec.modifiers
    total = sum(source.get(k, 0.0) for k in WEIGHT_KEYS)
    if total <= 0:
        return {k: 1 / 3 for k in WEIGHT_KEYS}
    return {k: round(source[k] / total, 4) for k in WEIGHT_KEYS}


def solve_plans(
    campus: Campus,
    params: dict,
    weights: dict | None,
    time_limit: float,
    progress=None,
    cancelled=None,
) -> dict:
    weights = normalize_weights(weights)
    sessions, unassigned_details, ctx = apply_scenario(campus, params)
    diagnostics = _precheck(campus, sessions, ctx)
    if diagnostics:
        raise InfeasibleScenario("Scenario is infeasible before solving: hard constraints cannot be satisfied.", diagnostics)

    results = []
    for index, spec in enumerate(PLAN_SPECS):
        if cancelled and cancelled():
            raise PlanCancelled()
        if progress:
            progress("solving", index, len(PLAN_SPECS), f"Solving Plan {spec.label} · {spec.name}")
        plan_weights = strategy_weights(weights, spec)
        started = time.perf_counter()
        room_cap = None
        if spec.label == "D":
            solved = [r for r in results if r.get("metrics")]
            if len(solved) >= 2:
                counts = [r["metrics"]["rooms_used"] for r in solved[-2:]]
                room_cap = max(min(counts), int(round(sum(counts) / 2)))
        model, variables = _build_model(campus, sessions, ctx, plan_weights, room_cap=room_cap)
        hint = _constructive_schedule(campus, sessions, ctx, plan_weights)
        if hint and room_cap is not None and len({room for room, _d, _s in hint.values()}) > room_cap:
            hint = None
        seed_cost = None
        if hint:
            seed_cost = _assignment_cost(variables, hint)
            # CP-SAT must not return a plan worse than the valid seed.
            model.Add(variables["objective"] <= seed_cost)
            _apply_hint(model, variables, hint)
        solver = cp_model.CpSolver()
        solver.parameters.max_time_in_seconds = max(1.0, float(time_limit))
        solver.parameters.num_search_workers = 1
        solver.parameters.random_seed = SOLVER_SEED
        solver.parameters.use_optimization_hints = True
        solver.parameters.repair_hint = True
        status = solver.Solve(model)
        runtime = time.perf_counter() - started
        status_name = solver.StatusName(status)
        cap_fallback = False
        if status_name in {"INFEASIBLE", "MODEL_INVALID"} and room_cap is not None:
            # A balanced cap must never turn an otherwise feasible scenario
            # into a failure. Retry without the cap and disclose the fallback.
            cap_fallback = True
            model, variables = _build_model(campus, sessions, ctx, plan_weights)
            if hint:
                _apply_hint(model, variables, hint)
            solver = cp_model.CpSolver()
            solver.parameters.max_time_in_seconds = max(1.0, float(time_limit))
            solver.parameters.num_search_workers = 1
            solver.parameters.random_seed = SOLVER_SEED
            status = solver.Solve(model)
            runtime = time.perf_counter() - started
            status_name = solver.StatusName(status)
        if status_name in {"INFEASIBLE", "MODEL_INVALID"}:
            results.append(
                {
                    "label": spec.label,
                    "name": spec.name,
                    "strategy": spec.strategy,
                    "status": "INFEASIBLE",
                    "solver_status": status_name,
                    "runtime_seconds": round(runtime, 2),
                    "objective": None,
                    "assignments": [],
                    "metrics": None,
                    "weights": plan_weights,
                    "audit": {"passed": False, "checks": [], "violations": ["Solver could not satisfy the hard constraints."]},
                    "warnings": ["No feasible timetable was found for this objective set."],
                    "objective_terms": {},
                }
            )
            continue
        if status_name not in {"OPTIMAL", "FEASIBLE"}:
            results.append(
                {
                    "label": spec.label,
                    "name": spec.name,
                    "strategy": spec.strategy,
                    "status": "UNKNOWN",
                    "solver_status": status_name,
                    "runtime_seconds": round(runtime, 2),
                    "objective": None,
                    "assignments": [],
                    "metrics": None,
                    "weights": plan_weights,
                    "audit": {"passed": False, "checks": [], "violations": ["Solver did not return a solution within the time limit."]},
                    "warnings": ["Increase the solver time limit or relax a hard constraint."],
                    "objective_terms": {},
                }
            )
            continue

        assignments = _extract_assignments(solver, variables, sessions)
        result_cost = _assignment_cost(
            variables,
            {a["session_id"]: (a["room_id"], a["day"], a["start_slot"]) for a in assignments},
        )
        optimized_sessions = [dict(s) for s in sessions]
        placement_by_id = {a["session_id"]: a for a in assignments}
        for session in optimized_sessions:
            placement = placement_by_id.get(session["id"])
            session["room_id"] = placement["room_id"] if placement else None
            session["day"] = placement["day"] if placement else None
            session["start_slot"] = placement["start_slot"] if placement else None
        metrics = compute_metrics(
            campus,
            optimized_sessions,
            ctx["group_sizes"],
            energy_factor=ctx["energy_factor"],
            operating_end_slot=ctx["end_slot"],
            available_room_ids=ctx["available_rooms"],
        )
        audit = audit_solution(campus, optimized_sessions, ctx)
        plan_warnings = []
        if room_cap is not None:
            plan_warnings.append(
                f"Balanced plan constrained to at most {room_cap} active rooms (midpoint of Plans B and C)."
            )
        if cap_fallback:
            plan_warnings.append("Balanced room cap was infeasible in this scenario; the cap was not applied.")
        if not audit["passed"]:
            plan_warnings.append("Independent hard-constraint audit failed; this plan is not presented as feasible.")
        if status_name == "FEASIBLE":
            plan_warnings.append("Best feasible solution found within the time limit; optimality was not proven.")
        terms = {
            "energy_kwh": metrics["energy_kwh"],
            "active_room_utilization_pct": metrics["active_room_utilization_pct"],
            "movement_km": metrics["movement_km"],
            "peak_kw": metrics["peak_kw"],
            "rooms_used": metrics["rooms_used"],
            "seat_utilization_pct": metrics["seat_utilization_pct"],
        }
        results.append(
            {
                "label": spec.label,
                "name": spec.name,
                "strategy": spec.strategy,
                "status": "FEASIBLE" if audit["passed"] else "AUDIT_FAILED",
                "solver_status": status_name,
                "runtime_seconds": round(runtime, 2),
                "objective": round(solver.ObjectiveValue(), 2),
                "assignments": assignments,
                "metrics": {k: v for k, v in metrics.items() if k != "schedule"},
                "schedule": metrics["schedule"],
                "weights": plan_weights,
                "audit": audit,
                "warnings": plan_warnings,
                "objective_terms": terms,
            }
        )
        if progress:
            progress(
                "solved",
                index,
                len(PLAN_SPECS),
                f"Plan {spec.label} {status_name} in {runtime:.1f}s · {metrics['energy_kwh']:.0f} kWh/wk",
            )

    return {
        "weights": weights,
        "plans": results,
        "ctx": ctx,
        "unassigned_details": unassigned_details,
        "session_count": len(sessions),
    }


def _allowed_starts(campus: Campus, session: dict, course: dict, ctx: dict) -> list[int]:
    teacher = campus.teacher_index[course["teacher_id"]]
    starts: list[int] = []
    length = session["length"]
    for day in range(5):
        for slot in range(0, 7 - length + 1):
            if slot + length - 1 > ctx["end_slot"]:
                continue
            if course.get("needs_lab") and ctx["lab_policy"] == "afternoon_only" and slot < 3:
                continue
            if any(not teacher_available(teacher, day, slot + off) for off in range(length)):
                continue
            starts.append(day * 7 + slot)
    return starts


def _eligible_rooms(campus: Campus, course: dict, group_size: int, ctx: dict) -> list[str]:
    rooms = []
    for room in campus.rooms:
        if room["id"] not in ctx["available_rooms"]:
            continue
        if allowed_rooms_for_course(course, room, group_size):
            rooms.append(room["id"])
    return rooms


def _eligible_placements(campus: Campus, session: dict, course: dict, group_size: int, ctx: dict) -> list[tuple[str, int, int]]:
    starts = _allowed_starts(campus, session, course, ctx)
    rooms = _eligible_rooms(campus, course, group_size, ctx)
    return [(rid, start // 7, start % 7) for rid in rooms for start in starts]


def _build_model(campus: Campus, sessions: list[dict], ctx: dict, weights: dict, room_cap: int | None = None):
    model = cp_model.CpModel()
    room_choice: dict[tuple[str, str], cp_model.IntVar] = {}
    start_var: dict[str, cp_model.IntVar] = {}
    room_used: dict[str, cp_model.IntVar] = {}
    eligible_rooms: dict[str, list[str]] = {}

    room_intervals: dict[str, list] = defaultdict(list)
    teacher_intervals: dict[str, list] = defaultdict(list)
    group_intervals: dict[str, list] = defaultdict(list)
    session_rooms: dict[str, list[cp_model.IntVar]] = defaultdict(list)
    session_course: dict[str, dict] = {}
    group_building: dict[tuple[str, str], cp_model.IntVar] = {}
    session_group: dict[str, str] = {}
    room_building: dict[str, str] = {}

    for session in sessions:
        course = campus.course_index[session["course_id"]]
        session_course[session["id"]] = course
        group_size = ctx["group_sizes"][session["group_id"]]
        starts = _allowed_starts(campus, session, course, ctx)
        rooms = _eligible_rooms(campus, course, group_size, ctx)
        if not starts or not rooms:
            raise InfeasibleScenario(
                "Scenario is infeasible: a session has no eligible room/slot.",
                [
                    {
                        "constraint": "room_eligibility",
                        "session_id": session["id"],
                        "label": f"{course['code']} · {session['group_id']}",
                        "detail": "No eligible room combined with an available start slot.",
                    }
                ],
            )
        eligible_rooms[session["id"]] = rooms
        start_var[session["id"]] = model.NewIntVarFromDomain(
            cp_model.Domain.FromValues(starts), f"start_{session['id']}"
        )
        choices = []
        session_group[session["id"]] = session["group_id"]
        for rid in rooms:
            var = model.NewBoolVar(f"room_{session['id']}_{rid}")
            room_choice[(session["id"], rid)] = var
            choices.append(var)
            building_id = campus.room_index[rid]["building_id"]
            room_building[rid] = building_id
            key = (session["group_id"], building_id)
            if key not in group_building:
                group_building[key] = model.NewBoolVar(f"group_building_{key[0]}_{key[1]}")
            model.Add(group_building[key] >= var)
            end = start_var[session["id"]] + session["length"]
            room_intervals[rid].append(
                model.NewOptionalIntervalVar(
                    start_var[session["id"]], session["length"], end, var, f"room_iv_{session['id']}_{rid}"
                )
            )
        model.AddExactlyOne(choices)
        session_rooms[session["id"]] = choices

        end = start_var[session["id"]] + session["length"]
        teacher_id = course["teacher_id"]
        teacher_intervals[teacher_id].append(
            model.NewIntervalVar(start_var[session["id"]], session["length"], end, f"teacher_iv_{session['id']}")
        )
        group_intervals[session["group_id"]].append(
            model.NewIntervalVar(start_var[session["id"]], session["length"], end, f"group_iv_{session['id']}")
        )

    for rid in {r["id"] for r in campus.rooms}:
        used = model.NewBoolVar(f"room_used_{rid}")
        room_used[rid] = used
        vars_for_room = [room_choice[(s["id"], rid)] for s in sessions if (s["id"], rid) in room_choice]
        if vars_for_room:
            model.AddMaxEquality(used, vars_for_room)
        else:
            model.Add(used == 0)
    if room_cap is not None:
        model.Add(sum(room_used.values()) <= max(1, room_cap))
    for rid, intervals in room_intervals.items():
        if intervals:
            model.AddNoOverlap(intervals)
    for intervals in teacher_intervals.values():
        if intervals:
            model.AddNoOverlap(intervals)
    for intervals in group_intervals.values():
        if intervals:
            model.AddNoOverlap(intervals)

    # Objective normalisers use each term's feasible range so that the
    # documented weights express comparable trade-offs rather than raw units.
    energy_range = 0.0
    low_energy: dict[str, float] = {}
    for session in sessions:
        course = session_course[session["id"]]
        energies = []
        for rid in eligible_rooms[session["id"]]:
            room = campus.room_index[rid]
            power = room["power_kw"] + (room.get("equipment_kw", 0.0) if course.get("needs_lab") else 0.0)
            energies.append(session["length"] * catalog.SLOT_HOURS * power)
        low_energy[session["id"]] = min(energies)
        energy_range += max(energies) - min(energies)

    scale = 1_000_000
    energy_coef = round(weights["energy"] * scale / max(1.0, energy_range))
    # Active-room utilisation is exactly the inverse of the number of rooms
    # used, because the occupied room-hours are fixed once every session is
    # placed. Minimising the fixed room cost therefore aligns the solver with
    # the reported utilisation metric.
    room_coef = round(weights["utilization"] * scale / max(1, len(room_used) - 1))
    # Movement proxy: minimise the number of distinct (group, building) pairs.
    # Concentrating a cohort's classes in fewer buildings reduces walking
    # transitions; the reported movement KPI remains independently computed.
    move_raw = max(1, len(group_building) - len({g for g, _b in group_building}))
    move_coef = round(weights["movement"] * scale / move_raw)

    terms = []
    placement_cost: dict[tuple[str, str], int] = {}
    for session in sessions:
        course = session_course[session["id"]]
        for rid in eligible_rooms[session["id"]]:
            var = room_choice[(session["id"], rid)]
            room = campus.room_index[rid]
            power = room["power_kw"] + (room.get("equipment_kw", 0.0) if course.get("needs_lab") else 0.0)
            energy = session["length"] * catalog.SLOT_HOURS * power
            cost = round((energy - low_energy[session["id"]]) * 100 * energy_coef)
            placement_cost[(session["id"], rid)] = int(cost)
            terms.append(var * int(cost))
    for rid, var in room_used.items():
        terms.append(var * int(room_coef))
    for key, var in group_building.items():
        terms.append(var * int(move_coef))
    objective = sum(terms)
    model.Minimize(objective)

    variables = {
        "room_choice": room_choice,
        "start": start_var,
        "room_used": room_used,
        "eligible_rooms": eligible_rooms,
        "objective": objective,
        "placement_cost": placement_cost,
        "room_coef": int(room_coef),
        "move_coef": int(move_coef),
        "group_building": group_building,
        "session_group": session_group,
        "room_building": room_building,
    }
    return model, variables


def _assignment_cost(variables, assignment: dict[str, tuple[str, int, int]]) -> int:
    cost = 0
    used_rooms = set()
    pairs = set()
    for session_id, (room_id, _day, _slot) in assignment.items():
        if room_id is None:
            continue
        cost += variables["placement_cost"].get((session_id, room_id), 0)
        used_rooms.add(room_id)
        building = variables["room_building"].get(room_id)
        group = variables["session_group"].get(session_id)
        if building and group:
            pairs.add((group, building))
    return cost + variables["room_coef"] * len(used_rooms) + variables["move_coef"] * len(pairs)


def _apply_hint(model, variables, hint: dict[str, tuple[str, int, int]]) -> None:
    for session_id, (room_id, day, slot) in hint.items():
        model.AddHint(variables["start"][session_id], day * 7 + slot)
        for rid in variables["eligible_rooms"][session_id]:
            model.AddHint(variables["room_choice"][(session_id, rid)], 1 if rid == room_id else 0)


def _extract_assignments(solver, variables, sessions: list[dict]) -> list[dict]:
    assignments = []
    for session in sessions:
        chosen = None
        for rid in variables["eligible_rooms"][session["id"]]:
            if solver.Value(variables["room_choice"][(session["id"], rid)]):
                chosen = rid
                break
        start = solver.Value(variables["start"][session["id"]])
        assignments.append(
            {
                "session_id": session["id"],
                "room_id": chosen,
                "day": start // 7,
                "start_slot": start % 7,
            }
        )
    return assignments


def _constructive_schedule(campus: Campus, sessions: list[dict], ctx: dict, weights: dict) -> dict | None:
    """Build a valid, objective-weighted seed timetable for CP-SAT."""
    placement_cache: dict[str, list[tuple[str, int, int]]] = {}
    for session in sessions:
        course = campus.course_index[session["course_id"]]
        group_size = ctx["group_sizes"][session["group_id"]]
        placement_cache[session["id"]] = _eligible_placements(campus, session, course, group_size, ctx)
    order = sorted(sessions, key=lambda s: (len(placement_cache[s["id"]]), -s["length"], s["id"]))
    room_busy: set[tuple[str, int, int]] = set()
    teacher_busy: set[tuple[str, int, int]] = set()
    group_busy: set[tuple[str, int, int]] = set()
    used_rooms: set[str] = set()
    used_group_buildings: set[tuple[str, str]] = set()
    slot_rooms: dict[tuple[int, int], int] = defaultdict(int)
    assignment: dict[str, tuple[str, int, int]] = {}

    for session in order:
        course = campus.course_index[session["course_id"]]
        group = campus.group_index[session["group_id"]]
        group_size = ctx["group_sizes"][session["group_id"]]
        best = None
        best_cost = float("inf")
        for room_id, day, slot in placement_cache[session["id"]]:
            covered = range(slot, slot + session["length"])
            if any((room_id, day, t) in room_busy for t in covered):
                continue
            if any((course["teacher_id"], day, t) in teacher_busy for t in covered):
                continue
            if any((session["group_id"], day, t) in group_busy for t in covered):
                continue
            room = campus.room_index[room_id]
            power = room["power_kw"] + (room.get("equipment_kw", 0.0) if course.get("needs_lab") else 0.0)
            slack = room["capacity"] - group_size
            distance = catalog.travel_distance(group["home_building_id"], room["building_id"])
            new_room = 0 if room_id in used_rooms else 1
            new_group_building = 0 if (group["id"], room["building_id"]) in used_group_buildings else 1
            cost = (
                weights["energy"] * (power / 20.0)
                + weights["utilization"] * (new_room + 0.02 * (slack / 100.0))
                + weights["movement"] * new_group_building
                + distance / 10000.0
                + slot_rooms[(day, slot)] * 0.004
                + slot * 0.0004
                + day * 0.0001
                + len(room_id) * 0.000001
            )
            if cost < best_cost:
                best_cost = cost
                best = (room_id, day, slot)
        if best is None:
            return None
        room_id, day, slot = best
        assignment[session["id"]] = best
        used_rooms.add(room_id)
        used_group_buildings.add((session["group_id"], campus.room_index[room_id]["building_id"]))
        for t in range(slot, slot + session["length"]):
            room_busy.add((room_id, day, t))
            teacher_busy.add((course["teacher_id"], day, t))
            group_busy.add((session["group_id"], day, t))
        slot_rooms[(day, slot)] += 1
    return assignment


def _precheck(campus: Campus, sessions: list[dict], ctx: dict) -> list[dict]:
    diagnostics: list[dict] = []
    for session in sessions:
        course = campus.course_index[session["course_id"]]
        group_size = ctx["group_sizes"][session["group_id"]]
        starts = _allowed_starts(campus, session, course, ctx)
        rooms = _eligible_rooms(campus, course, group_size, ctx)
        if not starts or not rooms:
            group = campus.group_index[session["group_id"]]
            if course.get("needs_lab"):
                reasons = (
                    f"No {course['needs_lab']} laboratory with {', '.join(course.get('required_equipment') or ['required equipment'])} "
                    f"and at least {group_size} seats is available in the permitted window."
                )
            else:
                reasons = f"No classroom with at least {group_size} seats is available in the permitted window."
            diagnostics.append(
                {
                    "constraint": "room_eligibility",
                    "session_id": session["id"],
                    "label": f"{course['code']} · {group['name']}",
                    "detail": reasons,
                }
            )
    load_by_teacher: dict[str, float] = defaultdict(float)
    for session in sessions:
        course = campus.course_index[session["course_id"]]
        load_by_teacher[course["teacher_id"]] += session["length"] * catalog.SLOT_HOURS
    for tid, load in load_by_teacher.items():
        teacher = campus.teacher_index[tid]
        if load > teacher["max_weekly_hours"] + 1e-6:
            diagnostics.append(
                {
                    "constraint": "teacher_weekly_hours",
                    "teacher_id": tid,
                    "label": teacher["name"],
                    "detail": f"Scheduled load {load:.1f}h exceeds the {teacher['max_weekly_hours']}h weekly limit.",
                }
            )
    return diagnostics[:40]


def audit_solution(campus: Campus, sessions: list[dict], ctx: dict) -> dict:
    """Independently verify every hard constraint of a returned timetable."""
    checks = []
    violations: list[str] = []
    assigned = [s for s in sessions if s.get("room_id") and s.get("day") is not None and s.get("start_slot") is not None]
    checks.append(
        {
            "name": "Every session assigned exactly once",
            "status": "pass" if len(assigned) == len(sessions) else "fail",
            "detail": f"{len(assigned)}/{len(sessions)} sessions placed.",
        }
    )
    if len(assigned) != len(sessions):
        violations.append("Some sessions are unassigned.")

    rooms = defaultdict(list)
    teachers = defaultdict(list)
    groups = defaultdict(list)
    capacity_bad = []
    facility_bad = []
    availability_bad = []
    window_bad = []
    load_by_teacher = defaultdict(float)
    for session in assigned:
        course = campus.course_index[session["course_id"]]
        room = campus.room_index[session["room_id"]]
        group_size = ctx["group_sizes"][session["group_id"]]
        for off in range(session["length"]):
            t = session["start_slot"] + off
            rooms[(session["room_id"], session["day"], t)].append(session["id"])
            teachers[(course["teacher_id"], session["day"], t)].append(session["id"])
            groups[(session["group_id"], session["day"], t)].append(session["id"])
        if group_size > room["capacity"]:
            capacity_bad.append(session["id"])
        if not allowed_rooms_for_course(course, room, group_size):
            facility_bad.append(session["id"])
        teacher = campus.teacher_index[course["teacher_id"]]
        if any(
            not teacher_available(teacher, session["day"], session["start_slot"] + off)
            for off in range(session["length"])
        ):
            availability_bad.append(session["id"])
        if session["start_slot"] + session["length"] - 1 > ctx["end_slot"]:
            window_bad.append(session["id"])
        if session["room_id"] not in ctx["available_rooms"]:
            capacity_bad.append(session["id"])
        load_by_teacher[course["teacher_id"]] += session["length"] * catalog.SLOT_HOURS

    def add_check(name: str, bad: list, detail: str):
        ok = not bad
        checks.append({"name": name, "status": "pass" if ok else "fail", "detail": detail if not ok else "No violations."})
        if not ok:
            violations.extend(bad[:10])

    add_check("Room capacity upheld", capacity_bad, f"{len(capacity_bad)} session(s) exceed capacity or use a closed room.")
    add_check("Lab type and equipment match", facility_bad, f"{len(facility_bad)} session(s) do not match the required facility.")
    add_check("Instructor availability upheld", availability_bad, f"{len(availability_bad)} session(s) sit outside availability.")
    add_check("Operating window upheld", window_bad, f"{len(window_bad)} session(s) fall outside the operating window.")
    room_clash = [k for k, v in rooms.items() if len(v) > 1]
    teacher_clash = [k for k, v in teachers.items() if len(v) > 1]
    group_clash = [k for k, v in groups.items() if len(v) > 1]
    add_check("No room double-booking", room_clash, f"{len(room_clash)} room slot(s) double-booked.")
    add_check("No instructor double-booking", teacher_clash, f"{len(teacher_clash)} instructor slot(s) double-booked.")
    add_check("No student-group double-booking", group_clash, f"{len(group_clash)} group slot(s) double-booked.")
    overload = [t for t, load in load_by_teacher.items() if load > campus.teacher_index[t]["max_weekly_hours"] + 1e-6]
    add_check("Weekly teaching limits upheld", overload, f"{len(overload)} instructor(s) exceed weekly limits.")

    return {
        "passed": all(c["status"] == "pass" for c in checks),
        "checks": checks,
        "violations": violations,
        "hard_constraint_count": len(checks),
    }
