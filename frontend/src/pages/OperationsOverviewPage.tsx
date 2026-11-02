import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  Building2,
  CalendarClock,
  Clock3,
  Database,
  FlaskConical,
  Gauge,
  RefreshCw,
  ScanSearch,
  Users2,
  X,
  Zap,
} from 'lucide-react'
import { useOverview } from '../lib/hooks'
import { useAppStore } from '../store/appStore'
import type { AlertItem, ConflictDetail, Metrics } from '../lib/types'
import { cn, fmtNumber, fmtPct, timeAgo } from '../lib/utils'
import { Badge, Button, EmptyState, ErrorState, LoadingBlock, Modal, Panel, PanelHeader, Tabs, Tooltip } from '../components/ui'
import { KpiCard, IssueCount, PipelineStrip, Provenance, Insight } from '../components/shared'
import { BarMeter, OccupancyHeatmap, UtilizationRing } from '../components/charts'
import { TimetableGrid } from '../components/TimetableGrid'

export function OperationsOverviewPage() {
  const { data, isLoading, isError, error, refetch, isFetching } = useOverview()
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false)
  const [diagTab, setDiagTab] = useState('conflicts')
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const [selectedCell, setSelectedCell] = useState<{ day: number; slot: number } | null>(null)
  const navigate = useNavigate()
  const setActiveScenario = useAppStore((state) => state.setActiveScenario)

  const metrics = data?.metrics
  const campus = data?.campus

  const activeAlerts = useMemo(() => (data?.alerts ?? []).filter((alert) => !dismissed.has(alert.id)), [data?.alerts, dismissed])

  const selected = useMemo(() => {
    if (!data) return null
    const target = selectedCell ?? { day: data.snapshot.day, slot: data.snapshot.slot }
    const cell = data.heatmap.find((item) => item.day === target.day && item.slot === target.slot)
    const day = data.days[target.day]
    const slot = data.time_slots[target.slot]
    const sessions = data.baseline_schedule.filter(
      (entry) => !entry.displaced && entry.day === target.day && (entry.start_slot ?? 0) <= target.slot && target.slot < (entry.start_slot ?? 0) + entry.length,
    )
    const busyRooms = new Set(sessions.map((entry) => entry.room_id))
    const availableRooms = data.rooms.filter((room) => !busyRooms.has(room.id))
    return { cell, day, slot, sessions, availableRooms, target }
  }, [data, selectedCell])

  if (isLoading) {
    return (
      <div className="space-y-5">
        <div className="h-24 animate-pulse rounded-lg border border-line bg-subtle" />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="h-32 animate-pulse rounded-lg border border-line bg-subtle" />
          ))}
        </div>
        <div className="grid gap-5 xl:grid-cols-3">
          <Panel className="xl:col-span-2">
            <LoadingBlock label="Loading campus, timetable and diagnostics" rows={6} />
          </Panel>
          <Panel>
            <LoadingBlock label="Loading alerts" rows={4} />
          </Panel>
        </div>
      </div>
    )
  }

  if (isError || !data || !metrics || !campus) {
    return (
      <div className="space-y-4">
        <ErrorState
          title="Campus operations could not be loaded"
          message={error instanceof Error ? error.message : 'The API did not return the overview payload. Confirm the FastAPI service is running on port 8000.'}
          onRetry={() => refetch()}
        />
        <div className="panel p-5 text-[11.5px] leading-relaxed text-faint">
          Start the backend with <code className="rounded bg-ink/10 px-1.5 py-0.5 font-mono text-cyan">uvicorn app.main:app --reload --port 8000</code> from the{' '}
          <code className="rounded bg-ink/10 px-1.5 py-0.5 font-mono">backend</code> folder. The Vite dev server proxies <code className="rounded bg-ink/10 px-1.5 py-0.5 font-mono">/api</code> to it.
        </div>
      </div>
    )
  }

  const summary = data.summary
  const baseline = metrics
  const heat = data.heatmap
  const peakCell = heat.reduce((best, cell) => (cell.conflicts > (best?.conflicts ?? -1) ? cell : best), heat[0])
  const worstUtil = heat.reduce((best, cell) => (cell.utilization_pct > (best?.utilization_pct ?? -1) ? cell : best), heat[0])
  const totalRoomHours = baseline.occupied_room_hours + baseline.available_room_hours
  const sparks = heat.slice(0, 7).map((cell) => cell.utilization_pct)

  const handleAlert = (alert: AlertItem) => {
    const route = alert.suggested_action?.route
    if (route) navigate(route)
    else if (alert.action === 'optimize') navigate('/optimizer')
    else if (alert.action === 'campus') navigate('/campus')
    else navigate('/simulation')
  }

  return (
    <div>
      <header className="mb-5 flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="telemetry text-cyan/80">Campus digital twin · {data.campus.name}</span>
            <Badge tone="warning">synthetic dataset</Badge>
            <Badge tone="neutral">Fall 2026 · Week 7</Badge>
          </div>
          <h1 className="text-[26px] font-semibold leading-[1.1] tracking-[-0.03em] text-ink sm:text-[30px]">Operations overview</h1>
          <p className="mt-2 max-w-2xl text-[12.5px] leading-relaxed text-muted">
            Baseline integrity, live occupancy and recovery entry points for {summary.buildings} buildings and {summary.rooms} teaching spaces. Every value is derived from the persisted week-7 timetable.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="ghost" iconLeft={<RefreshCw className={cn('h-3.5 w-3.5', isFetching && 'animate-spin')} />} onClick={() => refetch()} loading={isFetching}>
            Refresh
          </Button>
          <Button size="sm" variant="secondary" iconLeft={<ScanSearch className="h-3.5 w-3.5" />} onClick={() => setDiagnosticsOpen(true)}>
            Inspect diagnostics
          </Button>
          <Link to="/simulation" className="focus-ring inline-flex h-8 items-center gap-2 rounded-md border border-cyan/50 bg-[linear-gradient(180deg,rgba(56,217,245,0.22),rgba(79,140,255,0.14))] px-3 text-[11.5px] font-medium text-cyan shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] transition-colors hover:border-cyan/80">
            <FlaskConical className="h-3.5 w-3.5" /> Launch simulation
          </Link>
        </div>
      </header>

      <div className="mb-4">
        <PipelineStrip active="detect" />
      </div>

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <KpiCard
          label="Available rooms"
          value={`${metrics.rooms_available}`}
          unit={`of ${summary.rooms}`}
          icon={<Building2 className="h-3 w-3" />}
          tone="cyan"
          hint={`${fmtNumber(metrics.available_room_hours, 1)} room-hours open across the operating week`}
          footer={<BarMeter value={metrics.rooms_available} max={summary.rooms} tone="cyan" label="Available rooms" />}
          to="/campus"
        />
        <KpiCard
          label="Active classes"
          value={`${metrics.sessions_scheduled}`}
          unit="sessions"
          icon={<CalendarClock className="h-3 w-3" />}
          tone="violet"
          hint={`${summary.courses} courses delivered to ${summary.groups} cohorts`}
          footer={
            <span className="flex items-center justify-between font-mono text-[8.5px] uppercase tracking-[0.06em] text-faint">
              <span>{fmtNumber(metrics.students_total)} students</span>
              <span>{fmtNumber(metrics.rooms_used)} rooms used</span>
            </span>
          }
          to="/campus"
        />
        <KpiCard
          label="Schedule conflicts"
          value={`${metrics.conflicts_total}`}
          unit="collisions"
          icon={<AlertTriangle className="h-3 w-3" />}
          tone={metrics.conflicts_total > 0 ? 'critical' : 'success'}
          hint={`${metrics.conflicts_by_type.room} room · ${metrics.conflicts_by_type.teacher} teacher · ${metrics.conflicts_by_type.group} group`}
          footer={<Badge tone={metrics.conflicts_total > 0 ? 'critical' : 'success'} dot>{metrics.conflicts_total > 0 ? 'requires recovery' : 'baseline clean'}</Badge>}
          onClick={() => setDiagnosticsOpen(true)}
        />
        <KpiCard
          label="Hard-constraint issues"
          value={`${metrics.hard_issue_count}`}
          unit="total"
          icon={<Gauge className="h-3 w-3" />}
          tone={metrics.hard_issue_count > 0 ? 'warning' : 'success'}
          hint={`${metrics.capacity_violations_count} capacity · ${metrics.facility_mismatch_count} facility · ${metrics.availability_violation_count} availability · ${metrics.unassigned_sessions} displaced`}
          footer={<IssueCount metrics={metrics} />}
          onClick={() => setDiagnosticsOpen(true)}
        />
        <KpiCard
          label="Modelled energy"
          value={fmtNumber(metrics.energy_kwh, 0)}
          unit="kWh / wk"
          icon={<Zap className="h-3 w-3" />}
          tone="warning"
          spark={sparks}
          hint={`Peak ${fmtNumber(metrics.peak_kw, 1)} kW · factor ${fmtNumber(metrics.energy_factor, 2)}`}
          footer={<span className="font-mono text-[8.5px] uppercase tracking-[0.06em] text-faint">Estimated from room power ratings</span>}
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-5">
          <Panel>
            <PanelHeader
              eyebrow="Space utilisation · selected week"
              title="Occupancy heatmap"
              subtitle="Percent of all teaching rooms occupied per slot. Select a cell to inspect the live room board. Red markers indicate concurrent booking conflicts in the baseline."
              action={
                <div className="flex items-center gap-2">
                  <Badge tone="neutral">peak {fmtPct(worstUtil?.utilization_pct ?? 0, 0)}</Badge>
                  <Link to="/campus" className="focus-ring inline-flex items-center gap-1 text-[10px] text-cyan/80 hover:text-cyan">
                    Open campus <ArrowUpRight className="h-3 w-3" />
                  </Link>
                </div>
              }
            />
            <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_250px]">
              <div className="min-w-0">
                <OccupancyHeatmap
                  cells={heat}
                  days={data.days}
                  slots={data.time_slots}
                  selected={selected?.target ?? null}
                  onSelect={(cell) => setSelectedCell({ day: cell.day, slot: cell.slot })}
                />
                {peakCell && peakCell.conflicts > 0 && (
                  <div className="mt-4">
                    <Insight tone="warning" title="Highest collision density">
                      {data.days[peakCell.day]?.label} {data.time_slots[peakCell.slot]?.label} — {peakCell.conflicts} conflict{peakCell.conflicts === 1 ? '' : 's'} across {peakCell.sessions} sessions.
                    </Insight>
                  </div>
                )}
              </div>
              <div className="rounded-md border border-lineSoft bg-input p-3.5">
                <div className="flex items-center justify-between">
                  <div className="telemetry">Slot inspector</div>
                  <Tooltip content="Return to the peak demand slot">
                    <button
                      type="button"
                      onClick={() => setSelectedCell(null)}
                      className="focus-ring rounded px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-[0.08em] text-faint hover:text-ink"
                    >
                      reset
                    </button>
                  </Tooltip>
                </div>
                {selected && (
                  <>
                    <div className="mt-2 text-[12px] font-medium text-ink">
                      {selected.day?.label} · {selected.slot?.label}
                    </div>
                    <div className="mt-3 space-y-3">
                      <div>
                        <div className="flex items-baseline justify-between">
                          <span className="text-[10px] text-faint">Room utilisation</span>
                          <span className="font-mono text-[11px] text-cyan">{fmtPct(selected.cell?.utilization_pct ?? 0, 0)}</span>
                        </div>
                        <BarMeter value={selected.cell?.utilization_pct ?? 0} className="mt-1" tone={(selected.cell?.utilization_pct ?? 0) > 75 ? 'critical' : 'cyan'} />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="rounded border border-lineSoft bg-subtle px-2 py-1.5">
                          <div className="font-mono text-[8px] uppercase tracking-[0.06em] text-faint">In session</div>
                          <div className="mt-0.5 font-mono text-[15px] font-semibold text-ink">{selected.sessions.length}</div>
                        </div>
                        <div className="rounded border border-lineSoft bg-subtle px-2 py-1.5">
                          <div className="font-mono text-[8px] uppercase tracking-[0.06em] text-faint">Free rooms</div>
                          <div className="mt-0.5 font-mono text-[15px] font-semibold text-success">{selected.availableRooms.length}</div>
                        </div>
                      </div>
                      <div>
                        <div className="mb-1 font-mono text-[8px] uppercase tracking-[0.06em] text-faint">Rooms in use</div>
                        <div className="flex flex-wrap gap-1">
                          {selected.sessions.slice(0, 10).map((entry) => (
                            <span key={entry.id} className="rounded border border-cyan/20 bg-cyan/[0.05] px-1.5 py-0.5 font-mono text-[8.5px] text-cyan/90">
                              {entry.room_code ?? '—'}
                            </span>
                          ))}
                          {selected.sessions.length > 10 && <span className="font-mono text-[8.5px] text-faint">+{selected.sessions.length - 10}</span>}
                          {!selected.sessions.length && <span className="text-[10px] text-faint">No scheduled sessions.</span>}
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </Panel>

          <Panel>
            <PanelHeader
              eyebrow="Reproducible baseline"
              title="Weekly timetable"
              subtitle={`${data.summary.sessions} sessions generated from the campus model. Cells are coloured by course; overlapping bookings are outlined in red.`}
              action={<Badge tone="neutral">week 7</Badge>}
            />
            <div className="p-4">
              <TimetableGrid schedule={data.baseline_schedule} campus={data} days={data.days} slots={data.time_slots} initialView="group" allowedViews={['group', 'room']} maxHeight={330} compactHeaders />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-lineSoft px-5 py-3">
              <span className="text-[10px] text-faint">
                {metrics.sessions_scheduled} scheduled · {metrics.unassigned_sessions} displaced · {metrics.occupied_room_hours.toFixed(1)}h of room occupancy
              </span>
              <Link to="/campus" className="focus-ring inline-flex items-center gap-1 text-[10.5px] text-cyan/80 hover:text-cyan">
                Explore campus map <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </Panel>

          <div className="grid gap-5 lg:grid-cols-2">
            <Panel>
              <PanelHeader eyebrow="Utilisation" title="Where capacity sits" subtitle="Active-room utilisation uses rooms with at least one booking as the denominator; total-room utilisation includes all teaching rooms." />
              <div className="grid gap-4 p-5 sm:grid-cols-[110px_minmax(0,1fr)]">
                <div className="flex flex-col items-center justify-center">
                  <UtilizationRing value={metrics.active_room_utilization_pct} size={96} stroke={6} label="active" tone={metrics.active_room_utilization_pct > 85 ? 'warning' : 'cyan'} />
                </div>
                <div className="space-y-3">
                  {[
                    { label: 'Seat utilisation', value: metrics.seat_utilization_pct, tone: 'violet' as const, hint: `${fmtNumber(metrics.students_total)} seats of ${fmtNumber(data.summary.seat_capacity)} capacity` },
                    { label: 'Total-room utilisation', value: metrics.room_utilization_pct, tone: 'blue' as const, hint: `${fmtNumber(metrics.occupied_room_hours, 1)} of ${fmtNumber(totalRoomHours, 1)} room-hours` },
                    { label: 'Peak occupancy', value: metrics.peak_utilization_pct, tone: 'warning' as const, hint: metrics.peak_slot_label },
                  ].map((item) => (
                    <div key={item.label}>
                      <div className="mb-1 flex items-center justify-between text-[10.5px]">
                        <span className="text-muted">{item.label}</span>
                        <span className="font-mono text-[10px] tabular-nums text-ink">{fmtPct(item.value)}</span>
                      </div>
                      <BarMeter value={item.value} tone={item.tone} />
                      <div className="mt-0.5 text-[8.5px] text-faint">{item.hint}</div>
                    </div>
                  ))}
                </div>
              </div>
            </Panel>

            <Panel>
              <PanelHeader eyebrow="Teaching load" title="Instructor balance & movement" subtitle="Weekly contact hours are compared with each instructor's declared limit. Movement is a timetable-based estimate from documented building distances, not live tracking." />
              <div className="grid grid-cols-2 gap-4 p-5">
                <div>
                  <div className="telemetry mb-1.5">Max weekly load</div>
                  <div className="font-mono text-[24px] font-semibold tracking-[-0.03em] text-ink">{fmtNumber(metrics.teacher_max_load_h, 1)}<span className="ml-1 text-[9px] uppercase tracking-wide text-faint">h</span></div>
                  <div className="mt-0.5 truncate text-[10px] text-faint">{metrics.teacher_max_load_name ?? '—'}</div>
                  <div className="mt-2 flex items-center gap-1.5">
                    <Badge tone={metrics.teacher_overload_count ? 'warning' : 'success'} dot>
                      {metrics.teacher_overload_count} over limit
                    </Badge>
                  </div>
                </div>
                <div>
                  <div className="telemetry mb-1.5">Workload σ</div>
                  <div className="font-mono text-[24px] font-semibold tracking-[-0.03em] text-ink">{fmtNumber(metrics.teacher_workload_std_h, 2)}<span className="ml-1 text-[9px] uppercase tracking-wide text-faint">h</span></div>
                  <div className="mt-0.5 text-[10px] text-faint">Across {summary.teachers} instructors</div>
                  <div className="mt-2 text-[10px] text-muted">Limit {fmtNumber(metrics.teacher_max_limit_h, 0)}h</div>
                </div>
                <div className="col-span-2 border-t border-lineSoft pt-3">
                  <div className="flex items-baseline justify-between">
                    <span className="text-[10.5px] text-muted">Weekly inter-building movement</span>
                    <span className="font-mono text-[13px] text-cyan">{fmtNumber(metrics.movement_km, 2)} km</span>
                  </div>
                  <div className="mt-1 text-[9px] text-faint">
                    {metrics.total_gap_hours.toFixed(1)} gap-hours across {metrics.gap_pairs} consecutive-session pairs · avg {metrics.avg_gap_hours.toFixed(2)}h
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <Users2 className="h-3 w-3 text-faint" />
                    <span className="text-[9px] text-faint">Derived from production-group home zones and room building coordinates.</span>
                  </div>
                </div>
              </div>
            </Panel>
          </div>
        </div>

        <div className="min-w-0 space-y-5">
          <Panel>
            <PanelHeader
              eyebrow="Decision queue"
              title="Alerts"
              subtitle="Ordered by severity. Each alert links to the relevant workspace."
              action={<Badge tone={activeAlerts.some((alert) => alert.severity === 'critical') ? 'critical' : 'neutral'}>{activeAlerts.length} open</Badge>}
            />
            <div className="max-h-[430px] overflow-y-auto scroll-thin">
              {activeAlerts.length === 0 ? (
                <EmptyState title="No open alerts" description="The current baseline has no unresolved alerts. Refresh to re-evaluate the dataset." action={<Button size="xs" onClick={() => refetch()}>Re-evaluate</Button>} />
              ) : (
                activeAlerts.map((alert) => (
                  <div key={alert.id} className="group border-b border-lineSoft px-4 py-3 last:border-b-0">
                    <div className="flex items-start gap-2.5">
                      <span
                        className={cn(
                          'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border',
                          alert.severity === 'critical'
                            ? 'border-critical/30 bg-critical/10 text-critical'
                            : alert.severity === 'high' || alert.severity === 'medium'
                              ? 'border-warning/30 bg-warning/10 text-warning'
                              : 'border-cyan/25 bg-cyan/10 text-cyan',
                        )}
                      >
                        <AlertTriangle className="h-3 w-3" />
                      </span>
                      <button type="button" onClick={() => handleAlert(alert)} className="focus-ring min-w-0 flex-1 text-left">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[11px] font-medium text-ink">{alert.title}</span>
                          <Badge tone={alert.severity === 'critical' ? 'critical' : alert.severity === 'high' || alert.severity === 'medium' ? 'warning' : 'info'}>
                            {alert.severity_label ?? alert.severity}
                          </Badge>
                          <span className="ml-auto font-mono text-[8px] uppercase tracking-[0.06em] text-faint">{alert.category}</span>
                        </div>
                        <p className="mt-0.5 line-clamp-2 text-[10px] leading-relaxed text-faint">{alert.description ?? alert.detail}</p>
                        {alert.consequences && <p className="mt-1 text-[9px] leading-relaxed text-warning/85">Consequence: {alert.consequences}</p>}
                        {alert.suggested_action?.text && <p className="mt-1 text-[9px] leading-relaxed text-cyan/80">Next: {alert.suggested_action.text}</p>}
                        {!!alert.affected_resources?.length && (
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {alert.affected_resources.slice(0, 5).map((resource) => (
                              <Badge key={`${alert.id}:${resource.type}:${resource.id}`} tone="neutral">{resource.label}</Badge>
                            ))}
                          </div>
                        )}
                        {alert.slot && <div className="mt-1 font-mono text-[8px] text-faint/80">{alert.slot}</div>}
                      </button>
                      <Tooltip content="Dismiss for this view">
                        <button
                          type="button"
                          aria-label={`Dismiss ${alert.title}`}
                          onClick={() => setDismissed((prev) => new Set(prev).add(alert.id))}
                          className="focus-ring rounded p-0.5 text-faint opacity-0 transition-opacity hover:text-ink group-hover:opacity-100"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Tooltip>
                    </div>
                  </div>
                ))
              )}
            </div>
            {dismissed.size > 0 && (
              <div className="border-t border-lineSoft px-4 py-2">
                <button type="button" onClick={() => setDismissed(new Set())} className="focus-ring text-[9.5px] text-cyan/80 hover:text-cyan">
                  Restore {dismissed.size} dismissed alert{dismissed.size === 1 ? '' : 's'}
                </button>
              </div>
            )}
          </Panel>

          <Panel>
            <PanelHeader
              eyebrow="Decision support"
              title="Recommended actions"
              subtitle="Ranked from computed utilisation, capacity, conflict and modelled-energy signals."
              action={<Badge tone="neutral">{data.recommendations?.length ?? 0} actions</Badge>}
            />
            {(data.recommendations ?? []).length === 0 ? (
              <EmptyState title="No recommendation clears its threshold" description="The computed signals are inside their planning bands; no generic advice is generated." />
            ) : (
              <div className="divide-y divide-lineSoft">
                {(data.recommendations ?? []).map((recommendation) => (
                  <div key={recommendation.id} className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[11px] font-medium text-ink">{recommendation.title}</span>
                      <Badge tone={recommendation.confidence === 'high' ? 'success' : 'warning'}>{recommendation.confidence} confidence</Badge>
                    </div>
                    <p className="mt-1 text-[10px] leading-relaxed text-muted">{recommendation.action}</p>
                    <p className="mt-1 text-[9px] leading-relaxed text-faint">{recommendation.rationale}</p>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {recommendation.affected_resources.slice(0, 4).map((resource) => (
                        <Badge key={`${recommendation.id}:${resource.id}`} tone="neutral">{resource.label}</Badge>
                      ))}
                    </div>
                    <Link to={recommendation.route} className="focus-ring mt-1.5 inline-flex items-center gap-1 text-[9px] text-cyan/80 hover:text-cyan">
                      Review in workspace <ArrowRight className="h-2.5 w-2.5" />
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel>
            <PanelHeader
              eyebrow="Experiments"
              title="Recent runs"
              subtitle="Saved counterfactuals with their latest solver outcome."
              action={
                <Link to="/history" className="focus-ring text-[10px] text-cyan/80 hover:text-cyan">
                  All runs
                </Link>
              }
            />
            <div>
              {data.recent_scenarios.length === 0 ? (
                <EmptyState title="No scenarios yet" description="Create a disruption scenario to compare recovery strategies." action={<Link to="/simulation" className="text-[10.5px] text-cyan">Open simulation studio</Link>} />
              ) : (
                data.recent_scenarios.slice(0, 4).map((scenario) => (
                  <button
                    key={scenario.id}
                    type="button"
                    onClick={() => {
                      setActiveScenario(scenario.id, scenario.name)
                      navigate('/comparison')
                    }}
                    className="focus-ring flex w-full items-start gap-2.5 border-b border-lineSoft px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-subtleHover"
                  >
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-cyan/70" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[11px] font-medium text-ink">{scenario.name}</div>
                      <div className="mt-0.5 flex items-center gap-2 font-mono text-[8px] uppercase tracking-[0.04em] text-faint">
                        <span>{scenario.kind}</span>
                        <span>·</span>
                        <span>{scenario.plan_count} plans</span>
                        <span>·</span>
                        <span>{timeAgo(scenario.updated_at)}</span>
                      </div>
                      <div className="mt-1 line-clamp-1 text-[9.5px] text-faint">{scenario.headline}</div>
                    </div>
                    <span className={cn('mt-0.5 shrink-0 rounded border px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-[0.05em]', scenario.status === 'optimized' ? 'border-success/25 bg-success/[0.07] text-success' : 'border-cyan/20 bg-cyan/[0.05] text-cyan/80')}>
                      {scenario.status}
                    </span>
                  </button>
                ))
              )}
            </div>
          </Panel>

          <Panel className="p-4">
            <div className="flex items-start gap-2">
              <Database className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan/70" />
              <div>
                <div className="text-[11px] font-medium text-ink">Model provenance</div>
                <p className="mt-1 text-[10px] leading-relaxed text-faint">
                  {data.campus.dataset_label}. Synthetic institutional data generated from a seeded model; energy and movement values are estimates, not metered readings.
                </p>
                <button type="button" onClick={() => navigate('/method')} className="focus-ring mt-2 inline-flex items-center gap-1 text-[10px] text-cyan/80 hover:text-cyan">
                  Read assumptions <ArrowUpRight className="h-3 w-3" />
                </button>
              </div>
            </div>
          </Panel>
        </div>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Panel>
          <PanelHeader
            eyebrow="Baseline audit"
            title="Hard-constraint ledger"
            subtitle="Counts below are independently recomputed from the schedule, not copied from the seeded conflict labels."
            action={<Button size="xs" variant="ghost" iconLeft={<ScanSearch className="h-3 w-3" />} onClick={() => setDiagnosticsOpen(true)}>Inspect</Button>}
          />
          <div className="grid gap-px bg-lineSoft sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: 'Booking collisions', value: metrics.conflicts_total, hint: `${metrics.conflicts_by_type.room} room · ${metrics.conflicts_by_type.teacher} teacher · ${metrics.conflicts_by_type.group} group`, tone: metrics.conflicts_total ? 'critical' : 'success' },
              { label: 'Capacity breaches', value: metrics.capacity_violations_count, hint: `${metrics.capacity_violations_total} total seats over capacity`, tone: metrics.capacity_violations_count ? 'warning' : 'success' },
              { label: 'Facility mismatches', value: metrics.facility_mismatch_count, hint: 'Lab type or required equipment missing', tone: metrics.facility_mismatch_count ? 'warning' : 'success' },
              { label: 'Unassigned sessions', value: metrics.unassigned_sessions, hint: 'Sessions with no valid room/slot', tone: metrics.unassigned_sessions ? 'critical' : 'success' },
            ].map((item) => (
              <div key={item.label} className="bg-panel p-4">
                <div className="telemetry">{item.label}</div>
                <div className={cn('mt-2 font-mono text-[22px] font-semibold tabular-nums tracking-[-0.03em]', item.tone === 'critical' ? 'text-critical' : item.tone === 'warning' ? 'text-warning' : 'text-success')}>{item.value}</div>
                <div className="mt-1 text-[9.5px] leading-relaxed text-faint">{item.hint}</div>
              </div>
            ))}
          </div>
        </Panel>
        <Panel className="p-4">
          <div className="flex items-center gap-2">
            <Clock3 className="h-3.5 w-3.5 text-cyan/70" />
            <span className="text-[11px] font-medium text-ink">Operating envelope</span>
          </div>
          <div className="mt-3 space-y-2 text-[10.5px]">
            <div className="flex justify-between gap-3"><span className="text-faint">Teaching days</span><span className="font-mono text-muted">{data.days.length}</span></div>
            <div className="flex justify-between gap-3"><span className="text-faint">Slots / day</span><span className="font-mono text-muted">{data.time_slots.length}</span></div>
            <div className="flex justify-between gap-3"><span className="text-faint">Daily window</span><span className="font-mono text-muted">{data.time_slots[0]?.start}–{data.time_slots[data.time_slots.length - 1]?.end}</span></div>
            <div className="flex justify-between gap-3"><span className="text-faint">Utilisation denominator</span><span className="font-mono text-muted">all teaching rooms</span></div>
            <div className="flex justify-between gap-3"><span className="text-faint">Dataset fingerprint</span><span className="font-mono text-muted">{data.fingerprint?.slice(0, 10) ?? '—'}</span></div>
          </div>
          <div className="mt-3 border-t border-lineSoft pt-3">
            <Provenance>No sensitive records. The dataset is synthetic and reproducible from seed 42; no personal student data is modelled.</Provenance>
          </div>
        </Panel>
      </div>

      <DiagnosticsModal
        open={diagnosticsOpen}
        onClose={() => setDiagnosticsOpen(false)}
        tab={diagTab}
        setTab={setDiagTab}
        metrics={metrics}
        days={data.days}
        slots={data.time_slots}
      />
    </div>
  )
}

function DiagnosticsModal({
  open,
  onClose,
  tab,
  setTab,
  metrics,
  days,
  slots,
}: {
  open: boolean
  onClose: () => void
  tab: string
  setTab: (tab: string) => void
  metrics: Metrics
  days: { label: string }[]
  slots: { label: string }[]
}) {
  const conflictsByType = useMemo(() => {
    const groups: Record<string, ConflictDetail[]> = { room: [], teacher: [], group: [] }
    for (const detail of metrics.conflict_details) groups[detail.type]?.push(detail)
    return groups
  }, [metrics.conflict_details])
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Baseline diagnostics"
      description="Independent recomputation from the persisted schedule. Exports are available from the Model & evidence page."
      width="lg"
      footer={
        <>
          <Link to="/method" className="focus-ring mr-auto inline-flex h-8 items-center gap-1 rounded border border-line px-3 text-[10.5px] text-muted hover:text-ink">
            How these checks work <ArrowRight className="h-3 w-3" />
          </Link>
          <Button variant="secondary" onClick={onClose}>Close</Button>
        </>
      }
    >
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'conflicts', label: 'Collisions', count: metrics.conflicts_total },
          { id: 'capacity', label: 'Capacity', count: metrics.capacity_violations_count },
          { id: 'facility', label: 'Facilities', count: metrics.facility_mismatch_count },
          { id: 'availability', label: 'Availability', count: metrics.availability_violation_count },
          { id: 'unassigned', label: 'Displaced', count: metrics.unassigned_sessions },
        ]}
      />
      <div className="mt-3 max-h-[48vh] overflow-y-auto scroll-thin">
        {tab === 'conflicts' && (
          <div className="space-y-4">
            {(['room', 'teacher', 'group'] as const).map((type) => (
              <div key={type}>
                <div className="mb-1.5 flex items-center gap-2 font-mono text-[8.5px] uppercase tracking-[0.1em] text-faint">
                  {type} double-bookings <span className="rounded bg-subtleHover px-1 text-[8px]">{conflictsByType[type].length}</span>
                </div>
                {conflictsByType[type].length === 0 ? (
                  <p className="text-[10.5px] text-faint">None detected.</p>
                ) : (
                  conflictsByType[type].map((detail, index) => (
                    <div key={`${type}-${index}`} className="mb-1.5 rounded border border-critical/15 bg-critical/[0.035] px-2.5 py-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-mono text-[10px] text-critical/90">{detail.resource}</span>
                        <span className="font-mono text-[8.5px] text-faint">{detail.slot_label ?? `${days[detail.day]?.label} ${slots[detail.slot]?.label}`}</span>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                        {detail.sessions.map((session) => (
                          <span key={session.id} className="text-[10px] text-muted">
                            {session.label} <span className="text-faint">· {session.room_code ?? 'no room'}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            ))}
          </div>
        )}
        {tab === 'capacity' && (
          <div className="space-y-1.5">
            {metrics.capacity_details.length === 0 && <p className="text-[10.5px] text-faint">No capacity breaches.</p>}
            {metrics.capacity_details.map((detail) => (
              <div key={detail.session_id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-lineSoft px-2.5 py-2 text-[10.5px]">
                <span className="text-muted">{detail.label} <span className="text-faint">· {detail.room_code}</span></span>
                <span className="font-mono text-[9.5px] text-warning">{detail.group_size}/{detail.capacity} seats (+{detail.violation}) · {detail.slot_label}</span>
              </div>
            ))}
          </div>
        )}
        {tab === 'facility' && (
          <div className="space-y-1.5">
            {metrics.facility_details.length === 0 && <p className="text-[10.5px] text-faint">No facility mismatches.</p>}
            {metrics.facility_details.map((detail) => (
              <div key={detail.session_id} className="rounded border border-lineSoft px-2.5 py-2 text-[10.5px]">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted">{detail.label}</span>
                  <span className="font-mono text-[8.5px] text-faint">{detail.slot_label}</span>
                </div>
                <div className="mt-0.5 text-[9.5px] text-warning/90">{detail.reason}</div>
              </div>
            ))}
          </div>
        )}
        {tab === 'availability' && (
          <div className="space-y-1.5">
            {metrics.availability_details.length === 0 && <p className="text-[10.5px] text-faint">No instructor-availability violations.</p>}
            {metrics.availability_details.map((detail) => (
              <div key={detail.session_id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-lineSoft px-2.5 py-2 text-[10.5px]">
                <span className="text-muted">{detail.teacher_name} <span className="text-faint">· {detail.label}</span></span>
                <span className="font-mono text-[9px] text-warning">{detail.slot_label} · {detail.reason}</span>
              </div>
            ))}
          </div>
        )}
        {tab === 'unassigned' && (
          <div className="space-y-1.5">
            {metrics.unassigned_details.length === 0 && <p className="text-[10.5px] text-faint">Every session has a room and slot.</p>}
            {metrics.unassigned_details.map((detail) => (
              <div key={detail.session_id} className="rounded border border-warning/20 bg-warning/[0.03] px-2.5 py-2 text-[10.5px]">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted">{detail.label}</span>
                  <span className="font-mono text-[8.5px] text-faint">{detail.reason}</span>
                </div>
                <div className="mt-0.5 text-[9.5px] text-faint">{detail.detail}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  )
}
