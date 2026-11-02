export type Severity = 'critical' | 'warning' | 'info' | 'positive'

export interface CampusInfo {
  name: string
  dataset_label: string
  source: string
}

export interface MapBox {
  x: number
  y: number
  w: number
  h: number
}

export interface Building {
  id: string
  code: string
  name: string
  zone: string
  purpose: string
  floors: number
  map: MapBox
  accent: string
  room_count?: number
  lab_count?: number
  capacity?: number
  sessions?: number
  occupied_hours?: number
  available_hours?: number
  utilization_pct?: number
  conflicts?: number
  room_ids?: string[]
}

export interface Room {
  id: string
  building_id: string
  code: string
  name: string
  kind: 'classroom' | 'lab'
  lab_types: string[]
  capacity: number
  floor: number
  power_kw: number
  equipment: string[]
  equipment_kw: number
  building_name?: string
  building_code?: string
}

export interface Teacher {
  id: string
  name: string
  department: string
  title: string
  max_weekly_hours: number
  unavailable: [number, number][]
}

export interface StudentGroup {
  id: string
  name: string
  department: string
  batch: string
  size: number
  home_building_id: string
}

export interface Course {
  id: string
  code: string
  title: string
  department: string
  teacher_id: string
  weekly_sessions: number
  length: number
  needs_lab: string | null
  required_equipment: string[]
  color: string
}

export interface SessionRecord {
  id: string
  course_id: string
  group_id: string
  sequence: number
  length: number
  room_id: string | null
  day: number | null
  start_slot: number | null
  group_size?: number
}

export interface GroupCourse {
  group_id: string
  course_id: string
}

export interface TimeSlot {
  index: number
  start: string
  end: string
  label: string
}

export interface DayRecord {
  index: number
  label: string
  short: string
}

export interface ScheduleEntry extends SessionRecord {
  course_code?: string
  course_title?: string
  course_color?: string
  needs_lab?: string | null
  teacher_id?: string
  teacher_name?: string
  group_name?: string
  department?: string
  group_size: number
  room_code?: string | null
  room_name?: string | null
  room_capacity?: number | null
  room_kind?: string | null
  building_id?: string | null
  building_name?: string | null
  room_power_kw?: number
  room_equipment_kw?: number
  day_label?: string | null
  slot_label?: string | null
  end_slot?: number
  displaced?: boolean
  displaced_reason?: string | null
  displaced_detail?: string | null
  label?: string
  original_room_id?: string | null
}

export interface ConflictPairSession {
  id: string
  label: string
  room_code?: string | null
  teacher_name?: string
}

export interface ConflictDetail {
  type: 'room' | 'teacher' | 'group'
  resource: string
  day: number
  slot: number
  slot_label: string
  sessions: ConflictPairSession[]
}

export interface CapacityDetail {
  session_id: string
  label: string
  room_code: string
  group_size: number
  capacity: number
  violation: number
  slot_label: string
}

export interface FacilityDetail {
  session_id: string
  label: string
  room_code: string
  reason: string
  slot_label: string
}

export interface AvailabilityDetail {
  session_id: string
  label: string
  teacher_name: string
  slot_label: string
  reason: string
}

export interface UnassignedDetail {
  session_id: string
  label: string
  reason: string
  detail: string
  group_name?: string
  teacher_name?: string
  room_code?: string | null
}

export interface TeacherLoad {
  teacher_id: string
  teacher_name: string
  department: string
  load_hours: number
  limit_hours: number
}

export interface TeacherOverload {
  teacher_id: string
  teacher_name: string
  load_hours: number
  limit_hours: number
}

export interface Metrics {
  sessions_total: number
  sessions_scheduled: number
  unassigned_sessions: number
  conflicts_total: number
  conflicts_by_type: { room: number; teacher: number; group: number }
  conflict_details: ConflictDetail[]
  capacity_violations_total: number
  capacity_violations_count: number
  capacity_details: CapacityDetail[]
  facility_mismatch_count: number
  facility_details: FacilityDetail[]
  availability_violation_count: number
  availability_details: AvailabilityDetail[]
  unassigned_details: UnassignedDetail[]
  room_utilization_pct: number
  active_room_utilization_pct: number
  seat_utilization_pct: number
  peak_utilization_pct: number
  peak_slot_label: string
  energy_kwh: number
  peak_kw: number
  energy_factor: number
  teacher_workload_std_h: number
  teacher_max_load_h: number
  teacher_max_load_name: string | null
  teacher_max_limit_h: number
  teacher_overload_count: number
  teacher_overloads: TeacherOverload[]
  teacher_loads: TeacherLoad[]
  movement_km: number
  movement_metres: number
  total_gap_hours: number
  avg_gap_hours: number
  gap_pairs: number
  students_total: number
  rooms_total: number
  rooms_available: number
  rooms_used: number
  available_room_hours: number
  occupied_room_hours: number
  operating_end_slot: number
  hard_issue_count: number
  schedule?: ScheduleEntry[]
}

export interface CampusPayload {
  campus: CampusInfo
  buildings: Building[]
  rooms: Room[]
  teachers: Teacher[]
  groups: StudentGroup[]
  courses: Course[]
  group_courses: GroupCourse[]
  sessions: SessionRecord[]
  days: DayRecord[]
  time_slots: TimeSlot[]
  distances: Record<string, Record<string, number>>
  baseline: Metrics
  baseline_schedule: ScheduleEntry[]
  fingerprint: string
  summary: {
    buildings: number
    rooms: number
    classrooms: number
    labs: number
    teachers: number
    groups: number
    courses: number
    sessions: number
    students: number
    seat_capacity: number
  }
}

export interface HeatCell {
  day: number
  slot: number
  sessions: number
  used_rooms: number
  utilization_pct: number
  conflicts: number
}

export interface AlertResource {
  type: 'room' | 'building' | 'teacher' | 'group' | 'course' | string
  id: string
  label: string
  reason?: string | null
}

export interface AlertEvidence {
  metric: string
  value: string | number | null
  comparison?: string
}

export interface AlertItem {
  id: string
  condition_key?: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  severity_label?: string
  category: string
  title: string
  description?: string
  detail: string
  affected_resources?: AlertResource[]
  consequences?: string
  suggested_action?: { text: string; route: string }
  evidence?: AlertEvidence[]
  detected_at?: string
  fingerprint?: string
  slot: string | null
  action: 'optimize' | 'campus' | 'simulate' | string
}

export interface RecommendationItem {
  id: string
  title: string
  action: string
  rationale: string
  evidence: AlertEvidence[]
  expected_effect: string
  affected_resources: AlertResource[]
  confidence: 'high' | 'medium' | 'low'
  route: string
  priority: number
}

export interface SeverityFactor {
  metric: string
  label: string
  value: number
  unit: string
  threshold: string
  contribution: number
  description: string
}

export interface SeverityAssessment {
  level: 'low' | 'medium' | 'high' | 'critical'
  score: number
  factors: SeverityFactor[]
  summary: string
  evidence: { metric: string; value: number; unit: string; contribution: number }[]
  affected: { sessions: number; direct: number; displaced: number; rooms: number; teachers: number; groups: number }
  assumptions: string[]
}

export interface ScenarioTemplateField {
  key: string
  label: string
  value: string | number | string[]
  unit?: string
  source?: string
}

export interface ScenarioTemplate {
  id: string
  name: string
  description: string
  category: string
  params: ScenarioParams
  fields: ScenarioTemplateField[]
  assumptions: string[]
}

export interface ActivityItem {
  id: number
  action: string
  scenario_id: string | null
  actor: string
  timestamp: string
  detail: Record<string, unknown>
}

export interface OverviewPayload extends CampusPayload {
  metrics: Metrics
  alert_counts?: { total: number; by_severity: Record<string, number>; by_category: Record<string, number> }
  recommendations?: RecommendationItem[]
  buildings_summary: Building[]
  heatmap: HeatCell[]
  snapshot: {
    day: number
    slot: number
    label: string
    active_sessions: number
    available_rooms: number
    available_room_codes: string[]
    busy_room_codes: string[]
  }
  alerts: AlertItem[]
  recent_scenarios: ScenarioSummary[]
  activity: ActivityItem[]
  engine: {
    solver: string
    seed: number
    status: string
    job_worker: string
  }
}

export interface ScenarioParams {
  enrollment_delta: number
  unavailable_room_ids: string[]
  unavailable_building_ids: string[]
  unavailable_teacher_ids: string[]
  lab_availability_pct: number
  equipment_loss: string[]
  teacher_workload_delta: number
  lab_policy: 'default' | 'afternoon_only'
  operating_end_slot: number
  energy_mode: 'standard' | 'efficiency'
  notes?: string
}

export type ScenarioKind = 'demand' | 'facility' | 'policy' | 'sustainability' | 'compound' | 'baseline'

export interface ScenarioSummary {
  id: string
  name: string
  kind: string
  status: string
  params: ScenarioParams
  metrics: Metrics
  created_at: string
  updated_at: string
  plan_count: number
  feasible_plans: number
  fallback_plans?: number
  plan_labels: string[]
  headline: string
  severity?: SeverityAssessment | null
}

export interface AffectedSession {
  session_id: string
  label: string
  course_id?: string
  course_code?: string
  group_id?: string
  group_name?: string
  teacher_id?: string
  teacher_name?: string
  room_id?: string | null
  room_code?: string | null
  slot_label?: string
  reason: string
  severity: 'critical' | 'warning'
  detail: string
  source?: string
  direct: boolean
}

export interface AffectedResource {
  id: string
  label: string
  reason: string
}

export interface Affected {
  sessions: AffectedSession[]
  resources: {
    rooms: AffectedResource[]
    teachers: AffectedResource[]
    groups: AffectedResource[]
    courses: AffectedResource[]
  }
  counts: {
    sessions: number
    direct: number
    critical: number
    rooms: number
    teachers: number
    groups: number
    courses: number
  }
  by_reason: Record<string, number>
}

export interface AuditCheck {
  name: string
  status: 'pass' | 'fail'
  detail: string
}

export interface PlanAudit {
  passed: boolean
  checks: AuditCheck[]
  violations: string[]
  hard_constraint_count?: number
}

export interface Plan {
  label: string
  name: string
  strategy: string
  status: string
  source?: 'solver' | 'constructive_fallback' | 'none'
  solver_status: string
  objective: number | null
  metrics: Metrics | null
  schedule?: ScheduleEntry[]
  assignments?: {
    session_id: string
    room_id: string
    day: number
    start_slot: number
  }[]
  warnings: string[]
  assumptions: string[]
  audit: PlanAudit
  objective_terms: Record<string, number>
  runtime_seconds: number
  created_at?: string
}

export interface ScenarioDetail extends ScenarioSummary {
  schedule: ScheduleEntry[]
  affected: Affected
  warnings: string[]
  assumptions: string[]
  diagnostics: Record<string, unknown>
  plans: Plan[]
  baseline?: Metrics
  job?: Job
  difference?: DifferenceResult | null
}

export interface Job {
  id: string
  scenario_id: string
  status: 'queued' | 'running' | 'cancelling' | 'completed' | 'cancelled' | 'infeasible' | 'failed'
  stage: string
  message: string
  plan_index: number
  total_plans: number
  plans_done: number
  weights: Record<string, number>
  time_limit: number
  error: string | null
  diagnostics: { constraint: string; label: string; detail: string }[]
  warnings: string[]
  created_at: string
  started_at: string | null
  finished_at: string | null
  result: { scenario_id: string; feasible_plans: number; fallback_plans?: number } | null
}

export interface GraphNode {
  id: string
  type: 'building' | 'room' | 'teacher' | 'group' | 'course' | 'session' | 'equipment'
  raw_id: string
  label: string
  sublabel: string
  meta: Record<string, unknown>
  degree: number
  affected: boolean
  severity: string | null
  impact_reason?: string
}

export interface GraphEdge {
  id: string
  source: string
  target: string
  relation: string
}

export interface GraphData {
  nodes: GraphNode[]
  edges: GraphEdge[]
  counts: Record<string, number>
  scenario_id: string | null
  generated_at: string
}

export interface ImpactResult {
  node: GraphNode
  direct: GraphNode[]
  indirect: GraphNode[]
  sessions: GraphNode[]
  alternatives: {
    room_id: string
    code: string
    building_id: string
    capacity: number
    kind: string
    course_code: string
    required_size?: number
  }[]
  summary: {
    direct_nodes: number
    indirect_nodes: number
    sessions: number
    groups: number
    teachers: number
    rooms: number
    courses: number
  }
  depth: number
  direct_by_type: Record<string, number>
  indirect_by_type: Record<string, number>
}

export interface MetricDelta {
  absolute: number | null
  percent: number | null
  better: boolean | null
}

export interface ComparisonRow {
  key: string
  label: string
  unit: string
  direction: 'lower' | 'higher' | 'neutral'
  baseline: number | null
  scenario: number | null
  plan: number | null
  scenario_delta: MetricDelta
  plan_delta: MetricDelta | null
  plan_vs_scenario: MetricDelta | null
}

export interface ExplanationStatement {
  tone: 'positive' | 'warning' | 'critical' | 'neutral'
  title: string
  text: string
  metric: string
}

export interface Recommendation {
  label: string
  name: string
  score: number
  weights: Record<string, number>
  leaders: Record<string, string>
  rationale: string
}

export interface DifferenceResource {
  type: 'room' | 'building' | 'teacher' | 'group' | 'course' | 'policy' | string
  id: string
  label: string
  reason?: string | null
}

export interface DifferenceChange {
  id: string
  kind: string
  category: string
  label: string
  description: string
  before: string | number | string[] | null
  after: string | number | string[] | null
  delta: number | null
  unit: string
  direction: 'increase' | 'decrease' | 'unchanged' | 'added' | 'removed' | 'changed'
  affected_resources: DifferenceResource[]
  affected_session_ids: string[]
  constraint_effects: string[]
  evidence: string[]
  why_it_matters: string
}

export interface DifferenceDecision {
  id: string
  title: string
  action: string
  rationale: string
  resources: DifferenceResource[]
  route: string
  evidence: string[]
}

export interface DifferenceResult {
  available: boolean
  partial: boolean
  scenario_id: string | null
  scenario_name: string | null
  reason?: string | null
  summary: string
  counts: Record<string, number>
  changes: DifferenceChange[]
  decisions: DifferenceDecision[]
  assumptions: string[]
}

export interface ComparisonPayload {
  scenario: ScenarioDetail
  difference?: DifferenceResult
  baseline: Metrics & { schedule: ScheduleEntry[] }
  scenario_metrics: Metrics
  scenario_schedule: ScheduleEntry[]
  plan: Plan | null
  rows: ComparisonRow[]
  explanation: {
    headline: string
    recommendation: Recommendation | null
    statements: ExplanationStatement[]
    data_quality: string[]
  }
  recommendation: Recommendation | null
  plans: Plan[]
  dataset: { label: string; source: string; energy_model: string }
}

export interface HistoryPayload {
  runs: (ScenarioSummary & {
    affected_count: number
    energy_kwh: number
    solver_statuses: string[]
    has_plans: boolean
  })[]
  audit: ActivityItem[]
  counts: { runs: number; optimized: number; feasible_runs: number }
}

export interface HealthPayload {
  status: string
  service: string
  solver: string
  solver_version: string
  database: string
  dataset: string
  timestamp: string
}

export interface MovementTransition {
  transition_id: string
  cohort_id: string
  cohort_name: string
  student_count: number
  from_session_id: string
  from_course_code: string
  from_room_id: string
  from_building_id: string
  from_building_name: string
  from_day: number
  from_slot: number
  from_time: string
  to_session_id: string
  to_course_code: string
  to_room_id: string
  to_building_id: string
  to_building_name: string
  to_day: number
  to_slot: number
  to_time: string
  time_gap_min: number
  distance_m: number | null
  walking_time_min: number | null
  feasible: boolean | null
  tight: boolean | null
  unknown_distance: boolean
  same_building: boolean
  is_cross_day: boolean
}

export interface MovementSummary {
  unique_routes: number
  total_transitions: number
  total_students: number
  total_distance_m: number
  total_walking_time_min: number
  tight_transitions: number
  infeasible_transitions: number
  unknown_distance_transitions: number
  same_building_transitions: number
  cross_day_transitions: number
  warning_count: number
}

export type AIMode = 'ask' | 'analyst' | 'what_if' | 'advisor' | 'research'

export interface AIModeInfo {
  id: AIMode
  label: string
  blurb: string
  guidance?: string
  stub: string
}

export type AIQualityKey = 'verified' | 'calculated' | 'optimizer' | 'ai_interpretation' | 'insufficient_data'

export interface AIQualityLabel {
  key: AIQualityKey
  label: string
  detail: string
  scope: string
}

export interface AIToolTrace {
  tool: string
  label?: string | null
  ok: boolean
  rows: number
  elapsed_ms: number
  error: string | null
}

export interface AITool {
  id: string
  label: string
  kind: 'read' | 'proposal' | 'write'
  description: string
  sources: string[]
  enabled: boolean
  requires_confirmation: boolean
}

export interface AIReasoning {
  mode: AIMode
  mode_label: string
  evidence: AIEvidence[]
  sources: string[]
  assumptions: AIAssumption[]
  limitations: string[]
  next_actions: { label: string | null; route?: string | null }[]
  text_origin: 'language-model' | 'verification'
}

export interface AIBriefingSection {
  id: string
  title: string
  summary: string
  items: string[]
  sources: string[]
  quality: { key: AIQualityKey; label: string; detail: string }
}

export interface AIBriefing {
  generated_at: string
  dataset: string | null
  scenario: string | null
  scenario_id: string | null
  sections: AIBriefingSection[]
  mode_hint: AIMode
  provenance: string
}

export interface AIStatus {
  enabled: boolean
  provider: string
  model: string
  fallback_model: string | null
  configured: boolean
  key_env: string
  key_env_aliases?: string[]
  base_url: string
  mode: 'language-model' | 'deterministic' | 'disabled'
  supported_providers: string[]
  error_hints?: Record<string, string>
  capabilities?: {
    streaming: boolean
    history_turns: number
    proposal_confirmation: string
    grounding: string
  }
}

export interface AIEvidence {
  label: string
  value: number | string | null
  source: string
}

export interface AIQuickAction {
  id: string
  label: string
  question: string
  available: boolean
  reason: string | null
}

export interface AIAssumption {
  claim: string
  status: string
  detail: string
}

export interface AIRecommendationCard {
  id: string
  problem: string
  title?: string
  evidence: AIEvidence[]
  action: string
  expected_benefit: string
  tradeoff: string
  confidence: 'high' | 'medium' | 'low'
  affected_resources?: { type: string; id: string; label: string; reason?: string | null }[]
  route?: string
  priority?: number
}

export interface AIChatResponse {
  answer: string
  provider: string
  model: string
  used_model: boolean
  fallback_used: boolean
  provider_error: string | null
  provider_error_kind?: string | null
  provider_error_hint?: string | null
  mode?: string
  configured: boolean
  scenario: string | null
  scenario_id: string | null
  evidence: AIEvidence[]
  quick_actions?: AIQuickAction[]
  assumptions?: AIAssumption[]
  recommendation_cards?: AIRecommendationCard[]
  truncated?: boolean
  // Intelligence modes, explainability and tool activity (Phase 5).
  capability_mode?: AIMode
  capability_mode_label?: string
  proposal?: AIProposal | null
  tools?: AIToolTrace[]
  evidence_quality?: AIQualityLabel[]
  reasoning?: AIReasoning
}

export interface AIProposalChange {
  label: string
  before: unknown
  after: unknown
}

export interface AIProposal {
  understood: boolean
  name: string | null
  kind: string | null
  params: ScenarioParams | null
  changes: AIProposalChange[]
  warnings: string[]
  blockers: string[]
  questions: string[]
  entities?: {
    buildings: { id: string; label: string | null; code?: string | null }[]
    rooms: { id: string; label: string | null; code?: string | null }[]
    teachers: { id: string; label: string | null; code?: string | null }[]
  }
  parser: string
  requires_confirmation: boolean
  proposal_id: string | null
  expires_in_seconds: number
  applied: boolean
}

export interface AIValidation {
  ok: boolean
  enabled?: boolean
  provider?: string
  model?: string
  kind?: string
  message?: string
  hint?: string
  display_name?: string | null
  status?: number | null
  output_token_limit?: number | null
}

export interface AIStreamMeta {
  type: 'meta'
  configured: boolean
  enabled: boolean
  provider: string
  model: string
  mode: string
  used_model: boolean
  fallback_used: boolean
}

export interface AIStreamDelta {
  type: 'delta'
  text: string
}

export type AIStreamDone = AIChatResponse & { type: 'done' }
export type AIStreamEvent = AIStreamMeta | AIStreamDelta | AIStreamDone

export interface MovementResponse {
  scenario_id: string | null
  day: number | null
  slot: number | null
  transitions: MovementTransition[]
  summary: MovementSummary
  warnings: string[]
}

