# MIRRORWORLD — Product Specification Gap Analysis

**Audit date:** 31 October 2026  
**Specification audited:** `MIRRORWORLD_Upgrade_Specification.pdf` (Platform Upgrade Specification: Critical alerts, interactive digital campus, multi-variable simulation, MIRROR AI copilot and the Digital Twin Difference Engine)  
**Code snapshot:** `5a9f888` (`Update project files`)  
**Audit rule:** no application code, schema, configuration or dependency was changed during the audit. This report and its two companion documents were the only new files at that time.

> **Post-audit implementation status (Phase 1 and Phase 2 complete).** After approval, the platform was upgraded additively. The audit below remains the baseline evidence; these are the current statuses:
>
> | # | Feature | Now | What changed |
> | --- | --- | --- | --- |
> | 1 | Critical Alerts | **Functional** | Shared `alerts.py` produces severity-graded alerts with affected resources, consequences, measured evidence and router-backed suggested actions for baseline and scenario states. |
> | 2 | Recommended Actions | **Functional** | `recommendations.py` ranks evidence-based operating actions; `/api/recommendations` serves baseline or scenario context. |
> | 3 | Student Movement Visualization | **Functional** | Timetable-based pedestrian movement service in `movement.py`, `/api/movement` endpoint, SVG flow overlay with direction markers, tight-transition detection, unverified distance flagging, and inspector panel on Digital Campus. |
> | 4 | Multi-variable Simulation | **Functional** | Added building closure, laboratory availability %, equipment loss, instructor workload delta and an extended operating window, all applied atomically with the existing variables. |
> | 5 | Scenario Templates | **Functional** | Seven server-side templates from `templates.py`, derived from the live campus, exposed by `/api/templates` and consumed by Simulation Studio. |
> | 6 | Impact Severity Assessment | **Functional** | Deterministic rubric in `severity.py` with evidence, exposed by `POST /api/assess` and shown in Simulation Studio. |
> | 7 | MIRROR AI | **Functional** | `ai.py` provides a provider-agnostic transport (Google `generateContent`, primary + fallback model) and a deterministic rule engine; `/api/ai/status` and `/api/ai/chat` ground answers in campus, simulation, alert, recommendation, difference and movement data. The `/mirror-ai` workspace shows evidence per answer. Without a key the answer is labelled rule-engine output; provider failure falls back with an explicit error. |
> | 8 | Digital Twin Difference Engine | **Functional** | `state.py` + `difference.py` persist baseline/effective snapshots and expose `/api/scenarios/{id}/difference`; Overview, Simulation Studio, Comparison and the optimizer consume it. |
> | 9 | OR-Tools optimization integration | **Functional** | Reports `FEASIBLE`, `OPTIMAL`, `FEASIBLE_HEURISTIC`, `INFEASIBLE`, `UNKNOWN`; verified constructive fallback and atomic plan replacement; all documented hard constraints audited. |
>
> Verification at the end of Phase 3: **Phase 1, Phase 2, and Phase 3 completed**. Timetable movement service, schemas, and endpoint implemented with comprehensive edge-case test suite (`test_movement.py`). Digital Campus screen provides interactive flow overlay, risk filters, and transition details. Phase 4 (MIRROR AI) is now implemented as the same kind of grounded front end to the existing engines — see row 7.

---

## 1. Executive summary

MIRRORWORLD today is a working, single-operator **simulation and recovery prototype**. It is not yet the upgraded platform described in the specification.

**What it can actually do today**

- Load a deterministic synthetic campus: **4 buildings, 24 rooms, 26 instructors, 24 cohorts, 26 courses, 112 weekly sessions, 1,128 students**.
- Detect baseline problems by recomputing them from the persisted timetable, not by reading labels: **3 booking collisions** (1 room, 1 instructor, 1 cohort), **1 capacity breach** (52 students in a 32-seat room), **1 facility mismatch**, **1 instructor-availability violation** — **6 hard issues** in total.
- Simulate six counterfactual variables together on a copy of the baseline: enrolment delta, room closures, instructor absence, lab policy, operating end slot and energy factor. A six-variable probe produced **82 affected sessions / 25 displaced sessions** without mutating the baseline.
- Solve three auditable CP-SAT recovery plans. In isolated probes, all three were `FEASIBLE`, passed **9/9** independent hard-constraint checks and had **0** unresolved hard issues, with per-plan runtimes of roughly **2.2–6.4 s**.
- Compare baseline, disrupted scenario and recovery plan on 19 metric rows, recommend a plan under explicit weights, inspect a dependency graph, persist runs, and export CSV/HTML reports.
- Build and type-check the frontend (`tsc -b` + Vite) and pass lint with **0 errors** (18 style warnings).

**What it cannot do yet**

- **MIRROR AI** was the Phase 4 gap; it is now implemented as a grounded front end (no model configured means a labelled deterministic answer, never a fabricated one).
- No **Digital Twin Difference Engine** (no attribute-level state diff and no shared change-analysis service).
- No **student-movement visualization** (only a weekly aggregate distance KPI; no per-transition flows, walking time, gap check, congestion or animation).
- No **Recommended Actions** section (the existing “recommendation” chooses a recovery plan, not campus operating actions).
- No **impact severity prediction** (no pre-run assessment and no Low/Medium/High/Critical rollup; the affected ledger uses hard-coded per-issue critical/warning flags).
- **Critical alerts** are real and metric-derived, but they lack consequences, a suggested-action text field, affected-resource fields and severity granularity.
- **Multi-variable simulation** is real but has a limited variable set: no lab-availability percentage, building closure, equipment loss/quantity, workload change, room-capacity override or operating-hours extension.
- **Scenario templates** are six client-side presets, not a server-side template catalogue; only part of the seven-template specification is covered.
- **OR-Tools integration** works but has reliability and modelling gaps: weekly teaching limits are a pre-solve gate rather than a CP-SAT constraint, there is no equipment-quantity or building-level closure model, and solver time limits can produce `UNKNOWN` plans instead of feasible ones under CPU contention.

**What must be completed before a credible competition demonstration**

1. **Phase 1 (must-have):** make plan generation deterministic within demo time; introduce one canonical scenario-state model and the Difference Engine; align documentation with what the solver actually optimizes.
2. **Phase 2 (must-have for the specification):** structured alerts with consequences/actions, evidence-based Recommended Actions, richer multi-variable parameters, severity prediction and a real template catalogue.
3. **Phase 3 (strong differentiator):** timetable-based movement flows on the campus map with a time scrubber and tight-transition highlighting, clearly labelled as estimated.
4. **Phase 4 (showcase feature):** MIRROR AI as a grounded natural-language front end to the existing engines — configuration builder first, narrative second, never a separate chatbot that invents numbers.

The current application should be preserved as the computational foundation. The upgrade is additive, not a rewrite.

---

## 2. Audit method and evidence

### 2.1 What was inspected

| Layer | Inspected |
| --- | --- |
| Specification | Full text of `MIRRORWORLD_Upgrade_Specification.pdf`, all six pages |
| Backend | All 15 application modules (`models.py`, `db.py`, `main.py`, `schemas.py`, `catalog.py`, `seed.py`, `campus.py`, `simulation.py`, `metrics.py`, `graph.py`, `explain.py`, `optimizer.py`, `jobs.py`, `exports.py`, `api.py`) and both test modules |
| Frontend | Routes (`App.tsx`), navigation (`config/nav.ts`), typed API (`lib/api.ts`), query hooks (`lib/hooks.ts`), and the screens that carry the specification features: Overview, Simulation Studio, Digital Campus, Schedule Optimizer, Comparison, Method & Evidence, Campus Model |
| Computations | Direct execution of the simulation, metrics, graph and solver modules against an isolated temporary database; independent recount of conflicts; API payload inspection through `TestClient` |
| Build health | Backend test suite, frontend production build, frontend lint |

### 2.2 What was **not** executed in this audit

- No live browser walkthrough or screenshot review in this session.
- No load test, accessibility audit or cross-browser test.
- No external AI provider test (none is integrated).
- No database migration test (the project uses `create_all`, not migrations).

Claims below are therefore limited to code trace, executed tests and targeted probes.

### 2.3 Status definitions

| Status | Meaning |
| --- | --- |
| **Functional** | Implemented end to end, computed from the campus model, wired to the interface, and verified by execution or tests. |
| **Partial** | Core computation or UI exists, but the specification’s required fields, flows, data or coverage are incomplete. |
| **Missing** | No implementation exists (or only an unrelated adjacent capability exists). |
| **Mock** | A placeholder or hard-coded result presented as computed. **No such implementation was found in the computational path.** Synthetic data and illustrative geometry are disclosed to the user and are not mocks. |

---

## 3. Feature audit

### 3.1 Summary matrix

| # | Specification feature | Status | Primary implementation | Short conclusion |
| --- | --- | --- | --- | --- |
| 1 | Critical Alerts | **Partial** | `backend/app/api.py:355-462`; `frontend/src/pages/OperationsOverviewPage.tsx:370-424`; `TopBar.tsx:112-170` | Real alerts from computed metrics, but missing consequences, suggested-action text, resource fields and severity levels. |
| 2 | Recommended Actions | **Missing** | — | No operational recommendation engine or panel. Plan recommendation is a different feature. |
| 3 | Student Movement Visualization | **Missing** (metric **Partial**) | `backend/app/metrics.py:237-251`; `catalog.py` distance matrix | Only a weekly distance total; no flows, walking time, congestion, time control or animation. |
| 4 | Multi-variable Simulation | **Partial** | `backend/app/schemas.py:8-17`; `simulation.py:49-126`; `SimulationStudioPage.tsx:390-500` | Six variables combine correctly, but several specified variables cannot be represented. |
| 5 | Scenario Templates | **Partial** | `SimulationStudioPage.tsx:137-231` (client-side presets) | Six presets load real parameters; no server template catalogue; only part of the seven-template set. |
| 6 | Impact Severity Assessment | **Missing** | — (only per-issue `severity` flags in `simulation.build_affected`) | No preliminary severity prediction and no aggregate level derived from impact data. |
| 7 | MIRROR AI | **Missing at audit** *(implemented since — see the status table at the top and §3.8)* | — | No provider, route, conversation state or UI at audit time. Rule-based explanation is not AI. |
| 8 | Digital Twin Difference Engine | **Missing** | — (adjacent: `explain.comparison_rows`, `simulation.build_affected`, `graph.impact_analysis`) | No state diff, no change consequence model, no shared service. |
| 9 | OR-Tools optimization integration | **Functional** (with caveats) | `backend/app/optimizer.py`; `jobs.py`; `api.py`; `ScheduleOptimizerPage.tsx` | Genuine CP-SAT model with an independent audit; constraint coverage and timing reliability have gaps. |

### 3.2 Critical Alerts — **Partial**

**Location**

- `backend/app/api.py` → `overview()` (lines 269–462); alert construction begins at line 355.
- `frontend/src/pages/OperationsOverviewPage.tsx` → “Decision queue / Alerts” (lines 370–424) and diagnostics modal (lines 530–675).
- `frontend/src/components/layout/TopBar.tsx` → alerts popover (lines 112–170).

**Actual behaviour**

- Alerts are not stored records. They are generated on every `GET /api/overview` from the recomputed baseline metrics.
- Baseline probe returned **6 alerts**: 1 capacity, 1 room conflict, 1 instructor conflict, 1 cohort conflict, 1 facility mismatch, 1 instructor-availability violation. This exactly matches the independently recomputed metric details.
- Alert object fields actually returned: `id`, `severity`, `category`, `title`, `detail`, `slot`, `action`.
- `action` is a routing token (`optimize` or `campus`), not a suggested-action sentence.
- Severity is only `critical` or `warning`, assigned by alert type:
  - capacity, room/instructor/cohort conflicts → `critical`
  - facility mismatch, availability, weekly overload → `warning`
- The API returns at most 10 alerts (`alerts[:10]`), sorted critical first.
- Dismissal on the Overview page is React state only; it is not persisted and does not affect the TopBar count.
- There is no building-energy alert. `buildings_summary` exposes utilization, but not modelled energy per building.
- There is no aggregate condition such as “three classrooms over capacity” or “several sessions affected by a facility disruption”. Each alert is per session or per conflicting pair.

**Missing against the specification**

| Required field | Current state |
| --- | --- |
| Problem description | Present as `title` + `detail` |
| Severity level (Low / Medium / High / Critical) | Only critical/warning; no medium/low, no rubric |
| Affected resources (rooms, labs, instructors, groups, buildings) | Embedded in prose; no structured `affected_resources` field |
| Potential consequences | **Missing** |
| Suggested next action | **Missing** (only a navigation token) |
| Evidence/source metric | **Missing** as a structured field |

Also missing: aggregation by condition, duplicate suppression, acknowledgement/persistence, alert lifecycle, a per-building energy alert, and a scenario-level “several sessions affected” alert. The specification’s example of “three rooms in Building A” cannot be rendered as written because cards are per-session.

**Dependencies and risks**

- Depends on `metrics.capacity_details`, `conflict_details`, `facility_details`, `availability_details`, `teacher_overloads`.
- Adding fields is a typed API change: `AlertItem` in `frontend/src/lib/types.ts` and both alert UIs must be updated together.
- Suggested actions must be generated from actual model opportunities (e.g., a real available larger room), otherwise the feature would violate the specification’s “never generic advice” rule.
- Persisting dismissals/acknowledgements requires a new table or a client preference store; decide whether alerts are computed-only or first-class records.

### 3.3 Recommended Actions — **Missing**

**Actual behaviour**

- There is **no** Recommended Actions panel, endpoint or service.
- `buildings_summary` computes per-building room count, capacity, sessions, occupied hours, utilization and conflict count. It does not generate advice.
- `explain.recommend_plan()` recommends one of the three recovery plans (B/C/D). That is decision support for the optimizer, not the specification’s operational recommendations such as “Building A has higher utilization than Building B; consider redistributing sessions.”
- The UI contains no comparison of building utilization, capacity margins, conflict counts or modelled energy that would support such a recommendation.

**Missing logic**

- A rule/evidence engine that converts computed signals into ranked, actionable recommendations.
- Evidence payloads (metric, value, comparison, affected building/room/group).
- A UI section with “why this recommendation” and a route to act.
- Tests proving recommendations follow actual data and change when the model changes.

**Dependencies and risks**

- Needs building-level energy aggregation (not currently exposed), capacity-margin calculations and conflict attribution by building.
- Must avoid generic advice; every recommendation needs an evidence reference.
- Overlaps with alerts: an alert says what is wrong; a recommendation says what to do. They should share a structured model but not be the same list.

### 3.4 Student Movement Visualization — **Missing** (movement metric **Partial**)

**What exists**

- `metrics.compute_metrics()` computes `movement_m` / `movement_km` by sorting each cohort’s sessions per day and summing the building-to-building distances between consecutive sessions (lines 237–251).
- Distances come from a static 4×4 matrix in `catalog.DISTANCES` (metres). Within-building movement is treated as zero.
- Baseline probe: **3.54 km/week**. This is a weekly aggregate, not a per-transition flow.
- The Digital Campus page has day/slot buttons and a room-availability board (`DigitalCampusPage.tsx:267-330`), so it can step through time. The campus map itself is a static SVG with clickable buildings (`CampusMap`, lines 562–640).
- There is no walking-speed constant, no travel time, no gap comparison, no congestion metric, no transition payload and no animation.

**Missing against the specification**

| Requirement | Current state |
| --- | --- |
| Number of students moving | Not computed per transition; only group sizes exist |
| Distance between buildings | Matrix exists and is used in the weekly total |
| Expected movement time | Not computed |
| Compare travel time with the gap | `total_gap_hours` exists as an aggregate; no per-transition comparison |
| Potential congestion | Not computed |
| Animated paths / flow thickness | Missing |
| Time control stepping through transitions | Only day/slot room availability, not flows |
| Highlight tight transitions | Missing |
| “Estimated movement” labelling | The weekly value is labelled as an estimate, but there is no flow visual to label |

**Dependencies and risks**

- Needs a new movement service and API payload, not just a chart change.
- Requires an explicit walking-speed assumption and a rule for same-building movement.
- Congestion is a modelled estimate, not live tracking; the wording must remain “Estimated movement / Timetable-based flow”.
- Rendering animated paths over the illustrative map needs a real geometry model (or explicit schematic paths) and reduced-motion handling.

### 3.5 Multi-variable Simulation — **Partial**

**Supported variables**

`ScenarioParams` (`backend/app/schemas.py:8-17`) supports:

| Parameter | Meaning | Validation |
| --- | --- | --- |
| `enrollment_delta` | Uniform change distributed across all cohorts | integer −300…+600 |
| `unavailable_room_ids` | Rooms removed from capacity and availability | must exist; not all rooms |
| `unavailable_teacher_ids` | Instructors absent for the scenario | must exist |
| `lab_policy` | `default` or `afternoon_only` | enum |
| `operating_end_slot` | Teaching window end (slots 3–6) | integer 3–6 |
| `energy_mode` | `standard` or `efficiency` (0.90 factor) | enum |
| `notes` | Stored analyst note | ≤400 chars |

**Actual behaviour**

- All supplied variables are applied together by `build_context()` and `apply_scenario()` to a copy of the baseline sessions. The baseline is never mutated.
- Probe with `+200 students`, two closed rooms, one absent instructor, afternoon-only labs, a shortened window and efficiency mode:
  - validation passed;
  - **82 affected sessions / 25 directly displaced**;
  - reason ledger included capacity, lab policy, room unavailable, group conflict, room conflict, teacher absent, teacher conflict and outside-hours;
  - baseline session JSON hash was **unchanged**;
  - distributed cohort total was exactly **1,328** (1,128 + 200).
- The UI exposes these fields in one form and submits one request. It does not run separate one-variable-at-a-time simulations.

**Missing against the specification**

- **Laboratory availability reduction by 25%** — no percentage parameter; rooms can only be closed individually.
- **Extend campus operating hours by one hour** — `operating_end_slot` can only be reduced (max 6 = 19:30). There is no slot 7 and no extension beyond the default.
- **Building unavailable** — no building-level parameter; the user must select every room manually.
- **Equipment availability / equipment loss** — no quantity or availability model. Equipment is a static capability list on rooms.
- **Instructor workload changed** — the global weekly limit can be edited in Campus Model, but there is no scenario-scoped workload change.
- **Program / intake term** — enrolment is distributed uniformly across every cohort; no program-specific or intake-term logic.
- **Scenario-scoped room capacity override** — capacity can only be edited globally in the campus model.
- **Dynamic disruption categories** — the “Disruption class” select is only a stored label (`demand`, `facility`, `policy`, `sustainability`, `compound`). It does not change which fields are displayed, and it is not the specification’s Instructor / Infrastructure / Emergency category model.

**Dependencies and risks**

- Extending `ScenarioParams` changes persisted JSON, API validation and the UI form; old scenario records must remain readable.
- The solver must receive the same extended context, or simulation and optimization will diverge.
- The difference engine should consume the same canonical state rather than re-deriving parameters ad hoc.

### 3.6 Scenario Templates — **Partial**

**Actual behaviour**

Six presets are defined in `SimulationStudioPage.tsx` (lines 137–231). They are computed from the loaded campus, not hard-coded numbers:

| Preset | What it loads | Derived from campus? |
| --- | --- | --- |
| Lab closure | Two high-demand labs unavailable | Yes, from baseline room usage |
| Instructor absence | Most heavily booked instructor unavailable | Yes |
| Enrolment surge | ~12% student increase | Yes, from total students |
| Compressed day | Teaching ends at slot 4 | Fixed policy value |
| Efficiency week | Afternoon-only labs + efficiency factor | Fixed policy values |
| Compound disruption | One classroom closed + ~8% enrolment + shortened day | Partly derived |

Selecting a preset only populates the form; the user reviews and executes the simulation. This is a valid interaction, and every resulting scenario is genuinely simulated.

**Coverage against the specification’s seven templates**

| Specification template | Current coverage |
| --- | --- |
| Enrollment Expansion | **Partial** — uniform delta, no program or intake term |
| Laboratory Shutdown | **Partial** — room selection and closures, no duration or equipment-loss parameter |
| Teacher Shortage | **Partial** — one most-booked instructor, not multiple instructors or workload limits |
| Classroom Overcrowding | **Missing** as a dedicated template (enrolment surge loosely covers capacity pressure) |
| Energy Conservation | **Partial** — lab policy + factor, no energy target |
| Emergency Campus Disruption | **Partial** — one compound preset combining room, demand and policy |
| Semester Timetable Restructuring | **Missing** — no slot structure or session-length changes |

**Other gaps**

- No server-side template registry or API; templates exist only in the React page.
- No persistence of “template used”, no template metadata and no test coverage.
- No intake term or program fields, so “Enrollment Expansion” cannot be parameterised as specified.

**Risks**

- Move templates to a small server module if they must be testable and consistent with the API’s validation.
- Do not duplicate parameter defaults between client and server; one schema should own them.

### 3.7 Impact Severity Assessment — **Missing**

**What exists**

- `simulation.build_affected()` assigns a per-issue `severity`:
  - displacement and capacity → `"critical"`
  - facility mismatch, availability, conflicts → `"warning"`
- The probe with the six-variable scenario produced **76 critical** and **6 warning** affected rows. These are counts of rows, not a severity assessment.
- `scenario.headline` is a textual count (e.g., “25 displaced sessions · recovery required”), not a severity level.
- There is no preliminary assessment before running a simulation, no severity endpoint and no aggregate scenario severity.

**Missing against the specification**

- A deterministic rubric that maps impact data (affected sessions, displaced sessions, capacity deficit, conflict count, affected cohorts/instructors, energy delta) to **Low / Medium / High / Critical**.
- A preliminary assessment shown after parameters are entered but before execution.
- Evidence for the level (“12 sessions may be affected”, “3 classrooms unavailable”, etc.).
- Confidence/assumption labelling.
- Distinct severity semantics from the per-issue critical/warning flags.

**Risks**

- Severity thresholds are a policy decision; they must be documented and testable.
- If severity is computed only in the frontend, it will drift from backend metrics. It should be a backend service shared by the simulation, overview and AI layers.
- Do not confuse “number of affected rows” with severity; a single displaced lab session can be more severe than several low-impact warnings.

### 3.8 MIRROR AI — **Missing at audit; implemented since**

> **Status now:** `backend/app/ai.py` provides an env-configured provider transport (Google `generateContent`, primary + fallback model, timeout and bounded retries) and a deterministic rule engine; `POST /api/ai/chat` grounds every answer in the campus model, simulation metrics, alerts, recommendations, difference engine and movement service, and returns the evidence list alongside the prose. `GET /api/ai/status` reports whether a key is configured. The section below records the audited baseline and is kept as evidence.

**Actual behaviour**

- No AI/LLM dependency in `backend/requirements.txt`.
- No AI route in `api.py`; route inventory ends at health, campus, overview, scenarios, jobs, compare, graph, history, exports and report.
- No conversation state, prompt, tool schema, provider abstraction or chat UI.
- The existing `explain.py` is a rule-based template engine. It fills sentences with computed metrics and does not call a language model. It is not MIRROR AI.

**Missing capabilities**

- Natural-language intent interpretation and structured parameter extraction.
- Missing-information questions and confirmation before execution.
- Invocation of real simulation/optimization jobs.
- Explanations grounded strictly in engine outputs.
- Infeasibility explanation, result summaries, recurring-problem analysis, scenario differences and decision reports.
- Guardrails: numeric allowlist, citation of metrics, refusal to invent, audit log.
- Conversation persistence.

**Dependencies and risks**

- Requires a provider decision, a server-side API key, cost/latency management and privacy review. No provider should be selected inside this audit; the key must never reach the browser.
- Without a confirmation step, natural language can silently create the wrong scenario.
- The specification’s core rule — all numerical results from the engines — needs an explicit grounding layer and tests that inject adversarial prompts.
- This is the highest-risk phase; it should be built last and remain optional when no key is configured.

### 3.9 Digital Twin Difference Engine — **Missing**

**What exists (adjacent pieces)**

- `explain.comparison_rows()` compares baseline metrics, scenario metrics and an optional plan on 19 rows with absolute/percentage deltas.
- `simulation.build_affected()` produces direct/indirect affected sessions and affected resources.
- `graph.build_graph()` / `impact_analysis()` traverse campus relationships.
- `Scenario.diagnostics` stores baseline metrics, baseline schedule, campus fingerprint and scenario context.
- The Comparison page presents baseline vs scenario vs plan metrics and a rule-based narrative.

**What does not exist**

- No `difference.py` module, no `/api/difference` route and no Difference Engine service.
- No attribute-level state diff such as “classrooms 20 → 19”, “labs available 4 → 3”, “students 1,000 → 1,200”, “sessions 112 → 112”.
- No structured “what changed / why it matters / which resources are affected / which constraints become harder / what decisions could address it” report.
- No scenario-to-scenario comparison.
- No single shared change model consumed by alerts, severity and AI. Each feature would currently re-derive its own version.

**Important architectural gap**

`Scenario` stores baseline *metrics* and *schedule* snapshots, but not the full baseline campus state (rooms, instructors, cohorts, capacities, equipment). A correct Difference Engine needs both the original and proposed states, or a canonical change list created at scenario time. Storing only metrics is insufficient to explain “classroom count changed” or “lab availability changed”.

**Dependencies and risks**

- Requires a canonical `CampusState` / `ScenarioState` representation and a stable change taxonomy.
- Affected-resource expansion should reuse the dependency graph, but the graph’s BFS currently over-reports structural reachability.
- All other Phase 2 features (alerts, severity, templates, AI explanations) should depend on this service, otherwise the platform will have several inconsistent notions of “what changed”.

---

## 4. OR-Tools optimization integration — detailed audit

### 4.1 Model as implemented

`backend/app/optimizer.py` builds a CP-SAT model per plan:

- Boolean `room[s, r]` for each eligible room choice.
- Integer `start[s]` over an allowed domain (day × 7 + slot).
- Optional interval per (session, room); mandatory teacher and cohort intervals.
- `AddExactlyOne` for room choice.
- `AddNoOverlap` for each room, instructor and cohort.
- `AddMaxEquality` to derive room usage.
- A constructive greedy pass produces a valid incumbent and objective upper bound; CP-SAT is still responsible for the returned plan.
- Three plans: B (`utilization_first`), C (`energy_first`), D (balanced or analyst weights). Plan D may add a room-count cap derived from B and C, with an explicit fallback if the cap is infeasible.

### 4.2 Hard-constraint coverage

| Constraint | Where enforced | Verdict |
| --- | --- | --- |
| One room per session | `AddExactlyOne` | Enforced in model |
| Room capacity ≥ group size | `_eligible_rooms` → `allowed_rooms_for_course(..., respect_capacity=True)` | Enforced in model (eligibility) |
| Lab type match | `allowed_rooms_for_course` | Enforced in model |
| Required equipment presence | `allowed_rooms_for_course` | Enforced as static tag presence |
| Instructor unavailable slots | `_allowed_starts` → `teacher_available` | Enforced in start domain |
| Operating window | `_allowed_starts` | Enforced in start domain |
| Lab afternoon-only policy | `_allowed_starts` | Enforced in start domain |
| Closed rooms | `_eligible_rooms` excludes unavailable rooms | Enforced in model |
| Room double-booking | `AddNoOverlap` room intervals | Enforced in model |
| Instructor double-booking | `AddNoOverlap` teacher intervals | Enforced in model |
| Cohort double-booking | `AddNoOverlap` group intervals | Enforced in model |
| Weekly teaching-hour limit | `_precheck()` raises before solve; `audit_solution()` rechecks | **Pre-solve gate + audit, not a CP-SAT constraint** |
| Equipment quantity / availability | — | **Not modelled** |
| Building-level closure | — | **Not modelled** (rooms only) |
| Instructor workload change | — | **Not modelled** (absence only) |

Because each session is assigned exactly once, total weekly teaching load per instructor is invariant across feasible plans; the pre-solve gate is therefore sufficient to reject overloaded scenarios. It cannot, however, support workload optimisation or partial reallocation.

### 4.3 Verification

- `solve_plans(campus, {}, None, 3.0)` and `solve_plans(..., 6.0)` returned three `FEASIBLE` plans in isolated probes; audit passed 9/9 checks; 0 hard issues; runtimes approximately 2.2–6.4 s per plan.
- At a 2.0 s limit, three consecutive isolated attempts also returned all feasible plans (B/D `FEASIBLE`, C `OPTIMAL`).
- Closing all laboratories raised `InfeasibleScenario` with **15 diagnostics**, each naming the `room_eligibility` constraint and the missing lab/equipment/seat condition. No plan was returned.
- Closing all rooms was rejected earlier by `validate_params` with a 422 (“At least one room must remain available”).
- However, the full test suite **failed once** under CPU contention: Plan B returned `UNKNOWN` at a 3.0 s limit, and the lifecycle test received a 409 when exporting a plan that had no schedule after a 2.0 s run. A rerun passed 24/24. This is real timing fragility, not a deterministic logic failure.

### 4.4 Missing modelling and data

- No equipment quantity or availability model; equipment is a static capability tag.
- No building-level closure parameter (rooms only).
- No scenario-scoped room-capacity override or instructor workload change.
- No assignment-stability / minimal-disruption objective; every plan re-times the whole timetable.
- Weekly teaching limits are not a CP-SAT constraint (a pre-solve gate and audit check instead).
- No operating-hours extension beyond the default end slot.

### 4.5 Dependencies and risks

- Depends on `campus.py` eligibility helpers, `simulation.apply_scenario()`, `metrics.compute_metrics()` and `jobs.py` persistence; a change to any of these can invalidate the audit.
- The independent audit is the safety net, but it repeats implementation choices (e.g., the same `allowed_rooms_for_course` helper); an error in that helper would affect both the model and the audit.
- The single-worker, in-memory job registry is a reliability boundary; long or competing runs can starve the queue and lose state on restart.
- Time-limited solves are nondeterministic across machines and load; the UI must not translate `UNKNOWN` into “infeasible”.
- Any new hard constraint must be added to `_precheck`, the model and `audit_solution` together, or the three will disagree.

### 4.6 Status

**Functional**, with caveats: the optimization is genuine, constrained and independently audited; the constraint coverage is not yet the full documented set; and plan generation is not reliable enough to promise “three feasible plans” on every demo run.

---

## 5. Computation validation

The specification asks for proof, not UI labels. Each check below was traced to code and, where possible, executed.

| # | Check | Verdict | Evidence |
| --- | --- | --- | --- |
| 1 | Alerts generated from actual campus model data | **Verified** | `GET /api/overview` returned 6 alerts; each maps to a metric detail. Independent recount found exactly 1 room, 1 instructor and 1 cohort collision, and the engine reported the same. |
| 2 | Capacity, instructor and cohort conflicts computed correctly | **Verified** (semantics caveat) | Baseline: 52 students in a 32-seat room (deficit 20), instructor double-booking at `Mon 09:40`, cohort overlap at `Thu 11:20`. Independent slot scan produced 1/1/1 pairs, matching `conflicts_by_type`. Caveat: `conflicts_total` counts unique conflicting pairs per resource type, not doubled slots (documented in the UI). |
| 3 | Scenario changes do not corrupt the baseline | **Verified** | Six-variable simulation compared a JSON hash of `campus.sessions` before and after: identical. `diagnostics.baseline_immutable` is true. Scenario creation stores a baseline metrics/schedule snapshot. |
| 4 | Multiple disruptions evaluated together | **Verified** | The six-variable probe passed validation and produced 82 affected sessions, 25 displaced sessions, and a reason ledger containing all applied disruption types. Distributed cohort total was exact (1,328). |
| 5 | Dependency analysis identifies genuinely affected resources | **Partial** | `simulation.build_affected()` is genuinely derived from diagnostics and resources. But `graph.impact_analysis()` is a structural BFS: from `room:AT-101` it reported 2 direct and 109 indirect nodes / 83 sessions, including structurally reachable nodes that are not necessarily scenario-affected. `alternatives` also filters rooms using `max(ctx["group_sizes"].values())` instead of the affected course’s cohort size (`graph.py:226`). |
| 6 | Severity computed from actual impact data | **Missing** | No aggregate severity exists. Per-row flags are hard-coded by issue type (`critical` for displacement/capacity, `warning` otherwise). No thresholds, scores or evidence. |
| 7 | Optimizer enforces every documented hard constraint | **Partial** | Capacity, lab/equipment tags, availability, window, lab policy, closed rooms and room/instructor/cohort no-overlap are modelled. Weekly hours are a precheck + audit gate, not a solver constraint. Equipment quantity, building closure and workload changes are not modelled. |
| 8 | Infeasible scenarios are never presented as valid schedules | **Verified** | All labs closed → `InfeasibleScenario` with 15 diagnostics and no plan. Solver `INFEASIBLE`/`MODEL_INVALID`/`UNKNOWN` are stored as non-feasible; only audited plans get `FEASIBLE`. UI shows an explicit no-feasible-schedule state. |
| 9 | Movement, energy and utilization use documented formulas | **Partial** | Energy = Σ(duration × (room kW + lab equipment kW if required)) × factor; utilization = scheduled room-hours ÷ (rooms × 5 days × (end_slot+1) × 1.5 h); movement = Σ building distance between consecutive cohort sessions per day. Code matches the Method page text, but movement ignores cohort size, travel time, gap comparison and congestion, and the `5`-day constant is hard-coded. Peak demand uses max power per room per slot while energy sums overlapping sessions, so the two can disagree under a double-booking. |
| 10 | AI-generated text never invents numerical results | **N/A** | No AI exists. The rule-based explanation quotes computed metrics only. There is documentation drift in static UI copy (e.g., “112 sessions”, “zone coordinates”, “capacity slack” objective), which should be corrected but is not generated output. |

### 5.1 Verified numbers from the synthetic dataset

| Quantity | Value | Source |
| --- | --- | --- |
| Buildings / rooms / instructors / cohorts / courses / sessions | 4 / 24 / 26 / 24 / 26 / 112 | `load_campus()` + seed |
| Students | 1,128 | Sum of group sizes |
| Units available | 20 classrooms + 4 laboratories | Seed catalogue |
| Baseline conflicts | 3 (room 1, instructor 1, group 1) | `compute_metrics()` |
| Baseline capacity | 1 session, 20-seat deficit | 52 students in AD-101 (32 seats) |
| Facility mismatch | 1 | BIO-L205 in a lecture room |
| Availability violation | 1 | EE-201 at Friday 16:20 |
| Hard issues | 6 | Conflicts 3 + capacity 1 + facility 1 + availability 1 |
| Modelled energy | 1,406.2 kWh/week | Room ratings × scheduled hours |
| Peak demand | 154.1 kW | Max per-slot room power |
| Movement | 3.54 km/week | Consecutive-session distance sum |
| Room utilization | 14.6 % (all rooms), 15.3 % (active rooms) | Documented denominators |

All of the above are computed from the synthetic demo model. None are institutional measurements.

---

## 6. Verification log

### 6.1 Commands actually executed

| Check | Command | Result |
| --- | --- | --- |
| Backend suite, run 1 | `.venv\Scripts\python -m pytest tests -q` | **22 passed, 2 failed** in 59.26 s. Failure 1: Plan B `UNKNOWN` at 3.0 s in `test_optimizer_returns_feasible_audited_plans`. Failure 2: plan export returned **409** instead of 200/404 in `test_scenario_lifecycle_create_optimize_compare_export` after a 2.0 s optimization. |
| Backend suite, run 2 | same command | **24 passed** in 39.57 s, 1 Starlette deprecation warning. |
| Solver probe | direct `solve_plans` at 3.0 s and 6.0 s | Three `FEASIBLE` plans, audit 9/9, 0 hard issues, runtimes ~2.2–6.4 s. |
| Solver repeatability | three attempts at 2.0 s | All plans feasible in every attempt when run without competing load. |
| Infeasibility probe | all labs closed | `InfeasibleScenario`, 15 diagnostics, no plan. |
| Multi-variable probe | 6 parameters together | 82 affected / 25 displaced; baseline hash unchanged; cohort total exact. |
| Alert probe | `GET /api/overview` | 6 alerts, matching metric details. |
| Conflict recount | independent Python scan of the baseline schedule | 1 room, 1 instructor, 1 cohort pair — exactly the engine result. |
| Frontend build | `npm run build` (`tsc -b && vite build`) | **Passed**; bundle built in 5.12 s; only a chunk-size warning. |
| Frontend lint | `npm run lint` | **0 errors, 18 warnings** (hook-dependency/style hints). |

### 6.2 Interpretation

- The backend logic is substantially real and test-covered, but the suite is **not reliably green**: solver time limits make two tests flaky under load. Reporting “24/24 passed” without that caveat would be inaccurate.
- The frontend compiles cleanly. Lint warnings are non-blocking but should be reviewed before submission.
- No browser E2E was run here; the previous build’s browser walkthrough is not re-claimed as evidence for this audit.
- No production code was changed; the working tree remained clean except for the pre-existing untracked specification PDF after restoring a generated `.pyc` touched by imports.

---

## 7. Cross-cutting defects and technical risks

| # | Finding | Severity | Evidence | Impact | Suggested phase |
| --- | --- | --- | --- | --- | --- |
| 1 | Solver plans can return `UNKNOWN` under load at short time limits | **High** | First full test run: Plan B `UNKNOWN`; plan export 409 | Demo may show “No feasible schedule” for a feasible scenario; tests flaky | Phase 1 |
| 2 | `impact_analysis` alternatives use the maximum group size across all cohorts | **Medium** | `graph.py:226` | Suggested alternative rooms can be incorrectly excluded | Phase 1 |
| 3 | Objective documentation drift | **Medium** | Method page says normalized capacity slack + room-opening penalty; model uses energy + room count + group-building concentration | Public claims do not match the solver; judges may probe this | Phase 1 |
| 4 | UI copy drift (“minimal disruption”, “112 sessions”, “zone coordinates”) | **Low–Medium** | `SimulationStudioPage.tsx:818`; `OperationsOverviewPage.tsx:331`; timetable subtitle | Weakens credibility; wrong explanation of movement | Phase 1 |
| 5 | Five-day week hard-coded in metrics, solver, seed and overview | **Medium** | `range(5)`, `5 * (slots)`, `WEEK_SLOTS = 35` | Cannot support a Sun–Thu or six-day model without touching several modules; previously requested Sun–Thu is not implemented | Phase 1/2 |
| 6 | Jobs are in-memory and lost on restart | **Medium** | `JOBS` dict in `jobs.py`; no recovery | Restart leaves scenarios stuck at `optimizing`; no durable audit of running jobs | Phase 1/2 |
| 7 | Seeded demo scenarios do not store a baseline snapshot | **Low** | `seed_demo_scenarios()` calls `simulate_mode()` without `diagnostics.baseline_metrics` | Comparisons for seeded runs use the current baseline, unlike user-created runs | Phase 1 |
| 8 | Overview computes the baseline twice per request | **Low** | `overview()` calls `_baseline()` then `_campus_payload()` which calls `_baseline()` again | Avoidable CPU on every dashboard load | Phase 1 |
| 9 | No authentication or multi-user isolation | **Low** for demo | No auth dependency; CORS allows localhost + one Netlify origin | Fine for a local showcase; not a production system | Out of scope / Phase 4 |
| 10 | Alert dismissal is not persisted | **Low** | `useState<Set>` in Overview | Counts reappear on navigation; no acknowledgement audit | Phase 2 |
| 11 | Peak-demand and energy aggregation can disagree under overlaps | **Low** | `slot_power` max per room vs energy sum per session | Metrics are internally inconsistent when the baseline is double-booked | Phase 1 |
| 12 | `simulate()` drops the detailed unassigned list returned by `apply_scenario()` | **Low** | `simulation.py:135` recomputes unassigned from sessions | No current behaviour break; duplicate logic is a maintenance risk | Phase 1 |

---

## 8. What is genuinely functional, partial, or absent

### Functional (verified)

- Deterministic synthetic campus and baseline with reproducible conflicts.
- Metric recomputation: conflicts, capacity, facility fit, availability, seat/room utilization, modelled energy, peak demand, teacher load, movement total.
- Counterfactual simulation with six variables; baseline immutability.
- CP-SAT recovery model with three strategies, independent 9-check audit, infeasibility diagnostics and cancellation handling.
- Comparison rows with zero-denominator handling; rule-based narrative bound to computed metrics.
- Dependency graph construction and bounded BFS traversal.
- Scenario persistence, history, audit log, CSV and printable HTML exports.
- Typed React frontend with query caching, error/loading/empty states, command palette, responsive shell.

### Partial

- Critical Alerts (real data, incomplete contract).
- Multi-variable simulation (real combination, limited variable set).
- Scenario templates (six client presets, partial specification coverage).
- Dependency impact (structural BFS over-reports; alternatives bug).
- OR-Tools coverage (core constraints enforced; weekly limits and equipment/building semantics incomplete; timing flakiness).
- Movement metric (aggregate only; no flow model).

### Absent

- Recommended Actions.
- Student Movement Visualization.
- Impact Severity Assessment.
- MIRROR AI.
- Digital Twin Difference Engine.
- Server-side template catalogue.
- Building-level closure, equipment availability and workload-change scenario parameters.

### Not mock

No hard-coded computed result was found in the simulation, metrics, optimizer, graph, comparison or export path. The dataset is synthetic by design and labelled; the campus footprint is illustrative geometry; energy and movement are estimates. Those are disclosed modelling assumptions, not disguised mock implementations.

---

## 9. Data authenticity and claim boundaries

| Category | Examples | Status |
| --- | --- | --- |
| Synthetic | Buildings, rooms, instructors, cohorts, courses, timetable, distances, seeded conflicts | Generated deterministically from `catalog.py` / `seed.py`; labelled in the UI |
| Modelled estimate | Energy (room ratings × hours), peak demand, movement distance, utilization denominators, severity (future) | Transparent formulas; not metered |
| Computed / measured in-system | Conflict counts, capacity deficits, availability violations, affected sets, solver statuses, audit results, runtimes | Recomputed from data and verified |
| Real-world measured | Actual campus operations, utility meters, student tracking, walking routes | **None** |

The specification’s guiding principle — every number shown must be computed from the model, simulation or optimizer, and estimates must be labelled — is largely honoured today for the features that exist. The upgrade must preserve that discipline, especially for alerts, severity, movement and AI.

---

## 10. Conclusion

MIRRORWORLD already has the hardest computational core: a real campus model, deterministic simulation, a constrained CP-SAT scheduler and an independent audit. The specification’s new value is mostly in **interpretation and interaction** — explaining changes, recommending actions, showing movement, assigning severity and answering questions in natural language. Those layers do not exist yet, and they must be built on one shared, canonical change model rather than as five disconnected features.

The immediate engineering priority is not a new visual feature. It is **Phase 1**: make the solver/demo reliable and create the Difference Engine contract. Without that, alerts, severity and AI would each invent their own version of “what changed”, and the platform would not meet its own central claim.

No implementation has been started. The roadmap and architecture that follow are proposals awaiting approval.

---

**Companion documents:** `IMPLEMENTATION_ROADMAP.md`, `SYSTEM_ARCHITECTURE.md`.
