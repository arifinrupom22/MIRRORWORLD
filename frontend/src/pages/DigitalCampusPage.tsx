import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  Building2,
  CalendarClock,
  CheckCircle2,
  Compass,
  DoorOpen,
  FlaskConical,
  Layers3,
  MapPin,
  Search,
  Users2,
  X,
  Zap,
} from 'lucide-react'
import { useCampus } from '../lib/hooks'
import type { Room, ScheduleEntry } from '../lib/types'
import { cn, fmtNumber, fmtPct } from '../lib/utils'
import { Badge, Button, EmptyState, ErrorState, IconButton, Input, LoadingBlock, Modal, Panel, PanelHeader, Segmented } from '../components/ui'
import { BarMeter, UtilizationRing } from '../components/charts'
import { KpiCard, PipelineStrip, Provenance } from '../components/shared'

const SLOT_HOURS = 1.5
const WEEK_SLOTS = 35

export function DigitalCampusPage() {
  const { data: campus, isLoading, isError, error, refetch } = useCampus()
  const [selectedBuilding, setSelectedBuilding] = useState<string | null>(null)
  const [selectedRoom, setSelectedRoom] = useState<string | null>(null)
  const [kind, setKind] = useState<'all' | 'classroom' | 'lab'>('all')
  const [query, setQuery] = useState('')
  const [floor, setFloor] = useState<number | 'all'>('all')
  const [day, setDay] = useState<number | null>(null)
  const [slot, setSlot] = useState<number | null>(null)
  const [detail, setDetail] = useState<ScheduleEntry | null>(null)
  const [showOccupied, setShowOccupied] = useState(true)

  const schedule = campus?.baseline_schedule ?? []

  const peak = useMemo(() => {
    if (!campus) return { day: 0, slot: 0 }
    let best = { day: 0, slot: 0, busy: -1 }
    for (let dayIndex = 0; dayIndex < campus.days.length; dayIndex += 1) {
      for (let slotIndex = 0; slotIndex < campus.time_slots.length; slotIndex += 1) {
        const busy = new Set(
          schedule
            .filter((entry) => !entry.displaced && entry.day === dayIndex && (entry.start_slot ?? 0) <= slotIndex && slotIndex < (entry.start_slot ?? 0) + entry.length)
            .map((entry) => entry.room_id),
        ).size
        if (busy > best.busy) best = { day: dayIndex, slot: slotIndex, busy }
      }
    }
    return { day: best.day, slot: best.slot }
  }, [campus, schedule])

  const effectiveDay = campus ? Math.min(day ?? peak.day, campus.days.length - 1) : 0
  const effectiveSlot = campus ? Math.min(slot ?? peak.slot, campus.time_slots.length - 1) : 0

  const filteredRooms = useMemo(() => {
    if (!campus) return []
    const needle = query.trim().toLowerCase()
    return campus.rooms.filter((room) => {
      if (kind !== 'all' && room.kind !== kind) return false
      if (floor !== 'all' && room.floor !== floor) return false
      if (needle) {
        const haystack = `${room.code} ${room.name} ${room.building_name ?? ''} ${room.equipment.join(' ')}`.toLowerCase()
        if (!haystack.includes(needle)) return false
      }
      return true
    })
  }, [campus, kind, floor, query])

  const busyAtSlot = useMemo(() => {
    const map = new Map<string, ScheduleEntry>()
    for (const entry of schedule) {
      if (entry.displaced || entry.day !== effectiveDay || entry.start_slot === null) continue
      if (entry.start_slot <= effectiveSlot && effectiveSlot < entry.start_slot + entry.length && entry.room_id) {
        map.set(entry.room_id, entry)
      }
    }
    return map
  }, [schedule, effectiveDay, effectiveSlot])

  const buildingStats = useMemo(() => {
    if (!campus) return new Map<string, { rooms: number; labs: number; capacity: number; sessions: number; hours: number; utilization: number; conflicts: number }>()
    const stats = new Map<string, { rooms: number; labs: number; capacity: number; sessions: number; hours: number; utilization: number; conflicts: number }>()
    for (const building of campus.buildings) {
      const rooms = campus.rooms.filter((room) => room.building_id === building.id)
      const roomIds = new Set(rooms.map((room) => room.id))
      const entries = schedule.filter((entry) => entry.room_id && roomIds.has(entry.room_id) && !entry.displaced)
      const hours = entries.reduce((sum, entry) => sum + entry.length * SLOT_HOURS, 0)
      const byRoomSlot = new Map<string, number>()
      for (const entry of entries) {
        if (entry.start_slot === null) continue
        for (let offset = 0; offset < entry.length; offset += 1) {
          const key = `${entry.room_id}:${entry.day}:${entry.start_slot + offset}`
          byRoomSlot.set(key, (byRoomSlot.get(key) ?? 0) + 1)
        }
      }
      const conflicts = Array.from(byRoomSlot.values()).filter((count) => count > 1).length
      stats.set(building.id, {
        rooms: rooms.length,
        labs: rooms.filter((room) => room.kind === 'lab').length,
        capacity: rooms.reduce((sum, room) => sum + room.capacity, 0),
        sessions: entries.length,
        hours,
        utilization: rooms.length ? (hours / (rooms.length * WEEK_SLOTS * SLOT_HOURS)) * 100 : 0,
        conflicts,
      })
    }
    return stats
  }, [campus, schedule])

  const activeBuilding = campus?.buildings.find((building) => building.id === selectedBuilding) ?? null
  const activeRoom = campus?.rooms.find((room) => room.id === selectedRoom) ?? null
  const roomSessions = useMemo(() => {
    if (!activeRoom) return []
    return schedule
      .filter((entry) => entry.room_id === activeRoom.id)
      .sort((a, b) => (a.day ?? 99) - (b.day ?? 99) || (a.start_slot ?? 99) - (b.start_slot ?? 99))
  }, [activeRoom, schedule])

  const roomBusyKeys = useMemo(() => {
    const set = new Set<string>()
    for (const entry of schedule) {
      if (entry.displaced || entry.start_slot === null || !entry.room_id) continue
      for (let offset = 0; offset < entry.length; offset += 1) set.add(`${entry.room_id}:${entry.day}:${entry.start_slot + offset}`)
    }
    return set
  }, [schedule])

  const buildingMatchIds = useMemo(() => new Set(filteredRooms.map((room) => room.building_id)), [filteredRooms])

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-20 animate-pulse rounded-lg border border-line bg-subtle" />
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <Panel><LoadingBlock label="Loading campus geometry and rooms" rows={8} /></Panel>
          <Panel><LoadingBlock label="Loading space records" rows={5} /></Panel>
        </div>
      </div>
    )
  }
  if (isError || !campus) {
    return <ErrorState title="Campus model unavailable" message={error instanceof Error ? error.message : 'The campus payload could not be loaded from the API.'} onRetry={() => refetch()} />
  }

  const selectRoom = (room: Room) => {
    setSelectedRoom(room.id)
    setSelectedBuilding(room.building_id)
  }

  return (
    <div>
      <header className="mb-5 flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="telemetry text-cyan/80">Spatial model · {campus.campus.name}</span>
            <Badge tone="warning">illustrative geometry</Badge>
            <Badge tone="neutral">{campus.summary.buildings} buildings</Badge>
          </div>
          <h1 className="text-[26px] font-semibold leading-[1.1] tracking-[-0.03em] text-ink sm:text-[30px]">Digital campus</h1>
          <p className="mt-2 max-w-3xl text-[12.5px] leading-relaxed text-muted">
            A linked spatial and operational view of every teaching space. The building footprints are illustrative; capacities, equipment, bookings and utilisation are computed from the persisted campus model.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link to="/model" className="focus-ring inline-flex h-8 items-center gap-2 rounded-md border border-line bg-subtle px-3 text-[11.5px] text-ink hover:border-lineHover">
            <DoorOpen className="h-3.5 w-3.5" /> Edit campus model
          </Link>
          <Link to="/simulation" className="focus-ring inline-flex h-8 items-center gap-2 rounded-md border border-cyan/50 bg-[linear-gradient(180deg,rgba(56,217,245,0.22),rgba(79,140,255,0.14))] px-3 text-[11.5px] font-medium text-cyan">
            <FlaskConical className="h-3.5 w-3.5" /> Test a room closure
          </Link>
        </div>
      </header>

      <div className="mb-4"><PipelineStrip active="model" /></div>

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <KpiCard label="Buildings" value={campus.summary.buildings} icon={<Building2 className="h-3 w-3" />} tone="cyan" hint={[...new Set(campus.buildings.map((building) => building.zone))].join(' · ')} />
        <KpiCard label="Teaching spaces" value={campus.summary.rooms} icon={<DoorOpen className="h-3 w-3" />} tone="violet" hint={`${campus.summary.classrooms} classrooms · ${campus.summary.labs} labs`} />
        <KpiCard label="Seat capacity" value={fmtNumber(campus.summary.seat_capacity)} icon={<Users2 className="h-3 w-3" />} hint={`${fmtNumber(campus.summary.students)} students enrolled`} />
        <KpiCard label="Busy at selected slot" value={`${busyAtSlot.size}`} unit={`of ${campus.summary.rooms}`} icon={<CalendarClock className="h-3 w-3" />} tone={busyAtSlot.size > campus.summary.rooms * 0.8 ? 'warning' : 'success'} hint={`${campus.days[effectiveDay]?.label} · ${campus.time_slots[effectiveSlot]?.label}`} onClick={() => setShowOccupied((value) => !value)} />
        <KpiCard label="Baseline collisions" value={campus.baseline.conflicts_total} icon={<Zap className="h-3 w-3" />} tone={campus.baseline.conflicts_total ? 'critical' : 'success'} hint={`${campus.baseline.conflicts_by_type.room} room · ${campus.baseline.conflicts_by_type.teacher} teacher · ${campus.baseline.conflicts_by_type.group} group`} to="/optimizer" />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-line bg-input p-2">
        <div className="relative min-w-[190px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint" />
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search room, building or equipment…" aria-label="Search rooms" className="h-8 pl-8 text-[11px]" />
        </div>
        <Segmented
          size="sm"
          value={kind}
          onChange={setKind}
          options={[
            { value: 'all', label: 'All spaces' },
            { value: 'classroom', label: 'Classrooms' },
            { value: 'lab', label: 'Labs' },
          ]}
        />
        <select
          value={floor}
          onChange={(event) => setFloor(event.target.value === 'all' ? 'all' : Number(event.target.value))}
          aria-label="Filter by floor"
          className="input-base h-8 w-[112px] text-[11px]"
        >
          <option value="all">All floors</option>
          {[1, 2, 3].map((value) => <option key={value} value={value}>Floor {value}</option>)}
        </select>
        {(selectedBuilding || kind !== 'all' || query || floor !== 'all') && (
          <Button size="xs" variant="ghost" iconLeft={<X className="h-3 w-3" />} onClick={() => { setSelectedBuilding(null); setSelectedRoom(null); setKind('all'); setQuery(''); setFloor('all') }}>
            Clear filters
          </Button>
        )}
        <span className="ml-auto pr-1 font-mono text-[8.5px] uppercase tracking-[0.06em] text-faint">{filteredRooms.length} spaces match</span>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-5">
          <Panel>
            <PanelHeader
              eyebrow="Illustrative masterplan · not surveyed"
              title="Campus map"
              subtitle="Select a building to inspect its spaces. Dimmed blocks contain no room matching the current filters."
              action={
                <div className="flex items-center gap-1.5">
                  {campus.buildings.map((building) => (
                    <button
                      key={building.id}
                      type="button"
                      onClick={() => { setSelectedBuilding(building.id); setSelectedRoom(null) }}
                      className={cn('focus-ring rounded border px-1.5 py-0.5 font-mono text-[9px]', selectedBuilding === building.id ? 'border-cyan/50 bg-cyan/10 text-cyan' : 'border-line text-faint hover:text-ink')}
                      aria-label={`Select ${building.name}`}
                    >
                      {building.code}
                    </button>
                  ))}
                </div>
              }
            />
            <div className="p-4">
              <CampusMap
                buildings={campus.buildings}
                selected={selectedBuilding}
                onSelect={(id) => { setSelectedBuilding(id); setSelectedRoom(null) }}
                stats={buildingStats}
                matchIds={buildingMatchIds}
              />
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[8px] uppercase tracking-[0.07em] text-faint">
                  <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm border border-cyan/50 bg-cyan/15" /> selected</span>
                  <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm border border-line bg-subtle" /> no matching rooms</span>
                  <span className="flex items-center gap-1"><Compass className="h-3 w-3" /> north ↑</span>
                </div>
                <Provenance className="border-0 bg-transparent px-0 py-0">Footprints are schematic, not cadastral data.</Provenance>
              </div>
            </div>
          </Panel>

          <Panel>
            <PanelHeader
              eyebrow="Live room board"
              title="Availability by slot"
              subtitle="A room is available when no scheduled session covers the selected slot. Change the day or slot to step through the week."
              action={
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setShowOccupied((value) => !value)}
                    className={cn('focus-ring rounded border px-2 py-1 font-mono text-[8px] uppercase tracking-[0.06em]', showOccupied ? 'border-cyan/30 bg-cyan/[0.07] text-cyan' : 'border-line text-faint')}
                  >
                    {showOccupied ? 'showing all' : 'free only'}
                  </button>
                </div>
              }
            />
            <div className="border-b border-lineSoft px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex flex-wrap gap-1">
                  {campus.days.map((item) => (
                    <button
                      key={item.index}
                      type="button"
                      onClick={() => setDay(item.index)}
                      className={cn('focus-ring rounded px-2 py-1 font-mono text-[9px] uppercase tracking-[0.05em]', effectiveDay === item.index ? 'bg-cyan/10 text-cyan' : 'text-faint hover:text-muted')}
                    >
                      {item.short}
                    </button>
                  ))}
                </div>
                <span className="h-4 w-px bg-line" />
                <div className="flex flex-wrap gap-1">
                  {campus.time_slots.map((item) => (
                    <button
                      key={item.index}
                      type="button"
                      onClick={() => setSlot(item.index)}
                      className={cn('focus-ring rounded px-1.5 py-1 font-mono text-[8.5px] tabular-nums', effectiveSlot === item.index ? 'bg-blue/10 text-blue' : 'text-faint hover:text-muted')}
                      title={item.label}
                    >
                      {item.start}
                    </button>
                  ))}
                </div>
                <Badge tone="neutral" className="ml-auto">{busyAtSlot.size} busy · {campus.summary.rooms - busyAtSlot.size} free</Badge>
              </div>
            </div>
            <div className="grid max-h-[320px] grid-cols-2 gap-px overflow-y-auto bg-lineSoft scroll-thin sm:grid-cols-3 lg:grid-cols-4">
              {campus.buildings.map((building) => {
                const rooms = campus.rooms.filter((room) => room.building_id === building.id)
                return rooms.map((room) => {
                  const occupied = busyAtSlot.get(room.id)
                  const isFree = !occupied
                  if (!showOccupied && !isFree) return null
                  const matches = filteredRooms.some((candidate) => candidate.id === room.id)
                  return (
                    <button
                      key={room.id}
                      type="button"
                      onClick={() => selectRoom(room)}
                      className={cn(
                        'group bg-panel px-3 py-2.5 text-left transition-colors hover:bg-subtleHover',
                        selectedRoom === room.id && 'bg-cyan/[0.04]',
                        !matches && 'opacity-40',
                      )}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-mono text-[10px] font-medium text-ink">{room.code}</span>
                        <span className={cn('h-1.5 w-1.5 rounded-full', occupied ? 'bg-warning' : 'bg-success')} />
                      </div>
                      <div className="mt-0.5 truncate text-[9px] text-faint">{room.kind === 'lab' ? 'Lab' : 'Classroom'} · {room.capacity} seats</div>
                      <div className={cn('mt-1 truncate font-mono text-[8px] uppercase tracking-[0.03em]', occupied ? 'text-warning/90' : 'text-success/80')}>
                        {occupied ? occupied.course_code : 'available'}
                      </div>
                    </button>
                  )
                })
              })}
            </div>
          </Panel>
        </div>

        <div className="min-w-0 space-y-5">
          <Panel>
            <PanelHeader
              eyebrow={activeBuilding ? 'Building inspector' : 'Campus inspector'}
              title={activeBuilding ? activeBuilding.name : 'Buildings'}
              subtitle={activeBuilding ? activeBuilding.purpose : 'Choose a block on the map to inspect rooms, equipment and utilisation.'}
              action={activeBuilding ? <Badge tone="neutral">{activeBuilding.code}</Badge> : undefined}
            />
            {activeBuilding ? (
              <div className="p-4">
                <div className="flex items-start gap-3">
                  <UtilizationRing value={buildingStats.get(activeBuilding.id)?.utilization ?? 0} size={78} stroke={5} label="weekly" tone={(buildingStats.get(activeBuilding.id)?.utilization ?? 0) > 70 ? 'warning' : 'cyan'} />
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex items-center justify-between text-[10.5px]"><span className="text-faint">Zone</span><span className="text-muted">{activeBuilding.zone}</span></div>
                    <div className="flex items-center justify-between text-[10.5px]"><span className="text-faint">Spaces</span><span className="font-mono text-muted">{buildingStats.get(activeBuilding.id)?.rooms ?? 0}</span></div>
                    <div className="flex items-center justify-between text-[10.5px]"><span className="text-faint">Labs</span><span className="font-mono text-muted">{buildingStats.get(activeBuilding.id)?.labs ?? 0}</span></div>
                    <div className="flex items-center justify-between text-[10.5px]"><span className="text-faint">Seats</span><span className="font-mono text-muted">{fmtNumber(buildingStats.get(activeBuilding.id)?.capacity ?? 0)}</span></div>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div className="rounded border border-lineSoft bg-subtle px-2.5 py-2">
                    <div className="font-mono text-[8px] uppercase tracking-[0.06em] text-faint">Sessions</div>
                    <div className="mt-0.5 font-mono text-[15px] text-ink">{buildingStats.get(activeBuilding.id)?.sessions ?? 0}</div>
                  </div>
                  <div className="rounded border border-lineSoft bg-subtle px-2.5 py-2">
                    <div className="font-mono text-[8px] uppercase tracking-[0.06em] text-faint">Occupied</div>
                    <div className="mt-0.5 font-mono text-[15px] text-ink">{fmtNumber(buildingStats.get(activeBuilding.id)?.hours ?? 0, 1)}h</div>
                  </div>
                </div>
                <div className="mt-3">
                  <div className="mb-1 flex items-center justify-between text-[9.5px]"><span className="text-faint">Rooms</span><span className="font-mono text-faint">{campus.rooms.filter((room) => room.building_id === activeBuilding.id).length}</span></div>
                  <div className="space-y-1">
                    {campus.rooms.filter((room) => room.building_id === activeBuilding.id).map((room) => (
                      <button
                        key={room.id}
                        type="button"
                        onClick={() => selectRoom(room)}
                        className={cn(
                          'focus-ring flex w-full items-center justify-between gap-2 rounded border px-2 py-1.5 text-left transition-colors',
                          selectedRoom === room.id ? 'border-cyan/35 bg-cyan/[0.06]' : 'border-lineSoft hover:border-line hover:bg-subtleHover',
                        )}
                      >
                        <span className="flex min-w-0 items-center gap-1.5">
                          {room.kind === 'lab' ? <FlaskConical className="h-3 w-3 shrink-0 text-violet" /> : <DoorOpen className="h-3 w-3 shrink-0 text-cyan/70" />}
                          <span className="truncate font-mono text-[9.5px] text-ink">{room.code}</span>
                          <span className="truncate text-[9px] text-faint">F{room.floor}</span>
                        </span>
                        <span className="shrink-0 font-mono text-[8.5px] text-faint">{room.capacity} seats</span>
                      </button>
                    ))}
                  </div>
                </div>
                <button type="button" onClick={() => { setSelectedBuilding(null); setSelectedRoom(null) }} className="focus-ring mt-3 text-[9.5px] text-cyan/80 hover:text-cyan">View all buildings</button>
              </div>
            ) : (
              <div>
                {campus.buildings.map((building) => {
                  const stats = buildingStats.get(building.id)
                  return (
                    <button
                      key={building.id}
                      type="button"
                      onClick={() => setSelectedBuilding(building.id)}
                      className="focus-ring flex w-full items-center gap-3 border-b border-lineSoft px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-subtleHover"
                    >
                      <span className="h-7 w-1 rounded-full" style={{ backgroundColor: building.accent }} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2"><span className="text-[11px] font-medium text-ink">{building.name}</span><span className="font-mono text-[8px] text-faint">{building.code}</span></div>
                        <div className="mt-0.5 truncate text-[9.5px] text-faint">{building.zone} · {stats?.rooms ?? 0} rooms · {fmtPct(stats?.utilization ?? 0, 0)} used</div>
                      </div>
                      <ArrowRight className="h-3 w-3 shrink-0 text-faint" />
                    </button>
                  )
                })}
              </div>
            )}
          </Panel>

          {activeRoom && (
            <Panel className="animate-fade-up">
              <PanelHeader
                eyebrow="Space inspector"
                title={<span className="flex items-center gap-2"><span className="font-mono">{activeRoom.code}</span><span className="text-faint">·</span>{activeRoom.kind === 'lab' ? 'Laboratory' : 'Classroom'}</span>}
                subtitle={activeRoom.name}
                action={<IconButton label="Close room inspector" size="sm" variant="ghost" onClick={() => setSelectedRoom(null)}><X className="h-3.5 w-3.5" /></IconButton>}
              />
              <div className="p-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded border border-lineSoft bg-subtle px-2.5 py-2">
                    <div className="font-mono text-[8px] uppercase tracking-[0.06em] text-faint">Capacity</div>
                    <div className="mt-0.5 font-mono text-[16px] text-ink">{activeRoom.capacity}<span className="ml-1 text-[8px] uppercase text-faint">seats</span></div>
                  </div>
                  <div className="rounded border border-lineSoft bg-subtle px-2.5 py-2">
                    <div className="font-mono text-[8px] uppercase tracking-[0.06em] text-faint">Power</div>
                    <div className="mt-0.5 font-mono text-[16px] text-ink">{fmtNumber(activeRoom.power_kw, 1)}<span className="ml-1 text-[8px] uppercase text-faint">kW</span></div>
                  </div>
                  <div className="rounded border border-lineSoft bg-subtle px-2.5 py-2">
                    <div className="font-mono text-[8px] uppercase tracking-[0.06em] text-faint">Floor</div>
                    <div className="mt-0.5 font-mono text-[16px] text-ink">{activeRoom.floor}</div>
                  </div>
                  <div className="rounded border border-lineSoft bg-subtle px-2.5 py-2">
                    <div className="font-mono text-[8px] uppercase tracking-[0.06em] text-faint">Weekly bookings</div>
                    <div className="mt-0.5 font-mono text-[16px] text-ink">{roomSessions.length}</div>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-1">
                  {activeRoom.lab_types.map((type) => <Badge key={type} tone="violet">{type}</Badge>)}
                  {activeRoom.equipment.map((item) => <Badge key={item} tone="neutral">{item}</Badge>)}
                </div>
                <div className="mt-3">
                  <div className="mb-1 flex items-center justify-between"><span className="font-mono text-[8px] uppercase tracking-[0.08em] text-faint">Weekly occupancy</span><span className="font-mono text-[9px] text-cyan">{fmtPct((roomSessions.reduce((sum, entry) => sum + entry.length, 0) / WEEK_SLOTS) * 100)}</span></div>
                  <BarMeter value={(roomSessions.reduce((sum, entry) => sum + entry.length, 0) / WEEK_SLOTS) * 100} tone="cyan" />
                </div>
                <div className="mt-4 border-t border-lineSoft pt-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="font-mono text-[8px] uppercase tracking-[0.08em] text-faint">Scheduled sessions</span>
                    <span className="font-mono text-[8px] text-faint">{roomSessions.length}</span>
                  </div>
                  {roomSessions.length === 0 ? (
                    <p className="text-[10.5px] text-faint">No sessions booked in the baseline.</p>
                  ) : (
                    <div className="max-h-[230px] space-y-1 overflow-y-auto pr-1 scroll-thin">
                      {roomSessions.map((entry) => {
                        const conflict = entry.start_slot !== null && roomBusyKeys.has(`${activeRoom.id}:${entry.day}:${entry.start_slot}`) && schedule.filter((other) => other.id !== entry.id && other.room_id === activeRoom.id && other.day === entry.day).some((other) => other.start_slot !== null && other.start_slot < entry.start_slot! + entry.length && entry.start_slot! < other.start_slot + other.length)
                        return (
                          <button key={entry.id} type="button" onClick={() => setDetail(entry)} className="focus-ring flex w-full items-center gap-2 rounded border border-lineSoft px-2 py-1.5 text-left hover:border-line hover:bg-subtleHover">
                            <span className="h-4 w-1 shrink-0 rounded-full" style={{ backgroundColor: entry.course_color ?? '#38D9F5' }} />
                            <span className="min-w-0 flex-1">
                              <span className="flex items-center gap-1.5"><span className="font-mono text-[9px] text-ink">{entry.course_code}</span>{conflict && <Badge tone="critical">overlap</Badge>}</span>
                              <span className="block truncate text-[9px] text-faint">{entry.group_name} · {entry.day_label} {entry.slot_label}</span>
                            </span>
                            <span className="shrink-0 font-mono text-[8px] text-faint">{entry.teacher_name?.replace(/^(Dr\.|Prof\.)\s*/, '')}</span>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
                <Link to="/simulation" className="focus-ring mt-3 inline-flex items-center gap-1 text-[9.5px] text-cyan/80 hover:text-cyan">Simulate closing this room <ArrowRight className="h-3 w-3" /></Link>
              </div>
            </Panel>
          )}

          <Panel className="p-4">
            <div className="flex items-center gap-2 text-[11px] font-medium text-ink"><Layers3 className="h-3.5 w-3.5 text-cyan/70" /> Model notes</div>
            <ul className="mt-2 space-y-1.5 text-[10px] leading-relaxed text-faint">
              <li>• Room availability is derived from scheduled sessions, not from external timetables.</li>
              <li>• Capacity checks compare enrolment with seat counts; labs also enforce equipment rules.</li>
              <li>• Utilisation denominator is 35 slots × 1.5h per teaching room.</li>
            </ul>
          </Panel>
        </div>
      </div>

      <Panel className="mt-5">
        <PanelHeader
          eyebrow="Space register"
          title="Teaching spaces"
          subtitle="Filtered from the campus model. Select a row to open the room inspector; every value is persisted and editable in the campus model workspace."
          action={<Badge tone="neutral">{filteredRooms.length} of {campus.rooms.length}</Badge>}
        />
        {filteredRooms.length === 0 ? (
          <EmptyState title="No rooms match these filters" description="Clear the search or relax the building, floor and space-type filters." action={<Button size="xs" onClick={() => { setQuery(''); setKind('all'); setFloor('all'); setSelectedBuilding(null) }}>Reset filters</Button>} />
        ) : (
          <div className="overflow-x-auto scroll-thin">
            <table className="table-dense min-w-[900px]">
              <thead>
                <tr>
                  <th>Room</th>
                  <th>Building</th>
                  <th>Type</th>
                  <th className="text-right">Floor</th>
                  <th className="text-right">Capacity</th>
                  <th>Equipment</th>
                  <th className="text-right">Bookings</th>
                  <th className="text-right">Utilisation</th>
                  <th>Selected slot</th>
                </tr>
              </thead>
              <tbody>
                {filteredRooms.map((room) => {
                  const sessions = schedule.filter((entry) => !entry.displaced && entry.room_id === room.id)
                  const occupancy = (sessions.reduce((sum, entry) => sum + entry.length, 0) / WEEK_SLOTS) * 100
                  const occupied = busyAtSlot.get(room.id)
                  return (
                    <tr key={room.id} className="cursor-pointer" onClick={() => selectRoom(room)}>
                      <td><span className="font-mono text-[10.5px] text-ink">{room.code}</span><span className="ml-2 text-[9px] text-faint">{room.name}</span></td>
                      <td>{room.building_name} <span className="font-mono text-[9px] text-faint">{room.building_code}</span></td>
                      <td><Badge tone={room.kind === 'lab' ? 'violet' : 'info'}>{room.kind === 'lab' ? 'lab' : 'classroom'}</Badge></td>
                      <td className="text-right font-mono text-[10px]">{room.floor}</td>
                      <td className="text-right font-mono text-[10px] tabular-nums">{room.capacity}</td>
                      <td><span className="line-clamp-1 max-w-[220px] text-[9.5px]">{room.equipment.length ? room.equipment.join(' · ') : '—'}</span></td>
                      <td className="text-right font-mono text-[10px] tabular-nums">{sessions.length}</td>
                      <td className="text-right"><span className={cn('font-mono text-[10px] tabular-nums', occupancy > 70 ? 'text-warning' : 'text-muted')}>{fmtPct(occupancy, 0)}</span></td>
                      <td>{occupied ? <Badge tone="warning">busy · {occupied.course_code}</Badge> : <Badge tone="success" dot>available</Badge>}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <SessionModal session={detail} onClose={() => setDetail(null)} room={activeRoom ?? null} />

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-lineSoft pt-3 font-mono text-[8px] uppercase tracking-[0.08em] text-faint/80">
        <span className="flex items-center gap-1"><MapPin className="h-2.5 w-2.5" /> synthetic campus · 4 blocks</span>
        <span className="flex items-center gap-1"><CheckCircle2 className="h-2.5 w-2.5" /> capacity and equipment rules verified at request time</span>
        <span className="flex items-center gap-1"><CalendarClock className="h-2.5 w-2.5" /> {schedule.length} baseline sessions</span>
      </div>
    </div>
  )
}

function CampusMap({
  buildings,
  selected,
  onSelect,
  stats,
  matchIds,
}: {
  buildings: { id: string; code: string; name: string; zone: string; purpose: string; floors: number; map: { x: number; y: number; w: number; h: number }; accent: string }[]
  selected: string | null
  onSelect: (id: string) => void
  stats: Map<string, { rooms: number; labs: number; capacity: number; sessions: number; hours: number; utilization: number; conflicts: number }>
  matchIds: Set<string>
}) {
  const roads = [
    'M 420 190 H 468',
    'M 250 306 V 360',
    'M 430 470 H 500',
    'M 720 276 V 332',
    'M 140 520 H 900',
    'M 40 300 H 140',
  ]
  return (
    <div className="relative overflow-hidden rounded-md border border-lineSoft bg-cell">
      <div className="pointer-events-none absolute inset-0 bg-grid opacity-40" />
      <svg viewBox="0 0 1000 640" className="relative w-full" role="img" aria-label="Illustrative campus masterplan with four buildings">
        <defs>
          <pattern id="hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="7" stroke="rgba(255,255,255,0.035)" strokeWidth="1" />
          </pattern>
          <filter id="glow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="10" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <rect x="0" y="0" width="1000" height="640" fill="url(#hatch)" opacity="0.6" />
        <path d="M 0 300 C 190 280 300 320 470 300 S 760 260 1000 300" fill="none" stroke="#1C2A40" strokeWidth="38" strokeLinecap="round" />
        <path d="M 720 0 V 640" fill="none" stroke="#1C2A40" strokeWidth="30" strokeLinecap="round" />
        <path d="M 0 552 H 1000" fill="none" stroke="#1C2A40" strokeWidth="24" />
        {roads.map((road, index) => <path key={index} d={road} fill="none" stroke="#2A3A53" strokeWidth="9" strokeLinecap="round" strokeDasharray="1 14" />)}
        {buildings.map((building) => {
          const { x, y, w, h } = building.map
          const isSelected = selected === building.id
          const matches = matchIds.has(building.id)
          const stat = stats.get(building.id)
          return (
            <g
              key={building.id}
              role="button"
              tabIndex={0}
              aria-label={`${building.name}, ${stat?.rooms ?? 0} rooms, ${stat?.sessions ?? 0} sessions`}
              aria-pressed={isSelected}
              onClick={() => onSelect(building.id)}
              onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(building.id) } }}
              className="cursor-pointer outline-none"
              opacity={matches ? 1 : 0.28}
            >
              <rect x={x - 10} y={y - 10} width={w + 20} height={h + 20} rx="14" fill={building.accent} opacity={isSelected ? 0.08 : 0} filter={isSelected ? 'url(#glow)' : undefined} />
              <rect x={x} y={y} width={w} height={h} rx="10" fill="#0C1728" stroke={isSelected ? building.accent : '#2A3A53'} strokeWidth={isSelected ? 2 : 1} />
              <rect x={x} y={y} width={w} height={h} rx="10" fill={building.accent} opacity="0.045" />
              <rect x={x} y={y} width={w} height="3" rx="1.5" fill={building.accent} opacity={isSelected ? 1 : 0.7} />
              <rect x={x + 24} y={y + 30} width="9" height="9" rx="2" fill={building.accent} />
              <text x={x + 42} y={y + 39} fill="#F1F5FC" fontSize="20" fontFamily="Inter, sans-serif" fontWeight="600" letterSpacing="-0.4">{building.code}</text>
              <text x={x + 24} y={y + 66} fill="#9AA9BF" fontSize="13" fontFamily="Inter, sans-serif">{building.name}</text>
              <text x={x + 24} y={y + 84} fill="#6B7C93" fontSize="10.5" fontFamily="JetBrains Mono, monospace" letterSpacing="0.4">{building.zone.toUpperCase()}</text>
              <line x1={x + 24} y1={y + h - 62} x2={x + w - 24} y2={y + h - 62} stroke="#25334A" strokeWidth="1" />
              <text x={x + 24} y={y + h - 42} fill="#9AA9BF" fontSize="10.5" fontFamily="JetBrains Mono, monospace">{stat?.rooms ?? 0} SPACES · {stat?.labs ?? 0} LABS</text>
              <text x={x + 24} y={y + h - 25} fill={building.accent} fontSize="10.5" fontFamily="JetBrains Mono, monospace">{Math.round(stat?.utilization ?? 0)}% USED</text>
              <text x={x + w - 24} y={y + h - 42} textAnchor="end" fill="#6B7C93" fontSize="10" fontFamily="JetBrains Mono, monospace">{stat?.capacity ?? 0} SEATS</text>
              <text x={x + w - 24} y={y + h - 25} textAnchor="end" fill="#6B7C93" fontSize="10" fontFamily="JetBrains Mono, monospace">F{Array.from({ length: building.floors }).map((_, index) => index + 1).join('·F')}</text>
              {isSelected && (
                <g>
                  <rect x={x + w - 92} y={y + 14} width="68" height="19" rx="4" fill={building.accent} opacity="0.16" />
                  <text x={x + w - 58} y={y + 27} textAnchor="middle" fill={building.accent} fontSize="8.5" fontFamily="JetBrains Mono, monospace" letterSpacing="0.8">SELECTED</text>
                </g>
              )}
              <title>{`${building.name} — ${stat?.rooms ?? 0} rooms, ${stat?.sessions ?? 0} sessions, ${Math.round(stat?.utilization ?? 0)}% weekly utilisation`}</title>
            </g>
          )
        })}
        <g transform="translate(900 580)">
          <circle r="19" fill="#0A1322" stroke="#25334A" />
          <path d="M0 -11 L5 7 L0 3 L-5 7 Z" fill="#6B7C93" />
          <text y="31" textAnchor="middle" fill="#6B7C93" fontSize="8" fontFamily="JetBrains Mono, monospace">N</text>
        </g>
        <text x="56" y="600" fill="#43536B" fontSize="9" fontFamily="JetBrains Mono, monospace" letterSpacing="1">ILLUSTRATIVE SITE PLAN · NOT TO SCALE</text>
      </svg>
    </div>
  )
}

function SessionModal({ session, onClose, room }: { session: ScheduleEntry | null; onClose: () => void; room: Room | null }) {
  if (!session) return null
  return (
    <Modal
      open={Boolean(session)}
      onClose={onClose}
      title={`${session.course_code} · ${session.course_title}`}
      description="Session record from the persisted baseline timetable."
      width="sm"
      footer={<Button variant="secondary" onClick={onClose}>Close</Button>}
    >
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-[11px]">
        {[
          ['Course', `${session.course_code} — ${session.course_title}`],
          ['Group', `${session.group_name} · ${session.group_size} students`],
          ['Instructor', session.teacher_name ?? 'Unassigned'],
          ['Room', room ? `${room.code} · ${room.building_name}` : session.room_code ?? 'No room'],
          ['Slot', session.displaced ? 'Displaced' : `${session.day_label} · ${session.slot_label}`],
          ['Duration', `${session.length} × 1.5h`],
          ['Session ID', session.id],
          ['Displaced', session.displaced ? 'Yes' : 'No'],
        ].map(([label, value]) => (
          <div key={label}>
            <dt className="font-mono text-[8px] uppercase tracking-[0.08em] text-faint">{label}</dt>
            <dd className="mt-0.5 text-muted">{value}</dd>
          </div>
        ))}
      </dl>
      {session.displaced_reason && <p className="mt-3 rounded border border-warning/25 bg-warning/[0.04] px-3 py-2 text-[10.5px] text-warning/90">{session.displaced_reason}{session.displaced_detail ? ` — ${session.displaced_detail}` : ''}</p>}
      {room && room.capacity < session.group_size && <p className="mt-3 rounded border border-critical/25 bg-critical/[0.04] px-3 py-2 text-[10.5px] text-critical/90">Capacity breach: {session.group_size} students in a {room.capacity}-seat room.</p>}
    </Modal>
  )
}
