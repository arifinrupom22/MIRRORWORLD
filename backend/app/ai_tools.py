"""Deterministic tools Mirror AI calls before it ever reaches a model.

Two jobs live here:

* **Scenario parsing.** Turn a natural-language disruption into a *proposal*
  that is validated against the real ``ScenarioParams`` schema and the live
  campus model. A proposal is never applied here — the caller must show it to
  the user and apply it only after explicit confirmation.
* **Explanatory vocabulary.** The solver status glossary and the quick-action
  catalogue, so the model and the rule engine explain the same statuses the
  same way.

Everything is rule based. A language model may improve wording later, but it
never invents a parameter, a building id or a solver status: unknown input
returns a clarifying question instead of a guess.
"""

from __future__ import annotations

import re

from .campus import Campus
from .schemas import ScenarioParams
from .simulation import infer_kind, validate_params

#: Authoritative status semantics. The UI, the prompt and the rule engine all
#: use this table, so no layer can quietly upgrade a result.
OPTIMIZER_STATUS_GUIDE: dict[str, dict] = {
    "OPTIMAL": {
        "label": "Optimal",
        "means": "CP-SAT proved no better schedule exists within the model and the time limit.",
        "trust": "highest",
    },
    "FEASIBLE": {
        "label": "Feasible",
        "means": "A valid schedule was found and independently audited, but optimality was not proven.",
        "trust": "high",
    },
    "FEASIBLE_HEURISTIC": {
        "label": "Feasible (heuristic)",
        "means": (
            "CP-SAT did not finish inside the time limit, so an independently audited constructive "
            "schedule is shown. It satisfies the hard constraints but is not a solver optimum."
        ),
        "trust": "medium",
    },
    "INFEASIBLE": {
        "label": "Infeasible",
        "means": "The hard constraints cannot be satisfied for this scenario as configured.",
        "trust": "none",
    },
    "UNKNOWN": {
        "label": "Unknown",
        "means": "The solver stopped without proving feasibility. No plan should be trusted from this run.",
        "trust": "none",
    },
    "AUDIT_FAILED": {
        "label": "Audit failed",
        "means": "A schedule was produced but failed the independent audit, so it is not usable.",
        "trust": "none",
    },
}

CLOSED_WORDS = (
    "unavailable",
    "closed",
    "close ",
    "shut",
    "inaccessible",
    "out of service",
    "blocked",
    "evacuat",
    "flooded",
    "fire",
)
SHORTAGE_WORDS = ("shortage", "short of", "not enough", "lack of")
ENROLMENT_WORDS = ("enrol", "enroll", "student", "intake", "admission", "cohort")

#: Quick actions, each mapped to a grounded question. ``available`` is decided
#: from the actual context so a button never promises data that is not loaded.
QUICK_ACTIONS = [
    {
        "id": "explain_campus",
        "label": "Explain current campus state",
        "question": "Explain the current campus state: inventory, baseline diagnostics, energy and the highest-severity alerts.",
    },
    {
        "id": "analyse_disruption",
        "label": "Analyse active disruption",
        "question": "Analyse the active scenario. What changed against the baseline, which resources are affected and what are the consequences?",
    },
    {
        "id": "explain_optimizer",
        "label": "Explain latest optimisation",
        "question": "Explain the latest optimisation result: solver status for each plan, why that status, and the trade-offs.",
    },
    {
        "id": "analyse_movement",
        "label": "Analyse student movement",
        "question": "Analyse student movement: total transitions, walking distances, tight transitions and how the estimate is produced.",
    },
    {
        "id": "bottlenecks",
        "label": "Find campus bottlenecks",
        "question": "Where are the campus bottlenecks? Use the alerts, utilisation, conflict clusters and tight transitions.",
    },
    {
        "id": "compare_baseline",
        "label": "Compare baseline vs scenario",
        "question": "Compare the baseline with the active scenario and summarise the difference engine rows.",
    },
    {
        "id": "recommend",
        "label": "Recommend improvements",
        "question": "Recommend improvements for the current state, with the evidence, expected benefit and trade-off for each.",
    },
]


def _entity_terms(campus: Campus) -> dict[str, list[tuple[str, dict]]]:
    """Name/code terms per entity type, for case-aware matching."""
    buildings = []
    for building in campus.buildings:
        buildings.append((str(building.get("name") or ""), building))
        code = str(building.get("code") or "")
        if code:
            buildings.append((code, building))
            if code.isalpha() and len(code) <= 4:
                buildings.append((code.upper(), building))
    rooms = []
    for room in campus.rooms:
        rooms.append((str(room.get("code") or ""), room))
        rooms.append((str(room.get("name") or ""), room))
    teachers = [(str(teacher.get("name") or ""), teacher) for teacher in campus.teachers]
    return {
        "buildings": [(term, entity) for term, entity in buildings if term],
        "rooms": [(term, entity) for term, entity in rooms if len(term) >= 4],
        "teachers": [(term, entity) for term, entity in teachers if term],
    }


def find_entities(message: str, campus: Campus) -> dict[str, list[dict]]:
    """Match buildings, rooms and instructors mentioned in a message.

    Short codes are matched case-sensitively so the two-letter building code
    ``AT`` does not match the English word "at".
    """
    text = message or ""
    found: dict[str, list[dict]] = {"buildings": [], "rooms": [], "teachers": []}
    seen: set[tuple[str, str]] = set()
    for kind, terms in _entity_terms(campus).items():
        for term, entity in terms:
            pattern = re.compile(rf"(?<![\w-]){re.escape(term)}(?![\w-])", re.I if term.islower() else 0)
            if not pattern.search(text):
                continue
            key = (kind, str(entity.get("id")))
            if key in seen:
                continue
            seen.add(key)
            found[kind].append(
                {
                    "id": entity.get("id"),
                    "label": entity.get("name") or entity.get("code"),
                    "code": entity.get("code"),
                }
            )
    return found


def _pct(text: str) -> int | None:
    match = re.search(r"([+-]?\d{1,3})\s*(?:%|percent)", text, re.I)
    return int(match.group(1)) if match else None


def _signed_int(text: str) -> int | None:
    match = re.search(r"([+-]?\d{1,3})", text)
    return int(match.group(1)) if match else None


def _changes(params: dict, base: dict) -> list[dict]:
    labels = {
        "enrollment_delta": "Enrolment delta (students)",
        "unavailable_building_ids": "Unavailable buildings",
        "unavailable_room_ids": "Unavailable rooms",
        "unavailable_teacher_ids": "Unavailable instructors",
        "lab_availability_pct": "Laboratory availability (%)",
        "equipment_loss": "Lost equipment",
        "teacher_workload_delta": "Instructor workload delta (h)",
        "lab_policy": "Laboratory policy",
        "operating_end_slot": "Operating end slot",
        "energy_mode": "Energy mode",
    }
    rows = []
    for key, label in labels.items():
        before, after = base.get(key), params.get(key)
        if before == after:
            continue
        if isinstance(after, list) and after:
            after = ", ".join(str(item) for item in after)
        rows.append({"label": label, "before": before if before not in ("", None) else "—", "after": after})
    return rows


def parse_scenario_request(message: str, campus: Campus) -> dict:
    """Parse a natural-language disruption into a validated scenario proposal.

    Returns a proposal — never a stored scenario. ``understood`` is false when
    the message names nothing the schema can express; ``questions`` then lists
    what Mirror AI needs, instead of guessing.
    """
    text = message or ""
    lower = text.lower()
    mentions = find_entities(text, campus)
    defaults = ScenarioParams().model_dump()
    params = dict(defaults)
    warnings: list[str] = []
    questions: list[str] = []
    blockers: list[str] = []

    building_labels = ", ".join(item["label"] for item in mentions["buildings"]) or None

    if any(word in lower for word in CLOSED_WORDS) and mentions["buildings"]:
        params["unavailable_building_ids"] = [str(item["id"]) for item in mentions["buildings"]]
    if any(word in lower for word in CLOSED_WORDS) and mentions["rooms"]:
        params["unavailable_room_ids"] = [str(item["id"]) for item in mentions["rooms"]]
    if any(word in lower for word in CLOSED_WORDS) and mentions["teachers"]:
        params["unavailable_teacher_ids"] = [str(item["id"]) for item in mentions["teachers"]]

    percent = _pct(lower)
    if percent is not None and any(word in lower for word in ENROLMENT_WORDS):
        base_students = sum(int(group.get("size") or 0) for group in campus.groups)
        delta = int(round(base_students * percent / 100.0))
        bounded = max(-300, min(600, delta))
        if bounded != delta:
            warnings.append(
                f"A {percent}% change is {delta:+d} students, outside the schema range (-300 to +600); "
                f"the proposal is clamped to {bounded:+d}."
            )
        params["enrollment_delta"] = bounded
    elif percent is not None and any(word in lower for word in ("lab", "laboratory")):
        params["lab_availability_pct"] = max(0, min(100, percent))

    if re.search(r"(energy|power|kwh|efficien|sustainab)", lower):
        params["energy_mode"] = "efficiency"
    if "afternoon" in lower and ("lab" in lower or "only" in lower):
        params["lab_policy"] = "afternoon_only"
    if "shorten" in lower or "close early" in lower or "end the day" in lower:
        slot = _signed_int(lower)
        if slot is not None and 3 <= slot <= 7:
            params["operating_end_slot"] = slot
    if "workload" in lower:
        delta = _signed_int(lower)
        if delta is not None and -10 <= delta <= 10:
            params["teacher_workload_delta"] = delta

    if any(word in lower for word in SHORTAGE_WORDS) and not params["unavailable_room_ids"] and not params["unavailable_building_ids"]:
        questions.append(
            "MIRRORWORLD models a laboratory-availability percentage and individual rooms or buildings as "
            "unavailable; it has no 'classroom shortage' percentage. Name the rooms or building to withdraw, "
            "or say 'reduce laboratory availability to 50%'."
        )

    understood = params != defaults
    if not understood and not questions:
        questions.append(
            "I can build a scenario from four things MIRRORWORLD actually models: an unavailable building, room "
            "or instructor; an enrolment delta in students (or a percentage of current enrolment); laboratory "
            "availability as a percentage; and policy switches such as efficiency energy mode or an earlier "
            "operating end slot. Name one of those and the affected resource."
        )
    if any(word in lower for word in CLOSED_WORDS) and not (
        mentions["buildings"] or mentions["rooms"] or mentions["teachers"]
    ):
        questions.append(
            "Which building, room or instructor becomes unavailable? I will not guess an id — the campus model "
            f"contains {len(campus.buildings)} buildings and {len(campus.rooms)} rooms."
        )

    try:
        parsed = ScenarioParams(**params)
        clean = parsed.model_dump()
    except Exception as error:  # pragma: no cover - pydantic message is the payload
        return {
            "understood": False,
            "name": None,
            "kind": None,
            "params": None,
            "changes": [],
            "warnings": warnings,
            "blockers": [f"Parameters failed schema validation: {error}"],
            "questions": questions,
            "entities": mentions,
            "parser": "deterministic",
            "requires_confirmation": True,
        }

    blockers.extend(validate_params(campus, clean))

    name_subject = building_labels or (mentions["rooms"][0]["label"] if mentions["rooms"] else None)
    label_parts = []
    if clean["unavailable_building_ids"] or clean["unavailable_room_ids"]:
        label_parts.append(f"{name_subject or 'Resource'} unavailable")
    if clean["enrollment_delta"]:
        label_parts.append(f"enrolment {clean['enrollment_delta']:+d}")
    if clean["lab_availability_pct"] != 100:
        label_parts.append(f"labs at {clean['lab_availability_pct']}%")
    if clean["energy_mode"] != "standard":
        label_parts.append("efficiency energy mode")
    if not label_parts:
        label_parts.append("proposed change")
    name = ("AI proposal · " + " · ".join(label_parts))[:90]

    return {
        "understood": understood and not blockers,
        "name": name,
        "kind": infer_kind(clean),
        "params": clean,
        "changes": _changes(clean, defaults),
        "warnings": warnings,
        "blockers": blockers,
        "questions": questions,
        "entities": mentions,
        "parser": "deterministic",
        "requires_confirmation": True,
    }


def quick_actions(context: dict) -> list[dict]:
    """Quick actions annotated with what the current context can actually answer."""
    scenario = context.get("scenario") or {}
    plans = scenario.get("plans") or []
    movement = context.get("movement") or {}
    rows = []
    for action in QUICK_ACTIONS:
        available, reason = True, None
        if action["id"] in {"analyse_disruption", "compare_baseline"} and not scenario:
            available, reason = False, "Select a scenario first."
        if action["id"] == "explain_optimizer" and not plans:
            available, reason = False, "No optimisation has been stored for this scenario."
        if action["id"] == "analyse_movement" and not movement.get("available", True):
            available, reason = False, "The movement engine returned no summary."
        rows.append({**action, "available": available, "reason": reason})
    return rows


def status_explanation(status: str | None) -> dict:
    """Glossary row for a solver status, never inventing one."""
    key = (status or "").upper()
    row = OPTIMIZER_STATUS_GUIDE.get(key)
    if row is None:
        return {
            "status": status,
            "label": status,
            "means": "This status is not in Mirror AI's glossary, so it is reported verbatim without interpretation.",
            "trust": "unknown",
        }
    return {"status": key, **row}
