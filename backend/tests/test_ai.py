"""Tests for the Mirror AI grounding layer and its HTTP surface.

The suite never calls a real provider: the Google transport is monkeypatched.
What is verified here is the property that matters for the product — answers
are grounded in deterministic services, a missing key never impersonates a
model, and a provider failure degrades to the rule engine with an explicit
error instead of a fabricated success.
"""

from __future__ import annotations

import json

import pytest

from app import ai


def _overview(client) -> dict:
    return client.get("/api/overview").json()


def test_status_reports_deterministic_mode_without_key(client, monkeypatch):
    for name in ("MIRROR_AI_API_KEY", "GOOGLE_API_KEY", "GEMINI_API_KEY"):
        monkeypatch.delenv(name, raising=False)
    payload = client.get("/api/ai/status").json()["ai"]
    assert payload["configured"] is False
    assert payload["mode"] == "deterministic"
    assert payload["provider"] == "google"
    assert payload["model"]


def test_chat_without_key_uses_rule_engine_and_quotes_backend_numbers(client, monkeypatch):
    for name in ("MIRROR_AI_API_KEY", "GOOGLE_API_KEY", "GEMINI_API_KEY"):
        monkeypatch.delenv(name, raising=False)

    metrics = _overview(client)["metrics"]
    response = client.post("/api/ai/chat", json={"message": "How many weekly sessions and collisions are there?"})
    assert response.status_code == 200
    body = response.json()

    assert body["used_model"] is False
    assert body["configured"] is False
    assert body["provider"] == "mirrorworld-rule-engine"
    assert body["fallback_used"] is False
    # The numbers must be the ones the deterministic services computed.
    assert f"{metrics['sessions_total']:,}" in body["answer"] or str(metrics["sessions_total"]) in body["answer"]
    assert "Synthetic demo dataset" not in body["answer"]  # no dataset prose leaks into the answer
    labels = {item["label"] for item in body["evidence"]}
    assert "Weekly sessions" in labels
    assert "Schedule collisions" in labels


def test_chat_rejects_empty_and_overlong_questions(client):
    assert client.post("/api/ai/chat", json={"message": " "}).status_code == 422
    assert client.post("/api/ai/chat", json={"message": "x" * 2001}).status_code == 422


def test_chat_unknown_scenario_is_404(client):
    response = client.post("/api/ai/chat", json={"message": "Explain this scenario", "scenario_id": "does-not-exist"})
    assert response.status_code == 404


def test_scenario_context_uses_scenario_metrics(client):
    scenarios = client.get("/api/scenarios").json()["scenarios"]
    assert scenarios, "demo scenarios must exist"
    scenario = scenarios[0]
    body = client.post(
        "/api/ai/chat",
        json={"message": "What is the current state of this scenario?", "scenario_id": scenario["id"]},
    ).json()
    assert body["scenario_id"] == scenario["id"]
    assert body["scenario"] == scenario["name"]
    assert body["used_model"] is False


def test_provider_failure_degrades_with_visible_error(client, monkeypatch):
    monkeypatch.setenv("MIRROR_AI_API_KEY", "test-key-not-real")
    monkeypatch.setenv("MIRROR_AI_MAX_RETRIES", "0")

    def boom(config, model, system, user):  # noqa: ANN001 - test double
        raise ai.ProviderError("Provider returned HTTP 503. upstream unavailable")

    monkeypatch.setattr(ai, "_post", boom)
    body = client.post("/api/ai/chat", json={"message": "Summarise the campus"}).json()

    assert body["used_model"] is False
    assert body["fallback_used"] is True
    assert body["provider"] == "mirrorworld-rule-engine"
    assert "503" in (body["provider_error"] or "")
    assert body["answer"].strip()


def test_provider_success_reports_actual_model(client, monkeypatch):
    monkeypatch.setenv("MIRROR_AI_API_KEY", "test-key-not-real")
    monkeypatch.setenv("MIRROR_AI_MODEL", "test-primary-model")

    captured: dict = {}

    def fake_post(config, model, system, user):  # noqa: ANN001 - test double
        captured["model"] = model
        captured["prompt"] = user
        return "Grounded answer from the configured model."

    monkeypatch.setattr(ai, "_post", fake_post)
    body = client.post("/api/ai/chat", json={"message": "Which alerts are critical?"}).json()

    assert body["used_model"] is True
    assert body["model"] == "test-primary-model"
    assert body["answer"] == "Grounded answer from the configured model."
    assert captured["model"] == "test-primary-model"
    # The prompt carries the deterministic context, so the model cannot invent it.
    assert "CAMPUS CONTEXT" in captured["prompt"]
    assert "evidence" in captured["prompt"]


def test_fallback_model_is_used_when_primary_fails(client, monkeypatch):
    monkeypatch.setenv("MIRROR_AI_API_KEY", "test-key-not-real")
    monkeypatch.setenv("MIRROR_AI_MODEL", "primary-model")
    monkeypatch.setenv("MIRROR_AI_FALLBACK_MODEL", "fallback-model")

    attempted: list[str] = []

    def flaky_post(config, model, system, user):  # noqa: ANN001 - test double
        attempted.append(model)
        if model == "primary-model":
            raise ai.ProviderError("model not found", kind="model_unavailable")
        return "Answer from the fallback model."

    monkeypatch.setattr(ai, "_post", flaky_post)
    body = client.post("/api/ai/chat", json={"message": "Summarise the campus"}).json()

    assert attempted == ["primary-model", "fallback-model"]
    assert body["used_model"] is True
    assert body["model"] == "fallback-model"
    assert body["fallback_used"] is True


def test_a_transient_provider_error_is_retried_before_degrading(client, monkeypatch):
    monkeypatch.setenv("MIRROR_AI_API_KEY", "test-key-not-real")
    monkeypatch.setenv("MIRROR_AI_MODEL", "flaky-model")
    monkeypatch.setenv("MIRROR_AI_MAX_RETRIES", "2")
    monkeypatch.setattr(ai.time, "sleep", lambda seconds: None)

    calls: list[str] = []

    def flaky_post(config, model, system, user):  # noqa: ANN001 - test double
        calls.append(model)
        if len(calls) < 3:
            raise ai.ProviderError("Provider returned HTTP 500. Internal error", kind="provider_unavailable")
        return "Answer produced after the provider recovered."

    monkeypatch.setattr(ai, "_post", flaky_post)
    body = client.post("/api/ai/chat", json={"message": "Summarise the campus"}).json()

    assert len(calls) == 3
    assert body["used_model"] is True
    assert body["answer"] == "Answer produced after the provider recovered."
    assert "Recovered after 2 retry" in (body["provider_error"] or "")


def test_an_auth_failure_is_never_retried(client, monkeypatch):
    monkeypatch.setenv("MIRROR_AI_API_KEY", "test-key-not-real")
    monkeypatch.setenv("MIRROR_AI_MAX_RETRIES", "3")
    monkeypatch.setattr(ai.time, "sleep", lambda seconds: None)

    calls: list[str] = []

    def bad_key(config, model, system, user):  # noqa: ANN001 - test double
        calls.append(model)
        raise ai.ProviderError("API key not valid", kind="auth")

    monkeypatch.setattr(ai, "_post", bad_key)
    body = client.post("/api/ai/chat", json={"message": "Summarise the campus"}).json()

    assert len(calls) == 1
    assert body["used_model"] is False
    assert body["provider_error_kind"] == "auth"


def test_context_contains_no_secrets(client, monkeypatch):
    monkeypatch.setenv("MIRROR_AI_API_KEY", "super-secret-value")

    def fake_post(config, model, system, user):  # noqa: ANN001 - test double
        assert "super-secret-value" not in user
        return "ok"

    monkeypatch.setattr(ai, "_post", fake_post)
    body = client.post("/api/ai/chat", json={"message": "Summarise the campus"}).json()
    serialized = json.dumps(body)
    assert "super-secret-value" not in serialized
