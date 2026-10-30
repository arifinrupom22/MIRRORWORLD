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

No API keys, tokens or external services are required. The application is fully
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

## 3. Tests

```bash
cd backend
.venv/bin/python -m pytest tests -q      # Windows: .venv\Scripts\python -m pytest tests -q
```

24 tests cover dataset integrity, baseline conflict detection, disruption
propagation, validation failures, optimizer hard-constraint compliance
(capacity, facility fit, room/teacher/group double-booking, availability,
operating window), infeasibility reporting, cancellation, graph relationships,
comparison arithmetic (zero denominators) and the full HTTP workflow
(create → optimize → poll → compare → graph → history → CSV/HTML export).

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
  optimizer.py    CP-SAT model (room choices, integer starts, no-overlap),
                  3 strategy plans, independent hard-constraint audit
  jobs.py         single-worker async job queue with progress + cancel
  graph.py        dependency graph + bounded BFS impact analysis
  explain.py      comparison rows, deltas, recommendation text
  exports.py      CSV + printable HTML report
  api.py          FastAPI routes (prefix /api)
frontend/src/
  pages/          one file per workspace screen
  components/     design system (ui.tsx), charts, timetable grid, shell
  lib/            typed API client, query hooks, utilities
  store/          Zustand app state (active run, toasts, preferences)
```

Hard constraints the solver must satisfy: room availability, instructor
availability, weekly teaching limits, room capacity, laboratory type/equipment
fit, operating window and lab policy. Energy, space utilisation and student
movement are soft objectives combined by user-controlled weights.

## 5. Screens

Overview · Digital campus · Simulation studio · Dependency explorer ·
Schedule optimizer · Scenario comparison · Run history · Campus model ·
Method & evidence.

## 6. Known limitations

- The dataset is synthetic and clearly labelled everywhere it appears; it is
  not institutional data.
- Single-operator local mode: no authentication, no multi-user sync. Data is
  stored only in the local database file.
- Optimizer plans are reported as `FEASIBLE` unless CP-SAT proves `OPTIMAL`
  within the time limit; the solver status is never rounded up.
- Energy figures come from room power ratings × scheduled hours — a transparent
  model, not a measured meter reading.
- The campus footprint in *Digital campus* is illustrative geometry; capacities,
  equipment, bookings and utilisation are real model data.
