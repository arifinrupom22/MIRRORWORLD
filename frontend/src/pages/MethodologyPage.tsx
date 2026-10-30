import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  BookOpen,
  Calculator,
  CheckCircle2,
  Database,
  FlaskConical,
  GitBranch,
  Layers3,
  Scale,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-react'
import { useCampus, useHealth } from '../lib/hooks'
import { fmtNumber, fmtPct } from '../lib/utils'
import { Badge, Panel, Tabs } from '../components/ui'
import { PipelineStrip, Provenance } from '../components/shared'

const TABS = [
  { id: 'method', label: 'Method' },
  { id: 'diagnostics', label: 'Diagnostics' },
  { id: 'optimization', label: 'Optimization' },
  { id: 'verification', label: 'Verification & limits' },
]

export function MethodologyPage() {
  const [tab, setTab] = useState('method')
  const { data: campus } = useCampus()
  const { data: health } = useHealth()

  return (
    <div>
      <header className="mb-5 flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="telemetry text-cyan/80">Reference · method & evidence</span>
            <Badge tone="neutral">{health?.solver ?? 'CP-SAT'}</Badge>
            <Badge tone="warning">synthetic dataset</Badge>
          </div>
          <h1 className="text-[26px] font-semibold leading-[1.1] tracking-[-0.03em] text-ink sm:text-[30px]">Method & evidence</h1>
          <p className="mt-2 max-w-3xl text-[12.5px] leading-relaxed text-muted">
            What MIRRORWORLD computes, which constraints it enforces, how recommendations are scored, and what this prototype does not claim. The goal is verifiable engineering, not a polished forecast.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/model" className="focus-ring inline-flex h-8 items-center gap-2 rounded-md border border-line px-3 text-[11px] text-muted hover:text-ink"><Database className="h-3.5 w-3.5" /> Inspect model</Link>
          <Link to="/history" className="focus-ring inline-flex h-8 items-center gap-2 rounded-md border border-line px-3 text-[11px] text-muted hover:text-ink"><ShieldCheck className="h-3.5 w-3.5" /> Audit trail</Link>
        </div>
      </header>

      <div className="mb-4"><PipelineStrip active="model" /></div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          <Panel>
            <div className="border-b border-lineSoft px-4 pt-3">
              <Tabs value={tab} onChange={setTab} tabs={TABS} />
            </div>
            <div className="p-5">
              {tab === 'method' && <MethodTab />}
              {tab === 'diagnostics' && <DiagnosticsTab />}
              {tab === 'optimization' && <OptimizationTab />}
              {tab === 'verification' && <VerificationTab />}
            </div>
          </Panel>
        </div>

        <div className="min-w-0 space-y-5">
          <Panel className="p-4">
            <div className="flex items-center gap-2 text-[11px] font-medium text-ink"><Database className="h-3.5 w-3.5 text-cyan/70" /> Live dataset</div>
            {campus ? (
              <div className="mt-3 space-y-2">
                {[
                  ['Buildings', campus.summary.buildings],
                  ['Teaching spaces', campus.summary.rooms],
                  ['Instructors', campus.summary.teachers],
                  ['Cohorts', campus.summary.groups],
                  ['Courses', campus.summary.courses],
                  ['Weekly sessions', campus.summary.sessions],
                  ['Students modelled', fmtNumber(campus.summary.students)],
                  ['Seat capacity', fmtNumber(campus.summary.seat_capacity)],
                ].map(([label, value]) => (
                  <div key={String(label)} className="flex items-center justify-between border-b border-lineSoft pb-1.5 text-[10px] last:border-b-0 last:pb-0">
                    <span className="text-faint">{label}</span>
                    <span className="font-mono tabular-nums text-muted">{value}</span>
                  </div>
                ))}
                <div className="pt-1 font-mono text-[8px] uppercase tracking-[0.05em] text-faint">fingerprint {campus.fingerprint.slice(0, 16)}</div>
              </div>
            ) : <p className="mt-2 text-[10px] text-faint">Dataset metadata needs the API.</p>}
          </Panel>

          <Panel className="p-4">
            <div className="flex items-center gap-2 text-[11px] font-medium text-ink"><Calculator className="h-3.5 w-3.5 text-cyan/70" /> Baseline at a glance</div>
            {campus ? (
              <div className="mt-3 space-y-2">
                {[
                  ['Hard issues', campus.baseline.hard_issue_count],
                  ['Booking collisions', campus.baseline.conflicts_total],
                  ['Displaced sessions', campus.baseline.unassigned_sessions],
                  ['Room utilisation', fmtPct(campus.baseline.room_utilization_pct)],
                  ['Active-room utilisation', fmtPct(campus.baseline.active_room_utilization_pct)],
                  ['Seat utilisation', fmtPct(campus.baseline.seat_utilization_pct)],
                  ['Modelled energy', `${fmtNumber(campus.baseline.energy_kwh, 0)} kWh/wk`],
                  ['Movement', `${fmtNumber(campus.baseline.movement_km, 2)} km/wk`],
                ].map(([label, value]) => (
                  <div key={String(label)} className="flex items-center justify-between border-b border-lineSoft pb-1.5 text-[10px] last:border-b-0 last:pb-0">
                    <span className="text-faint">{label}</span>
                    <span className="font-mono tabular-nums text-muted">{value}</span>
                  </div>
                ))}
              </div>
            ) : <p className="mt-2 text-[10px] text-faint">Baseline metrics need the API.</p>}
          </Panel>

          <Panel className="p-4">
            <div className="flex items-center gap-2 text-[11px] font-medium text-ink"><BookOpen className="h-3.5 w-3.5 text-cyan/70" /> Source authority</div>
            <p className="mt-1.5 text-[9.5px] leading-relaxed text-faint">
              Implementation follows the supplied MIRRORWORLD documentation and design references. Where a formula was unspecified, the chosen complement is stated explicitly and applied consistently in code and interface.
            </p>
            <Provenance className="mt-2">Dataset: {campus?.campus.dataset_label ?? 'synthetic demo campus'} · {campus?.campus.source ?? 'seeded generator'}.</Provenance>
          </Panel>
        </div>
      </div>
    </div>
  )
}

function Formula({ title, formula, note }: { title: string; formula: string; note: string }) {
  return (
    <div className="rounded-md border border-lineSoft bg-input p-3">
      <div className="font-mono text-[8px] uppercase tracking-[0.08em] text-faint">{title}</div>
      <code className="mt-1.5 block break-words font-mono text-[10px] leading-relaxed text-cyan/85">{formula}</code>
      <p className="mt-1.5 text-[9.5px] leading-relaxed text-faint">{note}</p>
    </div>
  )
}

function MethodTab() {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-[15px] font-semibold text-ink">The problem this prototype solves</h2>
        <p className="mt-1.5 text-[11.5px] leading-relaxed text-muted">
          Campus timetables fail at the seams: a lab closes, an instructor is absent, enrolment rises, or a policy compresses the teaching day. The immediate disruption is visible, but the cascade — displaced cohorts, equipment conflicts, workload spikes, movement and energy — is not. MIRRORWORLD makes that cascade explicit, then searches for a feasible recovery.
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {[
          ['1 · Model', 'Relational campus data: buildings, rooms, instructors, cohorts, courses, weekly sessions, equipment and travel distances.'],
          ['2 · Detect', 'Recompute schedule diagnostics from the persisted timetable: collisions, capacity, facility fit, availability and displacement.'],
          ['3 · Simulate', 'Apply a counterfactual without mutating the baseline. Trace direct and indirect affected sessions and resources.'],
          ['4 · Optimize', 'Solve a CP-SAT recovery model with hard constraints and weighted soft objectives; audit every returned plan.'],
          ['5 · Compare', 'Place baseline, scenario and plan on the same metric definitions and explain the trade-offs.'],
          ['6 · Export', 'Persist runs and expose CSV schedules and a printable HTML evidence report generated from the stored data.'],
        ].map(([title, text]) => (
          <div key={title} className="rounded border border-lineSoft bg-subtle p-3">
            <div className="font-mono text-[9px] uppercase tracking-[0.08em] text-cyan/80">{title}</div>
            <p className="mt-1 text-[10px] leading-relaxed text-faint">{text}</p>
          </div>
        ))}
      </div>

      <div>
        <h3 className="text-[12.5px] font-semibold text-ink">Architecture</h3>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {[
            ['React + TypeScript', 'Typed application data, React Query for server state, Zustand for UI state, Tailwind design system.'],
            ['FastAPI + SQLAlchemy', 'Validation, persistence, exports, asynchronous solver jobs and a graph service.'],
            ['OR-Tools CP-SAT', 'Interval-based integer model with room choice, starts, no-overlap and facility eligibility.'],
          ].map(([title, text]) => (
            <div key={title} className="rounded border border-lineSoft p-3"><Layers3 className="h-3.5 w-3.5 text-cyan/70" /><div className="mt-1.5 text-[10.5px] font-medium text-ink">{title}</div><p className="mt-1 text-[9.5px] leading-relaxed text-faint">{text}</p></div>
          ))}
        </div>
        <p className="mt-2 text-[9.5px] leading-relaxed text-faint">
          SQLite stands in for the documented relational store in this local prototype. The schema uses SQLAlchemy models and avoids SQLite-specific SQL, so the intended PostgreSQL deployment remains compatible.
        </p>
      </div>

      <div className="rounded border border-cyan/20 bg-cyan/[0.035] p-3.5">
        <div className="flex items-center gap-2 text-[11px] font-medium text-cyan"><FlaskConical className="h-3.5 w-3.5" /> Design direction</div>
        <p className="mt-1.5 text-[10.5px] leading-relaxed text-muted">
          A dense, instrument-panel interface: deep navy surfaces, cyan for computed state, amber for pressure, red for violated constraints, violet for facilities. Tabular numerals, explicit units, provenance badges and restrained motion. The design references informed the information hierarchy and spatial viewer; they were not copied as decoration.
        </p>
      </div>
    </div>
  )
}

function DiagnosticsTab() {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-[15px] font-semibold text-ink">Metric definitions</h2>
        <p className="mt-1.5 text-[11.5px] leading-relaxed text-muted">
          All values are recomputed from the same schedule payload. The active-room complement is an explicit implementation choice: it answers “how full are the rooms we actually use?” rather than diluting utilisation across empty rooms.
        </p>
      </div>
      <div className="grid gap-2">
        <Formula title="Scheduled room-hours" formula="Σ (session length × 1.5h)" note="Only sessions with a room, day and start slot are included. Displaced sessions are counted separately." />
        <Formula title="Total-room utilisation" formula="scheduled room-hours ÷ (available rooms × 5 days × (operating_end_slot + 1) × 1.5h)" note="Closure scenarios reduce the available-room denominator; the operating window follows the scenario policy." />
        <Formula title="Active-room utilisation" formula="scheduled room-hours ÷ (rooms used × 5 × (operating_end_slot + 1) × 1.5h)" note="Documented complement used in the interface wherever capacity pressure is discussed." />
        <Formula title="Seat utilisation" formula="Σ (group size × duration) ÷ Σ (room capacity × duration)" note="Measured only over scheduled sessions; it is not a campus-wide occupancy rate." />
        <Formula title="Energy estimate" formula="Σ (duration × (room base kW + lab equipment kW if required)) × energy factor" note="Equipment power is charged only to laboratory courses. This is an estimate from ratings, not metered consumption." />
        <Formula title="Peak demand" formula="max over slots of Σ unique room power at that slot" note="Parallel sessions in the same room contribute once; this is a conservative demand proxy." />
        <Formula title="Instructor workload σ" formula="population standard deviation of weekly contact hours" note="Contact hours only; preparation, marking and meetings are outside the model." />
        <Formula title="Movement" formula="Σ walking distance between consecutive sessions per cohort per day" note="Building-to-building distance matrix; within-building movement is treated as zero. This is a comparative model, not a route planner." />
        <Formula title="Hard-issue count" formula="collisions + capacity breaches + facility mismatches + availability violations + displaced sessions" note="A plan is not called clean unless every component is zero. Details are capped at 120 records per category in the API payload." />
      </div>
      <div className="rounded border border-lineSoft p-3.5">
        <div className="flex items-center gap-2 text-[11px] font-medium text-ink"><GitBranch className="h-3.5 w-3.5 text-cyan/70" /> Collision accounting</div>
        <p className="mt-1.5 text-[10.5px] leading-relaxed text-faint">
          A collision is counted once per conflicting session pair per resource type (room, instructor, cohort). It is not the number of doubled slots, so one pair spanning two slots is one issue. This keeps the ledger stable and explainable.
        </p>
      </div>
      <div className="rounded border border-warning/25 bg-warning/[0.035] p-3.5">
        <div className="flex items-center gap-2 text-[11px] font-medium text-warning"><TriangleAlert className="h-3.5 w-3.5" /> Baseline is intentionally imperfect</div>
        <p className="mt-1.5 text-[10.5px] leading-relaxed text-muted">
          The demo baseline contains reproducible conflicts and pressure so the recovery workflow has something real to fix. Conflict labels in the seed data are not used as metric results; the engine re-derives every count. A reset restores the same seeded conditions.
        </p>
      </div>
    </div>
  )
}

function OptimizationTab() {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-[15px] font-semibold text-ink">Constraint model</h2>
        <p className="mt-1.5 text-[11.5px] leading-relaxed text-muted">
          Three plans are solved per job. Plans B and C use fixed strategy presets; plan D uses the analyst's weights. Each plan is independently audited, and the solver status is preserved rather than translated into a vague “optimal” badge.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded border border-lineSoft p-3.5">
          <div className="flex items-center gap-1.5 text-[10.5px] font-medium text-ink"><ShieldCheck className="h-3.5 w-3.5 text-success" /> Hard constraints</div>
          <ul className="mt-2 space-y-1 text-[9.5px] leading-relaxed text-faint">
            <li>• One room, instructor and cohort per session slot.</li>
            <li>• Room capacity ≥ group size.</li>
            <li>• Laboratory type and required equipment must match.</li>
            <li>• Instructor unavailable slots and weekly maximum hours.</li>
            <li>• Closed rooms and compressed operating windows.</li>
            <li>• Laboratory afternoon-only policy when configured.</li>
            <li>• Sessions remain within the week and valid start range.</li>
          </ul>
        </div>
        <div className="rounded border border-lineSoft p-3.5">
          <div className="flex items-center gap-1.5 text-[10.5px] font-medium text-ink"><Scale className="h-3.5 w-3.5 text-warning" /> Soft objectives</div>
          <ul className="mt-2 space-y-1 text-[9.5px] leading-relaxed text-faint">
            <li>• Estimated energy demand.</li>
            <li>• Slack in room allocation; fewer extra rooms opened.</li>
            <li>• Student movement from cohort home buildings.</li>
            <li>• Weighted sum is normalized across the observed term range.</li>
            <li>• Plan strategies: space-first, energy-first, balanced.</li>
            <li>• Time limit is per plan; feasibility is not guaranteed.</li>
          </ul>
        </div>
      </div>
      <Formula title="Objective" formula="min Σ normalized(energy) + normalized(capacity slack) + normalized(movement) + room-opening penalty" note="Exact coefficients are generated per instance from the range of available choices; the terms remain comparative and are not monetary costs." />
      <div>
        <h3 className="text-[12px] font-semibold text-ink">Solver lifecycle</h3>
        <div className="mt-2 grid gap-2 sm:grid-cols-4">
          {[
            ['Queued', 'A single-worker executor accepts the job. Duplicate active jobs for the same scenario are rejected.'],
            ['Running', 'Stages report model build and per-plan progress. Cancellation is requested between plans.'],
            ['Audited', 'Every plan is replayed through an independent constraint audit before persistence.'],
            ['Persisted', 'Feasible, infeasible or unknown status is stored with warnings, objective terms and runtime.'],
          ].map(([title, text], index) => (
            <div key={title} className="rounded border border-lineSoft p-3">
              <div className="font-mono text-[8px] text-cyan/70">0{index + 1}</div>
              <div className="mt-1 text-[10px] font-medium text-ink">{title}</div>
              <p className="mt-1 text-[9px] leading-relaxed text-faint">{text}</p>
            </div>
          ))}
        </div>
      </div>
      <div className="rounded border border-lineSoft p-3.5">
        <div className="flex items-center gap-2 text-[11px] font-medium text-ink"><Calculator className="h-3.5 w-3.5 text-cyan/70" /> Plan recommendation</div>
        <p className="mt-1.5 text-[10.5px] leading-relaxed text-faint">
          Feasible plans are scored by weighted normalized distance to the best observed value for energy, rooms used and movement. Any unresolved hard issue or failed audit adds a decisive penalty. The lowest score is recommended; equal scores prefer the balanced plan. The score is a heuristic decision aid, not a proof of optimality.
        </p>
        <pre className="mt-2 overflow-x-auto rounded border border-lineSoft bg-cell p-2.5 font-mono text-[9px] leading-relaxed text-cyan/80">{`score = Σ wᵢ · normalized(metricᵢ)\n      + 5.0 if hard_issue_count > 0 or audit failed`}</pre>
      </div>
      <div className="rounded border border-warning/25 bg-warning/[0.035] p-3.5">
        <div className="flex items-center gap-2 text-[11px] font-medium text-warning"><TriangleAlert className="h-3.5 w-3.5" /> What “optimal” means here</div>
        <p className="mt-1.5 text-[10.5px] leading-relaxed text-muted">
          CP-SAT can prove optimality for the modelled objective under its time limit. The interface reports the raw solver status and only labels a plan optimal when that status is returned. It never converts a time-limited feasible solution into an optimality claim.
        </p>
      </div>
    </div>
  )
}

function VerificationTab() {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-[15px] font-semibold text-ink">Verification approach</h2>
        <p className="mt-1.5 text-[11.5px] leading-relaxed text-muted">
          Verification is layered: pure engine tests, API integration tests, TypeScript compilation, production build, and a manual user-journey check through the running application. The report distinguishes executed checks from blocked ones.
        </p>
      </div>
      <div className="space-y-2">
        {[
          ['Engine invariants', 'Capacity violation detection, room/teacher/group collision detection, facility matching, unassigned handling and metric recomputation.'],
          ['Scenario propagation', 'Closure removes rooms; instructor absence removes assignments; enrolment changes capacity checks; compressed windows remove late slots.'],
          ['Optimizer correctness', 'Every returned plan is re-audited for hard constraints; infeasible scenarios return diagnostics instead of fabricated schedules.'],
          ['API contracts', 'Campus, overview, scenario creation, job polling, comparison, graph impact, exports and report endpoints are exercised with a temporary database.'],
          ['Interface build', 'TypeScript project build and Vite production build must complete with no errors. Interactive checks cover search, filters, plan selection, exports and failure states.'],
        ].map(([title, text], index) => (
          <div key={title} className="flex items-start gap-3 rounded border border-lineSoft px-3 py-2.5">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-success/25 bg-success/[0.06] font-mono text-[8px] text-success">0{index + 1}</span>
            <div><div className="text-[10.5px] font-medium text-ink">{title}</div><p className="mt-0.5 text-[9.5px] leading-relaxed text-faint">{text}</p></div>
          </div>
        ))}
      </div>
      <div className="rounded border border-lineSoft p-3.5">
        <div className="flex items-center gap-1.5 text-[11px] font-medium text-ink"><CheckCircle2 className="h-3.5 w-3.5 text-success" /> Honest result reporting</div>
        <p className="mt-1.5 text-[10.5px] leading-relaxed text-faint">
          A passing build is not presented as proof that algorithms work. Algorithm tests assert values and constraint outcomes directly. A successful export request is checked for data content, not merely an HTTP status. Limitations found during verification are listed below rather than hidden.
        </p>
      </div>
      <div>
        <h3 className="flex items-center gap-2 text-[12px] font-semibold text-ink"><TriangleAlert className="h-3.5 w-3.5 text-warning" /> Limitations of this prototype</h3>
        <ul className="mt-2 space-y-1.5 text-[10px] leading-relaxed text-faint">
          <li>• All campus, staffing, enrolment and timetable data is synthetic and illustrative. No claim of real institutional performance is made.</li>
          <li>• Building footprints on the campus map are schematic and are labelled as such; they are not survey or CAD geometry.</li>
          <li>• Energy values use static room power ratings and are not metered; they are suitable for relative comparison only.</li>
          <li>• Walking distance is a building-level matrix and ignores internal routing, lifts, accessibility and weather.</li>
          <li>• SQLite persistence is local to this deployment. It is not a multi-user institutional database and does not share state between devices.</li>
          <li>• The solver runs in a single background worker with per-plan time limits. Longer or larger instances may return FEASIBLE rather than OPTIMAL, or may be infeasible.</li>
          <li>• The scenario engine reassigns existing sessions; it does not invent new teaching sessions, staff substitutions or room-opening decisions.</li>
          <li>• The recommendation score is a decision aid with explicit weights, not a universal policy or a guaranteed improvement over all alternatives.</li>
          <li>• Authentication, role-based permissions and live institutional integrations are outside the local prototype scope.</li>
        </ul>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link to="/history" className="focus-ring inline-flex h-8 items-center gap-2 rounded border border-line px-3 text-[10.5px] text-muted hover:text-ink">Open audit trail <ArrowRight className="h-3 w-3" /></Link>
        <Link to="/simulation" className="focus-ring inline-flex h-8 items-center gap-2 rounded border border-line px-3 text-[10.5px] text-muted hover:text-ink">Run a scenario <ArrowRight className="h-3 w-3" /></Link>
      </div>
      <Provenance>
        This page describes implemented behaviour. Where the interface cannot verify something — for example, real-world energy savings — it does not claim to.
      </Provenance>
    </div>
  )
}
