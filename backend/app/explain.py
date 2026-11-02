"""Comparison metrics and rule-based explanation engine.

Explanations are templates filled exclusively with computed metric values.
There is no generative model in this path, so no number can be invented.
"""

from __future__ import annotations

from . import catalog

METRIC_DEFS = [
    ("conflicts_total", "Schedule conflicts", "count", "lower"),
    ("unassigned_sessions", "Displaced sessions", "sessions", "lower"),
    ("capacity_violations_count", "Capacity violations", "sessions", "lower"),
    ("capacity_violations_total", "Seat deficit", "seats", "lower"),
    ("facility_mismatch_count", "Facility mismatches", "sessions", "lower"),
    ("availability_violation_count", "Availability violations", "sessions", "lower"),
    ("hard_issue_count", "Hard issues", "issues", "lower"),
    ("active_room_utilization_pct", "Active-room utilization", "%", "higher"),
    ("room_utilization_pct", "Campus room-hour utilization", "%", "higher"),
    ("seat_utilization_pct", "Seat utilization", "%", "higher"),
    ("peak_utilization_pct", "Peak room utilization", "%", "neutral"),
    ("energy_kwh", "Estimated energy", "kWh/wk", "lower"),
    ("peak_kw", "Peak electrical demand", "kW", "lower"),
    ("movement_km", "Student movement", "km/wk", "lower"),
    ("teacher_workload_std_h", "Workload deviation", "h", "lower"),
    ("total_gap_hours", "Schedule gaps", "h/wk", "lower"),
    ("rooms_used", "Active rooms", "rooms", "lower"),
    ("sessions_scheduled", "Sessions scheduled", "sessions", "higher"),
    ("students_total", "Students", "students", "neutral"),
]


def _delta(base: float | int | None, value: float | int | None, direction: str) -> dict:
    if base is None or value is None:
        return {"absolute": None, "percent": None, "better": None, "display": "—"}
    absolute = value - base
    if base == 0:
        percent = 0.0 if absolute == 0 else None
    else:
        percent = absolute / base * 100
    better = None
    if direction == "lower" and absolute != 0:
        better = absolute < 0
    elif direction == "higher" and absolute != 0:
        better = absolute > 0
    return {
        "absolute": _round(absolute),
        "percent": _round(percent) if percent is not None else None,
        "better": better,
    }


def _round(value):
    if isinstance(value, float):
        return round(value, 2)
    return value


def comparison_rows(baseline: dict, scenario: dict, plan: dict | None) -> list[dict]:
    rows = []
    for key, label, unit, direction in METRIC_DEFS:
        base = baseline.get(key)
        scen = scenario.get(key)
        plan_value = plan.get(key) if plan else None
        rows.append(
            {
                "key": key,
                "label": label,
                "unit": unit,
                "direction": direction,
                "baseline": base,
                "scenario": scen,
                "plan": plan_value,
                "scenario_delta": _delta(base, scen, direction),
                "plan_delta": _delta(base, plan_value, direction) if plan else None,
                "plan_vs_scenario": _delta(scen, plan_value, direction) if plan else None,
            }
        )
    return rows


def _fmt(value, unit: str = "") -> str:
    if value is None:
        return "—"
    if isinstance(value, float):
        rendered = f"{value:,.1f}"
    else:
        rendered = f"{value:,}"
    return f"{rendered}{(' ' + unit) if unit else ''}"


def _signed(value, unit: str = "") -> str:
    if value is None:
        return "—"
    sign = "+" if value > 0 else ""
    return f"{sign}{_fmt(value, unit)}"


USABLE_PLAN_STATUSES = {"FEASIBLE", "FEASIBLE_HEURISTIC"}


def recommend_plan(plans: list[dict], weights: dict | None) -> dict | None:
    feasible = [p for p in plans if p.get("metrics") and p.get("status") in USABLE_PLAN_STATUSES]
    if not feasible:
        return None
    weights = weights or {"energy": 0.25, "utilization": 0.25, "movement": 0.5}
    total_w = max(1e-9, sum(max(0.0, weights.get(k, 0.0)) for k in ("energy", "utilization", "movement")))
    w = {k: max(0.0, weights.get(k, 0.0)) / total_w for k in ("energy", "utilization", "movement")}

    def values(key):
        return [float(p["metrics"].get(key) or 0) for p in feasible]

    e_vals, r_vals, m_vals = values("energy_kwh"), values("rooms_used"), values("movement_km")

    def norm(value, all_values):
        low, high = min(all_values), max(all_values)
        if high - low <= 1e-9:
            return 0.0
        return (value - low) / (high - low)

    scored = []
    for idx, plan in enumerate(feasible):
        metrics = plan["metrics"]
        score = (
            w["energy"] * norm(float(metrics.get("energy_kwh") or 0), e_vals)
            + w["utilization"] * norm(float(metrics.get("rooms_used") or 0), r_vals)
            + w["movement"] * norm(float(metrics.get("movement_km") or 0), m_vals)
        )
        # Any unresolved hard issue or failed audit is a decisive penalty.
        if metrics.get("hard_issue_count", 0) or not (plan.get("audit") or {}).get("passed", False):
            score += 5.0
        scored.append((score, idx, plan))
    scored.sort(key=lambda item: (item[0], 0 if item[2].get("label") == "D" else 1))
    _, _, best = scored[0]
    leaders = {
        "energy": min(feasible, key=lambda p: p["metrics"].get("energy_kwh", 0))["label"],
        "utilization": min(feasible, key=lambda p: p["metrics"].get("rooms_used", 999))["label"],
        "movement": min(feasible, key=lambda p: p["metrics"].get("movement_km", 999))["label"],
    }
    return {
        "label": best["label"],
        "name": best["name"],
        "score": round(scored[0][0], 4),
        "weights": {k: round(v, 3) for k, v in w.items()},
        "leaders": leaders,
        "rationale": (
            f"Plan {best['label']} has the lowest weighted distance to the best observed value on energy, "
            f"active-room utilisation and movement, using the configured priorities. "
            f"Leaders: energy {leaders['energy']}, utilisation {leaders['utilization']}, movement {leaders['movement']}."
        ),
    }


def build_explanation(
    *,
    baseline: dict,
    scenario: dict,
    plans: list[dict],
    weights: dict | None,
    scenario_name: str,
) -> dict:
    recommendation = recommend_plan(plans, weights)
    statements: list[dict] = []
    feasible = [p for p in plans if p.get("metrics") and p.get("status") in USABLE_PLAN_STATUSES]
    selected = next((p for p in feasible if recommendation and p["label"] == recommendation["label"]), None)

    if scenario.get("unassigned_sessions", 0) > 0:
        statements.append(
            {
                "tone": "critical",
                "title": "Displacement detected",
                "text": (
                    f"{scenario_name} displaces {_fmt(scenario.get('unassigned_sessions'), 'sessions')} and leaves "
                    f"{_fmt(scenario.get('hard_issue_count'), 'hard issues')} in the current timetable. "
                    "The baseline record itself is unchanged."
                ),
                "metric": "unassigned_sessions",
            }
        )
    elif scenario.get("hard_issue_count", 0) > 0:
        statements.append(
            {
                "tone": "warning",
                "title": "Constraints under pressure",
                "text": (
                    f"The scenario timetable still carries {_fmt(scenario.get('hard_issue_count'), 'hard issues')}, "
                    f"including {_fmt(scenario.get('capacity_violations_count'), 'capacity violations')} and "
                    f"{_fmt(scenario.get('conflicts_total'), 'conflicts')}."
                ),
                "metric": "hard_issue_count",
            }
        )

    if selected:
        metrics = selected["metrics"]
        recovered = max(0, int(scenario.get("unassigned_sessions", 0) or 0) - int(metrics.get("unassigned_sessions", 0) or 0))
        if scenario.get("unassigned_sessions", 0):
            statements.append(
                {
                    "tone": "positive" if recovered else "critical",
                    "title": "Recovery coverage",
                    "text": (
                        f"Plan {selected['label']} places {_fmt(metrics.get('sessions_scheduled'), 'of')} "
                        f"{_fmt(scenario.get('sessions_total'), 'sessions')} and recovers "
                        f"{_fmt(recovered, 'displaced sessions')}."
                    ),
                    "metric": "sessions_scheduled",
                }
            )
        statements.append(
            {
                "tone": "positive",
                "title": "Hard-constraint result",
                "text": (
                    f"Independent audit: {metrics.get('conflicts_total', '—')} conflicts, "
                    f"{metrics.get('capacity_violations_count', '—')} capacity violations, "
                    f"{metrics.get('facility_mismatch_count', '—')} facility mismatches, and "
                    f"{metrics.get('availability_violation_count', '—')} availability violations. "
                    "The solver enforces these as hard constraints, never as penalties."
                ),
                "metric": "hard_issue_count",
            }
        )
        e_base = baseline.get("energy_kwh")
        e_plan = metrics.get("energy_kwh")
        if e_base and e_plan is not None:
            pct = (e_plan - e_base) / e_base * 100
            statements.append(
                {
                    "tone": "positive" if pct <= 0 else "warning",
                    "title": "Estimated energy",
                    "text": (
                        f"Plan {selected['label']} estimates {_fmt(e_plan, 'kWh/week')} "
                        f"({_signed(round(pct, 1), '%')} versus the baseline), calculated from documented room "
                        "power ratings and scheduled hours. Weather and partial occupancy are not modeled."
                    ),
                    "metric": "energy_kwh",
                }
            )
        util_base = baseline.get("active_room_utilization_pct")
        util_plan = metrics.get("active_room_utilization_pct")
        if util_base is not None and util_plan is not None:
            statements.append(
                {
                    "tone": "positive" if util_plan >= util_base else "warning",
                    "title": "Space utilisation",
                    "text": (
                        f"Active-room utilisation moves from {_fmt(util_base, '%')} to {_fmt(util_plan, '%')} "
                        f"across {_fmt(metrics.get('rooms_used'), 'rooms')}, with seat utilisation at "
                        f"{_fmt(metrics.get('seat_utilization_pct'), '%')}. High utilisation is a planning signal, not an automatic success."
                    ),
                    "metric": "active_room_utilization_pct",
                }
            )
        m_base = baseline.get("movement_km")
        m_plan = metrics.get("movement_km")
        if m_base is not None and m_plan is not None:
            statements.append(
                {
                    "tone": "positive" if m_plan <= m_base else "warning",
                    "title": "Student movement",
                    "text": (
                        f"The simplified distance model estimates {_fmt(m_plan, 'km/week')} of inter-session "
                        f"movement versus {_fmt(m_base, 'km/week')} at baseline. Corridor routing and queuing are outside this model."
                    ),
                    "metric": "movement_km",
                }
            )

    if len(feasible) >= 2:
        by_energy = min(feasible, key=lambda p: p["metrics"].get("energy_kwh", 0))
        by_util = min(feasible, key=lambda p: p["metrics"].get("rooms_used", 999))
        by_move = min(feasible, key=lambda p: p["metrics"].get("movement_km", 999))
        statements.append(
            {
                "tone": "neutral",
                "title": "Trade-off map",
                "text": (
                    f"Energy leader: Plan {by_energy['label']} ({_fmt(by_energy['metrics'].get('energy_kwh'), 'kWh/wk')}). "
                    f"Space leader: Plan {by_util['label']} ({_fmt(by_util['metrics'].get('rooms_used'), 'rooms')}). "
                    f"Movement leader: Plan {by_move['label']} ({_fmt(by_move['metrics'].get('movement_km'), 'km/wk')}). "
                    "No single plan is best on every objective; the recommendation follows the configured weights."
                ),
                "metric": "tradeoffs",
            }
        )

    failed = [p for p in plans if p.get("status") not in USABLE_PLAN_STATUSES | {None}]
    if failed:
        statements.append(
            {
                "tone": "critical",
                "title": "Incomplete candidates",
                "text": (
                    f"{len(failed)} candidate plan(s) did not pass the hard-constraint audit or solver status: "
                    + ", ".join(f"Plan {p['label']} ({p.get('solver_status')})" for p in failed)
                    + ". They are excluded from the recommendation."
                ),
                "metric": "solver_status",
            }
        )

    statements.append(
        {
            "tone": "neutral",
            "title": "Evidence boundary",
            "text": (
                "All values are computed from the synthetic demo campus by the simulation and CP-SAT engines. "
                "The dataset is illustrative, the energy model is an estimate, and movement uses straight-line building distances; "
                "these results are not measured institutional outcomes."
            ),
            "metric": "data_quality",
        }
    )

    headline = "Simulation complete"
    if recommendation:
        headline = f"Plan {recommendation['label']} recommended under the configured trade-offs"
    if scenario.get("unassigned_sessions", 0) and not feasible:
        headline = "Scenario is disrupted and no recovery plan is feasible"

    return {
        "headline": headline,
        "recommendation": recommendation,
        "statements": statements,
        "data_quality": [
            "Synthetic campus dataset (illustrative, internally consistent).",
            "Energy is a modeled estimate (kWh/week), not a utility meter reading.",
            "Movement uses the documented building distance matrix.",
            "Weekly teaching-hour limits are enforced as hard constraints.",
            "Only measured solver statuses are reported; FEASIBLE is never labelled optimal unless the solver proves it. FEASIBLE_HEURISTIC is a verified constructive fallback, not a CP-SAT-confirmed result.",
        ],
    }
