import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Activity, ArrowRight, Clock3, Database, Download, Filter, FlaskConical, History as HistoryIcon, RefreshCw, Search, ShieldCheck, SlidersHorizontal, Sparkles } from 'lucide-react'
import { useHistory } from '../lib/hooks'
import { useAppStore } from '../store/appStore'
import { cn, fmtNumber, fmtDate, timeAgo, statusLabel } from '../lib/utils'
import { Badge, Button, EmptyState, ErrorState, LoadingBlock, Panel, PanelHeader, SearchInput, StatusBadge, Tabs } from '../components/ui'
import { KpiCard, PipelineStrip, Provenance } from '../components/shared'

export function HistoryPage() {
  const { data, isLoading, isError, error, refetch, isFetching } = useHistory()
  const [tab, setTab] = useState('runs')
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [expanded, setExpanded] = useState<number | null>(null)
  const setActiveScenario = useAppStore((state) => state.setActiveScenario)
  const navigate = useNavigate()

  const runs = useMemo(() => {
    if (!data) return []
    const needle = query.trim().toLowerCase()
    return data.runs.filter((run) => {
      if (statusFilter !== 'all' && run.status !== statusFilter) return false
      if (!needle) return true
      return `${run.name} ${run.kind} ${run.status} ${run.headline}`.toLowerCase().includes(needle)
    })
  }, [data, query, statusFilter])

  const logs = useMemo(() => {
    if (!data) return []
    const needle = query.trim().toLowerCase()
    return data.audit.filter((entry) => !needle || `${entry.action} ${entry.actor} ${JSON.stringify(entry.detail)}`.toLowerCase().includes(needle))
  }, [data, query])

  if (isLoading) return <LoadingBlock label="Loading experiment history" rows={7} />
  if (isError || !data) return <ErrorState title="History unavailable" message={error instanceof Error ? error.message : 'The history endpoint could not be loaded.'} onRetry={() => refetch()} />

  const openRun = (id: string, name: string, destination: 'comparison' | 'simulation') => {
    setActiveScenario(id, name)
    navigate(destination === 'comparison' ? '/comparison' : `/simulation?scenario=${id}`)
  }

  const statuses = ['all', ...Array.from(new Set(data.runs.map((run) => run.status)))]

  return (
    <div>
      <header className="mb-5 flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="telemetry text-cyan/80">Experiments · reproducibility log</span>
            <Badge tone="neutral">seeded engine</Badge>
          </div>
          <h1 className="text-[26px] font-semibold leading-[1.1] tracking-[-0.03em] text-ink sm:text-[30px]">Run history</h1>
          <p className="mt-2 max-w-3xl text-[12.5px] leading-relaxed text-muted">
            Every scenario, optimizer job and dataset mutation is recorded. Saved runs keep the baseline snapshot they were created against, so historical comparisons remain honest after model edits.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="ghost" iconLeft={<RefreshCw className={cn('h-3.5 w-3.5', isFetching && 'animate-spin')} />} onClick={() => refetch()}>Refresh</Button>
          <Button size="sm" variant="primary" iconLeft={<FlaskConical className="h-3.5 w-3.5" />} onClick={() => navigate('/simulation')}>New simulation</Button>
        </div>
      </header>

      <div className="mb-4"><PipelineStrip active="simulate" /></div>

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Saved runs" value={data.counts.runs} icon={<HistoryIcon className="h-3 w-3" />} tone="cyan" hint="Simulations persisted in the database" />
        <KpiCard label="Optimized runs" value={data.counts.optimized} icon={<SlidersHorizontal className="h-3 w-3" />} tone="violet" hint="At least one solver pass completed" />
        <KpiCard label="Feasible / simulated" value={data.counts.feasible_runs} icon={<Sparkles className="h-3 w-3" />} tone="success" hint="Runs with a valid scenario record" />
        <KpiCard label="Audit entries" value={data.audit.length} icon={<ShieldCheck className="h-3 w-3" />} tone="warning" hint="Timestamped mutations and jobs" />
      </div>

      <Panel>
        <div className="flex flex-col gap-2 border-b border-lineSoft px-4 pt-3 lg:flex-row lg:items-center">
          <Tabs
            value={tab}
            onChange={(value) => { setTab(value); setExpanded(null) }}
            tabs={[{ id: 'runs', label: 'Experiment runs', count: data.runs.length }, { id: 'audit', label: 'Audit trail', count: data.audit.length }]}
            className="flex-1 border-b-0"
          />
          <div className="flex flex-wrap items-center gap-2 pb-2.5">
            <SearchInput value={query} onChange={setQuery} placeholder={tab === 'runs' ? 'Search runs…' : 'Search audit events…'} className="w-full sm:w-56" ariaLabel="Search history" />
            {tab === 'runs' && (
              <label className="flex items-center gap-1.5">
                <Filter className="h-3 w-3 text-faint" />
                <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filter by status" className="input-base h-9 w-32 text-[10.5px]">
                  {statuses.map((status) => <option key={status} value={status}>{status === 'all' ? 'All statuses' : statusLabel(status)}</option>)}
                </select>
              </label>
            )}
          </div>
        </div>

        {tab === 'runs' && (
          runs.length === 0 ? (
            <EmptyState icon={<Search className="h-5 w-5" />} title="No runs match" description={data.runs.length ? 'Adjust the search or status filter.' : 'Create a scenario to start building the experiment log.'} action={<Button size="xs" onClick={() => { setQuery(''); setStatusFilter('all') }}>Clear filters</Button>} />
          ) : (
            <div className="overflow-x-auto scroll-thin">
              <table className="table-dense min-w-[860px]">
                <thead><tr><th>Run</th><th>Kind</th><th>Status</th><th className="text-right">Affected</th><th className="text-right">Plans</th><th className="text-right">Energy</th><th>Updated</th><th className="text-right">Open</th></tr></thead>
                <tbody>
                  {runs.map((run) => (
                    <tr key={run.id} className="group">
                      <td>
                        <div className="flex items-center gap-2">
                          <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: run.status === 'optimized' ? '#35D39A' : run.status === 'infeasible' ? '#FF647C' : '#38D9F5' }} />
                          <div className="min-w-0">
                            <div className="truncate text-[10.5px] font-medium text-ink">{run.name}</div>
                            <div className="mt-0.5 line-clamp-1 max-w-[320px] text-[9px] text-faint">{run.headline}</div>
                          </div>
                        </div>
                      </td>
                      <td><Badge tone="neutral">{run.kind}</Badge></td>
                      <td><StatusBadge status={run.status} /></td>
                      <td className="text-right font-mono text-[10px] tabular-nums">{run.affected_count}</td>
                      <td className="text-right font-mono text-[10px] tabular-nums">{run.plan_count}</td>
                      <td className="text-right font-mono text-[10px] tabular-nums">{run.energy_kwh !== undefined && run.energy_kwh !== null ? `${fmtNumber(run.energy_kwh, 0)} kWh` : '—'}</td>
                      <td><span className="font-mono text-[8.5px] text-faint" title={fmtDate(run.updated_at)}>{timeAgo(run.updated_at)}</span></td>
                      <td className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="xs" variant="ghost" onClick={() => openRun(run.id, run.name, 'simulation')}>Studio</Button>
                          <Button size="xs" variant="secondary" iconRight={<ArrowRight className="h-2.5 w-2.5" />} onClick={() => openRun(run.id, run.name, 'comparison')} disabled={!run.has_plans}>Evidence</Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}

        {tab === 'audit' && (
          logs.length === 0 ? (
            <EmptyState icon={<Activity className="h-5 w-5" />} title="No audit entries match" description="Clear the search field to see every recorded event." action={<Button size="xs" onClick={() => setQuery('')}>Clear search</Button>} />
          ) : (
            <div className="max-h-[560px] overflow-y-auto scroll-thin">
              {logs.map((entry) => (
                <div key={entry.id} className="border-b border-lineSoft last:border-b-0">
                  <button
                    type="button"
                    onClick={() => setExpanded((current) => (current === entry.id ? null : entry.id))}
                    className="focus-ring flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-subtleHover"
                  >
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border border-line bg-subtle text-cyan/80"><Activity className="h-3 w-3" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-[9.5px] uppercase tracking-[0.04em] text-ink">{entry.action.replace(/_/g, ' ')}</span>
                        {entry.scenario_id && <span className="font-mono text-[8px] text-faint">run {entry.scenario_id.slice(0, 8)}</span>}
                      </span>
                      <span className="mt-0.5 block font-mono text-[8.5px] text-faint">{fmtDate(entry.timestamp)} · {entry.actor}</span>
                    </span>
                    <span className="mt-0.5 flex items-center gap-1 font-mono text-[8px] text-faint"><Clock3 className="h-2.5 w-2.5" /> {timeAgo(entry.timestamp)}</span>
                  </button>
                  {expanded === entry.id && (
                    <div className="border-t border-lineSoft bg-input px-12 py-2.5">
                      {Object.keys(entry.detail).length === 0 ? <p className="text-[9.5px] text-faint">No additional detail stored.</p> : (
                        <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
                          {Object.entries(entry.detail).map(([key, value]) => (
                            <div key={key} className="flex items-baseline gap-2 text-[9.5px]">
                              <dt className="shrink-0 font-mono text-[8px] uppercase tracking-[0.05em] text-faint">{key}</dt>
                              <dd className="min-w-0 truncate text-muted" title={typeof value === 'string' ? value : JSON.stringify(value)}>{typeof value === 'string' ? value : JSON.stringify(value)}</dd>
                            </div>
                          ))}
                        </dl>
                      )}
                      {entry.scenario_id && <button type="button" onClick={() => openRun(entry.scenario_id as string, entry.scenario_id?.slice(0, 8) ?? 'Run', 'comparison')} className="focus-ring mt-2 inline-flex items-center gap-1 text-[9.5px] text-cyan/80 hover:text-cyan">Open related run <ArrowRight className="h-3 w-3" /></button>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )
        )}
      </Panel>

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Panel>
          <PanelHeader eyebrow="Reproducibility" title="What is stored with each run" subtitle="Enough context to re-derive the result after the session ends." />
          <div className="grid gap-px bg-lineSoft sm:grid-cols-3">
            {[
              { title: 'Inputs', text: 'Scenario kind, parameters and analyst notes.' },
              { title: 'Baseline snapshot', text: 'Metrics and schedule captured when the run was created.' },
              { title: 'Outputs', text: 'Scenario schedule, affected graph, warnings and plans with audits.' },
            ].map((item) => (
              <div key={item.title} className="bg-panel p-4"><Database className="h-4 w-4 text-cyan/70" /><div className="mt-2 text-[11px] font-medium text-ink">{item.title}</div><p className="mt-1 text-[10px] leading-relaxed text-faint">{item.text}</p></div>
            ))}
          </div>
          <div className="px-5 py-4"><Provenance>Runs are stored in SQLite for this local prototype, not shared across devices. The schema is PostgreSQL-compatible through SQLAlchemy.</Provenance></div>
        </Panel>
        <Panel className="p-4">
          <div className="flex items-center gap-2 text-[11px] font-medium text-ink"><ShieldCheck className="h-3.5 w-3.5 text-success/80" /> Audit integrity</div>
          <p className="mt-1.5 text-[9.5px] leading-relaxed text-faint">
            Audit events are append-only at application level. A dataset reset clears them because the demo database is rebuilt; exports generated before a reset are unaffected.
          </p>
          <div className="mt-3 border-t border-lineSoft pt-2 font-mono text-[8px] uppercase tracking-[0.06em] text-faint">Latest event · {data.audit[0] ? timeAgo(data.audit[0].timestamp) : 'none'}</div>
        </Panel>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-lineSoft pt-3 font-mono text-[8px] uppercase tracking-[0.08em] text-faint/80">
        <span className="flex items-center gap-1"><Database className="h-2.5 w-2.5" /> SQLite persistence</span>
        <span className="flex items-center gap-1"><Download className="h-2.5 w-2.5" /> exports generated on demand</span>
        <span className="flex items-center gap-1"><ShieldCheck className="h-2.5 w-2.5" /> synthetic data only</span>
      </div>
    </div>
  )
}
