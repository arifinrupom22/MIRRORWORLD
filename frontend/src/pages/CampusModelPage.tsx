import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  Database,
  DoorOpen,
  GraduationCap,
  Pencil,
  RotateCcw,
  ShieldCheck,
  Users2,
  UserRound,
} from 'lucide-react'
import { api, ApiError } from '../lib/api'
import { queryKeys, useCampus } from '../lib/hooks'
import { useAppStore, toast } from '../store/appStore'
import type { Room, StudentGroup, Teacher } from '../lib/types'
import { cn, fmtNumber, fmtPct } from '../lib/utils'
import {
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Field,
  Input,
  LoadingBlock,
  Modal,
  Panel,
  PanelHeader,
  SearchInput,
  Tabs,
} from '../components/ui'
import { KpiCard, PipelineStrip, Provenance } from '../components/shared'

type EditTarget = { type: 'room'; room: Room } | { type: 'teacher'; teacher: Teacher } | { type: 'group'; group: StudentGroup } | null

export function CampusModelPage() {
  const { data: campus, isLoading, isError, error, refetch } = useCampus()
  const [tab, setTab] = useState('rooms')
  const [query, setQuery] = useState('')
  const [editTarget, setEditTarget] = useState<EditTarget>(null)
  const [resetOpen, setResetOpen] = useState(false)
  const [resetting, setResetting] = useState(false)
  const queryClient = useQueryClient()
  const clearActiveScenario = useAppStore((state) => state.clearActiveScenario)

  const schedule = campus?.baseline_schedule ?? []
  const roomSessions = useMemo(() => {
    const map = new Map<string, number>()
    for (const entry of schedule) if (!entry.displaced && entry.room_id) map.set(entry.room_id, (map.get(entry.room_id) ?? 0) + 1)
    return map
  }, [schedule])

  const refreshAll = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.campus }),
      queryClient.invalidateQueries({ queryKey: queryKeys.overview }),
      queryClient.invalidateQueries({ queryKey: queryKeys.scenarios }),
      queryClient.invalidateQueries({ queryKey: queryKeys.history }),
    ])
    await refetch()
  }

  const resetDataset = async () => {
    setResetting(true)
    try {
      await api.resetCampus()
      clearActiveScenario()
      await refreshAll()
      setResetOpen(false)
      toast('Demo dataset restored', 'success', 'The campus, baseline timetable and seeded scenarios have been regenerated from the seed.')
    } catch (caught) {
      toast('Reset failed', 'error', caught instanceof ApiError ? caught.detail : caught instanceof Error ? caught.message : 'Unknown error')
    } finally {
      setResetting(false)
    }
  }

  if (isLoading) return <LoadingBlock label="Loading editable campus model" rows={8} />
  if (isError || !campus) return <ErrorState title="Campus model unavailable" message={error instanceof Error ? error.message : 'The campus endpoint did not respond.'} onRetry={() => refetch()} />

  const needle = query.trim().toLowerCase()
  const rooms = campus.rooms.filter((room) => !needle || `${room.code} ${room.name} ${room.building_name} ${room.equipment.join(' ')}`.toLowerCase().includes(needle))
  const teachers = campus.teachers.filter((teacher) => !needle || `${teacher.name} ${teacher.department} ${teacher.title}`.toLowerCase().includes(needle))
  const groups = campus.groups.filter((group) => !needle || `${group.name} ${group.department} ${group.batch}`.toLowerCase().includes(needle))

  return (
    <div>
      <header className="mb-5 flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="telemetry text-cyan/80">Model workspace · editable demo dataset</span>
            <Badge tone="warning">synthetic</Badge>
            <Badge tone="neutral">fingerprint {campus.fingerprint.slice(0, 10)}</Badge>
          </div>
          <h1 className="text-[26px] font-semibold leading-[1.1] tracking-[-0.03em] text-ink sm:text-[30px]">Campus model</h1>
          <p className="mt-2 max-w-3xl text-[12.5px] leading-relaxed text-muted">
            The model is the single source of truth for every workspace. Edits are validated and persisted; the server recomputes baseline diagnostics immediately and marks saved scenarios with their original baseline snapshots.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="ghost" iconLeft={<RotateCcw className="h-3.5 w-3.5" />} onClick={() => setResetOpen(true)}>Reset demo data</Button>
          <Link to="/campus" className="focus-ring inline-flex h-8 items-center gap-2 rounded-md border border-line px-3 text-[11.5px] text-muted hover:text-ink"><Building2 className="h-3.5 w-3.5" /> Open campus map</Link>
        </div>
      </header>

      <div className="mb-4"><PipelineStrip active="model" /></div>

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Rooms" value={campus.summary.rooms} unit={`${campus.summary.labs} labs`} icon={<DoorOpen className="h-3 w-3" />} tone="cyan" hint={`${campus.summary.classrooms} classrooms · ${fmtNumber(campus.summary.seat_capacity)} seats`} />
        <KpiCard label="Instructors" value={campus.summary.teachers} icon={<UserRound className="h-3 w-3" />} tone="violet" hint={`${campus.summary.courses} courses assigned`} />
        <KpiCard label="Cohorts" value={campus.summary.groups} unit={`${fmtNumber(campus.summary.students)} students`} icon={<Users2 className="h-3 w-3" />} tone="success" hint="Production groups, not individual records" />
        <KpiCard label="Dataset integrity" value={campus.baseline.hard_issue_count === 0 ? 'clean' : `${campus.baseline.hard_issue_count}`} unit={campus.baseline.hard_issue_count === 0 ? '' : 'issues'} icon={<ShieldCheck className="h-3 w-3" />} tone={campus.baseline.hard_issue_count === 0 ? 'success' : 'warning'} hint="Baseline diagnostics recomputed on every load" />
      </div>

      <Panel>
        <div className="flex flex-col gap-2 border-b border-lineSoft px-4 pt-3 sm:flex-row sm:items-center">
          <Tabs
            value={tab}
            onChange={(value) => { setTab(value); setQuery('') }}
            tabs={[
              { id: 'rooms', label: 'Rooms', count: rooms.length },
              { id: 'teachers', label: 'Instructors', count: teachers.length },
              { id: 'groups', label: 'Cohorts', count: groups.length },
            ]}
            className="flex-1 border-b-0"
          />
          <div className="pb-2.5">
            <SearchInput value={query} onChange={setQuery} placeholder={`Search ${tab}…`} className="w-full sm:w-64" ariaLabel={`Search ${tab}`} />
          </div>
        </div>

        {tab === 'rooms' && (
          rooms.length === 0 ? <EmptyState title="No rooms match" description="Clear the search field to view the full room register." action={<Button size="xs" onClick={() => setQuery('')}>Clear search</Button>} /> : (
            <div className="overflow-x-auto scroll-thin">
              <table className="table-dense min-w-[820px]">
                <thead><tr><th>Room</th><th>Building</th><th>Kind</th><th className="text-right">Capacity</th><th>Equipment</th><th className="text-right">Baseline bookings</th><th className="text-right">Action</th></tr></thead>
                <tbody>
                  {rooms.map((room) => (
                    <tr key={room.id}>
                      <td><span className="font-mono text-[10.5px] text-ink">{room.code}</span><span className="ml-2 text-[9px] text-faint">{room.name}</span></td>
                      <td>{room.building_name} <span className="font-mono text-[8px] text-faint">F{room.floor}</span></td>
                      <td><Badge tone={room.kind === 'lab' ? 'violet' : 'info'}>{room.kind}</Badge></td>
                      <td className="text-right font-mono text-[10px] tabular-nums">{room.capacity}</td>
                      <td><span className="line-clamp-1 max-w-[250px] text-[9px]">{room.equipment.length ? room.equipment.join(' · ') : '—'}</span></td>
                      <td className="text-right font-mono text-[10px] tabular-nums">{roomSessions.get(room.id) ?? 0}</td>
                      <td className="text-right">
                        <Button size="xs" variant="ghost" iconLeft={<Pencil className="h-3 w-3" />} onClick={() => setEditTarget({ type: 'room', room })}>Edit</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}

        {tab === 'teachers' && (
          teachers.length === 0 ? <EmptyState title="No instructors match" description="Clear the search field to view all instructors." action={<Button size="xs" onClick={() => setQuery('')}>Clear search</Button>} /> : (
            <div className="overflow-x-auto scroll-thin">
              <table className="table-dense min-w-[720px]">
                <thead><tr><th>Instructor</th><th>Department</th><th>Title</th><th className="text-right">Max weekly hours</th><th>Unavailable slots</th><th className="text-right">Action</th></tr></thead>
                <tbody>
                  {teachers.map((teacher) => (
                    <tr key={teacher.id}>
                      <td className="text-[10.5px] text-ink">{teacher.name}</td>
                      <td>{teacher.department}</td>
                      <td className="text-[9.5px]">{teacher.title}</td>
                      <td className="text-right font-mono text-[10px] tabular-nums">{teacher.max_weekly_hours}h</td>
                      <td><span className="font-mono text-[9px] text-faint">{teacher.unavailable.length ? teacher.unavailable.map(([day, slot]) => `D${day + 1}S${slot + 1}`).join(' · ') : 'none'}</span></td>
                      <td className="text-right"><Button size="xs" variant="ghost" iconLeft={<Pencil className="h-3 w-3" />} onClick={() => setEditTarget({ type: 'teacher', teacher })}>Edit</Button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}

        {tab === 'groups' && (
          groups.length === 0 ? <EmptyState title="No cohorts match" description="Clear the search field to view all cohorts." action={<Button size="xs" onClick={() => setQuery('')}>Clear search</Button>} /> : (
            <div className="overflow-x-auto scroll-thin">
              <table className="table-dense min-w-[680px]">
                <thead><tr><th>Cohort</th><th>Department</th><th>Batch</th><th className="text-right">Enrolment</th><th>Home building</th><th className="text-right">Action</th></tr></thead>
                <tbody>
                  {groups.map((group) => (
                    <tr key={group.id}>
                      <td className="text-[10.5px] text-ink">{group.name}</td>
                      <td>{group.department}</td>
                      <td className="font-mono text-[9.5px]">{group.batch}</td>
                      <td className="text-right font-mono text-[10px] tabular-nums">{group.size}</td>
                      <td className="font-mono text-[9.5px]">{campus.buildings.find((building) => building.id === group.home_building_id)?.code ?? group.home_building_id}</td>
                      <td className="text-right"><Button size="xs" variant="ghost" iconLeft={<Pencil className="h-3 w-3" />} onClick={() => setEditTarget({ type: 'group', group })}>Edit</Button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-lineSoft px-4 py-2.5 font-mono text-[8px] uppercase tracking-[0.07em] text-faint">
          <span className="flex items-center gap-1"><Database className="h-2.5 w-2.5" /> persisted in SQLite via SQLAlchemy</span>
          <span className="flex items-center gap-1"><ShieldCheck className="h-2.5 w-2.5" /> server-side validation</span>
          <span className="flex items-center gap-1"><GraduationCap className="h-2.5 w-2.5" /> no individual student records</span>
        </div>
      </Panel>

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Panel>
          <PanelHeader eyebrow="Propagation" title="What an edit changes" subtitle="Derived views are invalidated after a successful save, never patched with optimistic guesses." />
          <div className="grid gap-px bg-lineSoft sm:grid-cols-3">
            {[
              { icon: DoorOpen, title: 'Room capacity', text: 'Capacity checks, seat utilisation, room eligibility and scenario feasibility are recomputed on the server.' },
              { icon: UserRound, title: 'Instructor limit', text: 'Workload warnings and the availability constraint use the declared weekly maximum.' },
              { icon: Users2, title: 'Cohort size', text: 'Group size flows into capacity checks, seat utilisation and the movement calculation.' },
            ].map((item) => (
              <div key={item.title} className="bg-panel p-4">
                <item.icon className="h-4 w-4 text-cyan/80" />
                <div className="mt-2 text-[11px] font-medium text-ink">{item.title}</div>
                <p className="mt-1 text-[10px] leading-relaxed text-faint">{item.text}</p>
              </div>
            ))}
          </div>
          <div className="px-5 py-4"><Provenance>Saved runs retain the baseline snapshot captured at creation time. Editing the current dataset therefore does not silently rewrite past comparisons; create a new scenario to test the changed model.</Provenance></div>
        </Panel>
        <Panel className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-ink">Dataset health</span>
            <Badge tone={campus.baseline.hard_issue_count ? 'warning' : 'success'} dot>{campus.baseline.hard_issue_count ? 'attention' : 'clean'}</Badge>
          </div>
          <div className="mt-3 space-y-2 text-[10px]">
            {[
              ['Capacity breaches', campus.baseline.capacity_violations_count],
              ['Booking conflicts', campus.baseline.conflicts_total],
              ['Facility mismatches', campus.baseline.facility_mismatch_count],
              ['Displaced sessions', campus.baseline.unassigned_sessions],
              ['Teacher overloads', campus.baseline.teacher_overload_count],
            ].map(([label, value]) => (
              <div key={String(label)} className="flex items-center justify-between gap-2 border-b border-lineSoft pb-1.5 last:border-b-0 last:pb-0">
                <span className="text-faint">{label}</span>
                <span className={cn('font-mono tabular-nums', Number(value) ? 'text-warning' : 'text-success')}>{value}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 border-t border-lineSoft pt-2 text-[9px] leading-relaxed text-faint">
            Baseline room utilisation {fmtPct(campus.baseline.room_utilization_pct)} · active-room {fmtPct(campus.baseline.active_room_utilization_pct)}.
          </div>
          <Link to="/method" className="focus-ring mt-2 inline-flex items-center gap-1 text-[9.5px] text-cyan/80 hover:text-cyan">Review formulas <ArrowRight className="h-3 w-3" /></Link>
        </Panel>
      </div>

      <EditDialog
        key={editTarget ? `${editTarget.type}-${'room' in editTarget ? editTarget.room.id : 'teacher' in editTarget ? editTarget.teacher.id : editTarget.group.id}` : 'none'}
        target={editTarget}
        onClose={() => setEditTarget(null)}
        onSaved={async (message) => {
          setEditTarget(null)
          await refreshAll()
          toast('Model updated', 'success', message)
        }}
      />

      <ConfirmDialog
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        title="Reset the entire demo dataset?"
        description={<span>This deletes every saved scenario, plan and audit entry, then regenerates the seeded campus, baseline timetable and two demonstration scenarios. The action cannot be undone. It is blocked while a solver job is running.</span>}
        confirmLabel="Reset dataset"
        danger
        loading={resetting}
        onConfirm={resetDataset}
      />
    </div>
  )
}

function EditDialog({
  target,
  onClose,
  onSaved,
}: {
  target: EditTarget
  onClose: () => void
  onSaved: (message: string) => Promise<void>
}) {
  const [capacity, setCapacity] = useState(() => (target?.type === 'room' ? String(target.room.capacity) : ''))
  const [name, setName] = useState(() => (target?.type === 'room' ? target.room.name : ''))
  const [hours, setHours] = useState(() => (target?.type === 'teacher' ? String(target.teacher.max_weekly_hours) : ''))
  const [size, setSize] = useState(() => (target?.type === 'group' ? String(target.group.size) : ''))
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  if (!target) return null

  const submit = async () => {
    setError(null)
    setSaving(true)
    try {
      if (target.type === 'room') {
        const numeric = Number(capacity)
        if (!Number.isInteger(numeric) || numeric < 10 || numeric > 300) throw new Error('Capacity must be a whole number between 10 and 300.')
        if (name.trim().length < 2) throw new Error('Room name must contain at least two characters.')
        await api.updateRoom(target.room.id, { capacity: numeric, name: name.trim() })
        await onSaved(`${target.room.code} now holds ${numeric} seats; diagnostics were recomputed.`)
      } else if (target.type === 'teacher') {
        const numeric = Number(hours)
        if (!Number.isFinite(numeric) || numeric < 1 || numeric > 40) throw new Error('Weekly limit must be between 1 and 40 hours.')
        await api.updateTeacher(target.teacher.id, { max_weekly_hours: Math.round(numeric) })
        await onSaved(`${target.teacher.name}'s weekly limit is now ${Math.round(numeric)}h.`)
      } else {
        const numeric = Number(size)
        if (!Number.isInteger(numeric) || numeric < 5 || numeric > 300) throw new Error('Cohort size must be a whole number between 5 and 300.')
        await api.updateGroup(target.group.id, { size: numeric })
        await onSaved(`${target.group.name} now has ${numeric} students; capacity checks were recomputed.`)
      }
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.detail : caught instanceof Error ? caught.message : 'The update failed.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={target.type === 'room' ? `Edit ${target.room.code}` : target.type === 'teacher' ? `Edit ${target.teacher.name}` : `Edit ${target.group.name}`}
      description="Changes are persisted immediately and applied to the baseline diagnostics."
      width="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button variant="primary" onClick={submit} loading={saving}>Save changes</Button>
        </>
      }
    >
      <div className="space-y-4">
        {target.type === 'room' && (
          <>
            <Field label="Room name" htmlFor="room-name" hint={`${name.length}/80`}>
              <Input id="room-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={80} />
            </Field>
            <Field label="Seat capacity" htmlFor="room-capacity" hint="10–300" error={error}>
              <Input id="room-capacity" type="number" min={10} max={300} value={capacity} onChange={(event) => setCapacity(event.target.value)} />
            </Field>
            <div className="rounded border border-lineSoft bg-subtle px-3 py-2 text-[9.5px] leading-relaxed text-faint">
              Baseline bookings in this room: <span className="font-mono text-muted">{target.room.kind}</span> · {target.room.building_name} · floor {target.room.floor}. Reducing capacity below a group size creates a reproducible capacity breach.
            </div>
          </>
        )}
        {target.type === 'teacher' && (
          <>
            <Field label="Maximum weekly hours" htmlFor="teacher-hours" hint="1–40h" error={error}>
              <Input id="teacher-hours" type="number" min={1} max={40} value={hours} onChange={(event) => setHours(event.target.value)} />
            </Field>
            <div className="rounded border border-lineSoft bg-subtle px-3 py-2 text-[9.5px] leading-relaxed text-faint">
              Declared unavailability is fixed at model level: {target.teacher.unavailable.length ? target.teacher.unavailable.map(([day, slot]) => `D${day + 1}S${slot + 1}`).join(', ') : 'none'}.
            </div>
          </>
        )}
        {target.type === 'group' && (
          <>
            <Field label="Enrolment" htmlFor="group-size" hint="5–300" error={error}>
              <Input id="group-size" type="number" min={5} max={300} value={size} onChange={(event) => setSize(event.target.value)} />
            </Field>
            <div className="rounded border border-lineSoft bg-subtle px-3 py-2 text-[9.5px] leading-relaxed text-faint">
              Affects capacity, seat utilisation and movement. The group's home building determines modelled walking distance.
            </div>
          </>
        )}
        {error && <div className="flex items-start gap-2 rounded border border-critical/25 bg-critical/[0.05] px-3 py-2 text-[10px] text-critical"><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" /> {error}</div>}
      </div>
    </Modal>
  )
}
