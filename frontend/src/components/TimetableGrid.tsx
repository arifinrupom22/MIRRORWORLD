import { useMemo, useState } from 'react'
import { AlertTriangle, ArrowRight, CalendarRange, MapPin, Users2 } from 'lucide-react'
import type { CampusPayload, DayRecord, ScheduleEntry, TimeSlot } from '../lib/types'
import { cn, fmtNumber } from '../lib/utils'
import { Badge, Checkbox, Segmented, Select, Tooltip } from './ui'

type ViewMode = 'room' | 'group' | 'teacher'

interface RowEntity {
  id: string
  label: string
  sublabel?: string
  color?: string
}

export function TimetableGrid({
  schedule,
  campus,
  days,
  slots,
  initialView = 'group',
  allowedViews = ['group', 'room', 'teacher'],
  onSelectSession,
  maxHeight = 500,
  compactHeaders = false,
}: {
  schedule: ScheduleEntry[]
  campus: CampusPayload
  days: DayRecord[]
  slots: TimeSlot[]
  initialView?: ViewMode
  allowedViews?: ViewMode[]
  onSelectSession?: (session: ScheduleEntry | null) => void
  maxHeight?: number
  compactHeaders?: boolean
}) {
  const [view, setView] = useState<ViewMode>(initialView)
  const [building, setBuilding] = useState('all')
  const [search, setSearch] = useState('')
  const [activeOnly, setActiveOnly] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const roomMap = useMemo(() => new Map(campus.rooms.map((room) => [room.id, room])), [campus.rooms])

  const visibleSchedule = useMemo(() => schedule.filter((entry) => !entry.displaced), [schedule])
  const displaced = useMemo(() => schedule.filter((entry) => entry.displaced), [schedule])

  const entities = useMemo<RowEntity[]>(() => {
    if (view === 'room') {
      return campus.rooms
        .filter((room) => building === 'all' || room.building_id === building)
        .map((room) => {
          const buildingName = room.building_name ?? campus.buildings.find((item) => item.id === room.building_id)?.name ?? ''
          return {
            id: room.id,
            label: room.code,
            sublabel: `${room.capacity} seats · ${room.kind === 'lab' ? 'lab' : 'classroom'} · ${buildingName}`,
            color: room.kind === 'lab' ? '#8B7CFF' : '#38D9F5',
          }
        })
    }
    if (view === 'teacher') {
      return campus.teachers.map((teacher) => ({
        id: teacher.id,
        label: teacher.name,
        sublabel: `${teacher.department} · max ${teacher.max_weekly_hours}h/wk`,
        color: '#4F8CFF',
      }))
    }
    return campus.groups.map((group) => ({
      id: group.id,
      label: group.name,
      sublabel: `${group.department} · ${group.size} students`,
      color: '#35D39A',
    }))
  }, [view, building, campus.rooms, campus.teachers, campus.groups, campus.buildings])

  const filteredEntities = useMemo(() => {
    const query = search.trim().toLowerCase()
    return entities.filter((entity) => {
      if (query && !`${entity.label} ${entity.sublabel ?? ''}`.toLowerCase().includes(query)) return false
      if (activeOnly) return visibleSchedule.some((entry) => entityIdFor(entry, view) === entity.id)
      return true
    })
  }, [entities, search, activeOnly, visibleSchedule, view])

  const sessionsByEntity = useMemo(() => {
    const map = new Map<string, ScheduleEntry[]>()
    for (const entry of visibleSchedule) {
      const key = entityIdFor(entry, view)
      if (!key) continue
      if (!map.has(key)) map.set(key, [])
      map.get(key)?.push(entry)
    }
    return map
  }, [visibleSchedule, view])

  const selected = useMemo(() => schedule.find((entry) => entry.id === selectedId) ?? null, [schedule, selectedId])
  const selectedRoom = selected?.room_id ? roomMap.get(selected.room_id) : null
  const selectedConflicts = useMemo(() => {
    if (!selected || selected.day === null || selected.start_slot === null) return []
    const selectedDay = selected.day
    const selectedStart = selected.start_slot
    return visibleSchedule.filter(
      (entry) =>
        entry.id !== selected.id &&
        entityIdFor(entry, view) === entityIdFor(selected, view) &&
        entry.day === selectedDay &&
        entry.start_slot !== null &&
        rangesOverlap(entry.start_slot, entry.length, selectedStart, selected.length),
    )
  }, [selected, visibleSchedule, view])

  const handleSelect = (entry: ScheduleEntry) => {
    const next = selectedId === entry.id ? null : entry.id
    setSelectedId(next)
    onSelectSession?.(next ? entry : null)
  }

  const dayWidth = 7 * 54
  return (
    <div className="min-w-0">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Segmented
          size="sm"
          value={view}
          onChange={(next) => {
            setView(next)
            setSelectedId(null)
            onSelectSession?.(null)
          }}
          options={[
            ...(allowedViews.includes('group') ? [{ value: 'group' as const, label: 'By group' }] : []),
            ...(allowedViews.includes('room') ? [{ value: 'room' as const, label: 'By room' }] : []),
            ...(allowedViews.includes('teacher') ? [{ value: 'teacher' as const, label: 'By teacher' }] : []),
          ]}
        />
        {view === 'room' && (
          <Select value={building} onChange={(event) => setBuilding(event.target.value)} aria-label="Filter by building" className="h-8 w-40 text-[11px]">
            <option value="all">All buildings</option>
            {campus.buildings.map((item) => (
              <option key={item.id} value={item.id}>
                {item.code} · {item.name}
              </option>
            ))}
          </Select>
        )}
        <div className="relative min-w-[150px] flex-1 sm:max-w-[220px]">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Filter rows…"
            aria-label="Filter timetable rows"
            className="input-base h-8 text-[11px]"
          />
        </div>
        <Checkbox checked={activeOnly} onChange={setActiveOnly} label={<span className="text-[10.5px] text-faint">Rows with sessions</span>} />
        <span className="ml-auto flex items-center gap-1.5 font-mono text-[8.5px] uppercase tracking-[0.06em] text-faint">
          <span className="h-2 w-2 rounded-sm border border-critical/50 bg-critical/20" /> conflict
        </span>
      </div>

      {filteredEntities.length === 0 ? (
        <div className="flex h-40 flex-col items-center justify-center rounded-md border border-dashed border-line text-center">
          <CalendarRange className="mb-2 h-5 w-5 text-faint" />
          <p className="text-[11.5px] text-muted">No rows match this filter.</p>
          <p className="mt-1 text-[10.5px] text-faint">{activeOnly ? 'Disable “Rows with sessions” to see every entity.' : 'Clear the search field.'}</p>
        </div>
      ) : (
        <div className="overflow-auto rounded-md border border-lineSoft scroll-thin" style={{ maxHeight }}>
          <div style={{ minWidth: 150 + dayWidth * 5 }}>
            <div className="sticky top-0 z-30 bg-subbase">
              <div className="grid" style={{ gridTemplateColumns: `150px repeat(5, ${dayWidth}px)` }}>
                <div className="sticky left-0 z-40 flex items-center border-b border-r border-line bg-subbase px-3 py-1.5 font-mono text-[8px] uppercase tracking-[0.08em] text-faint">
                  {view === 'room' ? 'Room' : view === 'teacher' ? 'Teacher' : 'Group'}
                </div>
                {days.map((day) => (
                  <div key={day.index} className="border-b border-l border-lineSoft px-2 py-1.5 text-center font-mono text-[9px] font-medium uppercase tracking-[0.1em] text-muted" style={{ gridColumn: 'span 1' }}>
                    <span className="hidden xl:inline">{day.label}</span>
                    <span className="xl:hidden">{day.label.slice(0, 3)}</span>
                  </div>
                ))}
              </div>
              <div className="grid" style={{ gridTemplateColumns: `150px repeat(${days.length * slots.length}, 54px)` }}>
                <div className="sticky left-0 z-40 border-b border-r border-line bg-subbase" />
                {days.map((day) =>
                  slots.map((slot) => (
                    <div
                      key={`${day.index}-${slot.index}`}
                      className={cn(
                        'border-b border-l border-lineSoft px-1 text-center font-mono text-[8px] tabular-nums text-faint',
                        compactHeaders ? 'py-0.5' : 'py-1',
                      )}
                      title={`${day.label} · ${slot.label}`}
                    >
                      {compactHeaders ? slot.index + 1 : slot.start}
                    </div>
                  )),
                )}
              </div>
            </div>

            {filteredEntities.map((entity) => {
              const entries = sessionsByEntity.get(entity.id) ?? []
              return (
                <div key={entity.id} className="grid border-b border-lineSoft/70 last:border-b-0" style={{ gridTemplateColumns: `150px repeat(35, 54px)` }}>
                  <div className="sticky left-0 z-20 flex min-h-[42px] flex-col justify-center border-r border-lineSoft bg-canvas px-3 py-1">
                    <span className="truncate text-[10.5px] font-medium text-ink" title={entity.label}>
                      {entity.label}
                    </span>
                    <span className="truncate font-mono text-[7.5px] uppercase tracking-[0.04em] text-faint" title={entity.sublabel}>
                      {entity.sublabel}
                    </span>
                  </div>
                  {days.map((day) =>
                    slots.map((slot) => {
                      const covering = entries.filter((entry) => entry.day === day.index && coversSlot(entry.start_slot, entry.length, slot.index))
                      const starters = covering.filter((entry) => entry.start_slot === slot.index)
                      const primary = starters[0] ?? covering[0]
                      const count = covering.length
                      const conflict = count > 1
                      const isContinuation = primary && primary.start_slot !== slot.index
                      const isSelected = primary?.id === selectedId
                      const color = primary?.course_color || entity.color || '#38D9F5'
                      return (
                        <button
                          key={`${day.index}-${slot.index}`}
                          type="button"
                          onClick={() => primary && handleSelect(primary)}
                          disabled={!primary}
                          aria-label={
                            primary
                              ? `${primary.course_code ?? 'Session'} ${primary.group_name ?? ''} ${primary.room_code ?? ''} ${primary.day_label ?? ''} ${primary.slot_label ?? ''}${conflict ? `, ${count} overlapping sessions` : ''}`
                              : `Empty ${day.label} slot ${slot.index + 1}`
                          }
                          title={
                            count
                              ? `${day.label} ${slot.label}\n${covering
                                  .map(
                                    (entry) =>
                                      `${entry.course_code} · ${entry.group_name} · ${entry.teacher_name} · ${entry.room_code ?? 'No room'} (${entry.length} slot${entry.length > 1 ? 's' : ''})`,
                                  )
                                  .join('\n')}`
                              : `${day.label} ${slot.label} — no session`
                          }
                          className={cn(
                            'focus-ring relative min-h-[42px] border-b border-l border-lineSoft/60 p-0.5 text-left transition-colors',
                            primary ? 'hover:brightness-125' : 'cursor-default bg-cell',
                            conflict && 'outline outline-1 -outline-offset-1 outline-critical/70',
                            isSelected && 'ring-1 ring-inset ring-cyan',
                          )}
                          style={
                            primary
                              ? {
                                  backgroundColor: isContinuation ? `${color}10` : `${color}1f`,
                                  borderLeftColor: `${color}66`,
                                  boxShadow: `inset 2px 0 0 0 ${color}${isContinuation ? '55' : 'BB'}`,
                                }
                              : undefined
                          }
                        >
                          {primary && (
                            <span className="flex h-full min-w-0 flex-col justify-center">
                              <span className="flex items-center gap-0.5 overflow-hidden">
                                {conflict && <AlertTriangle className="h-2.5 w-2.5 shrink-0 text-critical" />}
                                <span className="truncate font-mono text-[9px] font-semibold leading-tight" style={{ color }}>
                                  {isContinuation ? '↳' : primary.course_code}
                                </span>
                                {primary.length > 1 && primary.start_slot === slot.index && (
                                  <span className="ml-auto shrink-0 rounded bg-ink/20 px-0.5 font-mono text-[6.5px] text-muted">{primary.length}×</span>
                                )}
                              </span>
                              {!isContinuation && (
                                <span className="truncate text-[7.5px] leading-tight text-muted">
                                  {view === 'room' ? primary.group_name : primary.room_code ?? 'Unassigned'}
                                </span>
                              )}
                              {conflict && primary.start_slot === slot.index && (
                                <span className="font-mono text-[6.5px] leading-tight text-critical">+{count - 1} overlap</span>
                              )}
                            </span>
                          )}
                        </button>
                      )
                    }),
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {displaced.length > 0 && (
        <div className="mt-3 rounded-md border border-warning/25 bg-warning/[0.04] p-3">
          <div className="mb-2 flex items-center gap-2 text-[10.5px] font-medium text-warning">
            <AlertTriangle className="h-3.5 w-3.5" />
            {displaced.length} displaced {displaced.length === 1 ? 'session' : 'sessions'} — no valid room or slot in this schedule
          </div>
          <div className="flex flex-wrap gap-1.5">
            {displaced.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => {
                  setSelectedId(entry.id)
                  onSelectSession?.(entry)
                }}
                className={cn(
                  'focus-ring rounded border border-warning/25 bg-warning/[0.07] px-2 py-1 text-left transition-colors hover:border-warning/50',
                  selectedId === entry.id && 'border-warning/70',
                )}
              >
                <span className="font-mono text-[9px] text-warning">{entry.course_code}</span>
                <span className="ml-1.5 text-[9px] text-muted">{entry.group_name}</span>
                <span className="ml-1.5 text-[8px] text-faint">{entry.displaced_reason ?? 'unassigned'}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {selected && (
        <div className="mt-3 rounded-md border border-line bg-subbase p-3.5 animate-fade-up">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: selected.course_color ?? '#38D9F5' }} />
                <span className="font-mono text-[11px] font-semibold text-ink">{selected.course_code}</span>
                <span className="text-[11.5px] text-muted">{selected.course_title}</span>
                {selected.displaced && <Badge tone="warning">Displaced</Badge>}
                {selectedConflicts.length > 0 && <Badge tone="critical">{selectedConflicts.length} overlap</Badge>}
                {selected.group_size > (selected.room_capacity ?? 0) && selected.room_capacity ? <Badge tone="critical">Over capacity</Badge> : null}
              </div>
              <div className="mt-2 grid gap-x-6 gap-y-1.5 text-[10.5px] sm:grid-cols-2 lg:grid-cols-4">
                <span className="flex items-center gap-1.5 text-faint">
                  <Users2 className="h-3 w-3" /> {selected.group_name} · {selected.group_size} students
                </span>
                <span className="flex items-center gap-1.5 text-faint">
                  <ArrowRight className="h-3 w-3" /> {selected.teacher_name ?? 'Unassigned teacher'}
                </span>
                <span className="flex items-center gap-1.5 text-faint">
                  <MapPin className="h-3 w-3" /> {selected.room_code ? `${selected.room_code} · ${selected.building_name}` : 'No room assigned'}
                  {selectedRoom && ` · ${fmtNumber(selectedRoom.capacity)} seats`}
                </span>
                <span className="flex items-center gap-1.5 text-faint">
                  <CalendarRange className="h-3 w-3" /> {selected.displaced ? 'Displaced — no slot' : `${selected.day_label} ${selected.slot_label}`}
                </span>
              </div>
              {selected.displaced_reason && (
                <p className="mt-2 text-[10.5px] leading-relaxed text-warning/90">
                  {selected.displaced_reason}
                  {selected.displaced_detail ? ` — ${selected.displaced_detail}` : ''}
                </p>
              )}
            </div>
            <Tooltip content="Close inspector">
              <button
                type="button"
                aria-label="Close session inspector"
                onClick={() => {
                  setSelectedId(null)
                  onSelectSession?.(null)
                }}
                className="focus-ring rounded border border-line px-2 py-1 font-mono text-[8px] uppercase tracking-[0.08em] text-faint hover:text-ink"
              >
                close
              </button>
            </Tooltip>
          </div>
          {selectedConflicts.length > 0 && (
            <div className="mt-3 border-t border-lineSoft pt-2">
              <div className="mb-1 font-mono text-[8px] uppercase tracking-[0.08em] text-critical">Overlapping sessions on this resource</div>
              {selectedConflicts.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => handleSelect(entry)}
                  className="focus-ring flex w-full items-center gap-2 rounded px-1 py-0.5 text-left text-[10px] text-muted hover:bg-subtleHover"
                >
                  <span className="font-mono text-[9px] text-critical">{entry.course_code}</span>
                  <span>{entry.group_name}</span>
                  <span className="text-faint">· {entry.room_code ?? 'no room'}</span>
                  <span className="ml-auto font-mono text-[8px] text-faint">{entry.slot_label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function entityIdFor(entry: ScheduleEntry, view: ViewMode): string {
  if (view === 'room') return entry.room_id ?? ''
  if (view === 'teacher') return entry.teacher_id ?? ''
  return entry.group_id
}

function coversSlot(start: number | null, length: number, slot: number): boolean {
  if (start === null) return false
  return slot >= start && slot < start + length
}

function rangesOverlap(startA: number, lengthA: number, startB: number, lengthB: number): boolean {
  return startA < startB + lengthB && startB < startA + lengthA
}
