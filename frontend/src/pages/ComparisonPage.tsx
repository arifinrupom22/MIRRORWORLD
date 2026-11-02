import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Check,
  CheckCircle2,
  Download,
  ExternalLink,
  FileText,
  Gauge,
  Info,
  Layers3,
  Lightbulb,
  Sparkles,
  X,
} from 'lucide-react'
import { api } from '../lib/api'
import { useCampus, useComparison, useScenarios } from '../lib/hooks'
import { useAppStore, toast } from '../store/appStore'
import type { ComparisonRow } from '../lib/types'
import { cn, deltaIntent, fmtNumber } from '../lib/utils'
import { Badge, Button, EmptyState, ErrorState, LoadingBlock, Panel, PanelHeader, Segmented, Tabs } from '../components/ui'
import { ComparisonBars, ParetoChart, type ParetoPoint } from '../components/charts'
import { DifferencePanel } from '../components/DifferencePanel'
import { DataQualityBadge, PipelineStrip, Provenance, ScenarioSelector } from '../components/shared'
import { TimetableGrid } from '../components/TimetableGrid'

const PLAN_COLORS: Record<string, string> = { B: '#8B7CFF', C: '#35D39A', D: '#38D9F5' }

export function ComparisonPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const planParam = searchParams.get('plan')?.toUpperCase() ?? undefined
  const activeId = useAppStore((state) => state.activeScenarioId)
  const { data: scenariosData } = useScenarios()
  const { data: campus } = useCampus()
  const { data, isLoading, isError, error, refetch } = useComparison(activeId, planParam)
  const [tableTab, setTableTab] = useState('all')
  const [scheduleView, setScheduleView] = useState<'group' | 'room'>('group')
  const [scheduleSource, setScheduleSource] = useState<'plan' | 'scenario'>('plan')
  const navigate = useNavigate()

  const plans = data?.plans ?? []
  const selectedPlan = data?.plan ?? null
  const recommendation = data?.recommendation ?? null

  const pareto = useMemo<ParetoPoint[]>(() => {
    return plans
      .filter((plan) => plan.metrics)
      .map((plan) => ({
        label: plan.label,
        name: plan.name,
        energy: plan.metrics?.energy_kwh ?? 0,
        utilization: plan.metrics?.active_room_utilization_pct ?? 0,
        movement: plan.metrics?.movement_km ?? 0,
        rooms: plan.metrics?.rooms_used ?? 0,
        color: PLAN_COLORS[plan.label] ?? '#38D9F5',
        status: plan.status,
      }))
  }, [plans])

  const rows = useMemo(() => {
    if (!data) return []
    if (tableTab === 'all') return data.rows
    if (tableTab === 'hard') {
      return data.rows.filter((row) => ['conflicts_total', 'capacity_violations_count', 'unassigned_sessions', 'hard_issue_count', 'facility_mismatch_count', 'availability_violation_count'].includes(row.key))
    }
    if (tableTab === 'resources') {
      return data.rows.filter((row) => ['rooms_used', 'rooms_available', 'active_room_utilization_pct', 'seat_utilization_pct', 'energy_kwh', 'movement_km'].includes(row.key))
    }
    return data.rows.filter((row) => ['teacher_workload_std_h', 'teacher_max_load_h', 'total_gap_hours', 'movement_km'].includes(row.key))
  }, [data, tableTab])

  const selectPlan = (label: string | null) => {
    if (!activeId) return
    if (label) setSearchParams({ plan: label })
    else setSearchParams({})
  }

  const exportFile = (href: string, name: string) => {
    const anchor = document.createElement('a')
    anchor.href = href
    anchor.download = name
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    toast('Export requested', 'info', `${name} is generated from the stored run.`)
  }

  if (!activeId) {
    return (
      <div>
        <header className="mb-5">
          <div className="mb-2 flex items-center gap-2"><span className="telemetry text-cyan/80">Scenario comparison</span><Badge tone="neutral">no active run</Badge></div>
          <h1 className="text-[26px] font-semibold leading-[1.1] tracking-[-0.03em] text-ink sm:text-[30px]">Scenario comparison</h1>
          <p className="mt-2 max-w-3xl text-[12.5px] leading-relaxed text-muted">Compare a baseline, a disrupted scenario and an optimized recovery plan using independently recomputed metrics.</p>
        </header>
        <div className="mb-4"><PipelineStrip active="compare" /></div>
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
          <Panel><EmptyState icon={<BarChart3 className="h-5 w-5" />} title="No run selected" description="Choose a saved scenario to open its evidence pack. Plans appear only after the optimizer has run." action={<Link to="/simulation" className="focus-ring inline-flex h-8 items-center gap-2 rounded-md border border-cyan/50 bg-cyan/[0.08] px-3 text-[11.5px] text-cyan">Open simulation studio <ArrowRight className="h-3.5 w-3.5" /></Link>} /></Panel>
          <Panel>
            <PanelHeader eyebrow="Scenario library" title="Choose a run" subtitle="Selecting updates the active run across the workspace." />
            <div className="p-4"><ScenarioSelector label="Active run" /></div>
            <div className="border-t border-lineSoft">
              {(scenariosData?.scenarios ?? []).slice(0, 6).map((item) => (
                <button key={item.id} type="button" onClick={() => useAppStore.getState().setActiveScenario(item.id, item.name)} className="focus-ring flex w-full items-center justify-between gap-2 border-b border-lineSoft px-4 py-2.5 text-left last:border-b-0 hover:bg-subtleHover">
                  <span className="min-w-0"><span className="block truncate text-[10.5px] text-ink">{item.name}</span><span className="block font-mono text-[8px] text-faint">{item.kind} · {item.headline}</span></span>
                  <span className="font-mono text-[8px] text-faint">{item.plan_count} plans</span>
                </button>
              ))}
            </div>
          </Panel>
        </div>
      </div>
    )
  }

  if (isLoading) return <LoadingBlock label="Recomputing comparison evidence" rows={8} />
  if (isError || !data) {
    return (
      <div className="space-y-4">
        <ErrorState title="Comparison could not be computed" message={error instanceof Error ? error.message : 'The comparison endpoint failed. The scenario may have been removed by a reset.'} onRetry={() => refetch()} />
        <ScenarioSelector />
      </div>
    )
  }

  const scenario = data.scenario
  const hasPlans = plans.length > 0

  return (
    <div>
      <header className="mb-5 flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="telemetry text-cyan/80">Evidence pack · baseline / scenario / plan</span>
            <DataQualityBadge verified />
            <Badge tone="neutral">{data.dataset.label}</Badge>
          </div>
          <h1 className="text-[26px] font-semibold leading-[1.1] tracking-[-0.03em] text-ink sm:text-[30px]">Scenario comparison</h1>
          <p className="mt-2 max-w-3xl text-[12.5px] leading-relaxed text-muted">
            {scenario.name}. Metrics are recomputed from each persisted schedule; percentages use the baseline as denominator and remain blank when it is zero.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ScenarioSelector label="Run" />
          <Button size="sm" variant="secondary" iconLeft={<Download className="h-3.5 w-3.5" />} onClick={() => exportFile(api.exportScenarioUrl(scenario.id), `mirrorworld-scenario-${scenario.id.slice(0, 6)}.csv`)}>Export CSV</Button>
          <Button size="sm" variant="primary" iconLeft={<FileText className="h-3.5 w-3.5" />} onClick={() => window.open(api.reportUrl(scenario.id), '_blank', 'noopener,noreferrer')}>Printable report</Button>
        </div>
      </header>

      <div className="mb-4"><PipelineStrip active="compare" scenarioId={scenario.id} /></div>

      <div className="mb-4">
        <DifferencePanel difference={data.difference ?? data.scenario.difference} />
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Hard issues" baseline={data.baseline.hard_issue_count} scenario={data.scenario_metrics.hard_issue_count} plan={selectedPlan?.metrics?.hard_issue_count ?? null} unit="" />
        <SummaryCard label="Displaced sessions" baseline={data.baseline.unassigned_sessions} scenario={data.scenario_metrics.unassigned_sessions} plan={selectedPlan?.metrics?.unassigned_sessions ?? null} unit="" />
        <SummaryCard label="Active-room util." baseline={data.baseline.active_room_utilization_pct} scenario={data.scenario_metrics.active_room_utilization_pct} plan={selectedPlan?.metrics?.active_room_utilization_pct ?? null} unit="%" digits={1} />
        <SummaryCard label="Modelled energy" baseline={data.baseline.energy_kwh} scenario={data.scenario_metrics.energy_kwh} plan={selectedPlan?.metrics?.energy_kwh ?? null} unit="kWh" digits={0} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_350px]">
        <div className="min-w-0 space-y-5">
          <Panel>
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-lineSoft px-4 py-3">
              <div>
                <div className="telemetry mb-1">Recovery plan selector</div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-[13px] font-semibold text-ink">{selectedPlan ? `Plan ${selectedPlan.label} · ${selectedPlan.name}` : hasPlans ? 'Automatic plan' : 'Scenario only'}</h2>
                  {selectedPlan && <Badge tone={selectedPlan.audit?.passed ? 'success' : 'critical'} dot>{selectedPlan.audit?.passed ? 'audit passed' : 'audit failed'}</Badge>}
                  {selectedPlan?.source === 'constructive_fallback' && <Badge tone="warning">verified heuristic</Badge>}
                </div>
              </div>
              <div className="flex flex-wrap gap-1">
                {hasPlans ? (
                  <>
                    <button type="button" onClick={() => selectPlan(null)} className={cn('focus-ring rounded border px-2 py-1 font-mono text-[9px]', !planParam ? 'border-cyan/40 bg-cyan/[0.08] text-cyan' : 'border-line text-faint hover:text-ink')}>AUTO</button>
                    {plans.map((plan) => (
                      <button key={plan.label} type="button" onClick={() => selectPlan(plan.label)} className={cn('focus-ring rounded border px-2 py-1 font-mono text-[9px]', planParam === plan.label ? 'border-cyan/40 bg-cyan/[0.08] text-cyan' : 'border-line text-faint hover:text-ink')} title={plan.name}>
                        {plan.label}{recommendation?.label === plan.label && ' ★'}
                      </button>
                    ))}
                  </>
                ) : (
                  <Link to="/optimizer" className="focus-ring text-[10px] text-cyan">Generate plans <ArrowRight className="inline h-3 w-3" /></Link>
                )}
              </div>
            </div>
            <div className="p-4">
              <ComparisonBars
                rows={[
                  { label: 'Hard-constraint issues', baseline: data.baseline.hard_issue_count, scenario: data.scenario_metrics.hard_issue_count, plan: selectedPlan?.metrics?.hard_issue_count ?? null, unit: '' },
                  { label: 'Booking collisions', baseline: data.baseline.conflicts_total, scenario: data.scenario_metrics.conflicts_total, plan: selectedPlan?.metrics?.conflicts_total ?? null, unit: '' },
                  { label: 'Capacity breaches', baseline: data.baseline.capacity_violations_count, scenario: data.scenario_metrics.capacity_violations_count, plan: selectedPlan?.metrics?.capacity_violations_count ?? null, unit: '' },
                  { label: 'Displaced sessions', baseline: data.baseline.unassigned_sessions, scenario: data.scenario_metrics.unassigned_sessions, plan: selectedPlan?.metrics?.unassigned_sessions ?? null, unit: '' },
                  { label: 'Active-room utilisation', baseline: data.baseline.active_room_utilization_pct, scenario: data.scenario_metrics.active_room_utilization_pct, plan: selectedPlan?.metrics?.active_room_utilization_pct ?? null, unit: '%' },
                  { label: 'Estimated energy', baseline: data.baseline.energy_kwh, scenario: data.scenario_metrics.energy_kwh, plan: selectedPlan?.metrics?.energy_kwh ?? null, unit: 'kWh' },
                ]}
              />
            </div>
          </Panel>

          <Panel>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-lineSoft px-4 pt-3">
              <Tabs value={tableTab} onChange={setTableTab} tabs={[{ id: 'all', label: 'All metrics' }, { id: 'hard', label: 'Hard constraints' }, { id: 'resources', label: 'Resources' }, { id: 'balance', label: 'Balance' }]} />
              <span className="pb-2 font-mono text-[8px] uppercase tracking-[0.06em] text-faint">{rows.length} rows</span>
            </div>
            <div className="overflow-x-auto scroll-thin">
              <table className="table-dense min-w-[720px]">
                <thead><tr><th>Metric</th><th className="text-right">Baseline</th><th className="text-right">Scenario</th><th className="text-right">Plan</th><th className="text-right">Scenario Δ</th><th className="text-right">Plan vs base</th></tr></thead>
                <tbody>
                  {rows.map((row) => <ComparisonTableRow key={row.key} row={row} />)}
                </tbody>
              </table>
            </div>
            <div className="border-t border-lineSoft px-4 py-2 text-[9px] leading-relaxed text-faint">
              Δ columns use absolute differences; percentages are omitted where the baseline is zero. “Better” is determined by the metric's documented direction (lower issues/energy, higher utilisation).
            </div>
          </Panel>

          <div className="grid gap-5 lg:grid-cols-2">
            <Panel>
              <PanelHeader eyebrow="Trade-off space" title="Plan frontier" subtitle="Each bubble is a feasible plan; position shows energy versus active-room utilisation and size shows rooms used." action={<Badge tone="neutral">{pareto.length} points</Badge>} />
              <div className="p-3">
                {pareto.length ? (
                  <ParetoChart points={pareto} selected={selectedPlan?.label ?? null} height={270} />
                ) : (
                  <EmptyState title="No feasible plans to plot" description="Run the optimizer to populate the trade-off space." action={<Link to="/optimizer" className="text-[10.5px] text-cyan">Open optimizer</Link>} />
                )}
              </div>
              {pareto.length > 0 && (
                <div className="border-t border-lineSoft px-4 py-2 font-mono text-[8.5px] leading-relaxed text-faint">
                  No point dominates all others: reducing energy can increase movement or reduce space efficiency. Use the recommendation as a defensible starting point, not as a universal optimum.
                </div>
              )}
            </Panel>

            <Panel>
              <PanelHeader eyebrow="Plan audit" title="Independent checks" subtitle="Constraint verification is repeated from the full plan schedule." />
              {selectedPlan?.audit?.checks?.length ? (
                <div className="max-h-[280px] divide-y divide-lineSoft overflow-y-auto scroll-thin">
                  {selectedPlan.audit.checks.map((check) => (
                    <div key={check.name} className="flex items-start gap-2 px-4 py-2.5">
                      <span className={cn('mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border', check.status === 'pass' ? 'border-success/30 bg-success/10 text-success' : 'border-critical/30 bg-critical/10 text-critical')}>{check.status === 'pass' ? <Check className="h-2.5 w-2.5" /> : <X className="h-2.5 w-2.5" />}</span>
                      <div><div className="text-[10px] font-medium text-ink">{check.name}</div><div className="mt-0.5 text-[9px] leading-relaxed text-faint">{check.detail}</div></div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="px-4 py-6 text-[10.5px] text-faint">No plan audit is available. Generate recovery plans first.</div>
              )}
            </Panel>
          </div>

          <Panel>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-lineSoft px-4 pt-3">
              <Tabs value={scheduleSource} onChange={(value) => setScheduleSource(value as 'plan' | 'scenario')} tabs={[{ id: 'plan', label: 'Recovery timetable' }, { id: 'scenario', label: 'Disrupted timetable' }]} />
              <div className="pb-2"><Segmented size="sm" value={scheduleView} onChange={setScheduleView} options={[{ value: 'group', label: 'By group' }, { value: 'room', label: 'By room' }]} /></div>
            </div>
            <div className="p-4">
              {campus ? (
                <TimetableGrid
                  schedule={scheduleSource === 'plan' && selectedPlan?.schedule?.length ? selectedPlan.schedule : data.scenario_schedule}
                  campus={campus}
                  days={campus.days}
                  slots={campus.time_slots}
                  initialView={scheduleView}
                  allowedViews={['group', 'room']}
                  maxHeight={380}
                />
              ) : (
                <div className="flex h-40 items-center justify-center text-[10.5px] text-faint">Campus dimensions are required to render the timetable.</div>
              )}
            </div>
          </Panel>
        </div>

        <div className="min-w-0 space-y-5">
          <Panel className="border-cyan/25 bg-[linear-gradient(180deg,rgba(56,217,245,0.045),transparent_45%)]">
            <PanelHeader
              eyebrow="Decision support"
              title={<span className="flex items-center gap-2"><Lightbulb className="h-3.5 w-3.5 text-cyan" /> {recommendation ? `Recommended: plan ${recommendation.label}` : 'No recommendation yet'}</span>}
              subtitle={recommendation ? recommendation.name : 'A recommendation requires at least one feasible, audited plan.'}
              action={recommendation && <Badge tone="info">score {fmtNumber(recommendation.score, 3)}</Badge>}
            />
            {recommendation ? (
              <div className="p-4">
                <p className="text-[10.5px] leading-relaxed text-muted">{recommendation.rationale}</p>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {Object.entries(recommendation.leaders).map(([key, label]) => (
                    <div key={key} className="rounded border border-lineSoft bg-subtle px-2 py-1.5">
                      <div className="font-mono text-[7.5px] uppercase tracking-[0.06em] text-faint">{key}</div>
                      <div className="mt-0.5 font-mono text-[11px] text-cyan">plan {label}</div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {Object.entries(recommendation.weights).map(([key, value]) => <Badge key={key} tone="neutral">{key} {Math.round(value * 100)}%</Badge>)}
                </div>
                <div className="mt-3 flex gap-2">
                  <Button size="xs" variant="primary" onClick={() => selectPlan(recommendation.label)} disabled={planParam === recommendation.label}>{planParam === recommendation.label ? 'Viewing' : 'View recommended plan'}</Button>
                  <Button size="xs" variant="ghost" onClick={() => navigate('/optimizer')}>Tune weights</Button>
                </div>
                <div className="mt-3 border-t border-lineSoft pt-2 font-mono text-[8px] leading-relaxed text-faint">
                  Score is a weighted normalized distance to the best observed plan values; lower is better. Hard-issue or audit penalties dominate.
                </div>
              </div>
            ) : (
              <div className="p-4">
                <p className="text-[10.5px] leading-relaxed text-faint">Generate recovery plans to receive a weighted recommendation. The optimizer will return an infeasible status rather than invent a plan if constraints cannot be met.</p>
                <Link to="/optimizer" className="focus-ring mt-3 inline-flex items-center gap-1 text-[10px] text-cyan">Open optimizer <ArrowRight className="h-3 w-3" /></Link>
              </div>
            )}
          </Panel>

          <Panel>
            <PanelHeader eyebrow="Narrative" title="What the numbers say" subtitle="Generated from the same metrics and plan selection." />
            <div className="space-y-2 p-4">
              {(data.explanation.statements ?? []).map((statement, index) => (
                <div key={`${statement.title}-${index}`} className={cn('rounded border px-3 py-2.5', statement.tone === 'critical' ? 'border-critical/25 bg-critical/[0.04]' : statement.tone === 'warning' ? 'border-warning/25 bg-warning/[0.04]' : statement.tone === 'positive' ? 'border-success/20 bg-success/[0.03]' : 'border-lineSoft')}>
                  <div className={cn('flex items-center gap-1.5 text-[10px] font-medium', statement.tone === 'critical' ? 'text-critical' : statement.tone === 'warning' ? 'text-warning' : statement.tone === 'positive' ? 'text-success' : 'text-muted')}>
                    {statement.tone === 'critical' || statement.tone === 'warning' ? <AlertTriangle className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
                    {statement.title}
                  </div>
                  <p className="mt-1 text-[10px] leading-relaxed text-faint">{statement.text}</p>
                </div>
              ))}
              {!data.explanation.statements?.length && <p className="text-[10.5px] text-faint">The selected scenario has no material findings.</p>}
            </div>
          </Panel>

          <Panel>
            <PanelHeader eyebrow="Data quality" title="Traceability" subtitle="Known limits of this evidence pack." />
            <div className="space-y-2 p-4">
              {(data.explanation.data_quality ?? []).map((note) => (
                <div key={note} className="flex items-start gap-2 text-[10px] leading-relaxed text-faint"><Info className="mt-0.5 h-3 w-3 shrink-0 text-cyan/60" /> {note}</div>
              ))}
              <Provenance>{data.dataset.source} · {data.dataset.energy_model}. Baseline metrics are stored with the scenario, so comparisons remain stable after later dataset edits.</Provenance>
            </div>
          </Panel>

          <Panel className="p-4">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-[11px] font-medium text-ink"><Download className="h-3.5 w-3.5 text-cyan/70" /> Exports</span>
              <Badge tone="neutral">CSV + HTML</Badge>
            </div>
            <div className="mt-3 space-y-1.5">
              <ExportRow label="Baseline schedule" onClick={() => exportFile(api.exportBaselineUrl(), 'mirrorworld-baseline.csv')} />
              <ExportRow label="Scenario schedule" onClick={() => exportFile(api.exportScenarioUrl(scenario.id), 'mirrorworld-scenario.csv')} />
              <ExportRow label={selectedPlan ? `Plan ${selectedPlan.label} schedule` : 'Recovery plan schedule'} onClick={() => selectedPlan && exportFile(api.exportPlanUrl(scenario.id, selectedPlan.label), `mirrorworld-plan-${selectedPlan.label}.csv`)} disabled={!selectedPlan} />
              <ExportRow label="Printable report" onClick={() => window.open(api.reportUrl(scenario.id), '_blank', 'noopener,noreferrer')} external />
            </div>
            <p className="mt-2 text-[8.5px] leading-relaxed text-faint">Exports reflect the stored run, not a hardcoded sample. Large schedules may take a moment to generate.</p>
          </Panel>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-lineSoft pt-3 font-mono text-[8px] uppercase tracking-[0.08em] text-faint/80">
        <span className="flex items-center gap-1"><Layers3 className="h-2.5 w-2.5" /> three schedules: baseline, disrupted, planned</span>
        <span className="flex items-center gap-1"><Gauge className="h-2.5 w-2.5" /> active-room utilisation complement documented</span>
        <span className="flex items-center gap-1"><Sparkles className="h-2.5 w-2.5" /> recommendation is a heuristic, not a guarantee</span>
      </div>
    </div>
  )
}

function SummaryCard({ label, baseline, scenario, plan, unit, digits = 0 }: { label: string; baseline: number; scenario: number; plan: number | null; unit: string; digits?: number }) {
  const delta = plan !== null ? plan - baseline : scenario - baseline
  const tone = delta === 0 ? 'text-faint' : delta < 0 ? 'text-success' : 'text-critical'
  return (
    <div className="panel p-3.5">
      <div className="telemetry">{label}</div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="font-mono text-[20px] font-semibold tracking-[-0.03em] tabular-nums text-ink">{fmtNumber(plan ?? scenario, digits)}<span className="ml-1 text-[8px] uppercase tracking-[0.06em] text-faint">{unit}</span></span>
        <span className={cn('font-mono text-[9px] tabular-nums', tone)}>{delta > 0 ? '+' : ''}{fmtNumber(delta, digits)}</span>
      </div>
      <div className="mt-1 font-mono text-[8px] text-faint">base {fmtNumber(baseline, digits)} · scenario {fmtNumber(scenario, digits)}</div>
    </div>
  )
}

function ComparisonTableRow({ row }: { row: ComparisonRow }) {
  return (
    <tr>
      <td><span className="text-[10.5px] text-muted">{row.label}</span><span className="ml-1.5 font-mono text-[8px] text-faint">{row.unit}</span></td>
      <td className="text-right font-mono text-[10px] tabular-nums">{fmtNumber(row.baseline, row.unit === '%' ? 1 : 1)}</td>
      <td className="text-right font-mono text-[10px] tabular-nums">{fmtNumber(row.scenario, row.unit === '%' ? 1 : 1)}</td>
      <td className="text-right font-mono text-[10px] tabular-nums text-cyan/90">{row.plan !== null ? fmtNumber(row.plan, row.unit === '%' ? 1 : 1) : '—'}</td>
      <td className="text-right"><DeltaCell delta={row.scenario_delta} /></td>
      <td className="text-right"><DeltaCell delta={row.plan_delta} /></td>
    </tr>
  )
}

function DeltaCell({ delta }: { delta: ComparisonRow['scenario_delta'] | null }) {
  if (!delta) return <span className="font-mono text-[9px] text-faint">—</span>
  if (delta.absolute === null) return <span className="font-mono text-[9px] text-faint">n/a</span>
  return (
    <span className={cn('font-mono text-[9.5px] tabular-nums', deltaIntent(delta) === 'good' ? 'text-success' : deltaIntent(delta) === 'bad' ? 'text-critical' : 'text-faint')}>
      {delta.absolute > 0 ? '+' : ''}{fmtNumber(delta.absolute, 1)}
      {delta.percent !== null && <span className="ml-1 text-[8px] opacity-80">({delta.percent > 0 ? '+' : ''}{fmtNumber(delta.percent, 1)}%)</span>}
    </span>
  )
}

function ExportRow({ label, onClick, disabled, external }: { label: string; onClick: () => void; disabled?: boolean; external?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="focus-ring flex w-full items-center justify-between rounded border border-lineSoft px-2.5 py-1.5 text-[10px] text-muted transition-colors hover:border-line hover:bg-subtleHover disabled:cursor-not-allowed disabled:opacity-40">
      <span>{label}</span>
      {external ? <ExternalLink className="h-3 w-3 text-faint" /> : <Download className="h-3 w-3 text-faint" />}
    </button>
  )
}
