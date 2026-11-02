import type {
  CampusPayload,
  ComparisonPayload,
  DifferenceResult,
  GraphData,
  AlertItem,
  RecommendationItem,
  ScenarioTemplate,
  SeverityAssessment,
  HealthPayload,
  HistoryPayload,
  ImpactResult,
  Job,
  AIChatResponse,
  AIProposal,
  AIStatus,
  AIStreamEvent,
  AIStreamMeta,
  AIValidation,
  MovementResponse,
  OverviewPayload,
  ScenarioDetail,
  ScenarioParams,
  ScenarioSummary,
} from './types'

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? ''

interface AIChatBody {
  /** Intelligence mode; the server enforces its own allowlist. */
  mode?: string
  message: string
  scenario_id?: string | null
  history?: { role: 'user' | 'assistant'; content: string }[]
}

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
  alerts: (scenarioId?: string | null) =>
    request<{ alerts: AlertItem[]; counts: Record<string, unknown>; source: string; scenario_id?: string | null }>(
      `/api/alerts${query({ scenario_id: scenarioId })}`,
    ),
  recommendations: (scenarioId?: string | null) =>
    request<{ recommendations: RecommendationItem[]; count: number; source: string }>(
      `/api/recommendations${query({ scenario_id: scenarioId })}`,
    ),
  assess: (params: ScenarioParams) =>
    request<{ assessment: SeverityAssessment }>('/api/assess', {
      method: 'POST',
      body: JSON.stringify({ params }),
    }),
  templates: () => request<{ templates: ScenarioTemplate[]; count: number }>('/api/templates'),
  aiStatus: () => request<{ ai: AIStatus }>('/api/ai/status'),
  aiBriefing: (scenarioId?: string | null) =>
    request<{ briefing: import('./types').AIBriefing; modes: import('./types').AIModeInfo[] }>(
      `/api/ai/briefing${scenarioId ? `?scenario_id=${encodeURIComponent(scenarioId)}` : ''}`,
    ),
  aiTools: () =>
    request<{
      tools: import('./types').AITool[]
      recent: import('./types').AIToolTrace[]
      policy: string
    }>('/api/ai/tools'),
  aiValidate: () => request<{ validation: AIValidation }>('/api/ai/validate', { method: 'POST' }),
  aiChat: (body: AIChatBody) => request<AIChatResponse>('/api/ai/chat', { method: 'POST', body: JSON.stringify(body) }),
  aiProposal: (body: { message: string; scenario_id?: string | null }) =>
    request<{ proposal: AIProposal }>('/api/ai/proposal', { method: 'POST', body: JSON.stringify(body) }),
  aiApplyProposal: (proposalId: string) =>
    request<{ scenario: ScenarioDetail; proposal_id: string; confirmed: boolean }>('/api/ai/proposal/apply', {
      method: 'POST',
      body: JSON.stringify({ proposal_id: proposalId, confirmed: true }),
    }),
  /**
   * Streamed answer over server-sent events. Resolves with the same shape as
   * `aiChat`, so callers can treat the streaming path as an optimisation.
   */
  aiChatStream: async (
    body: AIChatBody,
    handlers: { onDelta?: (text: string) => void; onMeta?: (meta: AIStreamMeta) => void } = {},
    signal?: AbortSignal,
  ): Promise<AIChatResponse> => {
    const response = await fetch(`${API_BASE}/api/ai/chat/stream`, {
      method: 'POST',
      headers: { Accept: 'text/event-stream', 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    })
    if (!response.ok) {
      let detail = `Request failed with status ${response.status}.`
      try {
        const payload = await response.json()
        if (typeof payload?.detail === 'string') detail = payload.detail
      } catch {
        // Keep the status-based message when the body is not JSON.
      }
      throw new ApiError(response.status, detail)
    }
    const reader = response.body?.getReader()
    if (!reader) throw new ApiError(0, 'This browser cannot read a streamed answer.')

    const decoder = new TextDecoder()
    let buffer = ''
    let done: AIChatResponse | null = null
    for (;;) {
      const { value, done: finished } = await reader.read()
      if (finished) break
      buffer += decoder.decode(value, { stream: true })
      let boundary = buffer.indexOf('\n\n')
      while (boundary !== -1) {
        const raw = buffer.slice(0, boundary).trim()
        buffer = buffer.slice(boundary + 2)
        boundary = buffer.indexOf('\n\n')
        if (!raw.startsWith('data:')) continue
        let event: AIStreamEvent
        try {
          event = JSON.parse(raw.slice(5).trim()) as AIStreamEvent
        } catch {
          continue
        }
        if (event.type === 'delta') handlers.onDelta?.(event.text)
        else if (event.type === 'meta') handlers.onMeta?.(event)
        else if (event.type === 'done') done = event
      }
    }
    if (!done) throw new ApiError(0, 'The answer stream ended before it completed.')
    return done
  },
  movement: (options?: { scenarioId?: string | null; day?: number | null; slot?: number | null }) =>
    request<MovementResponse>(
      `/api/movement${query({
        scenario_id: options?.scenarioId,
        day: options?.day,
        slot: options?.slot,
      })}`,
    ),
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
  difference: (scenarioId: string) =>
    request<{ difference: DifferenceResult }>(`/api/scenarios/${scenarioId}/difference`),
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
