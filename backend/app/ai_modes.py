"""Mirror AI intelligence modes, campus briefing and evidence labels.

The copilot is not one undifferentiated chat box. Each mode has a different job,
a different prompt suffix and — importantly — a different *default answer shape*
so the deterministic fallback stays useful where a model is not configured.

Everything in this module is deterministic. It reads the grounded context the
API layer already assembled from the campus, metrics, alerts, recommendations,
difference engine, movement engine and optimizer. It never invents a number and
never claims a model produced text.
"""

from __future__ import annotations

from datetime import datetime, timezone

__all__ = [
    "DEFAULT_MODE",
    "MODES",
    "MODES_ORDER",
    "build_briefing",
    "deterministic_research",
    "evidence_quality",
    "mode_framing",
    "normalize_mode",
    "reasoning_block",
    "system_suffix",
]

DEFAULT_MODE = "ask"
MODES_ORDER = ("ask", "analyst", "what_if", "advisor", "research")

#: Mode catalogue. ``guidance`` is appended to the system instruction; ``stub``
#: is the empty-state prompt shown in the UI before the first question.
MODES: dict[str, dict] = {
    "ask": {
        "id": "ask",
        "label": "Ask",
        "blurb": "Direct answers about campus, simulation, optimisation, alerts and movement.",
        "guidance": (
            "MODE: ASK. Answer the question directly, then the evidence behind it. "
            "Do not produce an unprompted audit of the whole campus."
        ),
        "stub": "Explain the current campus state and the highest-severity alerts.",
    },
    "analyst": {
        "id": "analyst",
        "label": "Analyst",
        "blurb": "Investigate the current state: bottlenecks, conflicts, risks and evidence.",
        "guidance": (
            "MODE: ANALYST. Investigate rather than describe. Rank findings by severity, name the\n"
            "affected resource for each, quote the measured value that supports it, and state what you\n"
            "could not verify. End with the two or three findings that most need action."
        ),
        "stub": "Analyse the current campus state: bottlenecks, resource conflicts and risks.",
    },
    "what_if": {
        "id": "what_if",
        "label": "What-if",
        "blurb": "Describe a disruption; Mirror AI builds a validated proposal, never an edit.",
        "guidance": (
            "MODE: WHAT-IF. The user is describing a hypothetical disruption. Explain what MIRRORWORLD\n"
            "can model for it and what it cannot. A structured proposal is produced by the deterministic\n"
            "parser and shown separately; never claim a scenario has been created. State clearly that the\n"
            "change is applied only after the administrator confirms it."
        ),
        "stub": "What if the Academic Building became unavailable for a week?",
    },
    "advisor": {
        "id": "advisor",
        "label": "Advisor",
        "blurb": "Evidence-backed improvements, with benefits, risks and trade-offs.",
        "guidance": (
            "MODE: ADVISOR. Use only the recommendation cards and measured metrics in the context.\n"
            "For each option give problem, evidence, action, expected benefit, trade-off and the\n"
            "confidence label. Rank by severity. If no threshold fired, say so instead of inventing advice."
        ),
        "stub": "What should we improve first, and what does each change cost us?",
    },
    "research": {
        "id": "research",
        "label": "Research",
        "blurb": "How digital twins, CP-SAT and this project actually work — clearly separated.",
        "guidance": (
            "MODE: RESEARCH. Explain concepts in two clearly separated parts: GENERAL KNOWLEDGE (how digital\n"
            "twins, constraint programming and OR-Tools CP-SAT work in general) and THIS PROJECT (what\n"
            "MIRRORWORLD actually implements, quoting context values). Never present general knowledge as a\n"
            "description of this codebase, and never claim the project does something it does not."
        ),
        "stub": "How does a campus digital twin work, and how does CP-SAT help here?",
    },
}


def normalize_mode(value: str | None) -> str:
    key = (value or DEFAULT_MODE).strip().lower().replace("-", "_")
    return key if key in MODES else DEFAULT_MODE


def system_suffix(mode: str | None) -> str:
    return "\n" + MODES[normalize_mode(mode)]["guidance"] + "\n"


def mode_framing(mode: str | None) -> str:
    """One-line header the deterministic answers use to name their own mode."""
    entry = MODES[normalize_mode(mode)]
    return f"**{entry['label']} mode** — {entry['blurb']}"


# ---------------------------------------------------------------------------
# Evidence quality labels
# ---------------------------------------------------------------------------

QUALITY_LABELS = {
    "verified": {
        "label": "Verified from backend data",
        "detail": "Read directly from the campus model or a persisted run. No model was involved.",
    },
    "calculated": {
        "label": "Calculated by simulation",
        "detail": "Recomputed by the deterministic simulation/metrics services from the stored timetable.",
    },
    "optimizer": {
        "label": "Produced by optimizer",
        "detail": "Reported by CP-SAT or the independently audited constructive fallback, status verbatim.",
    },
    "ai_interpretation": {
        "label": "AI interpretation",
        "detail": "Wording and prioritisation from a language model, constrained to the values above.",
    },
    "insufficient_data": {
        "label": "Insufficient data",
        "detail": "The fact is not in the campus model or the selected run; Mirror AI will not estimate it.",
    },
}


def evidence_quality(context: dict, *, used_model: bool, mode: str) -> list[dict]:
    """Transparent labels, never a fabricated confidence percentage."""
    scenario = context.get("scenario") or {}
    plans = scenario.get("plans") or []
    movement = context.get("movement") or {}
    rows = [
        {"key": "verified", **QUALITY_LABELS["verified"], "scope": "Campus inventory, alerts, recommendations"},
        {"key": "calculated", **QUALITY_LABELS["calculated"], "scope": "Baseline and scenario metrics, difference rows"},
    ]
    if plans:
        statuses = ", ".join(sorted({str(plan.get("status")) for plan in plans}))
        rows.append({"key": "optimizer", **QUALITY_LABELS["optimizer"], "scope": f"Plans: {statuses}"})
    if movement and movement.get("unknown_distance_transitions"):
        rows.append(
            {
                "key": "insufficient_data",
                **QUALITY_LABELS["insufficient_data"],
                "scope": f"{movement.get('unknown_distance_transitions')} transition(s) have no modelled distance",
            }
        )
    if used_model:
        rows.append(
            {
                "key": "ai_interpretation",
                **QUALITY_LABELS["ai_interpretation"],
                "scope": f"{MODES[normalize_mode(mode)]['label']} mode narration",
            }
        )
    return rows


# ---------------------------------------------------------------------------
# Campus Intelligence Briefing
# ---------------------------------------------------------------------------

def _fmt(value) -> str:
    if value is None:
        return "not available"
    if isinstance(value, bool):
        return "yes" if value else "no"
    if isinstance(value, float):
        return f"{value:,.2f}"
    if isinstance(value, int):
        return f"{value:,}"
    return str(value)


def _section(section_id: str, title: str, summary: str, items: list[str], sources: list[str], quality: str) -> dict:
    return {
        "id": section_id,
        "title": title,
        "summary": summary,
        "items": items,
        "sources": sources,
        "quality": {"key": quality, **QUALITY_LABELS[quality]},
    }


def build_briefing(context: dict) -> dict:
    """Compose the briefing purely from the grounded context.

    Every sentence quotes a value the API layer already computed. Nothing is
    seeded, randomised or hardcoded to make the panel look busy: when a source
    has no data the section says so and tells the operator what to run.
    """
    baseline = context.get("baseline") or {}
    campus = context.get("campus") or {}
    summary = campus.get("summary") or {}
    scenario = context.get("scenario") or {}
    alerts = context.get("alerts") or []
    movement = context.get("movement") or {}
    cards = context.get("recommendation_cards") or []
    plans = scenario.get("plans") or []
    difference = scenario.get("difference") or {}

    sections: list[dict] = []

    condition = (
        f"{_fmt(summary.get('buildings'))} buildings, {_fmt(summary.get('rooms'))} rooms "
        f"({_fmt(summary.get('labs'))} labs), {_fmt(summary.get('teachers'))} instructors, "
        f"{_fmt(summary.get('students'))} students across {_fmt(summary.get('sessions'))} weekly sessions."
    )
    condition_items = [
        f"Baseline diagnostics: {_fmt(baseline.get('conflicts_total'))} collisions, "
        f"{_fmt(baseline.get('capacity_violations_count'))} capacity violations, "
        f"{_fmt(baseline.get('facility_mismatch_count'))} facility mismatches.",
        f"Modelled energy {_fmt(baseline.get('energy_kwh'))} kWh/week at a peak of {_fmt(baseline.get('peak_kw'))} kW.",
        f"Utilisation: rooms {_fmt(baseline.get('room_utilization_pct'))}%, seats {_fmt(baseline.get('seat_utilization_pct'))}%.",
    ]
    if scenario:
        condition_items.append(
            f"Active scenario **{scenario.get('name')}** ({scenario.get('kind')}) — {scenario.get('headline', '')}."
        )
    else:
        condition_items.append(
            "No scenario is selected, so every figure below describes the unchanged baseline."
        )
    sections.append(
        _section(
            "condition",
            "Current modeled condition",
            condition,
            condition_items,
            ["/api/campus", "/api/overview"],
            "calculated",
        )
    )

    if alerts:
        order = {"Critical": 0, "High": 1, "Medium": 2, "Low": 3}
        ranked = sorted(alerts, key=lambda row: order.get(str(row.get("severity")), 9))[:4]
        sections.append(
            _section(
                "issues",
                "Most important detected issues",
                f"{len(alerts)} open alert(s); the four highest-severity are listed.",
                [
                    f"[{row.get('severity')}] {row.get('title')} — {row.get('description')}"
                    for row in ranked
                ],
                ["/api/alerts", "alerts.py"],
                "verified",
            )
        )
    else:
        sections.append(
            _section(
                "issues",
                "Most important detected issues",
                "No alert crossed its threshold for the current state.",
                ["Alerts are emitted only when a measured threshold is crossed (collision, capacity, "
                 "facility fit, availability, energy outlier, utilisation spread)."],
                ["/api/alerts"],
                "verified",
            )
        )

    constraints = [card for card in cards if "seat" in str(card.get("id", "")) or "utilization" in str(card.get("id", ""))]
    if constraints:
        sections.append(
            _section(
                "constraints",
                "Critical resource constraints",
                f"{len(constraints)} recommendation(s) point at capacity or utilisation pressure.",
                [f"{card.get('title')}: {card.get('expected_benefit')}" for card in constraints[:3]],
                ["recommendations.build_recommendations"],
                "calculated",
            )
        )
    elif alerts:
        sections.append(
            _section(
                "constraints",
                "Critical resource constraints",
                "No capacity or utilisation threshold fired, but open alerts still name affected resources.",
                [f"{row.get('title')} → {(row.get('affected') or {}).get('room') or (row.get('affected') or {}).get('building') or 'see alert'}" for row in alerts[:3]],
                ["/api/alerts"],
                "verified",
            )
        )

    if movement.get("available", True) and movement:
        flagged = movement.get("flagged_transitions") or []
        sections.append(
            _section(
                "movement",
                "Student movement concerns",
                f"{_fmt(movement.get('total_transitions'))} transitions, "
                f"{_fmt(movement.get('total_distance_m'))} m of student-distance, "
                f"{_fmt(movement.get('tight_transitions'))} tight and "
                f"{_fmt(movement.get('infeasible_transitions'))} infeasible transfers.",
                [
                    f"{row['cohort']}: {row['from']} → {row['to']} · {row['gap_min']} min gap vs "
                    f"{_fmt(row.get('walking_time_min'))} min walking"
                    for row in flagged[:3]
                ]
                or ["No transition is tight, infeasible or missing a distance in this state."],
                ["movement.compute_movement"],
                "calculated",
            )
        )
    else:
        sections.append(
            _section(
                "movement",
                "Student movement concerns",
                movement.get("reason") or "The movement engine returned no summary for this state.",
                ["Movement is a timetable-derived estimate at 84 m/min, not live tracking."],
                ["movement.compute_movement"],
                "insufficient_data",
            )
        )

    if scenario:
        sections.append(
            _section(
                "simulation",
                "Latest simulation insight",
                f"{_fmt(difference.get('change_count', len(difference.get('changes') or [])))} difference row(s) "
                f"between the baseline snapshot and **{scenario.get('name')}**.",
                [
                    f"{row.get('label')}: {_fmt(row.get('before'))} → {_fmt(row.get('after'))} ({row.get('direction')})"
                    for row in (difference.get("changes") or [])[:4]
                ]
                or ["The difference engine returned no attribute changes for this scenario."],
                ["/api/scenarios/{id}/difference", "difference.py"],
                "calculated",
            )
        )
    else:
        sections.append(
            _section(
                "simulation",
                "Latest simulation insight",
                "No scenario has been run from this workspace yet.",
                [
                    "Suggested first analysis: open Simulation Studio, apply a template (for example a building "
                    "closure), and run it; the briefing will then compare it with the baseline here.",
                ],
                ["/api/templates", "simulation.simulate"],
                "insufficient_data",
            )
        )

    if plans:
        sections.append(
            _section(
                "optimisation",
                "Optimization opportunities",
                f"{len(plans)} stored plan(s) for the active scenario.",
                [
                    f"Plan {plan.get('label')} · {plan.get('strategy')} — status `{plan.get('status')}`, "
                    f"objective {_fmt(plan.get('objective'))}"
                    for plan in plans
                ],
                ["optimizer.solve_plans", "scenario.plans"],
                "optimizer",
            )
        )
    else:
        sections.append(
            _section(
                "optimisation",
                "Optimization opportunities",
                "No optimisation has been stored for this scenario.",
                ["Open the Schedule optimizer to run CP-SAT; Mirror AI reports the solver's own status and never infers one."],
                ["/api/scenarios/{id}/optimize"],
                "insufficient_data",
            )
        )

    if cards:
        sections.append(
            _section(
                "actions",
                "Recommended next actions",
                f"{len(cards)} evidence-backed recommendation(s) available.",
                [
                    f"{card.get('title')} — {card.get('expected_benefit')} (trade-off: {card.get('tradeoff')})"
                    for card in cards[:3]
                ],
                ["recommendations.build_recommendations"],
                "calculated",
            )
        )
    else:
        sections.append(
            _section(
                "actions",
                "Recommended next actions",
                "No recommendation threshold fired, so Mirror AI has nothing evidence-backed to suggest.",
                [
                    "Ask Analyst mode for the current bottlenecks, or What-if mode to test a disruption before "
                    "committing to a change."
                ],
                ["recommendations.build_recommendations"],
                "verified",
            )
        )

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "dataset": (context.get("knowledge") or {}).get("dataset", {}).get("label") or context.get("dataset_label"),
        "scenario": scenario.get("name"),
        "scenario_id": scenario.get("id"),
        "sections": sections,
        "mode_hint": "what_if" if not scenario else "advisor",
        "provenance": (
            "Composed from MIRRORWORLD's deterministic services. No language model is required "
            "and none is claimed when one is not configured."
        ),
    }


# ---------------------------------------------------------------------------
# Research mode — general knowledge, clearly separated from this project
# ---------------------------------------------------------------------------

_GENERAL = {
    "digital twin": (
        "A digital twin is a computational model of a physical asset that is kept in step with data about it. "
        "The value comes from the coupling: state describes what is, simulation answers what if, optimisation "
        "proposes what should be. The usual maturity ladder is descriptive (what happened) → diagnostic (why) → "
        "predictive (what will) → prescriptive (what should be done). Twins are only as trustworthy as their "
        "assumptions, so provenance and uncertainty reporting matter more than visual fidelity."
    ),
    "cp-sat": (
        "CP-SAT is a constraint-programming solver in Google OR-Tools that works over integer and Boolean "
        "variables. It combines constraint propagation with learned clauses and a portfolio of search "
        "strategies, and it is well suited to scheduling: interval variables enforce no-overlap, optional "
        "intervals express 'this session may use this room', and an objective sums weighted soft terms. "
        "Hard constraints must hold in any solution; soft objectives are traded off against each other. "
        "Because the search is time-bounded, the solver reports a proof status: OPTIMAL (proven best), FEASIBLE "
        "(valid but optimality unproven), INFEASIBLE (provably impossible) or UNKNOWN (ran out of time). "
        "Conflating FEASIBLE with OPTIMAL is the classic reporting error."
    ),
    "constraint programming": (
        "Constraint programming declares relations that must hold and searches for assignments satisfying "
        "them, pruning with propagation rather than enumerating. It suits combinatorial arrangement problems — "
        "timetabling, rostering, packing — where the difficulty is the interaction between constraints rather "
        "than raw arithmetic."
    ),
    "optimisation": (
        "Optimisation separates three things that are easy to confuse: the decision variables (what may change), "
        "the hard constraints (what must never be violated) and the objective (what is being minimised or "
        "maximised, usually a weighted sum of soft goals). A solution satisfying every hard constraint is "
        "feasible; only a proven-bound solution is optimal. Weighted objectives encode policy, so different "
        "weights produce legitimately different 'best' schedules."
    ),
    "difference engine": (
        "A difference engine compares two canonical states attribute by attribute and reports what changed, in "
        "which direction and with what consequence. Its value is contract-like: alerts, severity scoring, "
        "narrative explanation and an AI layer all consume the same change set instead of re-deriving it, which "
        "is what keeps their numbers from drifting apart."
    ),
}

_PROJECT = (
    "MIRRORWORLD applies these ideas to one synthetic campus: a persisted timetable is the immutable baseline, "
    "a scenario applies validated parameters to a copy, metrics are recomputed deterministically, a difference "
    "engine reports attribute-level change, and three CP-SAT plans are audited independently before display. "
    "Energy is modelled from room power ratings, movement is estimated from the timetable at 84 m/min, and the "
    "AI layer only explains — it never computes campus numbers."
)


def deterministic_research(question: str, context: dict) -> str:
    """Research-mode answer without a model: general knowledge, then this project."""
    text = (question or "").lower()
    summary = (context.get("campus") or {}).get("summary") or {}
    picked: list[tuple[str, str]] = []
    if "twin" in text or not any(key in text for key in _GENERAL):
        picked.append(("Digital twin", _GENERAL["digital twin"]))
    if "sat" in text or "solver" in text or "ortools" in text or "or-tools" in text:
        picked.append(("CP-SAT and OR-Tools", _GENERAL["cp-sat"]))
    if "constraint" in text:
        picked.append(("Constraint programming", _GENERAL["constraint programming"]))
    if "optimi" in text or "objective" in text:
        picked.append(("Optimisation vocabulary", _GENERAL["optimisation"]))
    if "difference" in text or "compare" in text:
        picked.append(("Difference engine", _GENERAL["difference engine"]))
    if not picked:
        picked.append(("Digital twin", _GENERAL["digital twin"]))

    lines = [mode_framing("research"), "", "### General knowledge", ""]
    for title, body in picked:
        lines.append(f"**{title}.** {body}")
        lines.append("")
    lines.append("### This project")
    lines.append(_PROJECT)
    lines.append("")
    lines.append(
        f"Concretely, the model here holds {_fmt(summary.get('buildings'))} buildings, "
        f"{_fmt(summary.get('rooms'))} rooms and {_fmt(summary.get('sessions'))} weekly sessions, and the "
        "dataset is synthetic — it is a demonstration, not institutional data."
    )
    lines.append("")
    lines.append(
        "> General knowledge above is textbook material about these techniques. Claims about MIRRORWORLD are "
        "limited to what its services return, and no model was used to produce this answer."
    )
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Explainable reasoning block
# ---------------------------------------------------------------------------

def reasoning_block(
    context: dict, *, used_model: bool, mode: str, tools: list[dict] | None = None
) -> dict:
    """The structured *why* behind an answer — inputs and provenance, not hidden reasoning.

    This summarises what was consulted (evidence rows and their API source), which
    assumptions are in force, what could not be verified, and the single most
    useful next step. It never exposes step-by-step deliberation.
    """
    evidence = context.get("evidence") or []
    assumptions = context.get("assumptions") or []
    knowledge = context.get("knowledge") or {}
    movement = context.get("movement") or {}
    cards = context.get("recommendation_cards") or []
    scenario = context.get("scenario") or {}

    sources = sorted({str(row.get("source")) for row in evidence if row.get("source")})
    for item in tools or []:
        if item.get("ok"):
            sources.append(f"tool · {item.get('tool')}")

    limitations = list(((knowledge.get("dataset") or {}).get("limits") or []))
    unknown = movement.get("unknown_distance_transitions")
    if unknown:
        limitations.append(
            f"{unknown} transition(s) have no modelled distance; their walking time is unknown, not zero."
        )
    if not used_model:
        limitations.append(
            "No language model produced this text: it comes from the deterministic rule engine and quotes "
            "backend values verbatim."
        )

    next_actions: list[dict] = [
        {"label": card.get("title") or card.get("problem"), "route": card.get("route")}
        for card in cards[:2]
    ]
    if scenario and not (scenario.get("plans") or []):
        next_actions.append(
            {"label": "Run CP-SAT in the Schedule optimizer for a recovery plan.", "route": "/optimizer"}
        )
    if not next_actions:
        next_actions.append(
            {"label": "Run a disruption in Simulation Studio so the briefing can compare it.", "route": "/simulation"}
        )

    return {
        "mode": normalize_mode(mode),
        "mode_label": MODES[normalize_mode(mode)]["label"],
        "evidence": evidence[:8],
        "sources": sources[:8],
        "assumptions": assumptions[:5],
        "limitations": limitations[:5],
        "next_actions": next_actions[:3],
        "text_origin": "language-model" if used_model else "verification",
    }
