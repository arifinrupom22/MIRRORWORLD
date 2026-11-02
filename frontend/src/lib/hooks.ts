import { useQuery } from '@tanstack/react-query'
import { api } from './api'

export const queryKeys = {
  health: ['health'] as const,
  campus: ['campus'] as const,
  overview: ['overview'] as const,
  scenarios: ['scenarios'] as const,
  scenario: (id: string) => ['scenario', id] as const,
  compare: (id: string, plan: string | undefined) => ['compare', id, plan ?? 'auto'] as const,
  difference: (id: string) => ['difference', id] as const,
  graph: (scenarioId?: string | null) => ['graph', scenarioId ?? 'baseline'] as const,
  impact: (nodeId: string, scenarioId?: string | null, depth = 3) =>
    ['impact', nodeId, scenarioId ?? 'baseline', depth] as const,
  history: ['history'] as const,
  alerts: (scenarioId?: string | null) => ['alerts', scenarioId ?? 'baseline'] as const,
  recommendations: (scenarioId?: string | null) => ['recommendations', scenarioId ?? 'baseline'] as const,
  templates: ['templates'] as const,
  movement: (scenarioId?: string | null, day?: number | null, slot?: number | null) =>
    ['movement', scenarioId ?? 'baseline', day ?? 'all', slot ?? 'all'] as const,
  job: (id: string) => ['job', id] as const,
}

export function useHealth() {
  return useQuery({ queryKey: queryKeys.health, queryFn: api.health, staleTime: 5 * 60_000 })
}

export function useCampus() {
  return useQuery({ queryKey: queryKeys.campus, queryFn: api.campus, staleTime: 30_000 })
}

export function useOverview() {
  return useQuery({ queryKey: queryKeys.overview, queryFn: api.overview, staleTime: 20_000 })
}

export function useAlerts(scenarioId?: string | null) {
  return useQuery({
    queryKey: queryKeys.alerts(scenarioId),
    queryFn: () => api.alerts(scenarioId),
    staleTime: 10_000,
  })
}

export function useRecommendations(scenarioId?: string | null) {
  return useQuery({
    queryKey: queryKeys.recommendations(scenarioId),
    queryFn: () => api.recommendations(scenarioId),
    staleTime: 20_000,
  })
}

export function useTemplates() {
  return useQuery({ queryKey: queryKeys.templates, queryFn: api.templates, staleTime: 60_000 })
}

export function useScenarios() {
  return useQuery({ queryKey: queryKeys.scenarios, queryFn: api.scenarios, staleTime: 10_000 })
}

export function useScenario(id: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.scenario(id ?? 'none'),
    queryFn: () => api.scenario(id as string),
    enabled: Boolean(id),
    staleTime: 5_000,
    refetchOnMount: 'always',
  })
}

export function useComparison(id: string | null | undefined, plan?: string) {
  return useQuery({
    queryKey: queryKeys.compare(id ?? 'none', plan),
    queryFn: () => api.compare(id as string, plan),
    enabled: Boolean(id),
    staleTime: 10_000,
  })
}

export function useDifference(id: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.difference(id ?? 'none'),
    queryFn: () => api.difference(id as string),
    enabled: Boolean(id),
    staleTime: 10_000,
  })
}

export function useGraph(scenarioId?: string | null) {
  return useQuery({
    queryKey: queryKeys.graph(scenarioId),
    queryFn: () => api.graph(scenarioId),
    staleTime: 20_000,
  })
}

export function useImpact(nodeId: string | null, scenarioId?: string | null, depth = 3) {
  return useQuery({
    queryKey: queryKeys.impact(nodeId ?? 'none', scenarioId, depth),
    queryFn: () => api.impact(nodeId as string, scenarioId, depth),
    enabled: Boolean(nodeId),
    staleTime: 20_000,
  })
}

export function useHistory() {
  return useQuery({ queryKey: queryKeys.history, queryFn: api.history, staleTime: 10_000 })
}

export function useJob(jobId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.job(jobId ?? 'none'),
    queryFn: () => api.job(jobId as string),
    enabled: Boolean(jobId),
    refetchInterval: (query) => {
      const status = query.state.data?.job?.status
      if (!status) return 900
      return ['queued', 'running', 'cancelling'].includes(status) ? 900 : false
    },
    refetchOnWindowFocus: false,
  })
}

export function useMovement(options?: { scenarioId?: string | null; day?: number | null; slot?: number | null; enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.movement(options?.scenarioId, options?.day, options?.slot),
    queryFn: () => api.movement(options),
    staleTime: 10_000,
    enabled: options?.enabled ?? true,
  })
}

export function useMovementDaySlot(day: number, slot: number) {
  return useQuery({
    queryKey: queryKeys.movement(undefined, day, slot),
    queryFn: () => api.movement({ day, slot }),
    staleTime: 10_000,
  })
}
