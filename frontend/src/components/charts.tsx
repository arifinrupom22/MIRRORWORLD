import { useMemo, useState } from 'react'
import {
  Cell,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts'
import type { DayRecord, HeatCell, TimeSlot } from '../lib/types'
import { cn, fmtNumber, fmtPct } from '../lib/utils'

/* -------------------------------------------------------------------------- */
/* Sparkline                                                                   */
/* -------------------------------------------------------------------------- */

export function Sparkline({
  values,
  tone = 'cyan',
  className,
  ariaLabel = 'Trend',
}: {
  values: number[]
  tone?: 'cyan' | 'success' | 'warning' | 'critical' | 'violet'
  className?: string
  ariaLabel?: string
}) {
  const width = 100
  const height = 32
  const path = useMemo(() => {
    if (!values.length) return ''
    const min = Math.min(...values)
    const max = Math.max(...values)
    const range = max - min || 1
    return values
      .map((value, index) => {
        const x = (index / Math.max(1, values.length - 1)) * width
        const y = height - 3 - ((value - min) / range) * (height - 6)
        return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
      })
      .join(' ')
  }, [values])
  const area = path ? `${path} L${width},${height} L0,${height} Z` : ''
  const colors = {
    cyan: '#38D9F5',
    success: '#35D39A',
    warning: '#F5B84B',
    critical: '#FF647C',
    violet: '#8B7CFF',
  }
  const color = colors[tone]
  const id = `spark-${tone}-${values.join('-').slice(0, 16)}`
  if (!path) return null
  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className={cn('h-8 w-24', className)} role="img" aria-label={ariaLabel}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${id})`} />
      <path d={path} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

/* -------------------------------------------------------------------------- */
/* Bar meter                                                                   */
/* -------------------------------------------------------------------------- */

const barTones = {
  cyan: 'bg-cyan',
  success: 'bg-success',
  warning: 'bg-warning',
  critical: 'bg-critical',
  violet: 'bg-violet',
  blue: 'bg-blue',
}

export function BarMeter({
  value,
  max = 100,
  tone = 'cyan',
  className,
  label,
}: {
  value: number
  max?: number
  tone?: keyof typeof barTones
  className?: string
  label?: string
}) {
  const pct = max ? Math.max(0, Math.min(100, (value / max) * 100)) : 0
  return (
    <div className={cn('h-1.5 w-full overflow-hidden rounded-full bg-subtleHover', className)} role="img" aria-label={label ?? `${fmtPct(pct)}`}>
      <div className={cn('h-full rounded-full transition-[width] duration-700 ease-out', barTones[tone])} style={{ width: `${pct}%` }} />
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Ring                                                                        */
/* -------------------------------------------------------------------------- */

export function UtilizationRing({
  value,
  size = 74,
  stroke = 5,
  label,
  tone,
}: {
  value: number
  size?: number
  stroke?: number
  label?: string
  tone?: 'cyan' | 'success' | 'warning' | 'critical'
}) {
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const clamped = Math.max(0, Math.min(100, value))
  const color = tone ? { cyan: '#38D9F5', success: '#35D39A', warning: '#F5B84B', critical: '#FF647C' }[tone] : '#38D9F5'
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={radius} stroke="rgba(255,255,255,0.07)" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference - (clamped / 100) * circumference}
          style={{ transition: 'stroke-dashoffset 700ms cubic-bezier(0.16,1,0.3,1)' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-mono text-[13px] font-semibold tabular-nums text-ink">{fmtNumber(clamped, 1)}%</span>
        {label && <span className="mt-0.5 text-[8px] uppercase tracking-[0.08em] text-faint">{label}</span>}
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Heatmap                                                                     */
/* -------------------------------------------------------------------------- */

const heatTone = (value: number, conflicts: number) => {
  if (conflicts > 0) return 'border-critical/60 bg-critical/20 text-critical'
  if (value >= 75) return 'border-critical/30 bg-critical/[0.14] text-critical'
  if (value >= 50) return 'border-warning/30 bg-warning/[0.12] text-warning'
  if (value >= 25) return 'border-cyan/25 bg-cyan/[0.09] text-cyan'
  if (value > 0) return 'border-blue/20 bg-blue/[0.07] text-blue'
  return 'border-lineSoft bg-subtle text-faint/60'
}

export function OccupancyHeatmap({
  cells,
  days,
  slots,
  selected,
  onSelect,
  compact = false,
}: {
  cells: HeatCell[]
  days: DayRecord[]
  slots: TimeSlot[]
  selected?: { day: number; slot: number } | null
  onSelect?: (cell: HeatCell) => void
  compact?: boolean
}) {
  const cellMap = useMemo(() => new Map(cells.map((cell) => [`${cell.day}:${cell.slot}`, cell])), [cells])
  return (
    <div className="w-full overflow-x-auto scroll-thin">
      <div className="min-w-[420px]">
      <div className="mb-1.5 grid grid-cols-[34px_repeat(7,minmax(0,1fr))] gap-1">
        <span />
        {slots.map((slot) => (
          <span key={slot.index} className="text-center font-mono text-[8px] leading-tight text-faint">
            {slot.start}
          </span>
        ))}
      </div>
      <div className="space-y-1">
        {days.map((day) => (
          <div key={day.index} className="grid grid-cols-[34px_repeat(7,minmax(0,1fr))] gap-1">
            <span className="flex items-center font-mono text-[8.5px] uppercase tracking-[0.06em] text-faint">{day.short}</span>
            {slots.map((slot) => {
              const cell = cellMap.get(`${day.index}:${slot.index}`)
              const active = selected?.day === day.index && selected?.slot === slot.index
              return (
                <button
                  key={slot.index}
                  type="button"
                  onClick={() => cell && onSelect?.(cell)}
                  aria-label={`${day.label} ${slot.label}: ${cell?.sessions ?? 0} sessions, ${cell?.utilization_pct ?? 0}% rooms in use, ${cell?.conflicts ?? 0} conflicts`}
                  title={`${day.label} · ${slot.label} — ${cell?.sessions ?? 0} sessions · ${fmtPct(cell?.utilization_pct ?? 0, 0)} rooms in use · ${cell?.conflicts ?? 0} conflicts`}
                  className={cn(
                    'focus-ring relative flex items-center justify-center rounded border font-mono text-[9px] tabular-nums transition-all duration-150 hover:brightness-125',
                    compact ? 'h-6' : 'h-8',
                    heatTone(cell?.utilization_pct ?? 0, cell?.conflicts ?? 0),
                    active && 'ring-1 ring-cyan/70',
                  )}
                >
                  {cell ? Math.round(cell.utilization_pct) : '—'}
                  {Boolean(cell?.conflicts) && <span className="absolute right-0.5 top-0.5 h-1 w-1 rounded-full bg-critical" />}
                </button>
              )
            })}
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 font-mono text-[8px] uppercase tracking-[0.06em] text-faint">
        <span className="flex items-center gap-1"><span className="h-2 w-3 rounded-sm border border-lineSoft bg-subtle" /> empty</span>
        <span className="flex items-center gap-1"><span className="h-2 w-3 rounded-sm border border-cyan/25 bg-cyan/[0.09]" /> 1–49%</span>
        <span className="flex items-center gap-1"><span className="h-2 w-3 rounded-sm border border-warning/30 bg-warning/[0.12]" /> 50–74%</span>
        <span className="flex items-center gap-1"><span className="h-2 w-3 rounded-sm border border-critical/30 bg-critical/[0.14]" /> 75%+</span>
        <span className="flex items-center gap-1"><span className="h-1 w-1 rounded-full bg-critical" /> conflict</span>
        </div>
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Pareto                                                                      */
/* -------------------------------------------------------------------------- */

export interface ParetoPoint {
  label: string
  name: string
  energy: number
  utilization: number
  movement: number
  rooms: number
  color: string
  status?: string
}

function ParetoTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: ParetoPoint }> }) {
  if (!active || !payload?.length) return null
  const point = payload[0].payload
  return (
    <div className="rounded-md border border-line bg-popover px-3 py-2 text-[10px] shadow-float">
      <div className="mb-1 font-mono text-[8px] uppercase tracking-[0.1em] text-faint">Plan {point.label}</div>
      <div className="font-medium text-ink">{point.name}</div>
      <div className="mt-1.5 space-y-0.5 font-mono tabular-nums text-muted">
        <div>Energy · {fmtNumber(point.energy, 0)} kWh/wk</div>
        <div>Active util. · {fmtPct(point.utilization)}</div>
        <div>Movement · {fmtNumber(point.movement, 2)} km/wk</div>
        <div>Rooms used · {point.rooms}</div>
      </div>
    </div>
  )
}

export function ParetoChart({
  points,
  selected,
  height = 280,
}: {
  points: ParetoPoint[]
  selected?: string | null
  height?: number
}) {
  const [hovered, setHovered] = useState<string | null>(null)
  if (!points.length) {
    return (
      <div className="flex h-[240px] items-center justify-center rounded-md border border-dashed border-line text-[11px] text-faint">
        Generate recovery plans to populate the trade-off matrix.
      </div>
    )
  }
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 18, right: 24, bottom: 14, left: 2 }}>
          <XAxis
            type="number"
            dataKey="energy"
            name="Energy"
            unit=" kWh"
            tick={{ fill: '#6B7C93', fontSize: 9, fontFamily: 'JetBrains Mono' }}
            tickLine={false}
            axisLine={{ stroke: '#25334A' }}
            tickFormatter={(value: number) => fmtNumber(value, 0)}
            label={{ value: 'weekly energy (kWh, estimated)', position: 'insideBottom', offset: -8, fill: '#6B7C93', fontSize: 9 }}
          />
          <YAxis
            type="number"
            dataKey="utilization"
            name="Active utilisation"
            unit="%"
            tick={{ fill: '#6B7C93', fontSize: 9, fontFamily: 'JetBrains Mono' }}
            tickLine={false}
            axisLine={{ stroke: '#25334A' }}
            tickFormatter={(value: number) => `${value}`}
            label={{ value: 'active-room util. %', angle: -90, position: 'insideLeft', fill: '#6B7C93', fontSize: 9 }}
          />
          <ZAxis type="number" dataKey="rooms" range={[110, 340]} />
          <Tooltip content={<ParetoTooltip />} cursor={{ strokeDasharray: '3 3', stroke: '#3A4C69' }} />
          <Scatter
            data={points}
            onMouseEnter={(entry: unknown) => {
              const point = entry as ParetoPoint
              setHovered(point.label)
            }}
            onMouseLeave={() => setHovered(null)}
          >
            {points.map((point) => (
              <Cell
                key={point.label}
                fill={point.color}
                stroke={selected === point.label || hovered === point.label ? '#F1F5FC' : point.color}
                strokeWidth={selected === point.label ? 2 : 1}
                fillOpacity={selected && selected !== point.label ? 0.38 : 0.82}
              />
            ))}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
      <div className="mt-1 flex flex-wrap items-center justify-center gap-3">
        {points.map((point) => (
          <span key={point.label} className="flex items-center gap-1.5 font-mono text-[8.5px] uppercase tracking-[0.06em] text-faint">
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: point.color }} />
            {point.label} · {point.rooms} rooms
          </span>
        ))}
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Compare bars                                                                */
/* -------------------------------------------------------------------------- */

export function ComparisonBars({
  rows,
}: {
  rows: { label: string; baseline: number; scenario: number; plan: number | null; unit: string; max?: number }[]
}) {
  return (
    <div className="space-y-4">
      {rows.map((row) => {
        const max = row.max ?? Math.max(row.baseline, row.scenario, row.plan ?? 0, 1)
        const values = [
          { label: 'Baseline', value: row.baseline, color: 'bg-faint/50' },
          { label: 'Scenario', value: row.scenario, color: 'bg-warning/70' },
          { label: 'Plan', value: row.plan, color: 'bg-cyan/80' },
        ]
        return (
          <div key={row.label}>
            <div className="mb-1.5 flex items-center justify-between text-[10px]">
              <span className="text-muted">{row.label}</span>
              <span className="font-mono text-faint">{row.plan !== null ? fmtNumber(row.plan, 1) : '—'} {row.unit}</span>
            </div>
            <div className="space-y-1">
              {values.map((value) =>
                value.value === null ? null : (
                  <div key={value.label} className="flex items-center gap-2">
                    <span className="w-14 shrink-0 font-mono text-[8px] uppercase tracking-[0.06em] text-faint">{value.label}</span>
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-subtleHover">
                      <div className={cn('h-full rounded-full transition-[width] duration-700', value.color)} style={{ width: `${Math.min(100, (value.value / max) * 100)}%` }} />
                    </div>
                    <span className="w-12 shrink-0 text-right font-mono text-[9px] tabular-nums text-muted">{fmtNumber(value.value, value.value < 10 && value.value % 1 !== 0 ? 1 : 0)}</span>
                  </div>
                ),
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
