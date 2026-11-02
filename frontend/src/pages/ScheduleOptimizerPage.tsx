import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  CircleDashed,
  Download,
  Gauge,
  Layers3,
  Loader2,
  Move3d,
  Play,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Timer,
  X,
  Zap,
} from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '../lib/api'
import { queryKeys, useCampus, useJob, useScenario, useScenarios } from '../lib/hooks'
import { useAppStore, toast } from '../store/appStore'
import type { Plan, ScheduleEntry, ScenarioDetail } from '../lib/types'
import { cn, fmtNumber, fmtPct } from '../lib/utils'
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  LoadingBlock,
  Panel,
  PanelHeader,
  Segmented,
  Slider,
  StatusBadge,
  Tabs,
  Tooltip,
} from '../components/ui'
import { ComparisonBars } from '../components/charts'
import { IssueCount, JobProgress, PipelineStrip, Provenance, ScenarioSelector } from '../components/shared'
import { TimetableGrid } from '../components/TimetableGrid'

const PLAN_STRATEGY_LABEL: Record<string, string> = {
  utilization_first: 'Space-first',
  energy_first: 'Energy-first',
  balanced: 'Balanced',
}

const DEFAULT_WEIGHTS = { energy: 0.25, utilization: 0.25, movement: 0.5 }

export function ScheduleOptimizerPage() {
  const activeId = useAppStore((state) => state.activeScenarioId)
  const { data: campus } = useCampus()
  const { data: scenariosData } = useScenarios()
  const { data: scenarioData, isLoading, isError, error, refetch } = useScenario(activeId)
  const [weights, setWeights] = useState(DEFAULT_WEIGHTS)
  const [timeLimit, setTimeLimit] = useState(8)
  const [jobId, setJobId] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  const [runError, setRunError] = useState<string | null>(null)
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null)
  const [planTab, setPlanTab] = useState('moves')
  const [changeQuery, setChangeQuery] = useState('')
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { data: jobData, refetch: refetchJob } = useJob(jobId)
  const job = jobData?.job ?? null
  const scenario = scenarioData?.scenario ?? null
  const plans = scenario?.plans ?? []
  const busy = job ? ['queued', 'running', 'cancelling'].includes(job.status) : starting

  useEffect(() => {
    if (!plans.length) {
      setSelectedLabel(null)
      return
    }
    if (!selectedLabel || !plans.some((plan) => plan.label === selectedLabel)) {
      const usable = plans.find(
        (plan) => (plan.status === 'FEASIBLE' || plan.status === 'FEASIBLE_HEURISTIC') && plan.metrics,
      )
      setSelectedLabel(usable?.label ?? plans[0].label)
    }
  }, [plans, selectedLabel])

  useEffect(() => {
    if (!job) return
    if (job.status === 'completed') {
      void queryClient.invalidateQueries({ queryKey: queryKeys.scenario(job.scenario_id) })
      void queryClient.invalidateQueries({ queryKey: queryKeys.scenarios })
      void queryClient.invalidateQueries({ queryKey: queryKeys.overview })
      void refetch()
      toast('Recovery plans ready', 'success', job.message)
    }
    if (job.status === 'failed' || job.status === 'infeasible' || job.status === 'cancelled') {
      void refetch()
    }
  }, [job?.status, job?.scenario_id, queryClient, refetch, job])

  const selected = plans.find((plan) => plan.label === selectedLabel) ?? null

  const changedRows = useMemo(() => {
    if (!selected || !scenario) return []
    const original = new Map(scenario.schedule.map((entry) => [entry.id, entry]))
    const rows = selected.schedule
      ? selected.schedule.map((entry) => ({ entry, before: original.get(entry.id) ?? null }))
      : []
    return rows
      .filter(({ entry, before }) => !before || entry.room_id !== before.room_id || entry.day !== before.day || entry.start_slot !== before.start_slot)
      .filter(({ entry, before }) => {
        if (!changeQuery.trim()) return true
        const needle = changeQuery.toLowerCase()
        return `${entry.course_code} ${entry.group_name} ${entry.teacher_name} ${entry.room_code} ${before?.room_code ?? ''}`.toLowerCase().includes(needle)
      })
  }, [selected, scenario, changeQuery])

  const start = async () => {
    if (!activeId) return
    setStarting(true)
    setRunError(null)
    try {
      const response = await api.optimize(activeId, { weights, time_limit: timeLimit })
      setJobId(response.job.id)
      toast('Solver job queued', 'info', `${response.job.total_plans} plans will be generated.`)
    } catch (caught) {
      setRunError(caught instanceof ApiError ? caught.detail : caught instanceof Error ? caught.message : 'The optimization request failed.')
    } finally {
      setStarting(false)
    }
  }

  const cancel = async () => {
    if (!job) return
    try {
      await api.cancelJob(job.id)
      await refetchJob()
      toast('Cancellation requested', 'info', 'The solver stops between plans; completed plans are kept.')
    } catch (caught) {
      toast('Could not cancel job', 'error', caught instanceof Error ? caught.message : undefined)
    }
  }

  const exportPlan = (label: string) => {
    if (!activeId) return
    const anchor = document.createElement('a')
    anchor.href = api.exportPlanUrl(activeId, label)
    anchor.download = `mirrorworld-plan-${label}.csv`
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    toast('Plan export requested', 'info', `CSV for plan ${label} contains the persisted schedule.`)
  }

  if (!activeId) {
    return (
      <div>
        <header className="mb-5">
          <div className="mb-2 flex items-center gap-2"><span className="telemetry text-cyan/80">Decision engine · CP-SAT</span><Badge tone="neutral">no active run</Badge></div>
          <h1 className="text-[26px] font-semibold leading-[1.1] tracking-[-0.03em] text-ink sm:text-[30px]">Schedule optimizer</h1>
          <p className="mt-2 max-w-3xl text-[12.5px] leading-relaxed text-muted">Choose a simulation run to generate auditable recovery plans. The optimizer never edits the baseline.</p>
        </header>
        <div className="mb-4"><PipelineStrip active="optimize" /></div>
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <Panel>
            <EmptyState
              icon={<SlidersHorizontal className="h-5 w-5" />}
              title="Select a scenario to optimize"
              description="Plans are generated for a specific disrupted timetable. Start from a saved run or create a new disruption."
              action={
                <Link to="/simulation" className="focus-ring inline-flex h-8 items-center gap-2 rounded-md border border-cyan/50 bg-cyan/[0.08] px-3 text-[11.5px] text-cyan">
                  <Sparkles className="h-3.5 w-3.5" /> Open simulation studio
                </Link>
              }
            />
          </Panel>
          <Panel>
            <PanelHeader eyebrow="Saved runs" title="Choose a scenario" subtitle="Selecting a run links it across the workspace." />
            <div className="p-4"><ScenarioSelector label="Active run" /></div>
            <div className="border-t border-lineSoft">
              {(scenariosData?.scenarios ?? []).slice(0, 5).map((item) => (
                <button key={item.id} type="button" onClick={() => useAppStore.getState().setActiveScenario(item.id, item.name)} className="focus-ring flex w-full items-center justify-between gap-2 border-b border-lineSoft px-4 py-2.5 text-left last:border-b-0 hover:bg-subtleHover">
                  <span className="min-w-0">
                    <span className="block truncate text-[10.5px] text-ink">{item.name}</span>
                    <span className="block font-mono text-[8px] text-faint">{item.kind} · {item.plan_count} plans</span>
                  </span>
                  <StatusBadge status={item.status} />
                </button>
              ))}
              {!scenariosData?.scenarios.length && <p className="px-4 py-4 text-[10.5px] text-faint">No saved runs yet.</p>}
            </div>
          </Panel>
        </div>
      </div>
    )
  }

  if (isLoading) return <LoadingBlock label="Loading scenario and recovery plans" rows={7} />
  if (isError || !scenario) {
    return (
      <div className="space-y-4">
        <ErrorState title="Scenario could not be loaded" message={error instanceof Error ? error.message : 'The selected run is unavailable. It may have been removed by a dataset reset.'} onRetry={() => refetch()} />
        <ScenarioSelector />
      </div>
    )
  }

  return (
    <div>
      <header className="mb-5 flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="telemetry text-cyan/80">Decision engine · constraint programming</span>
            <Badge tone="neutral">CP-SAT · seed 42</Badge>
            <StatusBadge status={scenario.status} />
          </div>
          <h1 className="text-[26px] font-semibold leading-[1.1] tracking-[-0.03em] text-ink sm:text-[30px]">Schedule optimizer</h1>
          <p className="mt-2 max-w-3xl text-[12.5px] leading-relaxed text-muted">
            Generate three recovery strategies for <span className="text-ink">{scenario.name}</span>, independently audit every plan against hard constraints, and export the result. Plans B and C use fixed strategies; plan D follows your weights.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ScenarioSelector label="Run" />
          <Button variant="ghost" size="sm" onClick={() => navigate('/simulation')}>Edit scenario</Button>
        </div>
      </header>

      <div className="mb-4"><PipelineStrip active="optimize" scenarioId={scenario.id} /></div>

      <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
        <div className="min-w-0 space-y-5">
          <Panel>
            <PanelHeader eyebrow="Solver configuration" title="Objective weights" subtitle="Used by plan D. Higher weight means the solver spends more objective budget on that term." action={<Badge tone="info">normalized</Badge>} />
            <div className="space-y-4 p-4">
              <Slider
                label="Energy demand"
                value={weights.energy}
                min={0}
                max={1}
                step={0.05}
                onChange={(value) => setWeights((previous) => ({ ...previous, energy: value }))}
                valueLabel={`${Math.round(weights.energy * 100)}%`}
                description="Estimated kWh from room power ratings and session length."
              />
              <Slider
                label="Space utilization"
                value={weights.utilization}
                min={0}
                max={1}
                step={0.05}
                onChange={(value) => setWeights((previous) => ({ ...previous, utilization: value }))}
                valueLabel={`${Math.round(weights.utilization * 100)}%`}
                description="Prefers larger rooms to absorb slack; penalizes opening extra rooms."
              />
              <Slider
                label="Student movement"
                value={weights.movement}
                min={0}
                max={1}
                step={0.05}
                onChange={(value) => setWeights((previous) => ({ ...previous, movement: value }))}
                valueLabel={`${Math.round(weights.movement * 100)}%`}
                description="Walking distance between cohort home zones and assigned buildings."
              />
              <div className="flex items-center justify-between rounded border border-lineSoft bg-subtle px-2.5 py-2">
                <span className="font-mono text-[8px] uppercase tracking-[0.08em] text-faint">Effective split</span>
                <span className="font-mono text-[8.5px] text-muted">
                  {Math.round((weights.energy / Math.max(0.0001, weights.energy + weights.utilization + weights.movement)) * 100)} / {
                    Math.round((weights.utilization / Math.max(0.0001, weights.energy + weights.utilization + weights.movement)) * 100)
                  } / {Math.round((weights.movement / Math.max(0.0001, weights.energy + weights.utilization + weights.movement)) * 100)}
                </span>
              </div>
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-[11px] font-medium text-muted">Time limit</span>
                  <span className="font-mono text-[10px] text-cyan">{timeLimit.toFixed(0)}s per plan</span>
                </div>
                <input
                  type="range"
                  min={2}
                  max={20}
                  step={1}
                  value={timeLimit}
                  onChange={(event) => setTimeLimit(Number(event.target.value))}
                  className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-subtleHover accent-cyan [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-canvas [&::-webkit-slider-thumb]:bg-cyan"
                />
                <div className="mt-1 flex justify-between font-mono text-[8px] text-faint"><span>2s</span><span>20s</span></div>
              </div>
              <div className="flex gap-2">
                <Button variant="primary" className="flex-1" iconLeft={busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />} onClick={start} loading={starting} disabled={busy}>
                  {busy ? 'Solver working…' : plans.length ? 'Regenerate plans' : 'Generate recovery plans'}
                </Button>
                <Tooltip content="Restore default objective weights">
                  <Button variant="secondary" onClick={() => { setWeights(DEFAULT_WEIGHTS); setTimeLimit(8) }} aria-label="Reset solver configuration" disabled={busy}>Reset</Button>
                </Tooltip>
              </div>
              {runError && <ErrorState compact title="Optimization could not start" message={runError} onRetry={start} />}
              <Provenance>
                Solver: OR-Tools CP-SAT. Time limits are per plan; the reported runtime is measured, not estimated. Audits recheck every assignment independently of the solver.
              </Provenance>
            </div>
          </Panel>

          <Panel>
            <PanelHeader eyebrow="Scenario constraints" title="What the solver must respect" subtitle="Hard constraints are never softened." />
            <div className="space-y-2 p-4 text-[10.5px]">
              {[
                ['Room availability', scenario.params.unavailable_room_ids.length ? `${scenario.params.unavailable_room_ids.length} closed rooms` : 'All rooms available'],
                ['Instructor availability', scenario.params.unavailable_teacher_ids.length ? `${scenario.params.unavailable_teacher_ids.length} unavailable instructors` : 'Declared unavailable slots respected'],
                ['Capacity', 'Group size cannot exceed room seats'],
                ['Facility fit', 'Lab type and required equipment enforced'],
                ['Operating window', `Through slot ${scenario.params.operating_end_slot + 1}`],
                ['Lab policy', scenario.params.lab_policy === 'afternoon_only' ? 'Afternoon labs only' : 'Any valid slot'],
              ].map(([label, detail]) => (
                <div key={label} className="flex items-start justify-between gap-3 border-b border-lineSoft pb-2 last:border-b-0 last:pb-0">
                  <span className="flex items-center gap-1.5 text-faint"><CheckCircle2 className="h-3 w-3 text-success/70" /> {label}</span>
                  <span className="text-right font-mono text-[9px] text-muted">{detail}</span>
                </div>
              ))}
            </div>
          </Panel>

          <Panel className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-ink">Scenario burden</span>
              <IssueCount metrics={scenario.metrics} compact />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div><div className="font-mono text-[8px] uppercase tracking-[0.07em] text-faint">Affected</div><div className="mt-0.5 font-mono text-[16px] text-warning">{scenario.affected.counts.sessions}</div></div>
              <div><div className="font-mono text-[8px] uppercase tracking-[0.07em] text-faint">Displaced</div><div className="mt-0.5 font-mono text-[16px] text-critical">{scenario.metrics.unassigned_sessions}</div></div>
            </div>
            <Link to="/comparison" className="focus-ring mt-3 inline-flex items-center gap-1 text-[10px] text-cyan/80 hover:text-cyan">Open scenario comparison <ArrowRight className="h-3 w-3" /></Link>
          </Panel>
        </div>

        <div className="min-w-0 space-y-5">
          {job && busy && <JobProgress job={job} onCancel={cancel} />}
          {job && job.status === 'completed' && <JobProgress job={job} />}
          {job && (job.status === 'failed' || job.status === 'infeasible') && <JobProgress job={job} />}
          {job && job.status === 'cancelled' && <JobProgress job={job} />}
          {job?.warnings?.length ? (
            <div className="rounded-md border border-warning/25 bg-warning/[0.04] px-3 py-2.5">
              <div className="mb-1 flex items-center gap-1.5 font-mono text-[8px] uppercase tracking-[0.08em] text-warning">
                <AlertTriangle className="h-3 w-3" /> Solver warnings
              </div>
              <ul className="space-y-1 text-[9.5px] leading-relaxed text-muted">
                {job.warnings.map((warning) => <li key={warning}>• {warning}</li>)}
              </ul>
              <Button size="xs" variant="secondary" className="mt-2" onClick={start} disabled={busy}>Retry solver</Button>
            </div>
          ) : null}

          {plans.length === 0 && !busy && (
            <Panel>
              <EmptyState
                icon={<SlidersHorizontal className="h-5 w-5" />}
                title={scenario.status === 'infeasible' ? 'No feasible recovery was found' : 'No recovery plans yet'}
                description={
                  scenario.status === 'infeasible'
                    ? 'The scenario could not be repaired under the hard constraints. Review the constraint diagnostics and reduce the disruption scope, then run again.'
                    : 'Configure the objective weights and start the CP-SAT solver. Three plans will be produced and independently audited.'
                }
                action={
                  scenario.status === 'infeasible' ? (
                    <Button size="sm" variant="secondary" onClick={() => navigate('/simulation')}>Revise scenario</Button>
                  ) : (
                    <Button size="sm" variant="primary" onClick={start} loading={starting}>Generate plans</Button>
                  )
                }
              />
              {scenario.affected.counts.sessions > 0 && (
                <div className="border-t border-lineSoft px-5 py-4">
                  <div className="mb-2 font-mono text-[8px] uppercase tracking-[0.08em] text-faint">Scenario diagnostics</div>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(scenario.affected.by_reason).map(([reason, count]) => <Badge key={reason} tone="warning">{reason} · {count}</Badge>)}
                  </div>
                </div>
              )}
            </Panel>
          )}

          {plans.length > 0 && (
            <>
              <div className="grid gap-3 md:grid-cols-3">
                {plans.map((plan) => {
                  const active = selected?.label === plan.label
                  const feasible = (plan.status === 'FEASIBLE' || plan.status === 'FEASIBLE_HEURISTIC') && plan.metrics
                  return (
                    <button
                      key={plan.label}
                      type="button"
                      onClick={() => setSelectedLabel(plan.label)}
                      className={cn(
                        'focus-ring panel relative p-4 text-left transition-all duration-150',
                        active ? 'border-cyan/45 bg-cyan/[0.04]' : 'hover:border-lineHover',
                        !feasible && 'opacity-75',
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="flex items-center gap-2">
                          <span className={cn('flex h-6 w-6 items-center justify-center rounded border font-mono text-[10px] font-semibold', active ? 'border-cyan/50 bg-cyan/10 text-cyan' : 'border-line text-muted')}>{plan.label}</span>
                          <span className="font-mono text-[8px] uppercase tracking-[0.08em] text-faint">{PLAN_STRATEGY_LABEL[plan.strategy] ?? plan.strategy}</span>
                        </span>
                        <StatusBadge status={plan.status} />
                      </div>
                      <div className="mt-2.5 text-[11.5px] font-medium text-ink">{plan.name}</div>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <div>
                          <div className="font-mono text-[7.5px] uppercase tracking-[0.05em] text-faint">Hard issues</div>
                          <div className={cn('font-mono text-[14px]', plan.metrics?.hard_issue_count ? 'text-warning' : 'text-success')}>{plan.metrics?.hard_issue_count ?? '—'}</div>
                        </div>
                        <div>
                          <div className="font-mono text-[7.5px] uppercase tracking-[0.05em] text-faint">Objective</div>
                          <div className="font-mono text-[11px] text-muted">{plan.objective !== null ? fmtNumber(plan.objective, 0) : '—'}</div>
                        </div>
                        <div>
                          <div className="font-mono text-[7.5px] uppercase tracking-[0.05em] text-faint">Energy</div>
                          <div className="font-mono text-[10px] text-muted">{plan.metrics ? `${fmtNumber(plan.metrics.energy_kwh, 0)} kWh` : '—'}</div>
                        </div>
                        <div>
                          <div className="font-mono text-[7.5px] uppercase tracking-[0.05em] text-faint">Audit</div>
                          <div className={cn('inline-flex items-center gap-1 font-mono text-[9px]', plan.audit?.passed ? 'text-success' : 'text-critical')}>
                            {plan.audit?.passed ? <Check className="h-2.5 w-2.5" /> : <X className="h-2.5 w-2.5" />}{plan.audit?.passed ? 'passed' : 'failed'}
                          </div>
                        </div>
                      </div>
                      <div className="mt-2 font-mono text-[8px] text-faint">runtime {fmtNumber(plan.runtime_seconds, 1)}s</div>
                    </button>
                  )
                })}
              </div>

              {selected && (
                <PlanDetail
                  plan={selected}
                  scenario={scenario}
                  campus={campus ?? null}
                  tab={planTab}
                  setTab={setPlanTab}
                  changeQuery={changeQuery}
                  setChangeQuery={setChangeQuery}
                  changedRows={changedRows}
                  onExport={() => exportPlan(selected.label)}
                  onCompare={() => navigate(`/comparison?plan=${selected.label}`)}
                />
              )}
            </>
          )}

          {plans.length === 0 && !busy && scenario.status !== 'infeasible' && (
            <Panel>
              <PanelHeader eyebrow="Method" title="How recovery plans are produced" subtitle="A transparent constraint model, not an opaque heuristic." />
              <div className="grid gap-px bg-lineSoft sm:grid-cols-3">
                {[
                  { icon: Layers3, title: 'Interval model', text: 'Room-choice booleans and integer starts feed no-overlap constraints per room, instructor and cohort.' },
                  { icon: ShieldCheck, title: 'Independent audit', text: 'Each plan is replayed through the same diagnostics used for the baseline.' },
                  { icon: Timer, title: 'Bounded solve', text: 'The solver reports FEASIBLE or OPTIMAL explicitly. No plan is labelled optimal without proof.' },
                ].map((item) => (
                  <div key={item.title} className="bg-panel p-4">
                    <item.icon className="h-4 w-4 text-cyan/80" />
                    <div className="mt-2 text-[11px] font-medium text-ink">{item.title}</div>
                    <p className="mt-1 text-[10px] leading-relaxed text-faint">{item.text}</p>
                  </div>
                ))}
              </div>
              <div className="border-t border-lineSoft px-5 py-3">
                <Link to="/method" className="focus-ring inline-flex items-center gap-1 text-[10px] text-cyan/80 hover:text-cyan">Read the full method <ArrowRight className="h-3 w-3" /></Link>
              </div>
            </Panel>
          )}
        </div>
      </div>
    </div>
  )
}

function PlanDetail({
  plan,
  scenario,
  campus,
  tab,
  setTab,
  changeQuery,
  setChangeQuery,
  changedRows,
  onExport,
  onCompare,
}: {
  plan: Plan
  scenario: ScenarioDetail
  campus: import('../lib/types').CampusPayload | null
  tab: string
  setTab: (tab: string) => void
  changeQuery: string
  setChangeQuery: (value: string) => void
  changedRows: { entry: ScheduleEntry; before: ScheduleEntry | null }[]
  onExport: () => void
  onCompare: () => void
}) {
  const [view, setView] = useState<'group' | 'room'>('group')
  const feasible = (plan.status === 'FEASIBLE' || plan.status === 'FEASIBLE_HEURISTIC') && plan.metrics
  return (
    <>
      <Panel>
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-lineSoft px-5 py-4">
          <div>
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <span className="telemetry text-cyan/80">Plan {plan.label} · {plan.strategy.replace(/_/g, ' ')}</span>
              <StatusBadge status={plan.status} />
              <StatusBadge status={plan.solver_status} />
              <Badge tone={plan.audit?.passed ? 'success' : 'critical'} dot>{plan.audit?.passed ? 'audit passed' : 'audit failed'}</Badge>
              {plan.source === 'constructive_fallback' && <Badge tone="warning">verified heuristic · optimality not proven</Badge>}
            </div>
            <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-ink">{plan.name}</h2>
            <p className="mt-1 text-[10.5px] text-faint">
              Generated {plan.created_at ? new Date(plan.created_at).toLocaleString() : 'in this solver run'} · runtime {fmtNumber(plan.runtime_seconds, 2)}s
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="xs" variant="secondary" iconLeft={<Download className="h-3 w-3" />} onClick={onExport} disabled={!plan.schedule?.length}>Export plan</Button>
            <Button size="xs" variant="primary" iconRight={<ArrowRight className="h-3 w-3" />} onClick={onCompare} disabled={!feasible}>Compare evidence</Button>
          </div>
        </div>
        {!feasible && (
          <div className="border-b border-critical/20 bg-critical/[0.05] px-5 py-3 text-[10.5px] leading-relaxed text-critical/90">
            <div className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /><div><strong className="font-medium">No feasible schedule.</strong> The constraint model is unsatisfiable or the solver hit its time limit without a solution. {plan.warnings[0] ?? 'Review the audit and scenario diagnostics.'}</div></div>
          </div>
        )}
        {plan.metrics && (
          <div className="grid gap-4 p-5 sm:grid-cols-3 lg:grid-cols-6">
            {[
              { label: 'Audit', value: plan.audit?.checks.filter((check) => check.status === 'pass').length ?? 0, suffix: `/${plan.audit?.checks.length ?? 0}`, tone: plan.audit?.passed ? 'success' : 'critical', icon: ShieldCheck },
              { label: 'Hard issues', value: plan.metrics.hard_issue_count, suffix: '', tone: plan.metrics.hard_issue_count ? 'warning' : 'success', icon: AlertTriangle },
              { label: 'Displaced', value: plan.metrics.unassigned_sessions, suffix: '', tone: plan.metrics.unassigned_sessions ? 'critical' : 'success', icon: CircleDashed },
              { label: 'Active util.', value: fmtPct(plan.metrics.active_room_utilization_pct, 1), suffix: '', tone: 'cyan', icon: Gauge },
              { label: 'Energy', value: fmtNumber(plan.metrics.energy_kwh, 0), suffix: 'kWh', tone: 'violet', icon: Zap },
              { label: 'Movement', value: fmtNumber(plan.metrics.movement_km, 2), suffix: 'km', tone: 'muted', icon: Move3d },
            ].map((item) => (
              <div key={item.label}>
                <div className="flex items-center gap-1 font-mono text-[7.5px] uppercase tracking-[0.07em] text-faint"><item.icon className="h-2.5 w-2.5" /> {item.label}</div>
                <div className={cn('mt-1 font-mono text-[17px] font-semibold tabular-nums tracking-[-0.02em]', item.tone === 'success' ? 'text-success' : item.tone === 'critical' ? 'text-critical' : item.tone === 'warning' ? 'text-warning' : item.tone === 'cyan' ? 'text-cyan' : item.tone === 'violet' ? 'text-violet' : 'text-ink')}>
                  {item.value}<span className="ml-0.5 font-mono text-[8px] font-normal text-faint">{item.suffix}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel>
          <PanelHeader eyebrow="Constraint audit" title="Independent verification" subtitle="Every check is recomputed from the plan schedule, not trusted from the solver." action={<Badge tone={plan.audit?.passed ? 'success' : 'critical'}>{plan.audit?.checks.length ?? 0} checks</Badge>} />
          <div className="divide-y divide-lineSoft">
            {(plan.audit?.checks ?? []).map((check) => (
              <div key={check.name} className="flex items-start gap-2.5 px-4 py-2.5">
                <span className={cn('mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border', check.status === 'pass' ? 'border-success/30 bg-success/10 text-success' : 'border-critical/30 bg-critical/10 text-critical')}>
                  {check.status === 'pass' ? <Check className="h-2.5 w-2.5" /> : <X className="h-2.5 w-2.5" />}
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2"><span className="text-[10.5px] font-medium text-ink">{check.name}</span><span className={cn('font-mono text-[8px] uppercase', check.status === 'pass' ? 'text-success' : 'text-critical')}>{check.status}</span></div>
                  <p className="mt-0.5 text-[9.5px] leading-relaxed text-faint">{check.detail}</p>
                </div>
              </div>
            ))}
            {!plan.audit?.checks.length && <p className="px-4 py-4 text-[10.5px] text-faint">No audit data was returned for this plan.</p>}
          </div>
        </Panel>

        <Panel>
          <PanelHeader eyebrow="Objective decomposition" title="What the solver traded off" subtitle="Normalized weights are applied to measured plan terms; values are not improvement percentages." />
          <div className="p-5">
            <ComparisonBars
              rows={[
                { label: 'Hard-constraint issues', baseline: scenario.metrics.hard_issue_count, scenario: plan.metrics?.hard_issue_count ?? 0, plan: null, unit: '' },
                { label: 'Booking collisions', baseline: scenario.metrics.conflicts_total, scenario: plan.metrics?.conflicts_total ?? 0, plan: null, unit: '' },
                { label: 'Displaced sessions', baseline: scenario.metrics.unassigned_sessions, scenario: plan.metrics?.unassigned_sessions ?? 0, plan: null, unit: '' },
                { label: 'Active-room utilisation', baseline: scenario.metrics.active_room_utilization_pct, scenario: plan.metrics?.active_room_utilization_pct ?? 0, plan: null, unit: '%' },
                { label: 'Modelled energy', baseline: scenario.metrics.energy_kwh, scenario: plan.metrics?.energy_kwh ?? 0, plan: null, unit: 'kWh' },
                { label: 'Movement', baseline: scenario.metrics.movement_km, scenario: plan.metrics?.movement_km ?? 0, plan: null, unit: 'km' },
              ]}
            />
            <div className="mt-4 border-t border-lineSoft pt-3">
              <div className="mb-2 font-mono text-[8px] uppercase tracking-[0.08em] text-faint">Applied objective weights</div>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(plan.objective_terms ?? {}).map(([key, value]) => <Badge key={key} tone="neutral">{key} · {fmtNumber(value, 2)}</Badge>)}
              </div>
              <p className="mt-2 text-[9px] leading-relaxed text-faint">Objective terms are normalized across the plan set; they are comparative, not monetary.</p>
            </div>
          </div>
        </Panel>
      </div>

      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-lineSoft px-4 pt-3">
          <Tabs
            value={tab}
            onChange={setTab}
            tabs={[
              { id: 'moves', label: 'Changed assignments', count: changedRows.length },
              { id: 'warnings', label: 'Warnings', count: plan.warnings.length },
              { id: 'schedule', label: 'Recovery timetable' },
            ]}
          />
          <div className="pb-2">
            {tab === 'schedule' && campus && (
              <Segmented size="sm" value={view} onChange={setView} options={[{ value: 'group', label: 'By group' }, { value: 'room', label: 'By room' }]} />
            )}
          </div>
        </div>
        {tab === 'moves' && (
          <>
            <div className="flex items-center gap-2 border-b border-lineSoft px-4 py-2">
              <input value={changeQuery} onChange={(event) => setChangeQuery(event.target.value)} placeholder="Filter moved sessions…" aria-label="Filter changed assignments" className="input-base h-7 max-w-xs text-[10.5px]" />
              <span className="ml-auto font-mono text-[8px] uppercase tracking-[0.07em] text-faint">{changedRows.length} moved of {plan.schedule?.length ?? 0}</span>
            </div>
            {changedRows.length === 0 ? (
              <EmptyState title="No assignments changed" description="This plan preserves every baseline room and slot for the scenario's feasible sessions." />
            ) : (
              <div className="max-h-[360px] overflow-auto scroll-thin">
                <table className="table-dense min-w-[720px]">
                  <thead><tr><th>Course / group</th><th>Before</th><th>After</th><th>Delta</th></tr></thead>
                  <tbody>
                    {changedRows.map(({ entry, before }) => (
                      <tr key={entry.id}>
                        <td><span className="font-mono text-[9.5px] text-ink">{entry.course_code}</span><span className="ml-1.5 text-[9px] text-faint">{entry.group_name}</span></td>
                        <td className="font-mono text-[9px] text-faint">{before ? `${before.room_code ?? 'no room'} · ${before.day_label ?? '—'} ${before.slot_label ?? ''}` : 'not previously scheduled'}</td>
                        <td className="font-mono text-[9px] text-cyan/90">{entry.room_code ?? 'no room'} · {entry.displaced ? 'displaced' : `${entry.day_label} ${entry.slot_label}`}</td>
                        <td><Badge tone={entry.room_id !== before?.room_id ? 'violet' : 'warning'}>{entry.room_id !== before?.room_id ? 'room' : 'time'}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
        {tab === 'warnings' && (
          <div className="p-4">
            {plan.warnings.length ? (
              <ul className="space-y-1.5">{plan.warnings.map((warning) => <li key={warning} className="rounded border border-warning/20 bg-warning/[0.03] px-2.5 py-2 text-[10px] leading-relaxed text-muted">{warning}</li>)}</ul>
            ) : <p className="text-[10.5px] text-faint">No warnings were recorded for this plan.</p>}
            <div className="mt-3 border-t border-lineSoft pt-3">
              <div className="mb-1 font-mono text-[8px] uppercase tracking-[0.08em] text-faint">Assumptions</div>
              {plan.assumptions.length ? <ul className="space-y-1">{plan.assumptions.map((item) => <li key={item} className="text-[10px] leading-relaxed text-faint">• {item}</li>)}</ul> : <p className="text-[10px] text-faint">Inherited from the scenario.</p>}
            </div>
          </div>
        )}
        {tab === 'schedule' && (
          <div className="p-4">
            {campus && plan.schedule?.length ? (
              <TimetableGrid schedule={plan.schedule} campus={campus} days={campus.days} slots={campus.time_slots} initialView={view} allowedViews={['group', 'room']} maxHeight={420} />
            ) : (
              <p className="text-[10.5px] text-faint">No schedule was generated for this plan.</p>
            )}
          </div>
        )}
      </Panel>
    </>
  )
}
