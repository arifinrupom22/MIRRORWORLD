import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowRight,
  Beaker,
  Building2,
  CalendarClock,
  ChevronDown,
  ChevronUp,
  CircleDot,
  Gauge,
  GraduationCap,
  Info,
  Loader2,
  Play,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  UserRoundX,
  Users2,
  Wand2,
  Zap,
} from 'lucide-react'
import { api, ApiError } from '../lib/api'
import { useCampus, useScenario, useScenarios, useTemplates } from '../lib/hooks'
import { useAppStore, toast } from '../store/appStore'
import type { ScenarioDetail, ScenarioKind, ScenarioParams, ScenarioTemplate, SeverityAssessment } from '../lib/types'
import { cn, fmtNumber, timeAgo } from '../lib/utils'
import {
  Badge,
  Button,
  Checkbox,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Field,
  Input,
  LoadingBlock,
  Panel,
  PanelHeader,
  Segmented,
  Select,
  StatusBadge,
  Tabs,
} from '../components/ui'
import { ComparisonBars } from '../components/charts'
import { DifferencePanel } from '../components/DifferencePanel'
import { ActiveScenarioBanner, DataQualityBadge, Insight, PipelineStrip, Provenance } from '../components/shared'
import { TimetableGrid } from '../components/TimetableGrid'

interface FormState extends ScenarioParams {
  name: string
  kind: ScenarioKind
}

const EMPTY_FORM: FormState = {
  name: 'Untitled disruption',
  kind: 'facility',
  enrollment_delta: 0,
  unavailable_room_ids: [],
  unavailable_building_ids: [],
  unavailable_teacher_ids: [],
  lab_availability_pct: 100,
  equipment_loss: [],
  teacher_workload_delta: 0,
  lab_policy: 'default',
  operating_end_slot: 6,
  energy_mode: 'standard',
  notes: '',
}

const KIND_LABEL: Record<string, string> = {
  demand: 'Demand',
  facility: 'Facility',
  policy: 'Policy',
  sustainability: 'Energy',
  compound: 'Compound',
}

function paramsFromForm(form: FormState): ScenarioParams {
  return {
    enrollment_delta: form.enrollment_delta,
    unavailable_room_ids: [...form.unavailable_room_ids].sort(),
    unavailable_building_ids: [...form.unavailable_building_ids].sort(),
    unavailable_teacher_ids: [...form.unavailable_teacher_ids].sort(),
    lab_availability_pct: form.lab_availability_pct,
    equipment_loss: [...form.equipment_loss].sort(),
    teacher_workload_delta: form.teacher_workload_delta,
    lab_policy: form.lab_policy,
    operating_end_slot: form.operating_end_slot,
    energy_mode: form.energy_mode,
    notes: form.notes ?? '',
  }
}

export function SimulationStudioPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const initialId = searchParams.get('scenario')
  const [loadedId, setLoadedId] = useState<string | null>(initialId)
  const { data: campus, isLoading: campusLoading, isError: campusError, error: campusErrorValue, refetch: refetchCampus } = useCampus()
  const { data: recent, refetch: refetchScenarios } = useScenarios()
  const { data: templateData } = useTemplates()
  const { data: loaded, isError: loadedError } = useScenario(loadedId)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [result, setResult] = useState<ScenarioDetail | null>(null)
  const [status, setStatus] = useState<'idle' | 'running' | 'results' | 'error'>('idle')
  const [errors, setErrors] = useState<string[]>([])
  const [runError, setRunError] = useState<string | null>(null)
  const [affectedTab, setAffectedTab] = useState('all')
  const [scheduleMode, setScheduleMode] = useState<'group' | 'room'>('group')
  const [resetOpen, setResetOpen] = useState(false)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [roomQuery, setRoomQuery] = useState('')
  const [teacherQuery, setTeacherQuery] = useState('')
  const [roomBuilding, setRoomBuilding] = useState('all')
  const [assessment, setAssessment] = useState<SeverityAssessment | null>(null)
  const [assessing, setAssessing] = useState(false)
  const setActiveScenario = useAppStore((state) => state.setActiveScenario)
  const navigate = useNavigate()

  useEffect(() => {
    if (loaded?.scenario && loadedId && result?.id !== loadedId) {
      setResult(loaded.scenario)
      setStatus('results')
      setForm({
        ...EMPTY_FORM,
        name: loaded.scenario.name,
        kind: loaded.scenario.kind as ScenarioKind,
        ...loaded.scenario.params,
      })
      setActiveScenario(loaded.scenario.id, loaded.scenario.name)
    }
  }, [loaded, loadedId, result?.id, setActiveScenario])

  useEffect(() => {
    if (loadedError) {
      setRunError('The requested scenario could not be loaded. It may have been removed by a dataset reset.')
      setStatus('error')
    }
  }, [loadedError])

  const topRooms = useMemo(() => {
    if (!campus) return []
    const counts = new Map<string, number>()
    for (const entry of campus.baseline_schedule) {
      if (entry.room_id) counts.set(entry.room_id, (counts.get(entry.room_id) ?? 0) + entry.length)
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id)
  }, [campus])

  const topTeacher = useMemo(() => {
    if (!campus) return null
    const counts = new Map<string, number>()
    for (const entry of campus.baseline_schedule) {
      if (entry.teacher_id) counts.set(entry.teacher_id, (counts.get(entry.teacher_id) ?? 0) + entry.length)
    }
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1])
    return sorted[0]?.[0] ?? null
  }, [campus])

  const presets = useMemo(() => {
    if (!campus) return []
    const labs = topRooms.filter((id) => campus.rooms.find((room) => room.id === id)?.kind === 'lab').slice(0, 2)
    const seminarRoom = topRooms.find((id) => campus.rooms.find((room) => room.id === id)?.kind === 'classroom')
    return [
      {
        id: 'lab',
        label: 'Lab closure',
        description: 'Two high-demand laboratories go offline for maintenance. Every lab session must be rehoused or displaced.',
        icon: Beaker,
        accent: 'violet' as const,
        form: (): FormState => ({
          ...EMPTY_FORM,
          name: 'Robotics labs — maintenance closure',
          kind: 'facility',
          unavailable_room_ids: labs,
          notes: 'Facilities notice: both robotics labs unavailable for the full teaching week.',
        }),
      },
      {
        id: 'teacher',
        label: 'Instructor absence',
        description: 'The most heavily booked instructor is unavailable. Multi-session courses must be recovered consistently.',
        icon: UserRoundX,
        accent: 'warning' as const,
        form: (): FormState => ({
          ...EMPTY_FORM,
          name: 'Instructor absence — unplanned leave',
          kind: 'facility',
          unavailable_teacher_ids: topTeacher ? [topTeacher] : [],
          notes: 'Unplanned absence for the full week; substitution is not modelled.',
        }),
      },
      {
        id: 'demand',
        label: 'Enrolment surge',
        description: 'Cohort sizes grow by roughly 12%. Capacity and lab-equipment constraints become binding.',
        icon: GraduationCap,
        accent: 'cyan' as const,
        form: (): FormState => ({
          ...EMPTY_FORM,
          name: 'Enrolment surge — +12% cohort',
          kind: 'demand',
          enrollment_delta: Math.min(600, Math.round(campus.summary.students * 0.12)),
          notes: 'Late admissions increase every group by a uniform 12%.',
        }),
      },
      {
        id: 'policy',
        label: 'Compressed day',
        description: 'Teaching must end by 16:10. Late slots disappear, increasing peak demand earlier in the day.',
        icon: CalendarClock,
        accent: 'warning' as const,
        form: (): FormState => ({
          ...EMPTY_FORM,
          name: 'Compressed teaching day',
          kind: 'policy',
          operating_end_slot: 4,
          notes: 'Campus closure after 16:10 for an external event.',
        }),
      },
      {
        id: 'energy',
        label: 'Efficiency week',
        description: 'Shift lab policy to afternoons and apply efficient room power. Tests whether sustainability targets conflict with feasibility.',
        icon: Zap,
        accent: 'success' as const,
        form: (): FormState => ({
          ...EMPTY_FORM,
          name: 'Efficiency week — afternoon labs',
          kind: 'sustainability',
          lab_policy: 'afternoon_only',
          energy_mode: 'efficiency',
          notes: 'Energy reduction pilot; labs restricted to slots 3–7.',
        }),
      },
      {
        id: 'compound',
        label: 'Compound disruption',
        description: 'A classroom closes, enrolment rises, and the day shortens. Tests multi-constraint recovery.',
        icon: Wand2,
        accent: 'critical' as const,
        form: (): FormState => ({
          ...EMPTY_FORM,
          name: 'Compound disruption — room + demand + policy',
          kind: 'compound',
          unavailable_room_ids: seminarRoom ? [seminarRoom] : [],
          enrollment_delta: Math.min(600, Math.round(campus.summary.students * 0.08)),
          operating_end_slot: 4,
          notes: 'Concurrent facilities, demand and operating-window disruption.',
        }),
      },
    ]
  }, [campus, topRooms, topTeacher])

  const rooms = campus?.rooms ?? []
  const teachers = campus?.teachers ?? []
  const days = campus?.days ?? []
  const slots = campus?.time_slots ?? []

  const filteredRooms = useMemo(() => {
    const needle = roomQuery.trim().toLowerCase()
    return rooms.filter((room) => {
      if (roomBuilding !== 'all' && room.building_id !== roomBuilding) return false
      if (needle && !`${room.code} ${room.name} ${room.building_name}`.toLowerCase().includes(needle)) return false
      return true
    })
  }, [rooms, roomQuery, roomBuilding])
  const filteredTeachers = useMemo(() => {
    const needle = teacherQuery.trim().toLowerCase()
    return teachers.filter((teacher) => !needle || `${teacher.name} ${teacher.department}`.toLowerCase().includes(needle))
  }, [teachers, teacherQuery])
  const equipmentTags = useMemo(
    () => [...new Set(rooms.flatMap((room) => room.equipment ?? []))].sort(),
    [rooms],
  )

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((previous) => ({ ...previous, [key]: value }))
  const toggleRoom = (id: string) =>
    setForm((previous) => ({
      ...previous,
      unavailable_room_ids: previous.unavailable_room_ids.includes(id)
        ? previous.unavailable_room_ids.filter((item) => item !== id)
        : [...previous.unavailable_room_ids, id],
    }))
  const toggleTeacher = (id: string) =>
    setForm((previous) => ({
      ...previous,
      unavailable_teacher_ids: previous.unavailable_teacher_ids.includes(id)
        ? previous.unavailable_teacher_ids.filter((item) => item !== id)
        : [...previous.unavailable_teacher_ids, id],
    }))
  const toggleBuilding = (id: string) =>
    setForm((previous) => ({
      ...previous,
      unavailable_building_ids: previous.unavailable_building_ids.includes(id)
        ? previous.unavailable_building_ids.filter((item) => item !== id)
        : [...previous.unavailable_building_ids, id],
    }))
  const toggleEquipment = (tag: string) =>
    setForm((previous) => ({
      ...previous,
      equipment_loss: previous.equipment_loss.includes(tag)
        ? previous.equipment_loss.filter((item) => item !== tag)
        : [...previous.equipment_loss, tag],
    }))

  const changed =
    form.enrollment_delta !== 0 ||
    form.unavailable_room_ids.length > 0 ||
    form.unavailable_building_ids.length > 0 ||
    form.unavailable_teacher_ids.length > 0 ||
    form.lab_availability_pct !== 100 ||
    form.equipment_loss.length > 0 ||
    form.teacher_workload_delta !== 0 ||
    form.lab_policy !== 'default' ||
    form.operating_end_slot !== 6 ||
    form.energy_mode !== 'standard'

  useEffect(() => {
    if (!campus || !changed) {
      setAssessment(null)
      return
    }
    const timer = window.setTimeout(async () => {
      setAssessing(true)
      try {
        const response = await api.assess(paramsFromForm(form))
        setAssessment(response.assessment)
      } catch {
        setAssessment(null)
      } finally {
        setAssessing(false)
      }
    }, 650)
    return () => window.clearTimeout(timer)
  }, [campus, changed, form])

  const validate = (): string[] => {
    const next: string[] = []
    if (!form.name.trim() || form.name.trim().length < 2) next.push('Scenario name must contain at least two characters.')
    if (form.name.length > 90) next.push('Scenario name must be 90 characters or fewer.')
    if (!changed) next.push('Change at least one parameter so the simulation differs from the baseline.')
    if (form.enrollment_delta < -300 || form.enrollment_delta > 600) next.push('Enrolment delta must stay between −300 and +600 students.')
    if (form.unavailable_room_ids.length > rooms.length) next.push('Every room cannot be unavailable.')
    if (form.lab_availability_pct < 0 || form.lab_availability_pct > 100) next.push('Laboratory availability must stay between 0 and 100%.')
    if (form.teacher_workload_delta < -10 || form.teacher_workload_delta > 10) next.push('Teacher workload delta must stay between −10 and +10 hours.')
    if (form.operating_end_slot < 3 || form.operating_end_slot > 7) next.push('Teaching must end between slot 4 and slot 8.')
    if (form.notes && form.notes.length > 400) next.push('Notes must be 400 characters or fewer.')
    return next
  }

  const run = async () => {
    const validation = validate()
    setErrors(validation)
    if (validation.length) return
    setStatus('running')
    setRunError(null)
    try {
      const body = {
        name: form.name.trim(),
        kind: form.kind,
        params: paramsFromForm(form),
      }
      const response = await api.createScenario(body)
      setResult(response.scenario)
      setStatus('results')
      setAffectedTab('all')
      setActiveScenario(response.scenario.id, response.scenario.name)
      setSearchParams({ scenario: response.scenario.id }, { replace: true })
      setLoadedId(response.scenario.id)
      refetchScenarios()
      toast('Simulation complete', 'success', `${response.scenario.affected.counts.sessions} sessions affected — recovery plans are ready to generate.`)
    } catch (caught) {
      setStatus('error')
      setRunError(caught instanceof ApiError ? caught.detail : caught instanceof Error ? caught.message : 'The simulation request failed.')
      toast('Simulation failed', 'error', caught instanceof Error ? caught.message : 'Unknown error')
    }
  }

  const reset = () => {
    setForm({ ...EMPTY_FORM, name: 'Untitled disruption' })
    setResult(null)
    setStatus('idle')
    setErrors([])
    setRunError(null)
    setLoadedId(null)
    setSearchParams({}, { replace: true })
    setResetOpen(false)
  }

  const applyPreset = (preset: (typeof presets)[number]) => {
    setForm(preset.form())
    setErrors([])
    setStatus('idle')
    setResetOpen(false)
  }

  const applyTemplate = (template: ScenarioTemplate) => {
    const kindByCategory: Record<string, ScenarioKind> = {
      Demand: 'demand',
      Infrastructure: 'facility',
      Staffing: 'facility',
      Policy: 'policy',
      Emergency: 'compound',
    }
    setForm({
      ...EMPTY_FORM,
      ...template.params,
      name: template.name,
      kind: kindByCategory[template.category] ?? 'compound',
      notes: template.description,
    })
    setErrors([])
    setStatus('idle')
    setResult(null)
    setResetOpen(false)
  }

  if (campusLoading) return <LoadingBlock label="Loading simulation inputs" rows={8} />
  if (campusError || !campus) {
    return <ErrorState title="Simulation inputs unavailable" message={campusErrorValue instanceof Error ? campusErrorValue.message : 'The campus model could not be loaded.'} onRetry={() => refetchCampus()} />
  }

  const affected = result?.affected
  const visibleAffected = (affected?.sessions ?? []).filter((session) => {
    if (affectedTab === 'all') return true
    if (affectedTab === 'direct') return session.direct
    if (affectedTab === 'critical') return session.severity === 'critical'
    return session.source === affectedTab
  })

  return (
    <div>
      <header className="mb-5 flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="telemetry text-cyan/80">Simulation studio · counterfactual analysis</span>
            <DataQualityBadge verified />
            <Badge tone="neutral">engine seeded 42</Badge>
          </div>
          <h1 className="text-[26px] font-semibold leading-[1.1] tracking-[-0.03em] text-ink sm:text-[30px]">Simulation studio</h1>
          <p className="mt-2 max-w-3xl text-[12.5px] leading-relaxed text-muted">
            Configure a disruption, validate it against the live campus model, then inspect every directly and indirectly affected session before generating recovery plans.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link to="/comparison" className="focus-ring inline-flex h-8 items-center gap-2 rounded-md border border-line px-3 text-[11.5px] text-muted hover:text-ink">
            Compare runs <ArrowRight className="h-3.5 w-3.5" />
          </Link>
          <Button size="sm" variant="ghost" iconLeft={<RotateCcw className="h-3.5 w-3.5" />} onClick={() => setResetOpen(true)}>
            Reset scenario
          </Button>
        </div>
      </header>

      <div className="mb-4"><PipelineStrip active="simulate" scenarioId={result?.id} /></div>
      <div className="mb-4"><ActiveScenarioBanner compact /></div>

      <div className="grid gap-5 xl:grid-cols-[390px_minmax(0,1fr)]">
        <div className="min-w-0 space-y-5">
          <Panel>
            <PanelHeader
              eyebrow="Configuration"
              title="Disruption parameters"
              subtitle="Values are validated server-side. A run never mutates the baseline dataset."
              action={<Badge tone={changed ? 'info' : 'neutral'}>{changed ? 'modified' : 'baseline'}</Badge>}
            />
            <div className="space-y-4 p-4">
              <Field label="Scenario name" htmlFor="scenario-name" hint={`${form.name.length}/90`} error={errors.find((error) => error.toLowerCase().includes('name'))}>
                <Input id="scenario-name" value={form.name} onChange={(event) => update('name', event.target.value)} placeholder="e.g. Robotics lab closure" maxLength={90} />
              </Field>
              <Field label="Disruption class" htmlFor="scenario-kind" hint="classification">
                <Select id="scenario-kind" value={form.kind} onChange={(event) => update('kind', event.target.value as ScenarioKind)}>
                  {Object.entries(KIND_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </Select>
              </Field>

              <div className="rounded-md border border-lineSoft bg-subtle p-3">
                <div className="mb-1.5 flex items-center justify-between">
                  <label htmlFor="enrolment" className="text-[11px] font-medium text-muted">Enrolment delta</label>
                  <span className="font-mono text-[10px] tabular-nums text-cyan">{form.enrollment_delta > 0 ? '+' : ''}{form.enrollment_delta} students</span>
                </div>
                <input
                  id="enrolment"
                  type="range"
                  min={-300}
                  max={600}
                  step={10}
                  value={form.enrollment_delta}
                  onChange={(event) => update('enrollment_delta', Number(event.target.value))}
                  className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-subtleHover accent-cyan [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-canvas [&::-webkit-slider-thumb]:bg-cyan"
                />
                <div className="mt-1 flex justify-between font-mono text-[8px] text-faint"><span>−300</span><span>0</span><span>+600</span></div>
                <p className="mt-1 text-[9.5px] leading-relaxed text-faint">Applied uniformly to all cohorts; capacity feasibility is re-checked.</p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Teaching ends" htmlFor="end-slot" hint="slot">
                  <Select id="end-slot" value={form.operating_end_slot} onChange={(event) => update('operating_end_slot', Number(event.target.value))}>
                    {[3, 4, 5, 6, 7].map((value) => <option key={value} value={value}>Through slot {value + 1} · {slots[value]?.end ?? ''}</option>)}
                  </Select>
                </Field>
                <Field label="Lab policy" htmlFor="lab-policy" hint="constraint">
                  <Select id="lab-policy" value={form.lab_policy} onChange={(event) => update('lab_policy', event.target.value as ScenarioParams['lab_policy'])}>
                    <option value="default">Any valid slot</option>
                    <option value="afternoon_only">Afternoon only</option>
                  </Select>
                </Field>
              </div>

              <Field label="Energy model" htmlFor="energy-mode" hint="objective input">
                <Segmented
                  value={form.energy_mode}
                  onChange={(value) => update('energy_mode', value)}
                  options={[
                    { value: 'standard', label: 'Standard ratings' },
                    { value: 'efficiency', label: 'Efficiency-adjusted' },
                  ]}
                  className="w-full"
                />
              </Field>

              <div>
                <button type="button" onClick={() => setAdvancedOpen((value) => !value)} className="focus-ring flex w-full items-center justify-between rounded border border-lineSoft bg-subtle px-3 py-2 text-left">
                  <span className="flex items-center gap-2 text-[11px] font-medium text-ink"><Building2 className="h-3.5 w-3.5 text-cyan/70" /> Resource closures <Badge tone="neutral">{form.unavailable_room_ids.length + form.unavailable_teacher_ids.length}</Badge></span>
                  {advancedOpen ? <ChevronUp className="h-3.5 w-3.5 text-faint" /> : <ChevronDown className="h-3.5 w-3.5 text-faint" />}
                </button>
                {advancedOpen && (
                  <div className="mt-3 space-y-4 animate-fade-in">
                    <div>
                      <div className="mb-2 flex items-center gap-2">
                        <span className="font-mono text-[8px] uppercase tracking-[0.09em] text-faint">Unavailable rooms</span>
                        {form.unavailable_room_ids.length > 0 && <button type="button" onClick={() => update('unavailable_room_ids', [])} className="focus-ring ml-auto text-[9px] text-cyan/80">clear</button>}
                      </div>
                      <div className="mb-2 flex gap-2">
                        <Input value={roomQuery} onChange={(event) => setRoomQuery(event.target.value)} placeholder="Filter rooms…" className="h-7 flex-1 text-[10.5px]" aria-label="Filter rooms" />
                        <select value={roomBuilding} onChange={(event) => setRoomBuilding(event.target.value)} aria-label="Filter room building" className="input-base h-7 w-24 text-[10px]">
                          <option value="all">All</option>
                          {campus.buildings.map((building) => <option key={building.id} value={building.id}>{building.code}</option>)}
                        </select>
                      </div>
                      <div className="max-h-44 space-y-0.5 overflow-y-auto rounded border border-lineSoft p-1.5 scroll-thin">
                        {filteredRooms.map((room) => (
                          <Checkbox
                            key={room.id}
                            checked={form.unavailable_room_ids.includes(room.id)}
                            onChange={() => toggleRoom(room.id)}
                            label={
                              <span className="flex w-full items-center justify-between gap-2">
                                <span className="font-mono text-[9.5px] text-muted">{room.code}</span>
                                <span className="text-[8.5px] text-faint">{room.building_code} · {room.capacity} seats</span>
                              </span>
                            }
                          />
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="mb-2 flex items-center gap-2">
                        <span className="font-mono text-[8px] uppercase tracking-[0.09em] text-faint">Building closures</span>
                        {form.unavailable_building_ids.length > 0 && <button type="button" onClick={() => update('unavailable_building_ids', [])} className="focus-ring ml-auto text-[9px] text-cyan/80">clear</button>}
                      </div>
                      <div className="space-y-0.5 rounded border border-lineSoft p-1.5">
                        {campus.buildings.map((building) => (
                          <Checkbox
                            key={building.id}
                            checked={form.unavailable_building_ids.includes(building.id)}
                            onChange={() => toggleBuilding(building.id)}
                            label={
                              <span className="flex w-full items-center justify-between gap-2">
                                <span className="text-[9.5px] text-muted">{building.code} · {building.name}</span>
                                <span className="text-[8.5px] text-faint">{building.room_count ?? 0} rooms</span>
                              </span>
                            }
                          />
                        ))}
                      </div>
                    </div>
                    <div className="rounded border border-lineSoft bg-subtle p-2.5">
                      <div className="mb-1.5 flex items-center justify-between">
                        <label htmlFor="lab-availability" className="text-[10px] font-medium text-muted">Laboratory availability</label>
                        <span className="font-mono text-[9.5px] text-cyan">{form.lab_availability_pct}%</span>
                      </div>
                      <input
                        id="lab-availability"
                        type="range"
                        min={0}
                        max={100}
                        step={5}
                        value={form.lab_availability_pct}
                        onChange={(event) => update('lab_availability_pct', Number(event.target.value))}
                        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-subtleHover accent-cyan [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-canvas [&::-webkit-slider-thumb]:bg-cyan"
                      />
                      <p className="mt-1 text-[8.5px] leading-relaxed text-faint">Labs beyond this share are closed deterministically by room id.</p>
                    </div>
                    <div>
                      <div className="mb-2 flex items-center gap-2">
                        <span className="font-mono text-[8px] uppercase tracking-[0.09em] text-faint">Equipment unavailable</span>
                        {form.equipment_loss.length > 0 && <button type="button" onClick={() => update('equipment_loss', [])} className="focus-ring ml-auto text-[9px] text-cyan/80">clear</button>}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {equipmentTags.map((tag) => (
                          <button
                            key={tag}
                            type="button"
                            onClick={() => toggleEquipment(tag)}
                            className={cn('focus-ring rounded border px-1.5 py-0.5 font-mono text-[8.5px]', form.equipment_loss.includes(tag) ? 'border-critical/40 bg-critical/10 text-critical' : 'border-line text-faint hover:text-ink')}
                          >
                            {tag}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="mb-2 flex items-center gap-2">
                        <span className="font-mono text-[8px] uppercase tracking-[0.09em] text-faint">Unavailable instructors</span>
                        {form.unavailable_teacher_ids.length > 0 && <button type="button" onClick={() => update('unavailable_teacher_ids', [])} className="focus-ring ml-auto text-[9px] text-cyan/80">clear</button>}
                      </div>
                      <Input value={teacherQuery} onChange={(event) => setTeacherQuery(event.target.value)} placeholder="Filter instructors…" className="mb-2 h-7 text-[10.5px]" aria-label="Filter instructors" />
                      <div className="max-h-40 space-y-0.5 overflow-y-auto rounded border border-lineSoft p-1.5 scroll-thin">
                        {filteredTeachers.map((teacher) => (
                          <Checkbox
                            key={teacher.id}
                            checked={form.unavailable_teacher_ids.includes(teacher.id)}
                            onChange={() => toggleTeacher(teacher.id)}
                            label={
                              <span className="flex w-full items-center justify-between gap-2">
                                <span className="text-[9.5px] text-muted">{teacher.name}</span>
                                <span className="text-[8.5px] text-faint">{teacher.department}</span>
                              </span>
                            }
                          />
                        ))}
                      </div>
                    </div>
                    <div className="rounded border border-lineSoft bg-subtle p-2.5">
                      <div className="mb-1.5 flex items-center justify-between">
                        <label htmlFor="workload-delta" className="text-[10px] font-medium text-muted">Weekly workload change</label>
                        <span className="font-mono text-[9.5px] text-cyan">{form.teacher_workload_delta > 0 ? '+' : ''}{form.teacher_workload_delta}h</span>
                      </div>
                      <input
                        id="workload-delta"
                        type="range"
                        min={-10}
                        max={10}
                        step={1}
                        value={form.teacher_workload_delta}
                        onChange={(event) => update('teacher_workload_delta', Number(event.target.value))}
                        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-subtleHover accent-cyan [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-canvas [&::-webkit-slider-thumb]:bg-cyan"
                      />
                      <p className="mt-1 text-[8.5px] leading-relaxed text-faint">Applied to every instructor's declared weekly limit and rechecked by the audit.</p>
                    </div>
                  </div>
                )}
              </div>

              <Field label="Analyst note" htmlFor="notes" hint={`${form.notes?.length ?? 0}/400`}>
                <textarea
                  id="notes"
                  value={form.notes}
                  onChange={(event) => update('notes', event.target.value)}
                  rows={2}
                  maxLength={400}
                  placeholder="Context stored with the scenario…"
                  className="input-base resize-none text-[11px]"
                />
              </Field>

              {errors.length > 0 && (
                <div className="rounded-md border border-critical/30 bg-critical/[0.06] p-3">
                  <div className="mb-1 flex items-center gap-1.5 text-[10.5px] font-medium text-critical"><AlertTriangle className="h-3 w-3" /> Fix {errors.length} issue{errors.length === 1 ? '' : 's'} before running</div>
                  <ul className="space-y-0.5 text-[10px] leading-relaxed text-critical/85">
                    {errors.map((error) => <li key={error}>• {error}</li>)}
                  </ul>
                </div>
              )}
              {runError && <ErrorState compact title="Simulation failed" message={runError} onRetry={run} />}

              <div className="flex gap-2">
                <Button variant="primary" className="flex-1" iconLeft={status === 'running' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />} onClick={run} loading={status === 'running'} disabled={!changed}>
                  {status === 'running' ? 'Simulating disruption…' : result ? 'Run again' : 'Run simulation'}
                </Button>
                <Button variant="secondary" onClick={() => applyPreset(presets[0])} disabled={!presets.length} iconLeft={<Sparkles className="h-3.5 w-3.5" />} aria-label="Apply lab closure preset">
                  Preset
                </Button>
              </div>
              <div className="flex items-center gap-1.5 text-[9px] text-faint"><Info className="h-3 w-3" /> Requests are validated; failures preserve your configuration.</div>
            </div>
          </Panel>

          <Panel>
            <PanelHeader
              eyebrow="Preliminary assessment"
              title="Impact severity"
              subtitle="Calculated from dependency relationships before any recovery plan is generated."
              action={assessment ? <Badge tone={assessment.level === 'critical' ? 'critical' : assessment.level === 'high' ? 'warning' : assessment.level === 'medium' ? 'warning' : 'success'}>{assessment.level} · {assessment.score.toFixed(0)}/100</Badge> : <Badge tone="neutral">{assessing ? 'assessing' : 'not assessed'}</Badge>}
            />
            {assessment ? (
              <div className="space-y-2.5 p-4">
                <p className="text-[10px] leading-relaxed text-muted">{assessment.summary}</p>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    ['Affected', assessment.affected.sessions],
                    ['Displaced', assessment.affected.displaced],
                    ['Groups', assessment.affected.groups],
                  ].map(([label, value]) => (
                    <div key={String(label)} className="rounded border border-lineSoft bg-input px-2 py-1.5">
                      <div className="font-mono text-[7.5px] uppercase tracking-[0.06em] text-faint">{label}</div>
                      <div className="font-mono text-[13px] text-ink">{value}</div>
                    </div>
                  ))}
                </div>
                <div className="space-y-1.5">
                  {assessment.factors.filter((factor) => factor.contribution > 0).slice(0, 5).map((factor) => (
                    <div key={factor.metric}>
                      <div className="flex items-center justify-between text-[9px]">
                        <span className="text-muted">{factor.label}</span>
                        <span className="font-mono text-faint">{factor.value}{factor.unit} · +{factor.contribution.toFixed(1)}</span>
                      </div>
                      <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-subtleHover">
                        <div className="h-full rounded-full bg-warning/70" style={{ width: `${Math.min(100, factor.contribution * 4)}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-[8.5px] leading-relaxed text-faint">Preliminary rubric; simulation is not an optimization result and does not assume a recovery exists.</p>
              </div>
            ) : (
              <div className="px-4 py-4 text-[10px] leading-relaxed text-faint">
                {assessing ? 'Computing dependency-aware impact…' : 'Change at least one parameter to calculate a preliminary impact.'}
              </div>
            )}
          </Panel>

          <Panel>
            <PanelHeader eyebrow="Starting points" title="Disruption presets" subtitle="Presets only populate inputs; you still review and execute the simulation." />
            <div className="grid gap-2 p-3">
              {presets.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => applyPreset(preset)}
                  className="focus-ring group flex items-start gap-2.5 rounded-md border border-lineSoft bg-subtle px-3 py-2.5 text-left transition-colors hover:border-line hover:bg-subtleHover"
                >
                  <preset.icon className={cn('mt-0.5 h-4 w-4 shrink-0', preset.accent === 'violet' ? 'text-violet' : preset.accent === 'warning' ? 'text-warning' : preset.accent === 'success' ? 'text-success' : preset.accent === 'critical' ? 'text-critical' : 'text-cyan')} />
                  <span className="min-w-0">
                    <span className="block text-[11px] font-medium text-ink">{preset.label}</span>
                    <span className="mt-0.5 block text-[9.5px] leading-relaxed text-faint">{preset.description}</span>
                  </span>
                </button>
              ))}
            </div>
          </Panel>

          <Panel>
            <PanelHeader eyebrow="Server catalogue" title="Scenario templates" subtitle="Seven specification templates derived from the current campus. Load one, then customize every field." action={<Badge tone="neutral">{templateData?.count ?? 0}</Badge>} />
            <div className="grid gap-2 p-3">
              {(templateData?.templates ?? []).map((template) => (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => applyTemplate(template)}
                  className="focus-ring group flex items-start gap-2.5 rounded-md border border-lineSoft bg-subtle px-3 py-2.5 text-left transition-colors hover:border-line hover:bg-subtleHover"
                >
                  <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-cyan/80" />
                  <span className="min-w-0">
                    <span className="flex items-center gap-2">
                      <span className="text-[11px] font-medium text-ink">{template.name}</span>
                      <Badge tone="neutral">{template.category}</Badge>
                    </span>
                    <span className="mt-0.5 block text-[9.5px] leading-relaxed text-faint">{template.description}</span>
                    <span className="mt-1 flex flex-wrap gap-1">
                      {template.fields.slice(0, 3).map((field) => (
                        <span key={field.key} className="font-mono text-[8px] text-faint/80">{field.label}: {Array.isArray(field.value) ? field.value.join(', ') : field.value}{field.unit ? ` ${field.unit}` : ''}</span>
                      ))}
                    </span>
                  </span>
                </button>
              ))}
              {!templateData?.templates.length && <p className="px-2 py-2 text-[10px] text-faint">Templates load with the campus model.</p>}
            </div>
          </Panel>

          {recent?.scenarios.length ? (
            <Panel>
              <PanelHeader eyebrow="Saved runs" title="Load a scenario" subtitle="Existing runs open with their stored parameters and results." />
              <div className="max-h-52 overflow-y-auto scroll-thin">
                {recent.scenarios.slice(0, 6).map((scenario) => (
                  <button
                    key={scenario.id}
                    type="button"
                    onClick={() => {
                      setLoadedId(scenario.id)
                      setResult(null)
                      setStatus('running')
                      setSearchParams({ scenario: scenario.id }, { replace: true })
                    }}
                    className="focus-ring flex w-full items-center gap-2 border-b border-lineSoft px-4 py-2.5 text-left last:border-b-0 hover:bg-subtleHover"
                  >
                    <CircleDot className="h-3 w-3 shrink-0 text-cyan/60" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[10.5px] text-ink">{scenario.name}</span>
                      <span className="block font-mono text-[8px] text-faint">{scenario.kind} · {timeAgo(scenario.updated_at)}</span>
                    </span>
                    <StatusBadge status={scenario.status} />
                  </button>
                ))}
              </div>
            </Panel>
          ) : null}
        </div>

        <div className="min-w-0 space-y-5">
          {status === 'running' && !result && (
            <Panel className="p-8">
              <div className="flex flex-col items-center text-center">
                <div className="relative mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-cyan/30 bg-cyan/[0.06]">
                  <Loader2 className="h-6 w-6 animate-spin text-cyan" />
                  <span className="absolute inset-0 animate-ping rounded-full border border-cyan/10" />
                </div>
                <h2 className="text-[14px] font-medium text-ink">Applying the disruption to the campus model</h2>
                <p className="mt-1.5 max-w-md text-[11px] leading-relaxed text-faint">
                  The engine is rebuilding room eligibility, revalidating capacity and availability, and tracing affected sessions. No progress percentage is shown because the duration is not predictable.
                </p>
                <div className="mt-4 flex flex-wrap justify-center gap-2 font-mono text-[8px] uppercase tracking-[0.08em] text-faint">
                  <span className="rounded border border-line px-2 py-1">room eligibility</span>
                  <span className="rounded border border-line px-2 py-1">capacity & equipment</span>
                  <span className="rounded border border-line px-2 py-1">affected graph</span>
                </div>
              </div>
            </Panel>
          )}

          {status === 'error' && !result && runError && (
            <Panel className="p-6">
              <ErrorState title="The disruption could not be simulated" message={runError} onRetry={run} />
              <div className="mt-4">
                <Insight tone="warning" title="Configuration preserved">Your inputs remain in the editor. Adjust any invalid resource selection and retry; no partial scenario was saved.</Insight>
              </div>
            </Panel>
          )}

          {!result && status !== 'running' && status !== 'error' && (
            <Panel>
              <PanelHeader eyebrow="No simulation yet" title="What this workspace will compute" subtitle="A counterfactual run is deterministic: the same inputs always produce the same affected set." />
              <div className="grid gap-px bg-lineSoft sm:grid-cols-3">
                {[
                  { icon: Building2, title: 'Direct impact', text: 'Closure and policy rules remove room, instructor or slot options from the baseline.' },
                  { icon: Gauge, title: 'Recomputed conflict ledger', text: 'Capacity, facility, availability and double-booking checks run against the disrupted assignment.' },
                  { icon: Users2, title: 'Propagation', text: 'Affected sessions link to groups, courses and instructors so indirect effects are explicit.' },
                ].map((item) => (
                  <div key={item.title} className="bg-panel p-4">
                    <item.icon className="h-4 w-4 text-cyan/80" />
                    <div className="mt-2 text-[11.5px] font-medium text-ink">{item.title}</div>
                    <p className="mt-1 text-[10px] leading-relaxed text-faint">{item.text}</p>
                  </div>
                ))}
              </div>
              <div className="border-t border-lineSoft px-5 py-4">
                <Provenance>
                  Baseline: {campus.summary.sessions} sessions · {campus.baseline.conflicts_total} collisions · {fmtNumber(campus.baseline.hard_issue_count)} hard issues. Dataset: {campus.campus.dataset_label}.
                </Provenance>
              </div>
            </Panel>
          )}

          {result && (
            <>
              <Panel className="animate-fade-up">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-lineSoft px-5 py-4">
                  <div>
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <span className="telemetry text-cyan/80">Simulation result</span>
                      <Badge tone="info">{KIND_LABEL[result.kind] ?? result.kind}</Badge>
                      {result.severity && <Badge tone={result.severity.level === 'critical' ? 'critical' : result.severity.level === 'high' ? 'warning' : result.severity.level === 'medium' ? 'warning' : 'success'}>{result.severity.level} impact · {result.severity.score.toFixed(0)}</Badge>}
                      <StatusBadge status={result.status} />
                      <span className="font-mono text-[8px] text-faint">{timeAgo(result.created_at)}</span>
                    </div>
                    <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-ink">{result.name}</h2>
                    <p className="mt-1 max-w-2xl text-[11px] leading-relaxed text-muted">{result.headline}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="xs" variant="secondary" onClick={() => navigate('/optimizer')} iconLeft={<SlidersHorizontal className="h-3 w-3" />}>Generate plans</Button>
                    <Button size="xs" variant="primary" onClick={() => navigate('/comparison')} iconRight={<ArrowRight className="h-3 w-3" />}>Compare</Button>
                  </div>
                </div>
                <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
                  <MiniResult label="Affected sessions" value={result.affected.counts.sessions} baseline={0} unit="sessions" tone="warning" />
                  <MiniResult label="Conflicts" value={result.metrics.conflicts_total} baseline={campus.baseline.conflicts_total} unit="collisions" tone="critical" />
                  <MiniResult label="Displaced" value={result.metrics.unassigned_sessions} baseline={campus.baseline.unassigned_sessions} unit="sessions" tone="critical" />
                  <MiniResult label="Energy" value={result.metrics.energy_kwh} baseline={campus.baseline.energy_kwh} unit="kWh/wk" tone="violet" digits={0} />
                </div>
              </Panel>

              <DifferencePanel difference={result.difference} />

              <div className="grid gap-5 lg:grid-cols-2">
                <Panel>
                  <PanelHeader eyebrow="Exposure" title="Affected sessions" subtitle="Direct means the session was explicitly disrupted. Indirect sessions depend on a directly affected resource." action={<Badge tone="warning">{result.affected.counts.sessions}</Badge>} />
                  <div className="grid grid-cols-2 gap-px bg-lineSoft sm:grid-cols-4">
                    {[
                      { label: 'Direct', value: result.affected.counts.direct },
                      { label: 'Critical', value: result.affected.counts.critical },
                      { label: 'Groups', value: result.affected.counts.groups },
                      { label: 'Courses', value: result.affected.counts.courses },
                    ].map((item) => (
                      <div key={item.label} className="bg-panel px-3 py-2.5">
                        <div className="font-mono text-[8px] uppercase tracking-[0.07em] text-faint">{item.label}</div>
                        <div className="mt-0.5 font-mono text-[16px] font-semibold text-ink">{item.value}</div>
                      </div>
                    ))}
                  </div>
                  <div className="p-4">
                    <div className="space-y-2">
                      {(['rooms', 'teachers', 'groups', 'courses'] as const).map((key) => {
                        const items = result.affected.resources[key]
                        if (!items.length) return null
                        return (
                          <div key={key}>
                            <div className="mb-1 font-mono text-[8px] uppercase tracking-[0.08em] text-faint">{key} · {items.length}</div>
                            <div className="flex flex-wrap gap-1">
                              {items.slice(0, 8).map((item) => <Badge key={item.id} tone="neutral">{item.label}</Badge>)}
                              {items.length > 8 && <Badge tone="neutral">+{items.length - 8}</Badge>}
                            </div>
                          </div>
                        )
                      })}
                      {!result.affected.resources.rooms.length && !result.affected.resources.teachers.length && !result.affected.resources.groups.length && !result.affected.resources.courses.length && (
                        <p className="text-[10.5px] text-faint">No resources were flagged by the disruption rules.</p>
                      )}
                    </div>
                  </div>
                </Panel>

                <Panel>
                  <PanelHeader eyebrow="Change ledger" title="Scenario vs baseline" subtitle="Absolute deltas are computed from independently recomputed metrics." />
                  <div className="space-y-4 p-5">
                    <ComparisonBars
                      rows={[
                        { label: 'Booking collisions', baseline: campus.baseline.conflicts_total, scenario: result.metrics.conflicts_total, plan: null, unit: '' },
                        { label: 'Capacity breaches', baseline: campus.baseline.capacity_violations_count, scenario: result.metrics.capacity_violations_count, plan: null, unit: '' },
                        { label: 'Displaced sessions', baseline: campus.baseline.unassigned_sessions, scenario: result.metrics.unassigned_sessions, plan: null, unit: '' },
                        { label: 'Active-room utilisation', baseline: campus.baseline.active_room_utilization_pct, scenario: result.metrics.active_room_utilization_pct, plan: null, unit: '%' },
                        { label: 'Modelled energy', baseline: campus.baseline.energy_kwh, scenario: result.metrics.energy_kwh, plan: null, unit: 'kWh' },
                      ]}
                    />
                  </div>
                </Panel>
              </div>

              <Panel>
                <PanelHeader
                  eyebrow="Causal detail"
                  title="Affected session ledger"
                  subtitle="Every row is a session in the simulated timetable. Reason codes are emitted by the engine, not inferred in the interface."
                  action={<Badge tone="warning">{visibleAffected.length} shown</Badge>}
                />
                <div className="px-4 pt-3">
                  <Tabs
                    value={affectedTab}
                    onChange={setAffectedTab}
                    tabs={[
                      { id: 'all', label: 'All', count: result.affected.sessions.length },
                      { id: 'direct', label: 'Direct', count: result.affected.counts.direct },
                      { id: 'critical', label: 'Critical', count: result.affected.counts.critical },
                    ]}
                  />
                </div>
                {visibleAffected.length === 0 ? (
                  <EmptyState title="No affected sessions in this view" description="Try a different filter or a stronger disruption." />
                ) : (
                  <div className="max-h-[420px] overflow-auto scroll-thin">
                    <table className="table-dense min-w-[760px]">
                      <thead><tr><th>Session</th><th>Resource</th><th>Slot</th><th>Reason</th><th>Severity</th></tr></thead>
                      <tbody>
                        {visibleAffected.map((session) => (
                          <tr key={session.session_id}>
                            <td>
                              <div className="flex items-center gap-2">
                                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: session.severity === 'critical' ? '#FF647C' : '#F5B84B' }} />
                                <div>
                                  <div className="font-mono text-[9.5px] text-ink">{session.course_code ?? session.label.split(' · ')[0]}</div>
                                  <div className="text-[9px] text-faint">{session.group_name} · {session.teacher_name}</div>
                                </div>
                              </div>
                            </td>
                            <td className="font-mono text-[9px]">{session.room_code ?? 'no room'}</td>
                            <td className="font-mono text-[9px]">{session.slot_label ?? '—'}</td>
                            <td><span className="text-[9.5px] text-muted">{session.reason}</span><span className="mt-0.5 block text-[8.5px] text-faint">{session.detail}</span></td>
                            <td><Badge tone={session.severity === 'critical' ? 'critical' : 'warning'}>{session.severity}</Badge></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Panel>

              <Panel>
                <PanelHeader
                  eyebrow="Assumption register"
                  title="Warnings & modelling assumptions"
                  subtitle="These statements are returned with the scenario and should be read alongside the numbers."
                  action={<Badge tone="neutral">{result.warnings.length + result.assumptions.length}</Badge>}
                />
                <div className="grid gap-4 p-5 lg:grid-cols-2">
                  <div>
                    <div className="mb-2 flex items-center gap-1.5 font-mono text-[8.5px] uppercase tracking-[0.08em] text-warning"><AlertTriangle className="h-3 w-3" /> Warnings ({result.warnings.length})</div>
                    {result.warnings.length ? (
                      <ul className="space-y-1.5">
                        {result.warnings.map((warning) => <li key={warning} className="rounded border border-warning/15 bg-warning/[0.025] px-2.5 py-2 text-[10px] leading-relaxed text-muted">{warning}</li>)}
                      </ul>
                    ) : <p className="text-[10.5px] text-faint">No warnings were emitted for this run.</p>}
                  </div>
                  <div>
                    <div className="mb-2 flex items-center gap-1.5 font-mono text-[8.5px] uppercase tracking-[0.08em] text-cyan"><Info className="h-3 w-3" /> Assumptions ({result.assumptions.length})</div>
                    <ul className="space-y-1.5">
                      {result.assumptions.map((assumption) => <li key={assumption} className="rounded border border-lineSoft px-2.5 py-2 text-[10px] leading-relaxed text-faint">{assumption}</li>)}
                    </ul>
                  </div>
                </div>
              </Panel>

              <Panel>
                <PanelHeader
                  eyebrow="Disrupted timetable"
                  title="Simulated week"
                  subtitle="The disrupted assignment, recomputed from the baseline. Displaced rows have no valid room or slot."
                  action={
                    <Segmented
                      size="sm"
                      value={scheduleMode}
                      onChange={setScheduleMode}
                      options={[{ value: 'group', label: 'By group' }, { value: 'room', label: 'By room' }]}
                    />
                  }
                />
                <div className="p-4">
                  <TimetableGrid schedule={result.schedule} campus={campus} days={days} slots={slots} initialView={scheduleMode} allowedViews={['group', 'room']} maxHeight={380} />
                </div>
              </Panel>

              <Panel className="border-cyan/25 bg-[linear-gradient(180deg,rgba(56,217,245,0.04),transparent_60%)] p-5">
                <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
                  <div>
                    <div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-cyan" /><span className="text-[13px] font-medium text-ink">Next: optimize recovery</span></div>
                    <p className="mt-1 max-w-xl text-[11px] leading-relaxed text-muted">
                      Generate three auditable CP-SAT strategies — space-first, energy-first and balanced — then compare them against this scenario.
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button variant="secondary" onClick={() => navigate('/dependencies')}>Inspect dependencies</Button>
                    <Button variant="primary" iconRight={<ArrowRight className="h-3.5 w-3.5" />} onClick={() => navigate('/optimizer')}>Open optimizer</Button>
                  </div>
                </div>
              </Panel>
            </>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        title="Reset this scenario?"
        description="The editor returns to an untouched baseline configuration and the current result is cleared. Saved runs remain available in history."
        confirmLabel="Reset editor"
        onConfirm={reset}
      />
    </div>
  )
}

function MiniResult({ label, value, baseline, unit, tone, digits = 0 }: { label: string; value: number; baseline: number; unit: string; tone: 'warning' | 'critical' | 'violet'; digits?: number }) {
  const colors = { warning: 'text-warning', critical: 'text-critical', violet: 'text-violet' }
  const delta = value - baseline
  return (
    <div className="rounded-md border border-lineSoft bg-input px-3 py-2.5">
      <div className="font-mono text-[8px] uppercase tracking-[0.08em] text-faint">{label}</div>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className={cn('font-mono text-[20px] font-semibold tabular-nums tracking-[-0.03em]', colors[tone])}>{fmtNumber(value, digits)}</span>
        <span className="font-mono text-[8px] uppercase tracking-[0.05em] text-faint">{unit}</span>
      </div>
      <div className="mt-1 font-mono text-[8.5px] text-faint">
        {baseline ? <>baseline {fmtNumber(baseline, digits)} · <span className={delta > 0 ? 'text-critical' : delta < 0 ? 'text-success' : ''}>{delta > 0 ? '+' : ''}{fmtNumber(delta, digits)}</span></> : 'newly affected'}
      </div>
    </div>
  )
}
