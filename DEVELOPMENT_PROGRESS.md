# DEVELOPMENT_PROGRESS

Living log for the staged transformation of MIRRORWORLD. Each stage is completed
and verified before the next begins; a later session resumes from here.

Status legend: **DONE** (implemented + verified), **PARTIAL**, **NOT STARTED**.

---

## Stage 1 — Digital Campus 2.5D/3D upgrade — **DONE**

- Added `three` (+ `@types/three`) to the frontend.
- `frontend/src/components/CampusScene3D.tsx`: schematic campus massing driven
  entirely by the persisted `building.map` boxes. Footprints come from the
  dataset, heights from each building's stored floor count multiplied by one
  explicitly labelled storey assumption. No coordinates or facades are invented.
- Interactive: orbit/zoom, click-to-select a block (rays against real meshes),
  building labels projected from world space, and the Phase 3 movement
  transitions drawn as elevated arcs with volume-scaled radius and direction
  arrows. Routes are rebuilt whenever the movement query changes (day/slot or
  selected route), not baked in at mount.
- `DigitalCampusPage` gained a `3D twin` / `2D plan` toggle. WebGL support is
  probed before defaulting to 3D; the 2D plan stays the guaranteed fallback and
  keeps the room-matching legend.
- Verified: `tsc -b` clean, production build clean, 3D renders, clicking `AT`
  updates the building inspector, movement arcs appear once `/api/movement`
  resolves.

## Stage 2 — Mirror AI — **DONE**

Architecture: provider-agnostic, grounded, and honest about its own state.

- `backend/app/ai.py`: env-driven config (`MIRROR_AI_*`), a Google
  `generateContent` client over stdlib HTTP with timeout + bounded retries, a
  primary/fallback model path, and a deterministic rule engine used when no key
  is configured or when the provider fails.
- `backend/app/api.py`: `_ai_context()` assembles a grounded context from the
  existing deterministic services (campus model, simulation metrics, alerts,
  recommendations, difference engine, movement engine). Endpoints:
  `GET /api/ai/status`, `POST /api/ai/chat`.
- The model is told to use only the supplied context and to admit missing facts;
  campus numbers are never computed by the model.
- Deterministic mode is labelled as such in both the API response
  (`provider: mirrorworld-rule-engine`, `used_model: false`) and the UI. A
  provider failure degrades to the rule engine with an explicit
  `provider_error` — a model is never impersonated.
- `frontend/src/pages/MirrorAIPage.tsx` + nav entry + route: grounded chat,
  per-answer provider badge, expandable evidence values, provider configuration
  panel, "what Mirror AI will not do" list.
- `backend/tests/test_ai.py` (9 tests): status without key, grounded
  deterministic answers that match `/api/overview`, scenario scoping, 404 for an
  unknown scenario, 422 for empty input, model path via a monkeypatched
  transport, fallback-model path, and a check that the key never appears in a
  response body or prompt.

## Stage 3 — App-wide UX pass, guided tour, contextual explanation — **DONE**

- `frontend/src/components/GuidedTour.tsx`: six-step walkthrough of the real
  workflow (Overview → Digital campus → Simulation → Optimizer → Comparison →
  Mirror AI). Each step navigates to its page and highlights a live element;
  missing anchors degrade to a plain card, so the tour cannot break a page.
  Keyboard support (←/→/Esc), progress dots, seen-state in `localStorage`, and a
  one-time first-run offer.
- Launch control in the top bar (`Compass`), store flag `tourOpen`.
- Existing page headers, empty states and provenance panels already carried the
  contextual explanations, so the pass focused on the tour rather than
  restyling working pages.

## Stage 4 — Documentation, configuration, regression — **DONE**

- `backend/.env.example` documents every `MIRROR_AI_*` variable and states that
  the deterministic mode is the default.
- `README.md` documents the 3D twin, Mirror AI, the tour and the key setup.
- `IMPLEMENTATION_ROADMAP.md`, `FEATURE_AUDIT.md` and `SYSTEM_ARCHITECTURE.md`
  updated so Phase 4 / MIRROR AI no longer reads as missing: the audited baseline
  text is kept and annotated, current status lives in the top status tables,
  `ai.py` is added to the module map and the endpoint inventory, and the one
  Phase 4 item deliberately not built (free-text scenario creation that mutates
  state) is recorded as a decision rather than left ambiguous.
- Regression: full backend `pytest`, frontend `tsc -b`, `npm run build`,
  `npm run lint`.

## Stage 5 — Mirror AI intelligence upgrade — **DONE**

Extends Stage 2; nothing was rebuilt and no existing endpoint changed shape
(additive fields only).

- **Configuration fix.** `backend/app/env.py` parses `backend/.env` at startup
  without adding a dependency. Before this, a key placed in `.env` was never
  read by Python, so the API reported deterministic mode while a key sat on
  disk. Real environment variables still win; values are never logged.
- **Five modes** (`ai_modes.py`): Ask, Analyst, What-if, Advisor, Research. The
  mode is a server-side `Literal` on `AIChatRequest`, so an unknown value is a
  422, not a prompt injection. Each mode has its own guidance suffix (model
  path) and its own deterministic behaviour (no-key path).
- **Campus Intelligence Briefing** (`GET /api/ai/briefing`): seven sections,
  each with items, sources and an evidence-quality label. Sections without data
  say so (*Insufficient data*) and name the action that would produce it — for
  example "open Simulation Studio and run a template" when no scenario exists.
- **Tool registry** (`ai_registry.py`, `GET /api/ai/tools`): ten allowlisted
  tools over the already-computed context. Mode-plus-keyword selection means a
  model cannot widen its own toolset. `execute_confirmed_scenario` is disabled
  in the registry by policy; creation stays on the audited confirmation
  endpoint. Every execution is logged with tool, outcome, row count and
  elapsed milliseconds.
- **Explainability**: every chat answer now returns `reasoning` (evidence,
  sources, assumptions, limitations, next actions, text origin),
  `evidence_quality` (five transparent labels, no percentages) and `tools`
  (what actually ran). Rendered as an expandable panel per answer.
- **Research mode honesty**: general knowledge is separated from claims about
  this project, and the deterministic path states that no model produced it.
- **Frontend**: mode selector with persistence, briefing panel, reasoning
  panel, tool-activity line, per-answer quality chips, conversation cleared per
  scenario.
- **Tests**: `backend/tests/test_ai_modes.py` (12) cover mode enforcement and
  rejection, analyst tool selection, research separation, what-if proposals
  (asserting no scenario is created), briefing shape and its insufficient-data
  branch, registry allowlist and write policy, execution logging and the `.env`
  loader's non-override rule. One existing rule-engine answer was corrected: a
  question about "weekly sessions and collisions" previously answered only the
  collision half.

---

## Provider hardening (Gemma 4)

- `MIRROR_AI_MAX_RETRIES` was inert: every non-auth failure broke out of the
  retry loop, so a 5xx was never retried. Transient failures (5xx, timeout) are
  now retried with linear backoff; auth and bad-request failures still fail fast.
- The stream path replaced the real cause with "All configured models failed to
  produce an answer"; it now reports the underlying provider error.
- Google reports a rejected key as HTTP 400 `API_KEY_INVALID`, which was
  classified `bad_request` ("check the model id"); it is now `auth`.
- Gemma 4's default thinking budget made the hosted endpoint answer HTTP 500 on
  most calls. Requests now send `thinkingLevel: minimal`, and `thought` parts
  are filtered out of both answers and streams.
- Tests clear provider keys in an autouse fixture, so a real key in `backend/.env`
  can no longer leak into the suite or make live calls from it.

## Known limitations (deliberate, and stated in the UI)

- The 3D view is schematic massing, not an architectural model: no surveyed
  coordinates, no facade detail, storey height is an assumption.
- Mode guidance is enforced by instruction, not by tool access, for the model
  path; the deterministic path is fully rule-bound. A model may still phrase
  things imperfectly — which is why every number is rendered from the context
  rather than parsed out of the prose.
- Multimodal inputs (map image, PDF, dataset upload, voice) are **not**
  implemented. The architecture keeps them additive — the registry and mode
  layer are the seams — but nothing in the UI claims them.
- Conversation context is browser-local and per scenario; it is not a server
  session and is intentionally not a permanent user profile.
- Gemma model ids depend on the key's entitlements; the default is a documented
  Gemini Flash id and the API surfaces the provider's own error if a model id is
  wrong. No model id is guessed at request time.
- Mirror AI answers are grounded but not a substitute for the deterministic
  pages: every figure it quotes is available on a page.
- Single-operator, synthetic dataset by design.

## Next candidates

- Second provider adapter behind the same `ask()` contract.
- Guided-tour deep links from alerts (open the tour at the relevant step).
- Optional server-side answer caching for repeated questions.
