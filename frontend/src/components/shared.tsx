import { Link } from 'react-router-dom'
import {
  ArrowRight,
  Check,
  CircleDot,
  Database,
  FlaskConical,
  Gauge,
  Info,
  Loader2,
  TriangleAlert,
  X,
} from 'lucide-react'
import type { ReactNode } from 'react'
import type { Job, Metrics, ScenarioSummary } from '../lib/types'
import { useScenarios } from '../lib/hooks'
import { useAppStore } from '../store/appStore'
import { cn, fmtNumber, fmtPct, statusTone } from '../lib/utils'
import { Badge, Button, ProgressBar, Select, StatusBadge, Tooltip } from './ui'
import { Sparkline } from './charts'

/* -------------------------------------------------------------------------- */
/* KPI card                                                                    */
/* -------------------------------------------------------------------------- */

export function KpiCard({
  label,
  value,
  unit,
  hint,
  icon,
  tone = 'neutral',
  spark,
  delta,
  footer,
  to,
  onClick,
}: {
  label: string
  value: ReactNode
  unit?: string
  hint?: ReactNode
  icon?: ReactNode
  tone?: 'neutral' | 'cyan' | 'success' | 'warning' | 'critical' | 'violet'
  spark?: number[]
  delta?: ReactNode
  footer?: ReactNode
  to?: string
  onClick?: () => void
}) {
  const tones = {
    neutral: 'text-ink',
    cyan: 'text-cyan',
    success: 'text-success',
    warning: 'text-warning',
    critical: 'text-critical',
    violet: 'text-violet',
  }
  const contents = (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className="telemetry">{label}</div>
        <span className={cn('flex h-6 w-6 items-center justify-center rounded border border-line bg-subtle', tones[tone])}>{icon ?? <Gauge className="h-3 w-3" />}</span>
      </div>
      <div className="mt-3 flex items-end justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-baseline gap-1.5">
            <span className={cn('font-mono text-[26px] font-semibold leading-none tracking-[-0.035em] tabular-nums', tones[tone])}>{value}</span>
            {unit && <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-faint">{unit}</span>}
          </div>
          {delta && <div className="mt-1.5">{delta}</div>}
        </div>
        {spark && spark.length > 1 && <Sparkline values={spark} tone={tone === 'neutral' ? 'cyan' : tone} ariaLabel={`${label} trend`} className="opacity-75" />}
      </div>
      {hint && <div className="mt-2.5 text-[10.5px] leading-snug text-faint">{hint}</div>}
      {footer && <div className="mt-3 border-t border-lineSoft pt-2.5">{footer}</div>}
    </>
  )
  const className = cn(
    'panel group relative block min-w-0 p-4 text-left transition-colors duration-150',
    (to || onClick) && 'focus-ring hover:border-lineHover hover:bg-subtleHover',
  )
  if (to) {
    return (
      <Link to={to} className={className}>
        {contents}
      </Link>
    )
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={className}>
        {contents}
      </button>
    )
  }
  return <div className={className}>{contents}</div>
}

/* -------------------------------------------------------------------------- */
/* Active run banner                                                           */
/* -------------------------------------------------------------------------- */

export function ActiveScenarioBanner({ compact = false }: { compact?: boolean }) {
  const activeId = useAppStore((state) => state.activeScenarioId)
  const activeName = useAppStore((state) => state.activeScenarioName)
  const { data } = useScenarios()
  const current = data?.scenarios.find((scenario) => scenario.id === activeId)

  if (!activeId) {
    return (
      <div className="flex flex-col items-start justify-between gap-3 rounded-lg border border-dashed border-line bg-subtle px-4 py-3 sm:flex-row sm:items-center">
        <div className="flex items-start gap-2.5">
          <FlaskConical className="mt-0.5 h-4 w-4 shrink-0 text-cyan/70" />
          <div>
            <div className="text-[11.5px] font-medium text-ink">No scenario selected</div>
            <p className="mt-0.5 text-[10.5px] text-faint">Configure a disruption in Simulation Studio to begin. Plans, comparisons and dependency overlays are linked to a run.</p>
          </div>
        </div>
        <Button size="xs" variant="primary" iconRight={<ArrowRight className="h-3 w-3" />} onClick={() => (window.location.href = '/simulation')}>
          Open studio
        </Button>
      </div>
    )
  }

  return (
    <div className={cn('rounded-lg border border-cyan/20 bg-cyan/[0.035]', compact ? 'px-3.5 py-2.5' : 'px-4 py-3')}>
      <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5">
          <span className="flex items-center gap-1.5 font-mono text-[8.5px] uppercase tracking-[0.12em] text-cyan/80">
            <CircleDot className="h-3 w-3" /> Active run
          </span>
          <span className="truncate text-[12px] font-medium text-ink">{current?.name ?? activeName}</span>
          {current && <StatusBadge status={current.status} />}
          {current && <Badge tone="neutral">{current.kind}</Badge>}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Link to="/comparison" className="focus-ring inline-flex h-7 items-center gap-1 rounded border border-line bg-subtle px-2 text-[10px] text-muted hover:text-ink">
            Compare <ArrowRight className="h-2.5 w-2.5" />
          </Link>
          <Link to="/optimizer" className="focus-ring inline-flex h-7 items-center gap-1 rounded border border-line bg-subtle px-2 text-[10px] text-muted hover:text-ink">
            Plans <ArrowRight className="h-2.5 w-2.5" />
          </Link>
        </div>
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Scenario selector                                                           */
/* -------------------------------------------------------------------------- */

export function ScenarioSelector({
  className,
  label = 'Scenario',
  allowBaseline = false,
}: {
  className?: string
  label?: string
  allowBaseline?: boolean
}) {
  const activeId = useAppStore((state) => state.activeScenarioId)
  const setActive = useAppStore((state) => state.setActiveScenario)
  const { data, isLoading } = useScenarios()
  const scenarios = data?.scenarios ?? []
  return (
    <label className={cn('flex items-center gap-2', className)}>
      <span className="font-mono text-[8px] uppercase tracking-[0.1em] text-faint">{label}</span>
      <Select
        value={activeId ?? ''}
        aria-label="Select scenario"
        className="h-8 min-w-[210px] text-[11px]"
        disabled={isLoading || (!scenarios.length && !allowBaseline)}
        onChange={(event) => {
          const scenario = scenarios.find((item) => item.id === event.target.value)
          if (scenario) setActive(scenario.id, scenario.name)
        }}
      >
        {!activeId && <option value="">{isLoading ? 'Loading runs…' : scenarios.length ? 'Select a run…' : 'No runs yet'}</option>}
        {scenarios.map((scenario) => (
          <option key={scenario.id} value={scenario.id}>
            {scenario.name} · {scenario.status}
          </option>
        ))}
      </Select>
    </label>
  )
}

export function ScenarioChips({
  scenarios,
  activeId,
  onSelect,
  limit = 6,
}: {
  scenarios: ScenarioSummary[]
  activeId: string | null
  onSelect: (scenario: ScenarioSummary) => void
  limit?: number
}) {
  if (!scenarios.length) return <span className="text-[10.5px] text-faint">No saved runs.</span>
  return (
    <div className="flex flex-wrap gap-1.5">
      {scenarios.slice(0, limit).map((scenario) => (
        <button
          key={scenario.id}
          type="button"
          onClick={() => onSelect(scenario)}
          className={cn(
            'focus-ring flex items-center gap-1.5 rounded border px-2 py-1 text-[10px] transition-colors',
            activeId === scenario.id ? 'border-cyan/40 bg-cyan/[0.09] text-cyan' : 'border-line bg-subtle text-muted hover:border-lineHover',
          )}
        >
          <span className={cn('h-1.5 w-1.5 rounded-full', activeId === scenario.id ? 'bg-cyan' : 'bg-faint/60')} />
          {scenario.name}
        </button>
      ))}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Pipeline                                                                    */
/* -------------------------------------------------------------------------- */

export function PipelineStrip({ active, scenarioId }: { active: 'model' | 'detect' | 'simulate' | 'optimize' | 'compare'; scenarioId?: string | null }) {
  const stages = [
    { key: 'model', label: 'Model', path: '/model', detail: 'Campus graph' },
    { key: 'detect', label: 'Detect', path: '/', detail: 'Baseline' },
    { key: 'simulate', label: 'Simulate', path: '/simulation', detail: 'Counterfactual' },
    { key: 'optimize', label: 'Optimize', path: '/optimizer', detail: 'CP-SAT plans' },
    { key: 'compare', label: 'Compare', path: '/comparison', detail: 'Evidence' },
  ] as const
  const activeIndex = stages.findIndex((stage) => stage.key === active)
  return (
    <div className="no-scrollbar flex items-center gap-1 overflow-x-auto rounded-lg border border-line bg-input px-2 py-1.5">
      {stages.map((stage, index) => {
        const complete = index < activeIndex
        const current = index === activeIndex
        const href = stage.path === '/simulation' && scenarioId ? `/simulation?scenario=${scenarioId}` : stage.path
        return (
          <div key={stage.key} className="flex items-center">
            <Link
              to={href}
              className={cn(
                'focus-ring group flex items-center gap-2 rounded px-2 py-1 transition-colors',
                current ? 'bg-cyan/[0.1]' : 'hover:bg-subtleHover',
              )}
              aria-current={current ? 'step' : undefined}
            >
              <span
                className={cn(
                  'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border font-mono text-[7.5px]',
                  complete
                    ? 'border-success/40 bg-success/15 text-success'
                    : current
                      ? 'border-cyan/50 bg-cyan/15 text-cyan'
                      : 'border-line text-faint',
                )}
              >
                {complete ? <Check className="h-2.5 w-2.5" /> : index + 1}
              </span>
              <span className="hidden sm:block">
                <span className={cn('block font-mono text-[8px] uppercase tracking-[0.1em]', current ? 'text-cyan' : complete ? 'text-muted' : 'text-faint')}>{stage.label}</span>
                <span className="block text-[8px] text-faint/80">{stage.detail}</span>
              </span>
            </Link>
            {index < stages.length - 1 && <span className="mx-0.5 h-px w-3 bg-line sm:w-5" />}
          </div>
        )
      })}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Job progress                                                                */
/* -------------------------------------------------------------------------- */

export function JobProgress({
  job,
  onCancel,
  cancelling,
}: {
  job: Job
  onCancel?: () => void
  cancelling?: boolean
}) {
  const status = job.status
  const busy = status === 'queued' || status === 'running' || status === 'cancelling'
  const complete = status === 'completed'
  const failed = status === 'failed' || status === 'infeasible' || status === 'cancelled'
  return (
    <div
      className={cn(
        'rounded-lg border p-4',
        failed ? 'border-critical/30 bg-critical/[0.045]' : complete ? 'border-success/25 bg-success/[0.04]' : 'border-cyan/25 bg-cyan/[0.035]',
      )}
      aria-live="polite"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-start gap-2.5">
          <span
            className={cn(
              'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border',
              failed ? 'border-critical/40 text-critical' : complete ? 'border-success/40 text-success' : 'border-cyan/40 text-cyan',
            )}
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : failed ? <X className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[12px] font-medium text-ink">
                {status === 'queued' && 'Job queued'}
                {status === 'running' && 'CP-SAT solver running'}
                {status === 'cancelling' && 'Cancelling solver…'}
                {status === 'completed' && 'Recovery plans generated'}
                {status === 'infeasible' && 'No feasible plan found'}
                {status === 'failed' && 'Optimization failed'}
                {status === 'cancelled' && 'Optimization cancelled'}
              </span>
              <StatusBadge status={status} />
            </div>
            <p className="mt-1 text-[10.5px] leading-relaxed text-faint">{job.message}</p>
          </div>
        </div>
        {busy && onCancel && (
          <Button size="xs" variant="ghost" onClick={onCancel} loading={cancelling}>
            Cancel
          </Button>
        )}
      </div>
      <div className="mt-3">
        <ProgressBar
          value={job.total_plans ? (job.plans_done / job.total_plans) * 100 : undefined}
          indeterminate={busy && !job.total_plans}
          tone={failed ? 'critical' : complete ? 'success' : 'info'}
        />
        <div className="mt-1.5 flex items-center justify-between font-mono text-[8.5px] uppercase tracking-[0.06em] text-faint">
          <span>{job.stage}</span>
          <span>
            {job.plans_done}/{job.total_plans || 3} plans · limit {fmtNumber(job.time_limit, 0)}s
          </span>
        </div>
      </div>
      {job.error && <div className="mt-3 rounded border border-critical/20 bg-critical/[0.06] px-3 py-2 text-[10.5px] leading-relaxed text-critical/90">{job.error}</div>}
      {job.diagnostics.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {job.diagnostics.map((item, index) => (
            <div key={`${item.constraint}-${index}`} className="flex items-start gap-2 text-[10px] leading-relaxed">
              <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0 text-warning" />
              <span className="text-muted">
                <span className="font-mono text-[9px] uppercase tracking-[0.05em] text-warning">{item.label}</span> — {item.detail}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Data notes                                                                  */
/* -------------------------------------------------------------------------- */

export function Provenance({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-start gap-2 rounded border border-lineSoft bg-subtle px-3 py-2 text-[9.5px] leading-relaxed text-faint', className)}>
      <Database className="mt-0.5 h-3 w-3 shrink-0 text-faint/80" />
      <span>{children}</span>
    </div>
  )
}

export function InlineMetric({
  label,
  value,
  tone,
  hint,
}: {
  label: string
  value: ReactNode
  tone?: 'critical' | 'warning' | 'success' | 'cyan' | 'muted'
  hint?: string
}) {
  const colors = {
    critical: 'text-critical',
    warning: 'text-warning',
    success: 'text-success',
    cyan: 'text-cyan',
    muted: 'text-muted',
  }
  return (
    <div className="min-w-0">
      <div className="font-mono text-[8px] uppercase tracking-[0.09em] text-faint">{label}</div>
      <div className={cn('mt-1 font-mono text-[15px] font-semibold tabular-nums tracking-[-0.02em]', tone ? colors[tone] : 'text-ink')}>{value}</div>
      {hint && <div className="mt-0.5 truncate text-[9px] text-faint">{hint}</div>}
    </div>
  )
}

export function MetricGrid({ metrics, columns = 4 }: { metrics: { label: string; value: ReactNode; tone?: 'critical' | 'warning' | 'success' | 'cyan' | 'muted' }[]; columns?: number }) {
  return (
    <div className={cn('grid gap-4', columns === 4 ? 'grid-cols-2 sm:grid-cols-4' : columns === 3 ? 'grid-cols-3' : 'grid-cols-2')}>
      {metrics.map((metric) => (
        <InlineMetric key={metric.label} {...metric} />
      ))}
    </div>
  )
}

export function Insight({ tone = 'info', title, children }: { tone?: 'info' | 'warning' | 'critical' | 'success'; title: string; children: ReactNode }) {
  const styles = {
    info: 'border-cyan/20 bg-cyan/[0.035] text-cyan',
    warning: 'border-warning/25 bg-warning/[0.045] text-warning',
    critical: 'border-critical/25 bg-critical/[0.045] text-critical',
    success: 'border-success/25 bg-success/[0.04] text-success',
  }
  return (
    <div className={cn('rounded-md border px-3.5 py-3', styles[tone])}>
      <div className="flex items-center gap-1.5 text-[11px] font-medium">
        <Info className="h-3.5 w-3.5" /> {title}
      </div>
      <div className="mt-1.5 text-[11px] leading-relaxed text-muted">{children}</div>
    </div>
  )
}

export function ToneText({ tone, children }: { tone: 'critical' | 'warning' | 'success' | 'cyan' | 'muted'; children: ReactNode }) {
  const colors = { critical: 'text-critical', warning: 'text-warning', success: 'text-success', cyan: 'text-cyan', muted: 'text-muted' }
  return <span className={cn('font-mono tabular-nums', colors[tone])}>{children}</span>
}

export function IssueCount({ metrics, compact = false }: { metrics: Metrics | null | undefined; compact?: boolean }) {
  if (!metrics) return <span className="text-faint">Not computed</span>
  const serious = metrics.hard_issue_count
  return (
    <span className={cn('inline-flex items-center gap-1.5 font-mono text-[11px] tabular-nums', serious === 0 ? 'text-success' : serious > 5 ? 'text-critical' : 'text-warning')}>
      <TriangleAlert className="h-3 w-3" />
      {serious} {compact ? 'hard' : 'hard issues'}
    </span>
  )
}

export function PageFooterNote({ items }: { items: string[] }) {
  return (
    <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-lineSoft pt-3 font-mono text-[8px] uppercase tracking-[0.08em] text-faint/80">
      {items.map((item) => (
        <span key={item} className="flex items-center gap-1">
          <span className="h-1 w-1 rounded-full bg-faint/50" /> {item}
        </span>
      ))}
    </div>
  )
}

export function DataQualityBadge({ verified = false }: { verified?: boolean }) {
  return (
    <Tooltip content={verified ? 'Values recomputed from the persisted timetable.' : 'Illustrative synthetic values; not measured institutional data.'}>
      <Badge tone={verified ? 'success' : 'warning'}>
        <Database className="h-2.5 w-2.5" />
        {verified ? 'computed' : 'synthetic'}
      </Badge>
    </Tooltip>
  )
}

export function PercentCell({ value, digits = 1 }: { value: number | null | undefined; digits?: number }) {
  return <span className="font-mono tabular-nums text-muted">{fmtPct(value, digits)}</span>
}

export function SeverityIcon({ severity }: { severity: string }) {
  if (severity === 'critical') return <TriangleAlert className="h-3.5 w-3.5 text-critical" />
  if (severity === 'warning') return <TriangleAlert className="h-3.5 w-3.5 text-warning" />
  return <Info className="h-3.5 w-3.5 text-cyan" />
}

export function StatusLine({ status }: { status: string }) {
  const tone = statusTone(status)
  return <span className={cn('font-mono text-[9px] uppercase tracking-[0.08em]', tone === 'positive' ? 'text-success' : tone === 'critical' ? 'text-critical' : tone === 'warning' ? 'text-warning' : 'text-faint')}>{status}</span>
}
