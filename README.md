# MIRRORWORLD — Smart Campus Digital Twin & Disruption Recovery Platform

**See the Impact. Simulate the Future. Optimize the Recovery.**

MIRRORWORLD models a university campus as a digital twin, detects baseline
schedule conflicts, simulates disruptions (room closures, instructor absence,
enrolment surges, policy changes), recovers the timetable with a Google OR-Tools
CP-SAT optimizer, and compares baseline vs. recovery evidence — all computed
from a persisted dataset, never hard-coded.

Central workflow: **MODEL → DETECT → SIMULATE → OPTIMIZE → COMPARE**

---

## 1. Requirements

| Component | Version |
| --- | --- |
| Python | 3.11+ |
| Node.js | 18+ (npm 9+) |
| Disk | ~600 MB for Python wheels (OR-Tools bundles the CP-SAT solver) |

No API keys are required. Mirror AI runs in deterministic mode without one;
setting `MIRROR_AI_API_KEY` (see `backend/.env.example`) enables a language
model on top of the same grounded data. The application is otherwise fully
local and single-operator.

## 2. Run the application

### 2.1 Backend (FastAPI + CP-SAT)

```bash
cd backend

# one-time setup
python -m venv .venv
.venv/bin/pip install -r requirements.txt      # Windows: .venv\Scripts\pip install -r requirements.txt

# start the API on http://127.0.0.1:8000
.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
# Windows: .venv\Scripts\python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

On first start the API creates `backend/data/mirrorworld.db`, seeds the
synthetic Fall 2026 · Week 7 campus (4 buildings, 24 rooms, 26 instructors,
24 cohorts, 112 sessions) including a documented, reproducible set of baseline
conflicts, and loads demo runs. Interactive API docs: <http://127.0.0.1:8000/docs>.

### 2.2 Frontend (React + TypeScript + Tailwind)

```bash
cd frontend
npm install
npm run dev            # http://localhost:5173  (proxies /api to 127.0.0.1:8000)
```

Production build:

```bash
npm run build          # type-checks (tsc -b) then bundles to frontend/dist
```

### 2.3 Environment variables (all optional)

| Variable | Component | Default | Purpose |
| --- | --- | --- | --- |
| `MIRRORWORLD_DATABASE_URL` | backend | `sqlite:///backend/data/mirrorworld.db` | Any SQLAlchemy URL (PostgreSQL works; schema is portable) |
| `VITE_API_BASE` | frontend | `""` (same-origin, proxied) | Absolute API origin when the frontend is served separately |
| `MIRROR_AI_PROVIDER` | backend | `google` | Provider adapter id (only `google` is implemented) |
| `MIRROR_AI_API_KEY` | backend | unset | Google AI Studio key; unset means deterministic mode |
| `MIRROR_AI_MODEL` | backend | `gemini-2.5-flash` | Primary model id — any model your key can use |
| `MIRROR_AI_FALLBACK_MODEL` | backend | unset | Second model tried when the primary is unavailable |
| `MIRROR_AI_TIMEOUT` / `MIRROR_AI_MAX_RETRIES` | backend | `30` / `1` | Provider transport limits; retries apply to 5xx and timeouts only |
| `MIRROR_AI_BASE_URL` | backend | Google `v1beta` | Override only for a compatible gateway |

Gemma models are served by the same provider, so only the model id changes:
`gemma-4-26b-a4b-it` (26B total, ~4B active) or `gemma-4-31b-it`. Gemma 4 runs
with `thinkingLevel: minimal` because its default thinking budget made the hosted
endpoint fail with HTTP 500, and thinking parts are never shown as answer text.
Gemma 3 and older reject `systemInstruction`, so their system prompt is inlined.

Copy `backend/.env.example` to `backend/.env` to set these. The API parses
`backend/.env` at startup (`backend/app/env.py`, no extra dependency), and a real
environment variable always wins over the file, so a key added there takes
effect on the next restart. The key is read by the API process only; it is never
sent to the browser or included in a response body.

### 2.4 Mirror AI modes, briefing and tools

| Mode | Job | What answers when no key is set |
| --- | --- | --- |
| Ask | Direct grounded answers | rule engine over the same context |
| Analyst | Bottlenecks, conflicts and risks, ranked with evidence | alerts + movement + recommendations |
| What-if | A described disruption → validated proposal, never an edit | deterministic parser; confirmation still required |
| Advisor | Options with benefits, risks and trade-offs | recommendation cards |
| Research | How digital twins and CP-SAT work, separated from this project | curated explanation + project facts |

The **Campus Intelligence Briefing** (`GET /api/ai/briefing`) composes seven
sections from the same services. A section with no data says *Insufficient data*
and names the action that would produce it, rather than padding the panel. The
**tool registry** (`GET /api/ai/tools`) is allowlisted and read-only;
`execute_confirmed_scenario` is disabled there by policy, and scenario creation
happens only through `POST /api/ai/proposal/apply` after explicit confirmation,
which writes an audit record. Every answer also returns `reasoning` (evidence,
sources, assumptions, limitations, next actions), `evidence_quality` labels and
`tools` — what actually ran.

## 3. Tests

```bash
cd backend
.venv/bin/python -m pytest tests -q      # Windows: .venv\Scripts\python -m pytest tests -q
```

81 tests cover dataset integrity, baseline conflict detection, disruption
propagation, validation failures, extended scenario parameters, structured
alerts, evidence-based recommendations, severity scoring, the seven server
templates, optimizer hard-constraint compliance (capacity, facility fit,
room/teacher/group double-booking, availability, operating window), solver
timeout fallback, infeasibility reporting, cancellation, graph relationships,
comparison arithmetic (zero denominators), canonical state snapshots, the
Difference Engine, and the full HTTP workflow (create → optimize → poll →
compare → difference → graph → history → CSV/HTML export). Nine of them cover
the Mirror AI contract: deterministic answers when no key is configured,
grounded numbers that match `/api/overview`, scenario scoping and 404s, the
model and fallback paths against a stubbed transport, and the guarantee that
the key never appears in a prompt or response.

Frontend checks:

```bash
cd frontend
npm run build          # tsc -b + vite build
npm run lint           # oxlint
```

## 4. Architecture

```
backend/app/
  models.py       SQLAlchemy schema (buildings, rooms, teachers, groups,
                  courses, sessions, scenarios, plans, audit log)
  seed.py         deterministic synthetic campus + pinned baseline conflicts
  campus.py       campus load/serialisation + feasibility helpers
  metrics.py      conflict, capacity, utilisation, energy and movement KPIs
  simulation.py   counterfactual engine: validation, affected-set propagation
  state.py        canonical baseline/effective campus state snapshots
  difference.py   dependency-aware state diff, consequences and decisions
  alerts.py       severity-graded alerts with resources, evidence and actions
  recommendations.py  operational recommendations backed by measured metrics
  severity.py     deterministic Low/Medium/High/Critical impact assessment
  templates.py    seven campus-derived scenario templates
  optimizer.py    CP-SAT model (room choices, integer starts, no-overlap),
                  3 strategy plans, verified constructive fallback, audit
  jobs.py         single-worker async job queue with progress + cancel
  graph.py        dependency graph + bounded BFS impact analysis
  explain.py      comparison rows, deltas, recommendation text
  exports.py      CSV + printable HTML report
  ai.py           Mirror AI provider layer: env config, Google client with
                  primary/fallback models, deterministic rule engine
  api.py          FastAPI routes (prefix /api)
frontend/src/
  pages/          one file per workspace screen
  components/     design system (ui.tsx), charts, timetable grid, shell,
                  schematic 3D campus (Three.js), guided tour
  lib/            typed API client, query hooks, utilities
  store/          Zustand app state (active run, toasts, preferences)
```

Hard constraints the solver must satisfy: room availability, instructor
availability, room capacity, laboratory type/equipment fit, operating window
and lab policy. Weekly teaching limits are validated before solving and
rechecked by the independent audit. Energy, active-room use and student
movement are soft objectives combined by user-controlled weights.

## 5. Screens

Overview · Digital campus · Simulation studio · Dependency explorer ·
Schedule optimizer · Mirror AI · Scenario comparison · Run history · Campus
model · Method & evidence.

## 6. Known limitations

- The dataset is synthetic and clearly labelled everywhere it appears; it is
  not institutional data.
- Single-operator local mode: no authentication, no multi-user sync. Data is
  stored only in the local database file.
- Optimizer plans are reported as `FEASIBLE` unless CP-SAT proves `OPTIMAL`
  within the time limit; the solver status is never rounded up. If CP-SAT
  returns `UNKNOWN`, an independently audited constructive schedule is shown
  as `FEASIBLE_HEURISTIC`, never as infeasible or optimal.
- Student movement is computed per transition — walking feasibility, tight
  transitions and unknown distances — and drawn on both the 2D plan and the 3D
  twin. Congestion inside corridors is out of scope.
- The Digital Campus 3D view is schematic massing built from the stored
  footprints with one assumed storey height. It is not a surveyed or
  architectural model, and the UI says so.
- Mirror AI is an interface to the platform's own deterministic services, not
  an independent authority. With no key configured it answers from a rule
  engine and labels every answer as such; a provider failure falls back with an
explicit error rather than a fabricated success.
- Energy figures come from room power ratings × scheduled hours — a transparent
  model, not a measured meter reading.
- The campus footprint in *Digital campus* is illustrative geometry; capacities,
  equipment, bookings and utilisation are real model data.
