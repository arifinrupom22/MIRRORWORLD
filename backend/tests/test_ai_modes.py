"""Tests for Mirror AI intelligence modes, briefing, registry and .env loading.

The properties under test are the ones that distinguish an explainable campus
agent from a chatbot: a mode is enforced server-side, the briefing is composed
from real services (and says so when a source is empty), tools are allowlisted
and read-only, and no answer claims a model when no model answered.
"""

from __future__ import annotations

import os

from app import ai, ai_modes, ai_providers, ai_registry, env


def _no_key(monkeypatch) -> None:
    for name in ("MIRROR_AI_API_KEY", "GOOGLE_API_KEY", "GEMINI_API_KEY", "AI_API_KEY"):
        monkeypatch.delenv(name, raising=False)


def test_chat_runs_in_analyst_mode_with_tools_and_reasoning(client, monkeypatch):
    _no_key(monkeypatch)
    body = client.post(
        "/api/ai/chat",
        json={"message": "Analyse the current campus: bottlenecks and conflicts.", "mode": "analyst"},
    ).json()

    assert body["capability_mode"] == "analyst"
    assert body["capability_mode_label"] == "Analyst"
    assert body["used_model"] is False
    # Tools actually executed, not merely advertised.
    assert body["tools"], "analyst mode must run at least one tool"
    assert all("tool" in item and "ok" in item for item in body["tools"])
    assert any(item["tool"] == "get_alerts" for item in body["tools"])

    reasoning = body["reasoning"]
    for key in ("evidence", "sources", "assumptions", "limitations", "next_actions", "text_origin"):
        assert key in reasoning
    assert reasoning["text_origin"] == "verification"
    # Transparency labels, never a fabricated percentage.
    keys = {row["key"] for row in body["evidence_quality"]}
    assert "verified" in keys and "calculated" in keys
    assert not any("%" in str(row.get("label")) for row in body["evidence_quality"])


def test_research_mode_separates_general_knowledge_from_project_facts(client, monkeypatch):
    _no_key(monkeypatch)
    body = client.post(
        "/api/ai/chat",
        json={"message": "How does CP-SAT work, and what does this project actually do?", "mode": "research"},
    ).json()

    answer = body["answer"]
    assert "### General knowledge" in answer
    assert "### This project" in answer
    assert body["capability_mode"] == "research"
    # The deterministic research path must not imply a model wrote it.
    assert body["used_model"] is False
    assert "no model was used" in answer.lower()


def test_what_if_mode_returns_a_proposal_but_never_applies_it(client, monkeypatch):
    _no_key(monkeypatch)
    before = client.get("/api/scenarios").json()["count"]
    body = client.post(
        "/api/ai/chat",
        json={"message": "What if building AT becomes unavailable?", "mode": "what_if"},
    ).json()

    proposal = body["proposal"]
    assert proposal is not None
    assert proposal["requires_confirmation"] is True
    assert proposal["applied"] is False
    assert proposal["understood"] is True
    assert proposal["params"]["unavailable_building_ids"], "the building must be resolved from the campus model"
    # Nothing may have been written by asking a what-if question.
    assert client.get("/api/scenarios").json()["count"] == before


def test_unknown_mode_is_rejected_rather_than_guessed(client):
    response = client.post("/api/ai/chat", json={"message": "hello", "mode": "jailbreak"})
    assert response.status_code == 422


def test_briefing_is_composed_from_real_sections_and_admits_missing_runs(client, monkeypatch):
    _no_key(monkeypatch)
    payload = client.get("/api/ai/briefing").json()
    briefing = payload["briefing"]

    ids = [section["id"] for section in briefing["sections"]]
    assert ids == [
        "condition",
        "issues",
        "constraints",
        "movement",
        "simulation",
        "optimisation",
        "actions",
    ]
    assert len(payload["modes"]) == 5
    # Baseline-only state: the briefing must say no scenario has been run rather
    # than inventing an insight, and must point at a useful first analysis.
    simulation = next(section for section in briefing["sections"] if section["id"] == "simulation")
    assert simulation["quality"]["key"] == "insufficient_data"
    assert any("Simulation Studio" in item for item in simulation["items"])
    assert briefing["provenance"]
    assert any(row["key"] == "verified" for row in [s["quality"] for s in briefing["sections"]])


def test_briefing_with_a_scenario_reports_difference_rows(client):
    scenario_id = client.get("/api/scenarios").json()["scenarios"][0]["id"]
    briefing = client.get(f"/api/ai/briefing?scenario_id={scenario_id}").json()["briefing"]
    assert briefing["scenario_id"] == scenario_id
    simulation = next(section for section in briefing["sections"] if section["id"] == "simulation")
    assert "difference row" in simulation["summary"]


def test_tool_registry_is_allowlisted_and_disables_writes():
    catalog = {tool["id"]: tool for tool in ai_registry.catalog()}
    assert set(catalog) >= {
        "get_campus_state",
        "get_scenario_details",
        "get_simulation_difference",
        "get_alerts",
        "get_recommendations",
        "get_movement_analytics",
        "get_optimization_result",
        "compare_scenarios",
        "propose_scenario_change",
        "execute_confirmed_scenario",
    }
    assert catalog["execute_confirmed_scenario"]["enabled"] is False
    assert catalog["execute_confirmed_scenario"]["requires_confirmation"] is True
    assert all(tool["kind"] in {"read", "proposal", "write"} for tool in catalog.values())


def test_tool_execution_rejects_unknown_and_disabled_tools():
    unknown = ai_registry.run("drop_everything", {})
    assert unknown["ok"] is False and unknown["rows"] == 0

    disabled = ai_registry.run("execute_confirmed_scenario", {})
    assert disabled["ok"] is False
    assert disabled["error"] == "disabled by policy"


def test_tool_execution_logs_each_call():
    ai_registry.run("get_campus_state", {"campus": {"summary": {"buildings": 4}}, "baseline": {}})
    recent = ai_registry.recent(5)
    assert recent and recent[-1]["tool"] == "get_campus_state"
    assert recent[-1]["ok"] is True
    assert "elapsed_ms" in recent[-1]


def test_env_loader_reads_file_without_overriding_real_variables(tmp_path, monkeypatch):
    env_file = tmp_path / ".env"
    env_file.write_text(
        "\n".join(
            [
                "# comment line",
                "MIRROR_AI_MODEL=from-file",
                'MIRROR_AI_FALLBACK_MODEL="quoted-model"',
                "ALREADY_SET=from-file",
                "export EXPORTED=yes",
                "EMPTY_VALUE=",
            ]
        ),
        encoding="utf-8",
    )
    monkeypatch.setenv("ALREADY_SET", "from-shell")
    monkeypatch.delenv("MIRROR_AI_MODEL", raising=False)
    monkeypatch.delenv("EXPORTED", raising=False)

    loaded = env.load_env(env_file)

    assert loaded["MIRROR_AI_MODEL"] == "from-file"
    assert os.environ["MIRROR_AI_MODEL"] == "from-file"
    assert loaded["MIRROR_AI_FALLBACK_MODEL"] == "quoted-model"  # quotes stripped
    assert os.environ["ALREADY_SET"] == "from-shell"  # never overrides
    assert os.environ["EXPORTED"] == "yes"
    # An empty value is not imported: it must not shadow a later real variable.
    assert "EMPTY_VALUE" not in env.loaded_names()


def test_env_loader_imports_real_backend_env_file():
    """The shipped ``backend/.env`` must at least be parsed without crashing."""
    loaded = env.load_env()
    assert isinstance(loaded, dict)
    # Values are never exposed by the status helpers.
    assert all("=" not in name for name in env.loaded_names())


def test_gemma_models_receive_the_system_prompt_inline():
    """Gemma rejects systemInstruction, so the prompt must move into the turn."""
    payload = ai_providers._payload("SYSTEM RULES", "user question", None, "gemma-3-4b-it")
    assert "systemInstruction" not in payload
    assert payload["contents"][-1]["parts"][0]["text"] == "SYSTEM RULES"
    assert payload["contents"][-1]["parts"][-1]["text"] == "user question"


def test_gemini_models_keep_the_dedicated_system_instruction():
    payload = ai_providers._payload("SYSTEM RULES", "user question", None, "gemini-2.5-flash")
    assert payload["systemInstruction"]["parts"][0]["text"] == "SYSTEM RULES"
    assert [part["text"] for part in payload["contents"][-1]["parts"]] == ["user question"]


def test_gemma_4_runs_without_its_unstable_thinking_budget():
    """Default thinking made Gemma 4 fail with HTTP 500 on most calls."""
    payload = ai_providers._payload("SYS", "question", None, "gemma-4-26b-a4b-it")
    assert payload["generationConfig"]["thinkingConfig"] == {"thinkingLevel": "minimal"}
    gemini = ai_providers._payload("SYS", "question", None, "gemini-2.5-flash")
    assert "thinkingConfig" not in gemini["generationConfig"]


def test_gemma_4_keeps_the_system_instruction_it_supports():
    payload = ai_providers._payload("SYSTEM RULES", "user question", None, "gemma-4-26b-a4b-it")
    assert payload["systemInstruction"]["parts"][0]["text"] == "SYSTEM RULES"
    assert [part["text"] for part in payload["contents"][-1]["parts"]] == ["user question"]


def test_thinking_parts_are_never_returned_as_the_answer():
    """Gemma 4 and Gemini thinking models interleave thoughts with answer text."""
    payload = {
        "candidates": [
            {
                "content": {
                    "parts": [
                        {"text": "secret reasoning", "thought": True},
                        {"text": "The answer."},
                    ]
                }
            }
        ]
    }
    assert ai_providers.GoogleProvider._text_from_payload(payload) == "The answer."


def test_a_payload_of_only_thoughts_yields_no_answer_text():
    """Thoughts are not an answer, so the empty-response guard in generate() fires."""
    payload = {"candidates": [{"content": {"parts": [{"text": "thinking", "thought": True}]}}]}
    assert ai_providers.GoogleProvider._text_from_payload(payload) == ""


def test_an_invalid_key_is_reported_as_auth_not_bad_request():
    """Google returns HTTP 400 API_KEY_INVALID; that is a credential fault."""
    detail = '{"error": {"code": 400, "message": "API key not valid.", "details": [{"reason": "API_KEY_INVALID"}]}}'
    assert ai_providers._classify(400, detail) == "auth"
    assert ai_providers._classify(400, '{"error":{"message":"bad field"}}') == "bad_request"
    assert ai_providers._classify(401) == "auth"
    assert ai_providers._classify(429) == "quota"
    assert ai_providers._classify(404) == "model_unavailable"


def test_stream_fallback_reports_the_real_provider_error(monkeypatch):
    """A generic "all models failed" message hides the cause; keep the detail."""
    for name in ("MIRROR_AI_API_KEY", "GOOGLE_API_KEY", "GEMINI_API_KEY", "AI_API_KEY"):
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setenv("MIRROR_AI_API_KEY", "test-key-not-real")
    monkeypatch.setenv("MIRROR_AI_MAX_RETRIES", "0")
    monkeypatch.setattr(ai.time, "sleep", lambda seconds: None)

    def broken_stream(config, model, system, user):  # noqa: ANN001 - test double
        raise ai.ProviderError("Provider returned HTTP 500. Internal error", kind="provider_unavailable")
        yield  # pragma: no cover - keeps this a generator

    monkeypatch.setattr(ai, "_stream", broken_stream)
    events = list(ai.ask_stream("How many sessions?", {}, None, "ask"))
    done = [event for event in events if event.get("type") == "done"][-1]

    assert done["used_model"] is False
    assert "500" in (done["provider_error"] or "")


def test_mode_normalisation_falls_back_to_ask():
    assert ai_modes.normalize_mode("ANALYST") == "analyst"
    assert ai_modes.normalize_mode("what-if") == "what_if"
    assert ai_modes.normalize_mode("nonsense") == "ask"
    assert ai_modes.normalize_mode(None) == "ask"
    assert "MODE: ANALYST" in ai_modes.system_suffix("analyst")
