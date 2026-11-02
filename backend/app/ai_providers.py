"""Provider adapters for Mirror AI.

A provider is anything that can turn a system instruction plus a user prompt
into text. The contract is deliberately tiny so a second vendor can be added
without touching the API layer, the grounding layer or the frontend:

    generate(model, system, user, history) -> str
    generate_stream(model, system, user, history) -> Iterator[str]
    validate(model) -> dict

Nothing in this module reads or returns the key. Errors are classified into a
small vocabulary the UI can explain (auth, quota, unavailable model, timeout,
malformed response) instead of surfacing a raw traceback.
"""

from __future__ import annotations

import json
import urllib.error
import urllib.request
from typing import Iterator

DEFAULT_MODEL = "gemini-2.5-flash"
DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com/v1beta"

#: Human wording for each error class. The API returns the code, the UI can
#: show the hint, and neither invents a status.
ERROR_HINTS = {
    "auth": "The API key was rejected. Check that the key is valid and has access to the model.",
    "quota": "The provider quota or rate limit was hit. Wait and retry, or switch model.",
    "model_unavailable": "The requested model is not available to this key.",
    "bad_request": "The provider rejected the request. Check the model id and prompt size.",
    "timeout": "The provider did not answer in time.",
    "provider_unavailable": "The provider is unreachable or returned a server error.",
    "malformed": "The provider returned a response this adapter could not read.",
    "not_configured": "No API key is configured, so no provider call was attempted.",
}


class ProviderError(RuntimeError):
    """A provider failure with a machine-readable ``kind``."""

    def __init__(self, message: str, *, kind: str = "provider_unavailable", status: int | None = None):
        super().__init__(message)
        self.kind = kind if kind in ERROR_HINTS else "provider_unavailable"
        self.status = status

    @property
    def hint(self) -> str:
        return ERROR_HINTS[self.kind]

    def as_dict(self) -> dict:
        return {"kind": self.kind, "message": str(self), "hint": self.hint, "status": self.status}


def _visible_text(parts) -> list[str]:
    """Answer text only: Gemma 4 and Gemini thinking models also emit thoughts."""
    return [
        part.get("text", "")
        for part in parts or []
        if isinstance(part, dict) and not part.get("thought")
    ]


#: Google answers a bad key with HTTP 400 and one of these markers, not 401.
_KEY_ERROR_MARKERS = (
    "api_key_invalid",
    "api key not valid",
    "api key expired",
    "invalid api key",
    "api key is invalid",
)


def _classify(status: int, detail: str = "") -> str:
    if status in (401, 403):
        return "auth"
    if status == 429:
        return "quota"
    if status == 404:
        return "model_unavailable"
    if status == 400:
        lowered = detail.lower()
        if any(marker in lowered for marker in _KEY_ERROR_MARKERS):
            return "auth"
        return "bad_request"
    if status >= 500:
        return "provider_unavailable"
    return "provider_unavailable"


#: Gemma 4 spends its default thinking budget on internal reasoning and that path
#: fails often (HTTP 500) while adding latency we do not want: answers here are
#: grounded extraction, never chain-of-thought. ``minimal`` disables thinking.
_GEMMA_THINKING_LEVEL = "minimal"


def _is_gemma4(model: str | None) -> bool:
    return str(model or "").strip().lower().startswith("gemma-4")


def _needs_inline_system(model: str | None) -> bool:
    """Gemma 3 and older reject ``systemInstruction``; their prompt is inlined.

    Gemma 4 (``gemma-4-31b-it``, ``gemma-4-26b-a4b-it``) accepts a real system
    instruction, so only the older family is rewritten.
    """
    name = str(model or "").strip().lower()
    return name.startswith("gemma") and not name.startswith("gemma-4")


def _payload(system: str, user: str, history: list[dict] | None, model: str | None = None) -> dict:
    contents: list[dict] = []
    for turn in history or []:
        role = "model" if turn.get("role") == "assistant" else "user"
        text = str(turn.get("content") or "").strip()
        if text:
            contents.append({"role": role, "parts": [{"text": text[:4000]}]})
    final_parts: list[dict] = []
    if _needs_inline_system(model) and system.strip():
        final_parts.append({"text": system.strip()})
    final_parts.append({"text": user})
    contents.append({"role": "user", "parts": final_parts})
    generation: dict = {"temperature": 0.2, "maxOutputTokens": 1600}
    if _is_gemma4(model):
        generation["thinkingConfig"] = {"thinkingLevel": _GEMMA_THINKING_LEVEL}
    payload: dict = {"contents": contents, "generationConfig": generation}
    if not _needs_inline_system(model):
        payload["systemInstruction"] = {"parts": [{"text": system}]}
    return payload


class GoogleProvider:
    """Google Generative Language API (Gemini and Gemma models)."""

    name = "google"
    label = "Google Generative Language"

    def __init__(self, *, api_key: str, base_url: str = DEFAULT_BASE_URL, timeout: float = 30.0):
        self._api_key = api_key
        self._base_url = base_url.rstrip("/")
        self._timeout = timeout

    # -- transport ---------------------------------------------------------
    def _request(self, url: str, body: dict | None) -> urllib.request.Request:
        return urllib.request.Request(
            url,
            data=json.dumps(body).encode("utf-8") if body is not None else None,
            headers={"Content-Type": "application/json", "x-goog-api-key": self._api_key},
            method="POST" if body is not None else "GET",
        )

    def _open(self, request: urllib.request.Request):
        try:
            return urllib.request.urlopen(request, timeout=self._timeout)
        except urllib.error.HTTPError as error:
            detail = error.read().decode("utf-8", "ignore")[:400].strip()
            raise ProviderError(
                f"Provider returned HTTP {error.code}. {detail}".strip(),
                kind=_classify(error.code, detail),
                status=error.code,
            ) from error
        except urllib.error.URLError as error:
            kind = "timeout" if "timed out" in str(error.reason).lower() else "provider_unavailable"
            raise ProviderError(f"Provider unreachable: {error.reason}", kind=kind) from error
        except TimeoutError as error:
            raise ProviderError("Provider request timed out.", kind="timeout") from error

    @staticmethod
    def _text_from_payload(payload: dict) -> str:
        candidates = payload.get("candidates") or []
        if not candidates:
            blocked = (payload.get("promptFeedback") or {}).get("blockReason")
            raise ProviderError(
                f"Provider returned no candidate{': ' + blocked if blocked else '.'}",
                kind="malformed",
            )
        return "\n".join(_visible_text((candidates[0].get("content") or {}).get("parts"))).strip()

    # -- contract ----------------------------------------------------------
    def generate(self, model: str, system: str, user: str, history: list[dict] | None = None) -> str:
        url = f"{self._base_url}/models/{model}:generateContent"
        with self._open(self._request(url, _payload(system, user, history, model))) as response:
            try:
                payload = json.loads(response.read().decode("utf-8"))
            except json.JSONDecodeError as error:
                raise ProviderError("Provider response was not valid JSON.", kind="malformed") from error
        text = self._text_from_payload(payload)
        if not text:
            raise ProviderError("Provider returned an empty response.", kind="malformed")
        return text

    def generate_stream(
        self, model: str, system: str, user: str, history: list[dict] | None = None
    ) -> Iterator[str]:
        url = f"{self._base_url}/models/{model}:streamGenerateContent?alt=sse"
        produced = False
        with self._open(self._request(url, _payload(system, user, history, model))) as response:
            for raw in response:
                line = raw.decode("utf-8", "ignore").strip()
                if not line or not line.startswith("data:"):
                    continue
                data = line[5:].strip()
                if not data or data == "[DONE]":
                    continue
                try:
                    chunk = json.loads(data)
                except json.JSONDecodeError:
                    continue
                parts = ((chunk.get("candidates") or [{}])[0].get("content") or {}).get("parts")
                text = "".join(_visible_text(parts))
                if text:
                    produced = True
                    yield text
        if not produced:
            raise ProviderError("Provider stream ended without any text.", kind="malformed")

    def validate(self, model: str) -> dict:
        """Cheap live check: read the model record, never generate tokens."""
        url = f"{self._base_url}/models/{model}"
        try:
            with self._open(self._request(url, None)) as response:
                payload = json.loads(response.read().decode("utf-8"))
        except ProviderError as error:
            return {"ok": False, "provider": self.name, "model": model, **error.as_dict()}
        except (json.JSONDecodeError, ValueError) as error:
            failure = ProviderError(f"Unexpected validation response: {error}", kind="malformed")
            return {"ok": False, "provider": self.name, "model": model, **failure.as_dict()}
        return {
            "ok": True,
            "provider": self.name,
            "model": model,
            "display_name": payload.get("displayName"),
            "input_token_limit": payload.get("inputTokenLimit"),
            "output_token_limit": payload.get("outputTokenLimit"),
        }


#: Registry. Adding a vendor means adding one entry here and one class above.
PROVIDERS = {"google": GoogleProvider}


def supported_providers() -> list[str]:
    return sorted(PROVIDERS)


def build_provider(name: str, config: dict):
    """Instantiate a provider, or raise ``ProviderError`` for an unknown id."""
    factory = PROVIDERS.get(name)
    if factory is None:
        raise ProviderError(
            f"Unknown AI provider '{name}'. Supported: {', '.join(supported_providers())}.",
            kind="bad_request",
        )
    return factory(api_key=config["api_key"], base_url=config["base_url"], timeout=config["timeout"])
