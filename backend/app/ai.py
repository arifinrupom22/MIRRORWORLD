"""Mirror AI — the grounded reasoning and explanation layer.

Architecture (see ``docs``/README):

    api.py            assembles a grounded context from deterministic services
    ai_context.py     shapes knowledge / assumptions / plans / movement / actions
    ai_tools.py       deterministic scenario parsing + status glossary
    ai_providers.py   one adapter per vendor (Google today), sync + streaming
    ai.py (this file) prompt, policy, provider fallback, rule engine

Rules enforced here:

* The key is read from the environment and never leaves the backend.
* The model never computes campus numbers — it is told to use the supplied
  context verbatim and to say "not available" when a fact is missing.
* With no key (or with ``AI_ENABLED=false``) nothing claims a model answered:
  the rule engine produces the text and the response says so.
* Provider failure degrades to the rule engine with a classified error, never a
  fabricated success. A heuristic solver result is never described as optimal.
"""

from __future__ import annotations

import json
import os
import time
from typing import Iterator

from . import ai_modes
from .ai_providers import (
    DEFAULT_BASE_URL,
    DEFAULT_MODEL,
    ERROR_HINTS,
    PROVIDERS,
    ProviderError,
    build_provider,
    supported_providers,
)

__all__ = [
    "DEFAULT_BASE_URL",
    "DEFAULT_MODEL",
    "ProviderError",
    "SYSTEM_INSTRUCTION",
    "ask",
    "ask_stream",
    "deterministic_answer",
    "status",
    "validate_connection",
]

SYSTEM_INSTRUCTION = """You are Mirror AI, the Intelligent Campus Decision Copilot inside MIRRORWORLD,
a campus digital twin for a university administrator. Tagline: Understand. Simulate. Optimize. Decide.

You are not a generic assistant. You reason about THIS campus model and the context supplied in every message.

ABSOLUTE RULES
1. Use ONLY the JSON context supplied in the user message. Never invent a building, room, cohort, instructor,
   number, distance, energy value, solver status, plan or schedule.
2. If the context lacks what is asked, say exactly which fact is missing. Do not estimate.
3. Every number you quote must appear verbatim in the context. Never recompute, rescale or extrapolate.
   Multi-step arithmetic on context values is allowed only if you show the two source values.
4. Solver status is authoritative. Use the status_explanation glossary in the context:
   OPTIMAL, FEASIBLE, FEASIBLE_HEURISTIC, INFEASIBLE, UNKNOWN, AUDIT_FAILED are not interchangeable.
   Never describe a FEASIBLE_HEURISTIC plan as optimal; never call an INFEASIBLE or UNKNOWN run a success.
5. Student movement is a timetable-derived estimate at the stated walking speed, not live tracking or GPS.
6. Separate three things explicitly: (a) computed facts from the context, (b) your interpretation,
   (c) suggested next actions. Label suggestions as suggestions.
7. The campus dataset is synthetic; never imply it is live institutional data or IoT telemetry.
8. Scenario changes are proposals only. You may describe a proposed change, but you must tell the user it
   requires explicit confirmation in MIRRORWORLD before anything is created. Never claim you applied it.
9. For recommendations, use the recommendation cards' problem, evidence, action, expected benefit,
   trade-off and confidence. Do not invent percentages or savings.
10. Be concrete and brief: markdown with short sections, tables only when comparing values, no greetings,
    no filler, no restating the question.

ANSWER SHAPE (choose what fits, keep it tight)
- The direct answer first, in one or two sentences.
- Then the evidence: the specific values you used, grouped.
- Then consequences or trade-offs, if any.
- Then at most three suggested next actions, labelled as suggestions.
"""

_TOPIC_TERMS = (
    "conflict",
    "capacity",
    "seat",
    "energy",
    "move",
    "walk",
    "plan",
    "optimi",
    "alert",
    "risk",
    "scenario",
    "difference",
    "recommend",
    "bottleneck",
)


def _flag(name: str, default: str = "") -> str:
    return (os.getenv(name) or default).strip()


def _config() -> dict:
    """Read configuration at call time so tests and reloads pick up changes.

    Canonical names are ``AI_*``; the earlier ``MIRROR_AI_*`` names keep working
    so existing deployments and documentation do not break.
    """
    key = (
        _flag("MIRROR_AI_API_KEY")
        or _flag("GOOGLE_API_KEY")
        or _flag("GEMINI_API_KEY")
        or _flag("AI_API_KEY")
    )
    enabled_raw = _flag("AI_ENABLED") or _flag("MIRROR_AI_ENABLED") or "true"
    return {
        "enabled": enabled_raw.lower() not in {"0", "false", "no", "off"},
        "provider": (_flag("MIRROR_AI_PROVIDER") or _flag("AI_PROVIDER") or "google").lower(),
        "api_key": key,
        "model": _flag("MIRROR_AI_MODEL") or _flag("AI_MODEL") or DEFAULT_MODEL,
        "fallback_model": _flag("MIRROR_AI_FALLBACK_MODEL") or _flag("AI_FALLBACK_MODEL"),
        "base_url": (_flag("MIRROR_AI_BASE_URL") or _flag("AI_BASE_URL") or DEFAULT_BASE_URL).rstrip("/"),
        "timeout": float(_flag("MIRROR_AI_TIMEOUT") or _flag("AI_TIMEOUT") or 30),
        "max_retries": max(0, int(_flag("MIRROR_AI_MAX_RETRIES") or _flag("AI_MAX_RETRIES") or 1)),
    }


#: Failures that are worth a second attempt: provider 5xx and timeouts.
_TRANSIENT_KINDS = frozenset({"provider_unavailable", "timeout"})

#: Base backoff; the wait grows linearly with the attempt number.
_RETRY_BACKOFF_SECONDS = 0.8


def _mode(config: dict) -> str:
    if not config["enabled"]:
        return "disabled"
    return "language-model" if config["api_key"] else "deterministic"


def status() -> dict:
    """Accurate provider status. Never reports a model as active without a key."""
    config = _config()
    configured = bool(config["api_key"])
    return {
        "enabled": config["enabled"],
        "provider": config["provider"],
        "model": config["model"],
        "fallback_model": config["fallback_model"] or None,
        "configured": configured,
        "key_env": "GOOGLE_API_KEY",
        "key_env_aliases": ["GOOGLE_API_KEY", "MIRROR_AI_API_KEY", "GEMINI_API_KEY", "AI_API_KEY"],
        "base_url": config["base_url"],
        "mode": _mode(config),
        "supported_providers": supported_providers(),
        "error_hints": ERROR_HINTS,
        "capabilities": {
            "streaming": True,
            "history_turns": 12,
            "proposal_confirmation": "required",
            "grounding": "deterministic-services",
        },
    }


def validate_connection() -> dict:
    """Check the configured provider without generating tokens."""
    config = _config()
    if not config["enabled"]:
        return {"ok": False, "enabled": False, "kind": "disabled", "message": "Mirror AI is disabled by AI_ENABLED.", "hint": "Set AI_ENABLED=true to enable the copilot."}
    if not config["api_key"]:
        return {
            "ok": False,
            "enabled": True,
            "kind": "not_configured",
            "provider": config["provider"],
            "model": config["model"],
            "message": "No API key is configured, so no provider call was attempted.",
            "hint": ERROR_HINTS["not_configured"],
        }
    try:
        provider = build_provider(config["provider"], config)
    except ProviderError as error:
        return {"ok": False, "enabled": True, **error.as_dict()}
    result = provider.validate(config["model"])
    return {"enabled": True, **result}


def _post(config: dict, model: str, system: str, user: str) -> str:
    """Single-shot generation through the configured provider.

    Kept as a module-level function so tests can stub the transport without a
    network call.
    """
    provider = build_provider(config["provider"], config)
    return provider.generate(model, system, user)


def _stream(config: dict, model: str, system: str, user: str) -> Iterator[str]:
    provider = build_provider(config["provider"], config)
    return provider.generate_stream(model, system, user)


def _models(config: dict) -> list[str]:
    models = [config["model"]]
    if config["fallback_model"] and config["fallback_model"] != config["model"]:
        models.append(config["fallback_model"])
    return models


def _conversation(history: list[dict] | None) -> str:
    """Recent turns, included for pronoun resolution only."""
    rows = []
    for turn in (history or [])[-12:]:
        text = str(turn.get("content") or "").strip()
        if text:
            rows.append(f"{turn.get('role', 'user')}: {text[:800]}")
    if not rows:
        return ""
    return "\n\nRECENT CONVERSATION (not authoritative — facts must still come from the context):\n" + "\n".join(rows)


def _prompt(question: str, context: dict, history: list[dict] | None = None) -> str:
    return (
        "CAMPUS CONTEXT (authoritative, generated by MIRRORWORLD's deterministic services):\n"
        f"{json.dumps(context, ensure_ascii=False, separators=(',', ':'))}\n"
        f"{_conversation(history)}\n\n"
        f"ADMINISTRATOR QUESTION:\n{question}"
    )


def _rule_result(
    question: str,
    context: dict,
    *,
    error: ProviderError | None = None,
    fallback_used: bool = False,
    mode: str = "ask",
) -> dict:
    answer = (
        ai_modes.deterministic_research(question, context)
        if ai_modes.normalize_mode(mode) == "research"
        else deterministic_answer(question, context)
    )
    return {
        "answer": answer,
        "provider": "mirrorworld-rule-engine",
        "model": "deterministic",
        "used_model": False,
        "fallback_used": fallback_used,
        "provider_error": str(error) if error else None,
        "provider_error_kind": error.kind if error else None,
        "provider_error_hint": error.hint if error else None,
        "mode": "deterministic",
    }


def ask(question: str, context: dict, history: list[dict] | None = None, mode: str = "ask") -> dict:
    """Answer a question from a grounded context in the requested mode."""
    config = _config()
    if not config["enabled"]:
        return _rule_result(question, context, mode=mode)
    if not config["api_key"]:
        return _rule_result(question, context, mode=mode)

    prompt = _prompt(question, context, history)
    last_error: ProviderError | None = None
    for model in _models(config):
        for attempt in range(config["max_retries"] + 1):
            try:
                text = _post(config, model, SYSTEM_INSTRUCTION + ai_modes.system_suffix(mode), prompt)
            except ProviderError as error:
                last_error = error
                # Auth and quota failures will not improve on a second model.
                if error.kind in {"auth", "bad_request", "not_configured"}:
                    return _rule_result(question, context, error=error, fallback_used=True, mode=mode)
                # A 5xx or timeout is often transient, so retry before degrading.
                if attempt < config["max_retries"] and error.kind in _TRANSIENT_KINDS:
                    time.sleep(_RETRY_BACKOFF_SECONDS * (attempt + 1))
                    continue
                break
            return {
                "answer": text,
                "provider": config["provider"],
                "model": model,
                "used_model": True,
                "fallback_used": model != config["model"],
                "provider_error": None if attempt == 0 else f"Recovered after {attempt} retry(ies).",
                "provider_error_kind": None,
                "provider_error_hint": None,
                "mode": "language-model",
            }
    return _rule_result(question, context, error=last_error, fallback_used=True)


def ask_stream(
    question: str, context: dict, history: list[dict] | None = None, mode: str = "ask"
) -> Iterator[dict]:
    """Stream an answer as ``meta`` / ``delta`` / ``done`` events.

    Deterministic mode emits the computed answer as one delta: the text is not
    paced or animated, so streaming never fakes work being done.
    """
    config = _config()
    base_meta = {
        "configured": bool(config["api_key"]),
        "enabled": config["enabled"],
        "provider": config["provider"],
        "model": config["model"],
        "mode": _mode(config),
    }

    if not config["enabled"] or not config["api_key"]:
        result = _rule_result(question, context, mode=mode)
        yield {"type": "meta", **base_meta, "used_model": False, "fallback_used": False}
        yield {"type": "delta", "text": result["answer"]}
        yield {"type": "done", **result}
        return

    prompt = _prompt(question, context, history)
    last_error: ProviderError | None = None
    for model in _models(config):
        for attempt in range(config["max_retries"] + 1):
            produced = False
            chunks: list[str] = []
            try:
                if attempt == 0:
                    yield {
                        "type": "meta",
                        **base_meta,
                        "model": model,
                        "used_model": True,
                        "fallback_used": model != config["model"],
                    }
                for chunk in _stream(config, model, SYSTEM_INSTRUCTION + ai_modes.system_suffix(mode), prompt):
                    produced = True
                    chunks.append(chunk)
                    yield {"type": "delta", "text": chunk}
            except ProviderError as error:
                last_error = error
                if produced:
                    # Mid-stream failure: report it instead of pretending completion.
                    yield {
                        "type": "done",
                        "answer": "".join(chunks),
                        "provider": config["provider"],
                        "model": model,
                        "used_model": True,
                        "fallback_used": model != config["model"],
                        "provider_error": f"Stream interrupted: {error}",
                        "provider_error_kind": error.kind,
                        "provider_error_hint": error.hint,
                        "mode": "language-model",
                        "truncated": True,
                    }
                    return
                if attempt < config["max_retries"] and error.kind in _TRANSIENT_KINDS:
                    time.sleep(_RETRY_BACKOFF_SECONDS * (attempt + 1))
                    continue
                break
            if produced:
                yield {
                    "type": "done",
                    "answer": "".join(chunks),
                    "provider": config["provider"],
                    "model": model,
                    "used_model": True,
                    "fallback_used": model != config["model"],
                    "provider_error": None if attempt == 0 else f"Recovered after {attempt} retry(ies).",
                    "provider_error_kind": None,
                    "provider_error_hint": None,
                    "mode": "language-model",
                }
                return

    # Report the real provider failure; a generic message hides the diagnosis.
    failure = last_error or ProviderError(
        "All configured models failed to produce an answer.", kind="provider_unavailable"
    )
    result = _rule_result(question, context, error=failure, fallback_used=True, mode=mode)
    yield {"type": "meta", **base_meta, "used_model": False, "fallback_used": True}
    yield {"type": "delta", "text": result["answer"]}
    yield {"type": "done", **result}


# ---------------------------------------------------------------------------
# Deterministic rule engine
# ---------------------------------------------------------------------------

_FOOTER = (
    "> Rule engine · no language model is configured or the provider was unavailable. "
    "These values are read from MIRRORWORLD's deterministic services."
)


def _fmt(value, suffix: str = "") -> str:
    if value is None:
        return "not available"
    if isinstance(value, bool):
        return "yes" if value else "no"
    if isinstance(value, float):
        return f"{value:,.2f}{suffix}"
    if isinstance(value, int):
        return f"{value:,}{suffix}"
    return f"{value}{suffix}"


def _has(text: str, *words: str) -> bool:
    return any(word in text for word in words)


def deterministic_answer(question: str, context: dict) -> str:
    """Rule-based answer used when no model answers.

    Every sentence quotes a value from ``context``; nothing is computed here
    beyond formatting. Sections mirror the copilot's modules so the rule engine
    and the model cover the same ground.
    """
    text = (question or "").lower()
    baseline = context.get("baseline", {})
    campus = context.get("campus", {})
    summary = campus.get("summary", {})
    knowledge = context.get("knowledge", {}) or {}
    scenario = context.get("scenario")
    alerts = context.get("alerts", []) or []
    movement = context.get("movement", {}) or {}
    cards = context.get("recommendation_cards", []) or []
    assumptions_rows = context.get("assumptions", []) or []
    lines: list[str] = []

    def heading(title: str) -> None:
        lines.append(f"### {title}")

    def bullet_list(items: list[str]) -> None:
        lines.extend(f"- {item}" for item in items)

    not_modelled = [word for word in ("library", "cafeteria", "canteen", "hostel", "dorm", "parking", "gym", "auditorium") if word in text]
    if not_modelled and not _has(text, *_TOPIC_TERMS):
        heading("Not in the campus model")
        lines.append(
            f"The dataset models {_fmt(summary.get('buildings'))} teaching buildings with "
            f"{_fmt(summary.get('rooms'))} rooms ({_fmt(summary.get('labs'))} laboratories). "
            f"It contains no {not_modelled[0]} record, so there is no capacity, booking or location to report for one."
        )
        names = ", ".join(
            str(building.get("name")) for building in knowledge.get("buildings", context.get("campus", {}).get("buildings", []))
        )
        if names:
            lines.append(f"Modelled buildings: {names}.")
        lines.append(_FOOTER)
        return "\n".join(lines)

    if scenario:
        lines.append(
            f"**Active scenario:** {scenario.get('name')} ({scenario.get('kind')}) — {scenario.get('headline', '')}".strip()
        )

    if _has(text, "recommend", "improve", "what should", "next step"):
        heading("Recommendations")
        if cards:
            for index, card in enumerate(cards[:4], start=1):
                lines.append(f"**{index}. {card.get('problem')}**")
                evidence = card.get("evidence") or []
                if evidence:
                    lines.append(
                        "Evidence: "
                        + "; ".join(
                            f"{row.get('metric')} = {_fmt(row.get('value'))} ({row.get('comparison')})"
                            for row in evidence[:3]
                        )
                    )
                lines.append(f"Action: {card.get('action')}")
                lines.append(f"Expected benefit: {card.get('expected_benefit')}")
                lines.append(f"Trade-off: {card.get('tradeoff')}")
                lines.append(f"Evidence quality: {card.get('confidence')} · route `{card.get('route')}`")
        else:
            lines.append(
                "No recommendation threshold fired for the current state, so Mirror AI has nothing evidence-backed to "
                "suggest. Recommendations are only emitted when a measured threshold (utilisation spread, seat pressure, "
                "conflict cluster, energy outlier, workload breach) is crossed."
            )
    elif _has(text, "bottleneck", "congest", "pressure", "constraint"):
        heading("Bottlenecks")
        if alerts:
            bullet_list(
                [f"[{alert.get('severity')}] {alert.get('title')} — {alert.get('description')}" for alert in alerts[:4]]
            )
        else:
            lines.append("No alerts are open for the current state.")
        flagged = movement.get("flagged_transitions") or []
        if flagged:
            lines.append("")
            lines.append(
                f"{_fmt(movement.get('flagged_count'))} transition(s) are tight, infeasible or missing a distance. "
                "Tightest:"
            )
            bullet_list(
                [
                    f"{row['cohort']} ({row['students']} students): {row['from']} → {row['to']}, "
                    f"{row['gap_min']} min gap vs {_fmt(row.get('walking_time_min'), ' min')} walking"
                    for row in flagged[:3]
                ]
            )
    elif _has(text, "move", "walk", "distance", "transition", "route", "travel"):
        heading("Student movement")
        if movement.get("available", True):
            lines.append(
                f"Across the week: {_fmt(movement.get('total_transitions'))} transitions, "
                f"{_fmt(movement.get('total_students'))} student trips, "
                f"{_fmt(movement.get('total_distance_m'), ' m')} of student-distance, "
                f"{_fmt(movement.get('total_walking_time_min'), ' min')} of walking time."
            )
            lines.append(
                f"{_fmt(movement.get('tight_transitions'))} tight and "
                f"{_fmt(movement.get('infeasible_transitions'))} infeasible transfers; "
                f"{_fmt(movement.get('unknown_distance_transitions'))} transitions have no distance value."
            )
            flagged = movement.get("flagged_transitions") or []
            if flagged:
                lines.append("")
                lines.append("Transitions to review:")
                bullet_list(
                    [
                        f"{row['cohort']}: {row['from']} → {row['to']} · {row['gap_min']} min gap · "
                        f"{_fmt(row.get('distance_m'), ' m')} · {_fmt(row.get('walking_time_min'), ' min')} walking"
                        for row in flagged[:4]
                    ]
                )
            lines.append("")
            lines.append(
                f"Method: {movement.get('note') or 'Timetable-derived estimate; not live tracking.'} "
                f"Speed assumption {_fmt(movement.get('walking_speed_m_per_min'), ' m/min')}."
            )
        else:
            lines.append(movement.get("reason", "Movement data is not available for this state."))
    elif _has(text, "optimi", "solver", "plan", "recover", "schedule"):
        heading("Optimisation result")
        plans = (scenario or {}).get("plans") or []
        if plans:
            for plan in plans:
                explanation = (
                    plan.get("status_explanation")
                    or (context.get("optimizer_glossary") or {}).get(str(plan.get("status")), {})
                    or {}
                )
                lines.append(
                    f"**Plan {plan.get('label')} · {plan.get('strategy')}** — status `{plan.get('status')}`, "
                    f"objective {_fmt(plan.get('objective'))}."
                )
                lines.append(f"{explanation.get('means', 'No glossary entry for this status.')}")
            statuses = {str(plan.get("status")) for plan in plans}
            if statuses & {"INFEASIBLE", "UNKNOWN", "AUDIT_FAILED"}:
                lines.append(
                    "At least one plan did not produce a usable schedule. Those statuses are reported verbatim; "
                    "they are not a recovery result."
                )
            if "FEASIBLE_HEURISTIC" in statuses:
                lines.append(
                    "A heuristic fallback appears above: it passed the independent audit but is not a CP-SAT optimum."
                )
        else:
            lines.append(
                "No optimisation plan is stored for the selected scenario yet. Open the Schedule optimizer to run "
                "CP-SAT; Mirror AI reports the solver's own status and never infers one."
            )
    elif _has(text, "difference", "compare", "changed", "what happened", "impact", "affect", "disruption"):
        heading("What changed")
        if scenario:
            difference = scenario.get("difference") or {}
            changes = difference.get("changes") or []
            lines.append(
                f"{_fmt(difference.get('change_count', len(changes)))} difference row(s) between the baseline snapshot "
                "and the effective state."
            )
            if changes:
                lines.append("")
                lines.append("| Metric | Baseline | Scenario | Direction |")
                lines.append("| --- | --- | --- | --- |")
                for change in changes[:8]:
                    lines.append(
                        f"| {change.get('label')} | {_fmt(change.get('before'))} | "
                        f"{_fmt(change.get('after'))} | {change.get('direction')} |"
                    )
            for alert in alerts[:3]:
                lines.append(f"- [{alert.get('severity')}] {alert.get('title')}: {alert.get('consequences') or alert.get('description')}")
        else:
            lines.append(
                "No scenario is selected. The baseline is unchanged, so this answer describes the baseline state only."
            )
            lines.append(
                f"Baseline: {_fmt(baseline.get('sessions_total'))} sessions, "
                f"{_fmt(baseline.get('conflicts_total'))} collisions, "
                f"{_fmt(baseline.get('capacity_violations_count'))} capacity violations."
            )
    elif _has(text, "capacity", "seat", "overcrowd"):
        heading("Capacity")
        lines.append(
            f"{_fmt(baseline.get('capacity_violations_count'))} session(s) exceed their room's seat count "
            f"({_fmt(baseline.get('capacity_violations_total'))} excess seats), with seat utilisation at "
            f"{_fmt(baseline.get('seat_utilization_pct'), '%')}."
        )
        for alert in [item for item in alerts if "capacity" in str(item.get("category", "")).lower()][:3]:
            lines.append(f"- [{alert.get('severity')}] {alert.get('title')}: {alert.get('description')}")
    elif _has(text, "conflict", "double", "clash", "collision", "collid"):
        heading("Scheduling collisions")
        by_type = baseline.get("conflicts_by_type") or {}
        lines.append(
            f"{_fmt(baseline.get('sessions_total'))} weekly sessions carry "
            f"{_fmt(baseline.get('conflicts_total'))} collisions — {_fmt(by_type.get('room'))} room, "
            f"{_fmt(by_type.get('teacher'))} instructor, {_fmt(by_type.get('group'))} cohort."
        )
        for alert in [item for item in alerts if "conflict" in str(item.get("category", "")).lower()][:3]:
            lines.append(f"- [{alert.get('severity')}] {alert.get('title')}: {alert.get('description')}")
    elif _has(text, "energy", "power", "kwh", "consumption", "sustainab"):
        heading("Modelled energy")
        lines.append(
            f"{_fmt(baseline.get('energy_kwh'), ' kWh/week')} at a peak of {_fmt(baseline.get('peak_kw'), ' kW')}, "
            "modelled from room power ratings and scheduled hours — not a meter reading."
        )
        for alert in [item for item in alerts if "energy" in str(item.get("category", "")).lower()][:2]:
            lines.append(f"- [{alert.get('severity')}] {alert.get('title')}: {alert.get('description')}")
    elif _has(text, "alert", "problem", "issue", "risk", "critical", "wrong"):
        heading("Open alerts")
        if alerts:
            lines.append(f"{_fmt(len(alerts))} alert(s), ordered by severity:")
            bullet_list(
                [
                    f"**[{alert.get('severity')}] {alert.get('title')}** — {alert.get('description')} "
                    f"(action: {alert.get('suggested_action') or 'none suggested'})"
                    for alert in alerts[:5]
                ]
            )
        else:
            lines.append("No alerts were returned for the current state.")
    else:
        heading("Campus state")
        lines.append(
            f"The model covers {_fmt(summary.get('buildings'))} buildings, {_fmt(summary.get('rooms'))} teaching "
            f"spaces ({_fmt(summary.get('labs'))} laboratories), {_fmt(summary.get('teachers'))} instructors and "
            f"{_fmt(summary.get('students'))} enrolled students."
        )
        lines.append(
            f"Baseline: {_fmt(baseline.get('sessions_total'))} weekly sessions, "
            f"{_fmt(baseline.get('conflicts_total'))} scheduling collisions, "
            f"{_fmt(baseline.get('capacity_violations_count'))} capacity violations and "
            f"{_fmt(baseline.get('facility_mismatch_count'))} facility mismatches."
        )
        lines.append(
            f"Modelled energy is {_fmt(baseline.get('energy_kwh'), ' kWh/week')} with a peak of "
            f"{_fmt(baseline.get('peak_kw'), ' kW')}."
        )
        buildings = knowledge.get("buildings") or campus.get("buildings") or []
        if buildings:
            lines.append("")
            lines.append("| Building | Rooms | Labs | Seats | Floors | Zone |")
            lines.append("| --- | --- | --- | --- | --- | --- |")
            for building in buildings[:6]:
                lines.append(
                    f"| {building.get('name')} ({building.get('code')}) | {_fmt(building.get('rooms'))} | "
                    f"{_fmt(building.get('labs'))} | {_fmt(building.get('seats'))} | "
                    f"{_fmt(building.get('floors'))} | {building.get('zone')} |"
                )
        if alerts:
            lines.append("")
            lines.append(f"Most severe open alert: **{alerts[0].get('title')}** ({alerts[0].get('severity')}).")
        lines.append("")
        lines.append(
            "Ask about capacity, collisions, energy, student movement, alerts, a recovery plan, the difference "
            "engine, or a proposed disruption to get a grounded answer."
        )

    if assumptions_rows:
        lines.append("")
        lines.append("### Assumptions behind these numbers")
        bullet_list([f"{row['claim']} — {row['status']}: {row['detail']}" for row in assumptions_rows[:4]])

    lines.append("")
    lines.append(_FOOTER)
    return "\n".join(lines)
