"""Mirror AI tool registry — allowlisted, read-only access to existing services.

Design rules (matching the specification):

* **Reuse, don't reimplement.** Every tool reads the grounded context the API
  layer already built from ``campus``, ``metrics``, ``alerts``,
  ``recommendations``, ``difference``, ``movement`` and ``optimizer`` results.
  A tool therefore cannot disagree with the page it mirrors.
* **Allowlist only.** :data:`TOOLS` is the complete set. There is no dynamic
  dispatch by string from a model, no ``eval``, no SQL, no shell and no file
  access. A model never chooses a tool name that reaches execution.
* **Read tools cannot mutate.** The two state-changing capabilities are
  explicit: ``propose_scenario_change`` only parses and validates, and
  ``execute_confirmed_scenario`` is *disabled* here because creation is handled
  by the audited ``POST /api/ai/proposal/apply`` endpoint, which requires a
  human confirmation flag and writes an ``AuditLog`` row.
* **Everything is logged.** Each execution appends a structured entry with the
  tool, outcome, row count and elapsed milliseconds, and emits a log record.
"""

from __future__ import annotations

import logging
import time
from typing import Callable

__all__ = ["TOOLS", "catalog", "run", "run_for", "recent"]

_LOGGER = logging.getLogger("mirrorworld.ai.tools")
_TRACE: list[dict] = []
_TRACE_LIMIT = 200


def _rows(context: dict, key: str, *, limit: int = 6) -> list:
    value = context.get(key)
    if isinstance(value, list):
        return value[:limit]
    if isinstance(value, dict):
        return [value]
    return []


def _campus_state(context: dict) -> list[dict]:
    campus = context.get("campus") or {}
    baseline = context.get("baseline") or {}
    return [
        {"summary": campus.get("summary"), "dataset": campus.get("dataset")},
        {
            "conflicts_total": baseline.get("conflicts_total"),
            "capacity_violations": baseline.get("capacity_violations_count"),
            "facility_mismatches": baseline.get("facility_mismatch_count"),
            "energy_kwh": baseline.get("energy_kwh"),
        },
    ]


def _scenario_details(context: dict) -> list[dict]:
    scenario = context.get("scenario")
    if not scenario:
        return []
    return [
        {
            key: scenario.get(key)
            for key in ("id", "name", "kind", "status", "headline", "params", "metrics")
        }
    ]


def _difference(context: dict) -> list[dict]:
    scenario = context.get("scenario") or {}
    return (scenario.get("difference") or {}).get("changes") or []


def _alerts(context: dict) -> list[dict]:
    return _rows(context, "alerts", limit=6)


def _recommendations(context: dict) -> list[dict]:
    return _rows(context, "recommendation_cards", limit=6)


def _movement(context: dict) -> list[dict]:
    movement = context.get("movement") or {}
    if not movement or movement.get("available") is False:
        return []
    return [
        {
            "total_transitions": movement.get("total_transitions"),
            "total_distance_m": movement.get("total_distance_m"),
            "tight_transitions": movement.get("tight_transitions"),
            "infeasible_transitions": movement.get("infeasible_transitions"),
            "unknown_distance_transitions": movement.get("unknown_distance_transitions"),
            "flagged": movement.get("flagged_transitions") or [],
        }
    ]


def _optimisation(context: dict) -> list[dict]:
    scenario = context.get("scenario") or {}
    return _rows({"plans": scenario.get("plans")}, "plans", limit=3)


def _compare(context: dict) -> list[dict]:
    rows = _difference(context)
    baseline = context.get("baseline") or {}
    scenario = context.get("scenario") or {}
    return [
        {
            "baseline": {
                key: baseline.get(key)
                for key in ("conflicts_total", "capacity_violations_count", "energy_kwh", "hard_issue_count")
            },
            "scenario": scenario.get("metrics"),
            "changed_attributes": len(rows),
        }
    ]


def _propose(context: dict) -> list[dict]:
    # Parsing happens in ai_tools.parse_scenario_request with the live campus;
    # this tool deliberately does not reach for it, so no tool execution can
    # create data. The API layer owns that call.
    return [
        {
            "requires_live_campus": True,
            "note": "Proposals are parsed by ai_tools.parse_scenario_request and applied only via /api/ai/proposal/apply.",
        }
    ]


TOOLS: dict[str, dict] = {
    "get_campus_state": {
        "label": "Campus state",
        "kind": "read",
        "description": "Inventory, baseline diagnostics and dataset provenance.",
        "sources": ["/api/campus", "/api/overview"],
        "collect": _campus_state,
    },
    "get_scenario_details": {
        "label": "Scenario details",
        "kind": "read",
        "description": "The active scenario's parameters, metrics and headline.",
        "sources": ["/api/scenarios/{id}"],
        "collect": _scenario_details,
    },
    "get_simulation_difference": {
        "label": "Difference rows",
        "kind": "read",
        "description": "Attribute-level changes between baseline and scenario.",
        "sources": ["/api/scenarios/{id}/difference", "difference.py"],
        "collect": _difference,
    },
    "get_alerts": {
        "label": "Alerts",
        "kind": "read",
        "description": "Severity-graded alerts with evidence and suggested actions.",
        "sources": ["/api/alerts", "alerts.py"],
        "collect": _alerts,
    },
    "get_recommendations": {
        "label": "Recommendations",
        "kind": "read",
        "description": "Evidence-backed operating recommendations and trade-offs.",
        "sources": ["/api/recommendations", "recommendations.py"],
        "collect": _recommendations,
    },
    "get_movement_analytics": {
        "label": "Movement analytics",
        "kind": "read",
        "description": "Transition summary, walking estimate and flagged transfers.",
        "sources": ["/api/movement", "movement.py"],
        "collect": _movement,
    },
    "get_optimization_result": {
        "label": "Optimization result",
        "kind": "read",
        "description": "Stored CP-SAT plans with their verbatim status.",
        "sources": ["scenario.plans", "optimizer.py"],
        "collect": _optimisation,
    },
    "compare_scenarios": {
        "label": "Baseline vs scenario",
        "kind": "read",
        "description": "Key metrics side by side with the number of changed attributes.",
        "sources": ["baseline metrics", "scenario.metrics", "difference.py"],
        "collect": _compare,
    },
    "propose_scenario_change": {
        "label": "Propose scenario change",
        "kind": "proposal",
        "description": "Parse a described disruption into validated parameters. Never writes.",
        "sources": ["ai_tools.parse_scenario_request"],
        "collect": _propose,
    },
    "execute_confirmed_scenario": {
        "label": "Execute confirmed scenario",
        "kind": "write",
        "enabled": False,
        "description": (
            "Disabled inside the registry: creation happens only through the audited "
            "POST /api/ai/proposal/apply endpoint after an explicit confirmation flag."
        ),
        "sources": ["/api/ai/proposal/apply", "AuditLog"],
        "collect": lambda context: [],
    },
}


def catalog() -> list[dict]:
    """Public description of every tool, including why a write tool is disabled."""
    return [
        {
            "id": tool_id,
            "label": tool["label"],
            "kind": tool["kind"],
            "description": tool["description"],
            "sources": tool["sources"],
            "enabled": tool.get("enabled", True),
            "requires_confirmation": tool["kind"] != "read",
        }
        for tool_id, tool in TOOLS.items()
    ]


def _log(entry: dict) -> None:
    _TRACE.append(entry)
    if len(_TRACE) > _TRACE_LIMIT:
        del _TRACE[: len(_TRACE) - _TRACE_LIMIT]
    _LOGGER.info(
        "ai.tool tool=%s ok=%s rows=%s elapsed_ms=%s error=%s",
        entry["tool"],
        entry["ok"],
        entry["rows"],
        entry["elapsed_ms"],
        entry["error"],
    )


def run(tool_id: str, context: dict) -> dict:
    """Execute one allowlisted read tool against the grounded context."""
    tool = TOOLS.get(tool_id)
    started = time.perf_counter()
    if tool is None:
        entry = {"tool": tool_id, "ok": False, "rows": 0, "error": "unknown tool", "elapsed_ms": 0.0}
        _log(entry)
        return entry
    if tool.get("enabled", True) is False:
        entry = {
            "tool": tool_id,
            "ok": False,
            "rows": 0,
            "error": "disabled by policy",
            "elapsed_ms": 0.0,
        }
        _log(entry)
        return entry
    try:
        data: list = tool["collect"](context)  # type: ignore[operator]
        entry = {"tool": tool_id, "ok": True, "rows": len(data), "error": None}
    except Exception as error:  # noqa: BLE001 - a tool failure must not break an answer
        data = []
        entry = {"tool": tool_id, "ok": False, "rows": 0, "error": str(error)[:200]}
    entry["elapsed_ms"] = round((time.perf_counter() - started) * 1000, 2)
    entry["label"] = tool["label"]
    entry["data"] = data
    _log({key: value for key, value in entry.items() if key != "data"})
    return entry


#: Which tools each mode needs. Deterministic, so a model can never widen the
#: toolset by asking for a name that is not in a mode's list.
_MODE_TOOLS: dict[str, tuple[str, ...]] = {
    "ask": ("get_campus_state",),
    "analyst": ("get_campus_state", "get_alerts", "get_movement_analytics", "get_recommendations"),
    "what_if": ("get_scenario_details", "get_alerts", "compare_scenarios"),
    "advisor": ("get_recommendations", "get_alerts", "compare_scenarios"),
    "research": ("get_campus_state",),
}

_KEYWORD_TOOLS: tuple[tuple[tuple[str, ...], str], ...] = (
    (("alert", "critical", "severity"), "get_alerts"),
    (("move", "walk", "transition", "travel"), "get_movement_analytics"),
    (("recommend", "improve", "should"), "get_recommendations"),
    (("plan", "solver", "optimi"), "get_optimization_result"),
    (("difference", "compare", "changed", "impact"), "get_simulation_difference"),
    (("scenario", "disruption", "affected"), "get_scenario_details"),
)


def run_for(mode: str, question: str, context: dict) -> list[dict]:
    """Run the tools a mode and question actually need, and return their trace."""
    selected: list[str] = list(_MODE_TOOLS.get(mode, ("get_campus_state",)))
    text = (question or "").lower()
    for words, tool_id in _KEYWORD_TOOLS:
        if tool_id not in selected and any(word in text for word in words):
            selected.append(tool_id)
    results = [run(tool_id, context) for tool_id in selected]
    return [
        {
            "tool": item["tool"],
            "label": item.get("label"),
            "ok": item["ok"],
            "rows": item["rows"],
            "elapsed_ms": item["elapsed_ms"],
            "error": item["error"],
        }
        for item in results
    ]


def recent(limit: int = 20) -> list[dict]:
    return _TRACE[-limit:]
