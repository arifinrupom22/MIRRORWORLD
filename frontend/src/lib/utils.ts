import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import type { Metrics, Severity } from './types'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function fmtNumber(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value)
}

export function fmtPct(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  return `${fmtNumber(value, digits)}%`
}

export function fmtSigned(value: number | null | undefined, digits = 0, unit = ''): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  const sign = value > 0 ? '+' : ''
  return `${sign}${fmtNumber(value, digits)}${unit}`
}

export function fmtCompact(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—'
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value)
}

export function fmtDate(value: string | null | undefined): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function timeAgo(value: string | null | undefined): string {
  if (!value) return '—'
  const time = new Date(value).getTime()
  if (Number.isNaN(time)) return '—'
  const seconds = Math.round((Date.now() - time) / 1000)
  if (seconds < 45) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  return `${days}d ago`
}

export const KIND_LABELS: Record<string, string> = {
  demand: 'Demand',
  facility: 'Facility',
  policy: 'Policy',
  sustainability: 'Energy',
  compound: 'Compound',
  baseline: 'Baseline',
}

export const STATUS_TONE: Record<string, Severity | 'neutral'> = {
  optimized: 'positive',
  simulated: 'info',
  optimizing: 'warning',
  queued: 'info',
  running: 'warning',
  completed: 'positive',
  cancelled: 'neutral',
  infeasible: 'critical',
  timeout: 'warning',
  failed: 'critical',
  FEASIBLE: 'positive',
  FEASIBLE_HEURISTIC: 'warning',
  OPTIMAL: 'positive',
  INFEASIBLE: 'critical',
  UNKNOWN: 'warning',
  AUDIT_FAILED: 'critical',
}

export function statusTone(status: string): Severity | 'neutral' {
  return STATUS_TONE[status] ?? 'neutral'
}

export function statusLabel(status: string): string {
  if (!status) return 'Unknown'
  if (status === 'FEASIBLE_HEURISTIC') return 'Verified heuristic'
  if (status === 'timeout') return 'Solver timeout'
  return status
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

export function severityClasses(severity: Severity | 'neutral'): string {
  switch (severity) {
    case 'critical':
      return 'border-critical/30 bg-critical/10 text-critical'
    case 'warning':
      return 'border-warning/30 bg-warning/10 text-warning'
    case 'positive':
      return 'border-success/30 bg-success/10 text-success'
    case 'info':
      return 'border-cyan/30 bg-cyan/10 text-cyan'
    default:
      return 'border-line bg-subtle text-muted'
  }
}

export function deltaIntent(delta: { absolute: number | null; better: boolean | null } | null | undefined) {
  if (!delta || delta.absolute === null) return 'muted'
  if (delta.absolute === 0) return 'muted'
  return delta.better ? 'good' : 'bad'
}

export function hardIssueSummary(metrics: Metrics | null | undefined): string {
  if (!metrics) return 'Not computed'
  if (metrics.hard_issue_count === 0) return 'No hard issues'
  const parts = []
  if (metrics.conflicts_total) parts.push(`${metrics.conflicts_total} conflicts`)
  if (metrics.capacity_violations_count) parts.push(`${metrics.capacity_violations_count} capacity`)
  if (metrics.unassigned_sessions) parts.push(`${metrics.unassigned_sessions} displaced`)
  return parts.join(' · ') || `${metrics.hard_issue_count} issues`
}

export function metricTone(key: string, value: number | null | undefined): Severity | 'neutral' {
  if (value === null || value === undefined) return 'neutral'
  if (['conflicts_total', 'unassigned_sessions', 'capacity_violations_count', 'hard_issue_count'].includes(key)) {
    return value > 0 ? (value > 3 ? 'critical' : 'warning') : 'positive'
  }
  if (key === 'energy_kwh') return 'neutral'
  return 'neutral'
}

export function initials(name: string): string {
  return name
    .replace(/^(Dr\.|Prof\.|Mr\.|Ms\.)\s+/i, '')
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

export function slotCode(day: number | null | undefined, slot: number | null | undefined): string {
  if (day === null || day === undefined || slot === null || slot === undefined) return '—'
  return `D${day + 1}·S${slot + 1}`
}

export function relationLabel(relation: string): string {
  return relation.replace(/_/g, ' ')
}

export function pluralize(count: number, singular: string, plural?: string): string {
  return count === 1 ? singular : plural ?? `${singular}s`
}
