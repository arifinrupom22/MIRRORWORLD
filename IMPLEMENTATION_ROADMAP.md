# MIRRORWORLD — Implementation Roadmap

**Status:** Phases 1–4 implemented. Phase 4 ships a grounded MIRROR AI whose live model is optional; without a key it answers from the deterministic rule engine and says so.  
**Based on:** `FEATURE_AUDIT.md` and the current code at `5a9f888`  
**Constraint:** preserve all working functionality; additive changes; no rewrite of the existing MODEL → DETECT → SIMULATE → OPTIMIZE → COMPARE flow.

> **Implementation update.** Phase 1 (canonical state, Difference Engine, verified `FEASIBLE_HEURISTIC` fallback, atomic plan persistence, documentation alignment), Phase 2 (structured alerts, Recommended Actions, extended multi-variable parameters, severity assessment, seven server templates and their UI wiring), and Phase 3 (student movement service `movement.py`, `/api/movement` endpoint, SVG flow visualization, tight-transition detection, unverified distance flagging, and inspector panel) are now implemented. Phase 4 (MIRROR AI) is implemented as a grounded copilot: `ai.py` holds an env-configured, provider-specific transport plus a deterministic rule engine, `api.py` assembles the grounding context from the existing services, and `/mirror-ai` renders answers with their evidence. With no key configured every answer is labelled as rule-engine output; a provider failure degrades to the rule engine with an explicit error instead of impersonating a model.

**Executive summary (audited baseline — superseded by the status line above).** MIRRORWORLD could already model a synthetic campus, recompute conflicts and capacity pressure, simulate six disruption variables on an immutable baseline, and produce three independently audited CP-SAT recovery plans with comparison and export. It cannot yet express the specification’s richer scenario set, explain state differences, recommend operational actions, assign impact severity, visualise student movement, or answer questions in natural language. The critical path is solver reliability and a canonical Difference Engine in Phase 1; alerts, recommendations, extended parameters, severity and templates in Phase 2; movement visualization in Phase 3; and a grounded MIRROR AI in Phase 4. A competition-ready subset is Phase 1 + the Phase 2 decision features + Phase 3 + a narrow AI demonstration — not every feature at once.

---

## 1. Guiding decisions

1. **Compute before explaining.** Every new number must come from the campus model, simulation, optimizer or a documented formula. The AI layer is last and never computes results.
2. **One change model.** The Difference Engine is the shared contract for “what changed”. Alerts, severity, templates and AI consume it instead of re-deriving changes.
3. **Keep the baseline immutable.** All new parameters are applied to a scenario copy; no endpoint edits the baseline timetable.
4. **Preserve existing endpoints and screens.** New features are additive endpoints, panels and routes. Existing plan statuses and audits remain truthful.
5. **No false success.** Distinguish `INFEASIBLE`, `UNKNOWN` (timeout), `AUDIT_FAILED` and `FEASIBLE`. A heuristic fallback must say so.
6. **No new dependency without a decision.** Phase 1–3 can be built with the current stack. Phase 4 needs a provider decision and a server-side key.

---

## 2. Phase 1 — Core computational correctness and Difference Engine

**Goal:** make the demo reliable and create the shared state/diff contract that every later feature depends on.

### 1.1 Make plan generation deterministic within the demo window

**Problem.** The solver runs three plans, each with its own wall-clock limit. Under CPU contention a plan can return `UNKNOWN` with no schedule; the UI then says “No feasible schedule” although the scenario is feasible. The first full test run reproduced this: Plan B `UNKNOWN` at 3.0 s; plan export returned 409 because the plan had no schedule.

**Required files**

- `backend/app/optimizer.py`
- `backend/app/jobs.py`
- `backend/app/api.py`
- `backend/app/schemas.py`
- `frontend/src/pages/ScheduleOptimizerPage.tsx`
- `frontend/src/lib/types.ts`
- `backend/tests/test_mirrorworld.py`

**Backend changes**

- Keep the constructive schedule as an explicit **feasible fallback**: if CP-SAT returns `UNKNOWN`/`INFEASIBLE` but the constructive assignment passes `audit_solution`, return that assignment as a plan with a truthful status such as `FEASIBLE_HEURISTIC` and `solver_status="UNKNOWN"`. Do not call it optimal and do not hide the distinction.
- Alternatively (preferred if time permits): make the constructive assignment a hard incumbent through CP-SAT hints and verify it is always available before solving; use the fallback only when the solver cannot confirm within the limit.
- Separate the API/UI message for **timeout without a solution** from **proven infeasible**. Never render “No feasible schedule” for a timeout; render “The solver did not finish in the time limit; a verified heuristic plan is shown” or an explicit retry.
- Do not delete existing plans before a new solve succeeds. Persist the previous set and replace atomically.
- Expose `source: "solver" | "constructive_fallback"`, `solver_status`, `audit`, and `runtime_seconds` in the plan payload.
- Set a safe default time limit (at least 6 s per plan) and validate the UI minimum; consider a per-job budget rather than three independent limits.
- Add a job warning list for fallback/limit conditions.

**Frontend changes**

- Show `FEASIBLE_HEURISTIC` with an amber “verified heuristic, optimality not proven” badge, not as infeasible.
- Add a retry action for timeout-only outcomes.
- Keep the raw solver status visible in the plan detail.

**Tests**

- Repeat `solve_plans(campus, {}, None, 2.0)` ten times under a CPU load (or with a deliberately tiny limit) and assert every plan either has a complete schedule or is explicitly `INFEASIBLE` with diagnostics — never `UNKNOWN` with an empty schedule.
- Assert all feasible/fallback plans pass `audit_solution` with 9/9 checks.
- API test: lifecycle export never returns 409 for a plan that has a schedule; timeout response carries the new status and message.
- Regression: baseline and room-closure scenarios still return three plans.

**Acceptance**

- A feasible scenario always produces three usable plans in the demo environment.
- Status vocabulary is honest and covered by tests.
- No “no feasible schedule” message for a timeout.

**Estimate:** 2–3 engineering days.

### 1.2 Canonical campus and scenario state

**Problem.** `Scenario` stores params, metrics and schedule, but not the full baseline state. A difference engine cannot explain “classrooms 20 → 19” or “lab availability 4 → 3” from metrics alone.

**Required files**

- `backend/app/models.py` (add a JSON snapshot column or store under `diagnostics`)
- `backend/app/campus.py`
- `backend/app/simulation.py`
- `backend/app/schemas.py`
- new `backend/app/state.py`

**Backend changes**

- Define a serializable `CampusState` containing buildings, rooms (kind, capacity, lab types, equipment, power), instructors (availability, weekly limit), cohorts (size, home building), courses, sessions, distances, days, time slots and the default operating window.
- Define `ScenarioState` as `{baseline, changes, effective}` where `effective` is the state the simulation/solver actually used.
- Persist the baseline snapshot on scenario creation (for seeded demo runs too). Prefer a `campus_snapshot` JSON field in `Scenario.diagnostics` for backward compatibility instead of a schema migration; if a column is added, include a small migration path.
- Make `simulate()` and `solve_plans()` consume the same `ScenarioState` builder. Remove duplicate context construction (`build_context`) or make it a thin wrapper.
- Keep old scenarios readable: if no snapshot exists, fall back to the stored baseline metrics/schedule and mark the diff as “legacy scenario, partial evidence”.

**Tests**

- Round-trip serialize/load of `CampusState`.
- Old scenario without a snapshot still returns a comparison.
- Scenario snapshot is immutable after creation and does not change when the campus model is edited.

**Acceptance:** every scenario has enough state to explain its changes without recomputing from the current campus.

**Estimate:** 2–3 days.

### 1.3 Digital Twin Difference Engine

**Required files**

- new `backend/app/difference.py`
- `backend/app/api.py`
- `backend/app/graph.py`
- `frontend/src/lib/api.ts`, `hooks.ts`, `types.ts`
- new `frontend/src/components/DifferencePanel.tsx`
- `SimulationStudioPage.tsx`, `ComparisonPage.tsx`
- tests in `backend/tests/test_mirrorworld.py` or a new `test_difference.py`

**Backend changes**

- Implement a deterministic `diff_states(baseline, effective)` returning an ordered list of changes:
  - enrolment total and per-department/group changes;
  - room count, classroom count, lab count, seat capacity;
  - closed rooms/buildings and lost equipment;
  - instructor availability and weekly-limit changes;
  - operating-window and lab-policy changes;
  - energy-factor changes;
  - session count and scheduled/displaced counts.
- Each change carries: `kind`, `before`, `after`, `delta`, `unit`, `affected_resource_ids`, `affected_session_ids`, `constraint_effects` (which constraints tighten/loosen), `evidence` (metric/value), and a plain-language `why_it_matters`.
- Add a `decisions` list generated from constraints and the dependency graph (e.g., “reassign lab sessions to FL-L1 or TS-L1”, “open extra rooms”, “reduce intake by N”). Actions must reference real resources.
- Ensure the engine explains:
  1. what changed;
  2. why it matters;
  3. which resources are affected;
  4. which constraints become harder;
  5. what decisions could address it.
- Reuse `graph.build_graph()` / `impact_analysis()` for affected sessions, but filter to the scenario’s direct/indirect set rather than returning all structurally reachable nodes.
- Expose `GET /api/scenarios/{scenario_id}/difference`. Include it in `GET /api/scenarios/{id}` as an optional `difference` object to save a round trip.
- Make scenario-to-scenario comparison possible later by accepting an optional `against_scenario_id`; Phase 1 can expose baseline-vs-scenario only.

**Frontend changes**

- A reusable `DifferencePanel` with change groups (Demand, Infrastructure, Staffing, Policy, Energy), before → after, delta, affected chips and “why it matters”.
- Show the panel on the Simulation result (after a run) and on the Comparison page (replacing the current metric-only narrative as the primary explanation, while keeping the metric table).
- Add a compact “what changed” summary to the Overview only when a scenario is active (do not clutter the baseline view).
- Link affected resources to the Dependency Explorer with the resource preselected.

**Tests**

- Golden diffs for: +200 enrolment; two room closures; all lab closures; instructor absence; shortened day; zero-change scenario.
- Diff values are exact and ordered deterministically.
- Affected sessions in the diff equal `scenario.affected.sessions` (or a documented subset).
- Legacy scenario without snapshot returns partial evidence, not an exception.
- API test: 404 for unknown scenario; 200 with a full diff for a created scenario.

**Acceptance:** the Difference Engine is the single source of change analysis; alerts, severity and AI can call it; the UI shows before/after and consequences without inventing numbers.

**Estimate:** 3–4 days.

### 1.4 Correct constraint and objective claims

**Required files**

- `backend/app/optimizer.py`
- `backend/app/metrics.py`
- `frontend/src/pages/MethodologyPage.tsx`
- `README.md`
- tests

**Backend changes**

- Decide one of:
  - **(A) Document the actual objective** — energy + active-room count + group-building concentration, with no “capacity slack” term; or
  - **(B) Add a real capacity-slack term** and update the objective tests.
  Recommended: (A) first, because adding slack changes decisions and needs calibration.
- Make the weekly-hours position explicit: it is a pre-solve gate and audit check, not a CP-SAT constraint; because each session is assigned once, total load is invariant. If workload changes are added later, promote it to a constraint.
- Fix the five-day constants into a single `TEACHING_DAYS`/`SLOTS_PER_WEEK` source. If the product must support a Sun–Thu week, make the day list configurable rather than scattering `range(5)` and `5 * ...`.
- Align peak-demand and energy aggregation: either document the conservative `max` per room per slot, or compute both from the same per-slot session set.
- Correct `impact_analysis` alternatives to use the affected course’s cohort size, not the maximum cohort (`graph.py:226`).

**Frontend changes**

- Update Method & Evidence formulas and text to match code.
- Replace “minimal disruption” copy in the Simulation Studio with the actual plan names (utilization-first, energy-first, balanced).
- Remove hard-coded “112 sessions” and “zone coordinates” copy; read these from the payload or use neutral wording.

**Tests**

- Objective terms are reproducible; documented names match payload keys.
- Alternatives include a room that is genuinely feasible for the affected cohort and exclude one that is too small.

**Acceptance:** docs, UI and solver agree; no claim exceeds what the code enforces.

**Estimate:** 1–2 days.

### Phase 1 exit criteria

- All backend tests pass repeatedly (no flaky solver test) under normal load.
- A feasible scenario always yields three usable plans; infeasible and timeout states are distinct.
- `GET /api/scenarios/{id}/difference` returns exact, deterministic changes with consequences and decisions.
- The Difference panel is visible on Simulation and Comparison.
- Documentation matches the solver; no hard-coded dataset counts in UI copy.
- No regression in baseline conflicts, plan audits, exports or the graph.

---

## 3. Phase 2 — Alerts, multi-variable simulation, severity and templates

**Goal:** make the platform explain the campus and let administrators express the specification’s scenarios.

### 2.1 Structured alert engine

**Required files**

- new `backend/app/alerts.py`
- `backend/app/api.py`
- `frontend/src/components/AlertCard.tsx` (or extend Overview)
- `OperationsOverviewPage.tsx`, `TopBar.tsx`, `types.ts`, `hooks.ts`
- new `backend/tests/test_alerts.py`

**Backend changes**

- Build alerts from computed data, not prose templates alone.
- Required fields: `id`, `condition_key`, `severity` (low/medium/high/critical), `title`, `description`, `affected_resources` (rooms, labs, instructors, groups, buildings, courses), `consequences`, `suggested_action` (text + route), `evidence` (metric/value/comparison), `detected_at`, `fingerprint`.
- Conditions to implement:
  - capacity overrun aggregated by building/room/slot;
  - room, instructor and cohort conflicts;
  - facility mismatch (lab type/equipment);
  - instructor availability and weekly overload;
  - building with modelled energy materially above the campus average (use a documented ratio, not a hardcoded number);
  - scenario-level facility disruption affecting several sessions.
- Severity rubric must be documented and deterministic. Example: capacity deficit ratio, number of affected cohorts, conflict count, displacement count, share of the weekly timetable. Do not label every conflict “critical”.
- Suggested actions must name a real resource or an engine action: e.g., “Move 3 sessions from AT-103 to AT-104 (90 seats); both are free at the affected slot” only if that is true from the model.
- Deduplicate alerts across sessions when the condition is the same.
- Persist acknowledgements if the UI exposes dismiss/ack; otherwise label dismissal as session-only and keep it out of the audit trail.

**Frontend changes**

- Alert cards with severity chip, affected resource chips, consequence, suggested action and evidence line.
- Filters by severity/category/building; acknowledge/restore; no generic “Fix it” button.
- TopBar count must read the same `/api/alerts` source and reflect acknowledgements.
- Empty state must be genuine (“no open alerts”), not a hidden list.

**Tests**

- Each condition produces exactly one alert for a synthetic case.
- Severity boundaries are tested at low/medium/high/critical.
- Suggestions reference resources that exist and are feasible.
- No alert when the metric is zero; no duplicate alerts for the same condition.
- Alert counts match `metrics` details.

**Estimate:** 3–4 days.

### 2.2 Recommended Actions

**Required files**

- new `backend/app/recommendations.py`
- `backend/app/api.py`
- new `frontend/src/components/RecommendedActions.tsx`
- `OperationsOverviewPage.tsx`
- tests

**Backend changes**

- Generate ranked, evidence-based recommendations from:
  - building utilization imbalance (with actual room capacity/availability);
  - capacity margin by building/room;
  - conflict clusters by building/slot;
  - modelled energy outliers;
  - instructor overload;
  - operating-window pressure;
  - lab/equipment bottlenecks.
- Each recommendation: `id`, `title`, `action`, `rationale`, `evidence` (metrics with values), `expected_effect` (qualitative or computed delta), `affected_resources`, `confidence`, `route`.
- Explicitly exclude generic advice. If no recommendation clears its threshold, return an empty list with a reason.
- Reuse the Difference Engine for scenario actions (“close AT-L1 → 6 lab sessions need rehousing”) so the same explanation is not duplicated.

**Frontend changes**

- “Recommended Actions” panel on Overview, separate from Alerts.
- Each card links to the relevant room/building/scenario; show the evidence, not just the sentence.
- “Apply as simulation” action for recommendations that can be expressed as parameters.

**Tests**

- A campus with a real utilization imbalance produces a recommendation naming the buildings and rooms.
- A balanced campus produces no recommendation.
- Changing room capacity changes the recommendation; no hardcoded text.
- Recommendations never suggest a room that is closed, too small or already full at the slot.

**Estimate:** 2–3 days.

### 2.3 Extended multi-variable parameters

**Required files**

- `backend/app/schemas.py`
- `backend/app/simulation.py`
- `backend/app/optimizer.py`
- `backend/app/metrics.py`
- `backend/app/catalog.py` (time slots / days if extended)
- `SimulationStudioPage.tsx`, `types.ts`
- tests

**Backend changes**

Add, with backward-compatible defaults:

| Parameter | Behaviour |
| --- | --- |
| `unavailable_building_ids` | Expands to all rooms in the building; one change, not N room selections |
| `lab_availability_pct` | Deterministically removes a share of lab capacity/slots (define the rule; do not silently close arbitrary rooms) |
| `equipment_loss` | Removes tags/quantities from rooms; affects facility eligibility |
| `teacher_workload_delta` / `teacher_hours_overrides` | Changes weekly limits for the scenario; promote weekly hours to a solver constraint when variable |
| `operating_start_slot` | Allows a later start / shorter day |
| `operating_end_slot` extension | Add a configurable extra operating window (at least +60 min) or an eighth slot with an explicit duration; default remains slot 6. Do not silently assume another 90-minute slot equals “one hour”. |
| `room_capacity_overrides` | Scenario-scoped capacity changes |
| `enrollment_changes` by department/program | Targeted intake rather than uniform distribution |
| `session_length_overrides` / `slot_structure` | Supports timetable restructuring |

- Make the day/slot counts data-driven; remove hard-coded `5` and `7` loops. If Sun–Thu is required, make `DAYS` configurable and update the seed, metrics, solver and UI in one change.
- Validate combinations (e.g., start ≤ end; at least one room/lab remains; equipment loss cannot make a required course impossible without a diagnostic).
- Ensure `validate_params`, `build_context`, `apply_scenario`, `_precheck` and `audit_solution` all use the same state.

**Frontend changes**

- Replace the single “Disruption class” label with real categories: **Instructor**, **Infrastructure**, **Emergency** (plus existing demand/policy/energy where useful).
- Each category displays only relevant fields, as specified.
- Add a “change summary” chip row showing all combined changes before execution.
- Preserve the existing form values when switching categories where sensible; never silently drop a parameter.
- Show validation errors next to the field, not only in a summary.

**Tests**

- Each new parameter changes the expected model value and affected set.
- Combination of all parameters remains deterministic and baseline-immutable.
- Old scenarios with only the original params still load and compare.
- Infeasible combinations return diagnostics, not a fabricated plan.
- The extended operating window adds exactly the configured minutes and only when selected.

**Estimate:** 4–6 days (the largest backend change in Phase 2).

### 2.4 Impact severity assessment

**Required files**

- new `backend/app/severity.py`
- `backend/app/api.py`
- `SimulationStudioPage.tsx`, `ComparisonPage.tsx`, `types.ts`
- tests

**Backend changes**

- Implement `assess_severity(metrics, affected, baseline, changes)` returning:
  - `level` in `low | medium | high | critical`;
  - `score` 0–100 (optional, but useful for ranking);
  - `factors` with metric, value, threshold and contribution;
  - `summary` and `evidence` strings;
  - `assumptions` (e.g., synthetic data, estimates).
- Rubric example (to be approved): weighted normalized factors for displaced share, capacity deficit, conflict count, affected cohorts/instructors, closed-room share, energy delta. Thresholds: <20 low, 20–44 medium, 45–69 high, ≥70 critical. The exact weights must be documented and unit-tested.
- Add `POST /api/scenarios/assess` (draft params, no persistence) and include severity in `GET /api/scenarios/{id}` and `GET /api/compare`.
- Severity must be computed from actual impact data, never from the scenario name or user text.

**Frontend changes**

- Pre-run assessment card: level, 3–5 bullet factors, affected counts, “this is a preliminary assessment based on the campus model”.
- Post-run severity card with the same evidence and a link to the diff.
- Do not show a severity level while inputs are invalid; show “not assessed”.

**Tests**

- Boundary tests for each level.
- Monotonicity: adding a closed room or enrolment must not lower severity for the same scenario.
- A zero-change scenario is low.
- Infeasible/no-valid-room scenarios are critical or explicitly “undefined”, not low.
- The summary contains only values present in the evaluation payload.

**Estimate:** 2–3 days.

### 2.5 Server-side scenario templates

**Required files**

- new `backend/app/templates.py`
- `backend/app/api.py`
- `frontend/src/pages/SimulationStudioPage.tsx` (replace local presets)
- `types.ts`, `hooks.ts`
- tests

**Backend changes**

- Define the seven specification templates as data + parameter builders:
  1. Enrollment Expansion (program/intake term, student increase);
  2. Laboratory Shutdown (lab selection, duration, equipment loss);
  3. Teacher Shortage (multiple instructors, workload limits);
  4. Classroom Overcrowding (capacity thresholds, group sizes);
  5. Energy Conservation (building schedules, energy target, operating hours);
  6. Emergency Campus Disruption (combined building/staff/equipment outages);
  7. Semester Timetable Restructuring (slot structure, session lengths, hours).
- Each template returns `{id, name, description, category, params, assumptions, fields}` derived from the current campus (no magic numbers).
- Expose `GET /api/templates`. Optionally `POST /api/templates/{id}/instantiate` for server-side validation.
- Keep the client able to edit every generated parameter before running.

**Frontend changes**

- Template gallery grouped by category with “Load”, preview of generated changes, and “Customize”.
- Show which fields were derived from the campus and which are policy defaults.
- When a template cannot be expressed (e.g., missing lab), say so instead of silently omitting it.

**Tests**

- Every template instantiates to valid `ScenarioParams`.
- Values change when campus data changes.
- Each template produces at least one measurable change in the simulated metrics (or a clear “no impact” result).
- Template list is deterministic and ordered.

**Estimate:** 2–3 days.

### Phase 2 exit criteria

- Overview has real recommended actions and complete alert cards.
- Multi-variable scenarios cover the specification’s Semester Expansion example end to end.
- Severity is computed before and after a run and is visible in the UI.
- Seven server-side templates load valid parameters.
- Tests cover each rule, threshold and parameter combination.

---

## 4. Phase 3 — Interactive campus and movement visualization

**Goal:** show timetable-based student movement honestly and make the campus map genuinely interactive.

### 3.1 Movement computation service

**Required files**

- new `backend/app/movement.py`
- `backend/app/api.py`
- `backend/app/catalog.py` (walking speed / path model)
- `frontend/src/lib/api.ts`, `types.ts`
- tests

**Backend changes**

- For each cohort/day, pair consecutive scheduled sessions:
  - `students` = cohort size in the scenario context (optionally per-transition if enrolment changes are targeted);
  - `distance_m` = building-to-building matrix value (0 within the same building);
  - `walk_minutes` = distance / speed (default 1.4 m/s, documented);
  - `gap_minutes` = (next.start_slot − (prev.start_slot + prev.length)) × 90;
  - `slack_minutes` = gap − walk;
  - `tight` = slack < 0 (or below a configurable threshold);
  - `window` = transition time band for animation.
- Aggregate flows by `(from_building, to_building, window)`:
  - students, trips, distance, average slack;
  - relative congestion index = flow / max flow in the selected window (no claim of measured congestion).
- Return a summary: transitions, students moving, total distance, tight count, worst transition, unassigned/no-room transitions.
- Expose `GET /api/movement?scenario_id=` (baseline when omitted). Include movement in `GET /api/scenarios/{id}` only if payload size is acceptable; otherwise keep it separate.
- **Labelling:** all fields and UI copy use “Estimated movement” or “Timetable-based flow”; never “real-time tracking”.

**Tests**

- Same building → distance 0, walk 0; different building → documented distance.
- Zero gap → negative slack and tight flag.
- One-slot gap → slack = 90 − walk.
- Multiple cohorts on the same corridor aggregate correctly.
- Displaced sessions are excluded and reported separately.
- Scenario enrolment delta changes `students` correctly.
- Total weekly distance remains consistent with the existing `movement_km` metric (or document the intended difference).

**Estimate:** 2–3 days.

### 3.2 Map overlay, animation and time control

**Required files**

- `frontend/src/pages/DigitalCampusPage.tsx`
- new `frontend/src/components/MovementLayer.tsx`
- `frontend/src/components/MovementPanel.tsx`
- `charts.tsx` only if a small sparkline is added
- `types.ts`

**Frontend changes**

- Draw building-to-building paths on the existing SVG map (or a documented schematic route layer) with:
  - stroke width proportional to students;
  - color by slack (normal / tight / negative);
  - arrowheads and optional animated dash offset;
  - hover/focus tooltip with students, distance, walk time, gap, slack.
- Time scrubber across the teaching day with play/pause and step; changes the visible transition window.
- Side panel listing transitions; selecting a row highlights the path and vice versa.
- Highlight tight transitions and offer a filter (“show only tight transitions”).
- Respect `prefers-reduced-motion`: no looping animation, static paths.
- Keep the existing room board and building inspector; movement is an added layer, not a replacement.
- Mobile: collapse the movement panel, keep the map legible.

**Tests**

- TypeScript build and lint.
- Component/unit tests if a frontend test runner is approved; otherwise a scripted browser check with two transitions and a tight case.
- Manual visual check at 1440, 1024 and 390 px.

**Estimate:** 3–5 days.

### 3.3 Interaction polish

- Pan/zoom on the map or a deliberate “fixed schematic” decision (do not fake 3D).
- Keyboard selection for buildings/rooms/transitions.
- Empty/loading/error states.
- Performance: max 112 sessions; avoid re-rendering all paths on every scrub tick.

**Phase 3 exit criteria**

- Movement is computed from the timetable and visibly labelled as estimated.
- A user can step through the day and see flow thickness and tight transitions.
- No claim of live tracking or measured congestion.
- The map remains usable on mobile and with reduced motion.

---

## 5. Phase 4 — MIRROR AI — **implemented**

**Goal:** a grounded natural-language interface to the existing engines, with confirmation and auditability.

> **Implementation note.** Shipped in `backend/app/ai.py` (env config, provider transport, primary/fallback model, deterministic rule engine) and `api.py` (`GET /api/ai/status`, `POST /api/ai/chat`), with the `/mirror-ai` workspace. The provider layer stayed in one module instead of a package, and the transport uses the provider's HTTP API so no SDK dependency was added. Google is the only adapter; a second one can implement the same `ask()` contract without touching the API or UI. One item below is deliberately not implemented: natural-language scenario *creation* that parses parameters, confirms and runs a job. Mirror AI reads and explains; it links to the page that performs the action rather than mutating state from free text.

**Important:** do not start this phase until Phase 1–3 are stable. The AI must consume the Difference Engine and severity service, not re-implement them. No provider is selected in this roadmap; that requires a separate service evaluation and a server-side key.

### 4.1 Provider abstraction and configuration

**Required files**

- new `backend/app/ai/provider.py`
- new `backend/app/ai/config.py`
- `backend/requirements.txt` (only if a provider SDK is chosen)
- environment documentation

**Backend changes**

- Define a small interface: `interpret(messages, json_schema) -> StructuredDraft` and `narrate(payload, question) -> str`.
- Provider selected by configuration; no key in the browser, `.env` only or a deployment secret.
- If no key is configured, the API returns a clear “AI is not configured” state; the rest of the app works.
- Timeouts, retries and token limits; log request IDs, not full sensitive prompts by default.

### 4.2 Intent → configuration builder

**Required files**

- new `backend/app/ai/schemas.py`
- new `backend/app/ai/interpret.py`
- `backend/app/schemas.py` (reuse `ScenarioParams`)
- tests

**Backend changes**

- Convert a natural-language request into:
  - `intent` (simulate, explain, compare, optimize, ask);
  - `ScenarioDraft` (name, params, assumptions);
  - `missing_fields` (questions to ask);
  - `confidence` and `unresolved_terms`.
- Validate the draft with the same Pydantic schema as the UI; reject unknown rooms/instructors.
- Require explicit user confirmation before creating a scenario or running the optimizer.
- Never let the model invent an ID, capacity or metric; it can only choose from tool results.

### 4.3 Tool orchestration

**Required files**

- new `backend/app/ai/tools.py`
- new `backend/app/ai/service.py`
- `backend/app/api.py`
- tests

**Backend changes**

- Provide tools: `campus_summary`, `simulate`, `difference`, `severity`, `optimize`, `compare`, `history`.
- For optimization, create a real job and stream/poll it; the AI summarizes the stored result.
- Tool results are the only allowed source of numbers. Include a machine-readable `evidence` list with every number and its source key.
- If a tool fails or returns infeasible, explain that outcome; never substitute a plausible schedule.

### 4.4 Grounded narrative and guardrails

**Required files**

- new `backend/app/ai/guardrails.py`
- tests

**Backend changes**

- Extract all numbers from the generated text and verify each against the tool payload allowlist (with tolerance for formatting/rounding). Reject or regenerate on violation.
- Require citations for claims (metric key or resource ID).
- System prompt rules: no invented results, no hidden calculations, no promises, label estimates, distinguish scenario vs baseline vs plan.
- Handle prompt injection: user text cannot change tool permissions or system rules.
- Rate-limit per session; cap conversation length; audit every AI run with model, prompt hash, tool calls and result IDs.
- Fallback: if validation fails twice, return the deterministic rule-based explanation instead of ungrounded prose.

### 4.5 UI

**Required files**

- new `frontend/src/pages/CopilotPage.tsx` or a slide-over panel
- `config/nav.ts`
- `lib/api.ts`, `types.ts`
- components for draft card, missing-info questions, confirmation, result summary, citations

**Frontend changes**

- Chat-like input with example prompts, but the draft is always shown as an editable structured card before execution.
- “Run simulation”, “Generate plans”, “Compare” buttons call the real engines with visible job progress.
- Every numerical claim shows a source chip (metric key / plan label / resource).
- Clear empty/disabled state when AI is not configured.
- Do not auto-execute on message send.

### 4.6 Tests

- Mock provider returns a valid draft; missing fields trigger questions.
- Hallucinated number is rejected; grounded number passes.
- Prompt injection cannot alter tools or permissions.
- Infeasible request returns the real diagnostics, not a fabricated plan.
- Confirmation is required before scenario creation/optimization.
- No key → 503/disabled state with a useful message.
- Cost/latency guard: timeout and token cap.

**Phase 4 exit criteria**

- A user can describe a scenario, review the parsed parameters, confirm, run it and receive an explanation whose every number is traceable to the engines.
- The AI cannot invent a schedule, metric or resource.
- The app remains fully usable with AI disabled.

**Estimate:** 5–8 days plus provider setup.

---

## 6. Cross-cutting workstreams

| Workstream | Work | Files |
| --- | --- | --- |
| Data compatibility | Add fields with defaults; keep old scenarios readable; use JSON snapshots before schema migrations | `models.py`, `schemas.py`, `api.py` |
| API contracts | Add typed responses; update `types.ts` and `api.ts` together; keep existing routes stable | `api.py`, `lib/api.ts`, `types.ts` |
| Test harness | Backend pytest fixtures for each scenario kind; solver repeatability test; golden metric snapshots; frontend typecheck/build | `tests/`, `conftest.py`, CI script |
| Observability | Log job stage, solver status, runtime, plan fallback and alert counts; keep audit log entries for new actions | `jobs.py`, `api.py`, `models.py` |
| Documentation | Update `README.md` and Method & Evidence after each phase; add a short demo script | `README.md`, `MethodologyPage.tsx` |
| Demo reliability | Run the full workflow three times before submission; reset dataset; verify exports | scripts/manual |

**Testing decision:** the backend already has a real test suite. The frontend has no unit-test runner. Adding Vitest/Testing Library is a new dependency; approve it only if component tests are required. Otherwise use TypeScript build, lint and scripted browser checks for Phases 2–3, and add a small Playwright suite before final submission.

---

## 7. Sequencing and critical path

```
Phase 1
  1.1 Solver reliability ──┐
  1.2 State snapshot ──────┼──> 1.3 Difference Engine ──> Phase 2.1 Alerts
  1.4 Docs/objective ──────┘                          ├──> 2.2 Recommended Actions
                                                       ├──> 2.4 Severity
  2.3 Extended parameters ─────────────────────────────┘
  2.5 Templates ────────────────────────────────────────┘
                                                       └──> Phase 3 Movement
                                                              └──> Phase 4 AI
```

- **Critical path:** 1.1 → 1.2 → 1.3 → 2.4 → 4.3.
- **Parallelizable:** 1.4 (docs/objective) with 1.1; 2.3 (parameters) with 2.1/2.2; 2.5 templates with 2.4; 3.1 movement backend with 2.x UI work.
- Do not start Phase 4 before the Difference Engine and severity are stable; otherwise the AI will duplicate logic.

### Rough effort (solo engineer, including tests and UI)

| Phase | Estimate | Risk |
| --- | --- | --- |
| Phase 1 | 8–12 days | Solver reliability and state refactor are the highest-risk work |
| Phase 2 | 13–19 days | Extended parameters touch every engine; scope control is essential |
| Phase 3 | 5–8 days | Visual polish and motion accessibility |
| Phase 4 | 5–8 days + provider setup | Grounding, latency, cost |

These are planning ranges, not commitments. The demo-critical subset is Phase 1 + 2.1/2.2/2.4 + Phase 3 + a narrow Phase 4 (simulate/explain only).

---

## 8. Demo readiness checklist

- [ ] Dataset resets to the same fingerprint and 6 baseline hard issues.
- [ ] Three plans are generated on every demo run; no `UNKNOWN` with an empty schedule.
- [ ] Every plan shows 9/9 audit checks and a truthful solver status.
- [ ] Infeasible example returns diagnostics, not a fake plan.
- [ ] Alerts show problem, severity, affected resources, consequence and action.
- [ ] Recommended Actions are evidence-based and change when the model changes.
- [ ] The Semester Expansion scenario (enrolment + rooms + lab availability + hours) is expressible.
- [ ] Severity is shown before and after the run with factors.
- [ ] Seven templates load valid parameters.
- [ ] Movement is labelled estimated, with flow thickness and tight transitions.
- [ ] Difference Engine explains every change in plain language.
- [ ] AI (if enabled) cites engine outputs and refuses to invent numbers.
- [ ] Exports contain the displayed values.
- [ ] No console errors; responsive at 1440/1024/390 px.
- [ ] `pytest` green repeatedly; `npm run build` and `npm run lint` clean.

---

## 9. Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Solver returns `UNKNOWN` during judging | Verified constructive fallback; repeatability test; safe time limit; honest status |
| Extended parameters break old scenarios | Defaults + JSON compatibility + legacy tests |
| Alerts/recommendations become generic text | Evidence fields and tests that change with the model |
| Severity thresholds are arbitrary | Publish the rubric; unit-test boundaries; show factors |
| Movement is mistaken for tracking | “Estimated movement / timetable-based” labels everywhere; no live claims |
| AI hallucinates numbers | Tool-only numbers, allowlist validation, deterministic fallback, audit log |
| Scope explosion | Phase gates; demo subset; no new features outside this roadmap |
| Frontend test gap | Typecheck/lint now; add a runner or Playwright before submission |

---

## 10. Decisions required before implementation

1. **Scope/priority:** full roadmap or the demo-critical subset (Phase 1 + 2.1/2.2/2.4 + Phase 3 + narrow Phase 4)?
2. **Week shape:** keep the current five-day Mon–Fri model, or implement the previously requested Sun–Thu week? This affects `DAYS`, seed generation, metrics denominators, solver start domains and UI labels in one coordinated change.
3. **Severity rubric:** approve the proposed factor set and thresholds, or define institutional thresholds.
4. **Movement assumptions:** walking speed (default 1.4 m/s), same-building time, and whether corridor geometry is needed or a schematic path layer is acceptable.
5. **AI provider:** select a provider and supply a server-side key; confirm cost/latency limits. Do not put the key in the browser.
6. **Alert persistence:** computed-only alerts (current style) or persisted acknowledgements with an audit trail.
7. **Frontend testing:** add Vitest/Playwright, or rely on typecheck/lint plus scripted browser checks.

No code will be changed until one of these directions is approved.

---

## 11. Explicitly out of scope

- Multi-tenant authentication, roles and per-user data isolation.
- A production PostgreSQL deployment and migration framework.
- Real-time GPS/student tracking; movement remains timetable-based.
- Replacing the synthetic dataset with institutional data.
- A full 3D campus reconstruction.
- Monetary costing or procurement workflows.
- Any AI feature that generates numbers independently of the engines.

---

**Next action:** approve Phase 1 (or a revised scope). The first implementation task should be 1.1, because every later feature depends on a reliable, truthfully reported recovery plan.
