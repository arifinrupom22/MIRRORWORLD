import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, GitCompareArrows, Info, Lightbulb, TriangleAlert } from 'lucide-react'
import type { DifferenceChange, DifferenceDecision, DifferenceResult } from '../lib/types'
import { cn, fmtNumber } from '../lib/utils'
import { Badge, Panel, PanelHeader } from './ui'

const CATEGORY_ORDER = ['Demand', 'Infrastructure', 'Staffing', 'Policy', 'Equipment', 'Timetable', 'Outcome', 'Change']

function formatValue(value: DifferenceChange['before']): string {
  if (value === null || value === undefined) return '—'
  if (Array.isArray(value)) return value.length ? value.join(', ') : 'none'
  if (typeof value === 'number') return fmtNumber(value, Number.isInteger(value) ? 0 : 2)
  return String(value)
}

function deltaLabel(change: DifferenceChange): string | null {
  if (change.delta === null || change.delta === undefined) return null
  if (change.delta === 0) return 'no change'
  const sign = change.delta > 0 ? '+' : ''
  return `${sign}${fmtNumber(change.delta, Number.isInteger(change.delta) ? 0 : 1)}${change.unit ? ` ${change.unit}` : ''}`
}

function directionTone(change: DifferenceChange): string {
  if (change.kind.startsWith('outcome.')) {
    return change.direction === 'decrease' ? 'text-success' : change.direction === 'increase' ? 'text-warning' : 'text-faint'
  }
  if (change.direction === 'removed' || change.direction === 'decrease') return 'text-warning'
  if (change.direction === 'added' || change.direction === 'increase') return 'text-cyan'
  return 'text-muted'
}

function ResourceChips({ change }: { change: DifferenceChange }) {
  if (!change.affected_resources.length) return null
  return (
    <div className="mt-2 flex flex-wrap gap-1">
      {change.affected_resources.slice(0, 8).map((resource) => (
        <Badge key={`${change.id}:${resource.type}:${resource.id}`} tone="neutral">
          {resource.label}
        </Badge>
      ))}
      {change.affected_resources.length > 8 && <Badge tone="neutral">+{change.affected_resources.length - 8}</Badge>}
    </div>
  )
}

function ChangeRow({ change }: { change: DifferenceChange }) {
  const delta = deltaLabel(change)
  return (
    <div className="border-b border-lineSoft px-4 py-3 last:border-b-0">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-medium text-ink">{change.label}</span>
            <Badge tone="neutral">{change.category}</Badge>
            {change.affected_session_ids.length > 0 && (
              <span className="font-mono text-[8px] text-faint">{change.affected_session_ids.length} session(s)</span>
            )}
          </div>
          {change.description && <p className="mt-1 text-[9.5px] leading-relaxed text-faint">{change.description}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1.5 font-mono text-[10px]">
          <span className="text-muted">{formatValue(change.before)}</span>
          <ArrowRight className="h-3 w-3 text-faint" />
          <span className="text-ink">{formatValue(change.after)}</span>
          {delta && <span className={cn('ml-1 rounded border border-line px-1.5 py-0.5 text-[8.5px]', directionTone(change))}>{delta}</span>}
        </div>
      </div>
      {change.why_it_matters && (
        <p className="mt-2 border-l-2 border-cyan/25 pl-2 text-[9.5px] leading-relaxed text-muted">
          {change.why_it_matters}
        </p>
      )}
      {change.constraint_effects.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {change.constraint_effects.map((effect) => (
            <span key={effect} className="rounded border border-warning/20 bg-warning/[0.03] px-1.5 py-0.5 text-[8.5px] text-warning/90">
              {effect}
            </span>
          ))}
        </div>
      )}
      <ResourceChips change={change} />
      {change.evidence.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer font-mono text-[8px] uppercase tracking-[0.06em] text-faint">Evidence</summary>
          <ul className="mt-1 space-y-0.5 text-[9px] leading-relaxed text-faint">
            {change.evidence.map((line) => <li key={line}>• {line}</li>)}
          </ul>
        </details>
      )}
    </div>
  )
}

function DecisionCard({ decision }: { decision: DifferenceDecision }) {
  const target = decision.route || '/simulation'
  return (
    <div className="rounded-md border border-lineSoft bg-input p-3">
      <div className="flex items-start gap-2">
        <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan/75" />
        <div className="min-w-0">
          <div className="text-[10.5px] font-medium text-ink">{decision.title}</div>
          <p className="mt-1 text-[9.5px] leading-relaxed text-muted">{decision.action}</p>
          <p className="mt-1 text-[9px] leading-relaxed text-faint">{decision.rationale}</p>
          {decision.evidence.length > 0 && (
            <div className="mt-1.5 font-mono text-[8.5px] text-faint">{decision.evidence.join(' · ')}</div>
          )}
          <Link to={target} className="focus-ring mt-2 inline-flex items-center gap-1 text-[9px] text-cyan/85 hover:text-cyan">
            {target === '/optimizer' ? 'Open recovery optimizer' : 'Review scenario'} <ArrowRight className="h-2.5 w-2.5" />
          </Link>
        </div>
      </div>
    </div>
  )
}

export function DifferencePanel({
  difference,
  compact = false,
  title = 'Digital twin difference',
  subtitle = 'What changed, why it matters and which constraints tighten.',
}: {
  difference: DifferenceResult | null | undefined
  compact?: boolean
  title?: string
  subtitle?: string
}) {
  const grouped = useMemo(() => {
    if (!difference?.changes.length) return []
    const order = new Map(CATEGORY_ORDER.map((category, index) => [category, index]))
    const groups = new Map<string, DifferenceChange[]>()
    for (const change of difference.changes) {
      const category = change.category || 'Change'
      const list = groups.get(category) ?? []
      list.push(change)
      groups.set(category, list)
    }
    return Array.from(groups.entries()).sort(
      ([a], [b]) => (order.get(a) ?? CATEGORY_ORDER.length) - (order.get(b) ?? CATEGORY_ORDER.length),
    )
  }, [difference])

  if (!difference) return null

  if (!difference.available) {
    return (
      <Panel>
        <PanelHeader eyebrow="Digital twin difference" title="State comparison unavailable" />
        <div className="flex items-start gap-2 px-4 py-4 text-[10.5px] leading-relaxed text-muted">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-faint" />
          <span>{difference.reason || difference.summary || 'This scenario has no state snapshot to compare.'}</span>
        </div>
      </Panel>
    )
  }

  return (
    <Panel>
      <PanelHeader
        eyebrow="Digital twin difference"
        title={title}
        subtitle={subtitle}
        action={
          <div className="flex items-center gap-1.5">
            {difference.partial && <Badge tone="warning">partial evidence</Badge>}
            <Badge tone="neutral">{difference.changes.length} changes</Badge>
          </div>
        }
      />
      <div className="border-b border-lineSoft bg-cyan/[0.025] px-4 py-3">
        <div className="flex items-start gap-2">
          <GitCompareArrows className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan/80" />
          <div>
            <p className="text-[10.5px] leading-relaxed text-ink">{difference.summary}</p>
            {difference.partial && difference.reason && (
              <p className="mt-1 flex items-start gap-1 text-[9px] leading-relaxed text-warning/90">
                <TriangleAlert className="mt-0.5 h-2.5 w-2.5 shrink-0" /> {difference.reason}
              </p>
            )}
          </div>
        </div>
      </div>

      {difference.changes.length ? (
        compact ? (
          <div className="max-h-64 overflow-y-auto scroll-thin">
            {difference.changes.slice(0, 6).map((change) => <ChangeRow key={change.id} change={change} />)}
          </div>
        ) : (
          <div className="divide-y divide-lineSoft">
            {grouped.map(([category, changes]) => (
              <div key={category}>
                <div className="bg-subtle px-4 py-1.5 font-mono text-[8px] uppercase tracking-[0.08em] text-faint">
                  {category} · {changes.length}
                </div>
                {changes.map((change) => <ChangeRow key={change.id} change={change} />)}
              </div>
            ))}
          </div>
        )
      ) : (
        <div className="px-4 py-5 text-[10.5px] text-faint">
          No material state changes were detected. The scenario is operationally identical to the baseline snapshot.
        </div>
      )}

      {!compact && (
        <div className="border-t border-lineSoft px-4 py-3">
          <div className="mb-2 flex items-center gap-1.5 font-mono text-[8.5px] uppercase tracking-[0.08em] text-cyan/80">
            <Lightbulb className="h-3 w-3" /> Decisions supported by this diff ({difference.decisions.length})
          </div>
          {difference.decisions.length ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {difference.decisions.map((decision) => <DecisionCard key={decision.id} decision={decision} />)}
            </div>
          ) : (
            <p className="text-[10px] text-faint">No decision rule fires for this change set.</p>
          )}
        </div>
      )}

      <div className="border-t border-lineSoft bg-subtle/40 px-4 py-2">
        <p className="text-[8.5px] leading-relaxed text-faint">
          Computed from the baseline state snapshot and the effective scenario state. Movement and energy values are modelled estimates; no live tracking or measured meter data is used.
        </p>
      </div>
    </Panel>
  )
}
