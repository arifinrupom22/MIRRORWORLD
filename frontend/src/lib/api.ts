import type {
  CampusPayload,
  ComparisonPayload,
  GraphData,
  HealthPayload,
  HistoryPayload,
  ImpactResult,
  Job,
  OverviewPayload,
  ScenarioDetail,
  ScenarioParams,
  ScenarioSummary,
} from './types'

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? ''

export class ApiError extends Error {
  status: number
  detail: string

  constructor(status: number, detail: string) {
    super(detail)
    this.name = 'ApiError'
    this.status = status
    this.detail = detail
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  })
  if (!response.ok) {
    let detail = `Request failed with status ${response.status}.`
    try {
      const body = await response.json()
      if (typeof body?.detail === 'string') detail = body.detail
      else if (Array.isArray(body?.detail)) {
        detail = body.detail
          .map((item: { msg?: string; loc?: unknown[] }) => item.msg ?? JSON.stringify(item))
          .join(' ')
      }
    } catch {
      // Keep the status-based message when the body is not JSON.
    }
    throw new ApiError(response.status, detail)
  }
  return (await response.json()) as T
}

function query(params: Record<string, string | number | null | undefined>): string {
  const values = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined && value !== '') values.set(key, String(value))
  }
  const rendered = values.toString()
  return rendered ? `?${rendered}` : ''
}

export const api = {
  health: () => request<HealthPayload>('/api/health'),
  campus: () => request<CampusPayload>('/api/campus'),
  overview: () => request<OverviewPayload>('/api/overview'),
  scenarios: () => request<{ scenarios: ScenarioSummary[]; count: number }>('/api/scenarios'),
  scenario: (id: string) => request<{ scenario: ScenarioDetail }>(`/api/scenarios/${id}`),
  createScenario: (body: { name: string; kind?: string; params: ScenarioParams }) =>
    request<{ scenario: ScenarioDetail }>('/api/scenarios', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  optimize: (id: string, body: { weights: Record<string, number>; time_limit: number }) =>
    request<{ job: Job }>(`/api/scenarios/${id}/optimize`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  job: (id: string) => request<{ job: Job }>(`/api/jobs/${id}`),
  cancelJob: (id: string) => request<{ job: Job }>(`/api/jobs/${id}/cancel`, { method: 'POST' }),
  compare: (scenarioId: string, plan?: string) =>
    request<ComparisonPayload>(`/api/compare${query({ scenario_id: scenarioId, plan })}`),
  graph: (scenarioId?: string | null) => request<GraphData>(`/api/graph${query({ scenario_id: scenarioId })}`),
  impact: (nodeId: string, scenarioId?: string | null, depth = 3) =>
    request<ImpactResult>(`/api/graph/impact${query({ node_id: nodeId, scenario_id: scenarioId, depth })}`),
  history: () => request<HistoryPayload>('/api/history'),
  updateRoom: (id: string, body: { capacity?: number; name?: string }) =>
    request<{ ok: boolean; campus: CampusPayload }>(`/api/campus/rooms/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  updateTeacher: (id: string, body: { max_weekly_hours?: number }) =>
    request<{ ok: boolean; campus: CampusPayload }>(`/api/campus/teachers/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  updateGroup: (id: string, body: { size?: number }) =>
    request<{ ok: boolean; campus: CampusPayload }>(`/api/campus/groups/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  resetCampus: () =>
    request<{ ok: boolean; message: string; campus: CampusPayload }>('/api/campus/reset', {
      method: 'POST',
    }),
  exportBaselineUrl: () => `${API_BASE}/api/export/baseline.csv`,
  exportScenarioUrl: (id: string) => `${API_BASE}/api/export/scenarios/${id}.csv`,
  exportPlanUrl: (id: string, label: string) => `${API_BASE}/api/export/scenarios/${id}/plans/${label}.csv`,
  reportUrl: (id: string) => `${API_BASE}/api/scenarios/${id}/report`,
}
