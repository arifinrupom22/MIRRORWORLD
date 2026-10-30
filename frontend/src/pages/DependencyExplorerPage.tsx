import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  ArrowRight,
  Building2,
  CircleDot,
  Compass,
  DoorOpen,
  FlaskConical,
  GitBranch,
  GraduationCap,
  Info,
  Layers3,
  Minus,
  Plus,
  Search,
  UserRound,
  Users2,
  Wrench,
  Zap,
} from 'lucide-react'
import { useCampus, useGraph, useImpact } from '../lib/hooks'
import { useAppStore } from '../store/appStore'
import type { GraphEdge, GraphNode } from '../lib/types'
import { cn, fmtNumber } from '../lib/utils'
import { Badge, EmptyState, ErrorState, LoadingBlock, Panel, PanelHeader, Segmented, Tooltip } from '../components/ui'
import { ActiveScenarioBanner, PipelineStrip, Provenance, ScenarioSelector } from '../components/shared'

const TYPE_META: Record<string, { label: string; icon: typeof Building2; color: string }> = {
  building: { label: 'Buildings', icon: Building2, color: '#38D9F5' },
  room: { label: 'Rooms', icon: DoorOpen, color: '#4F8CFF' },
  teacher: { label: 'Instructors', icon: UserRound, color: '#8B7CFF' },
  group: { label: 'Cohorts', icon: Users2, color: '#35D39A' },
  course: { label: 'Courses', icon: GraduationCap, color: '#F5B84B' },
  session: { label: 'Sessions', icon: CircleDot, color: '#FF9F6B' },
  equipment: { label: 'Equipment', icon: Wrench, color: '#6B7C93' },
}

const RELATION_COLORS: Record<string, string> = {
  located_in: '#38D9F5',
  has_equipment: '#8B7CFF',
  requires: '#F5B84B',
  taught_by: '#8B7CFF',
  enrolled_in: '#35D39A',
  scheduled_as: '#FF9F6B',
  attended_by: '#35D39A',
  assigned_to: '#4F8CFF',
}

const RELATION_LABELS: Record<string, string> = {
  located_in: 'Room is located in a building',
  has_equipment: 'Room contains lab equipment',
  requires: 'Course requires equipment',
  taught_by: 'Course or session is taught by an instructor',
  enrolled_in: 'Cohort is enrolled in a course',
  scheduled_as: 'Session instantiates a course',
  attended_by: 'Session is attended by a cohort',
  assigned_to: 'Session is assigned to a room',
}

export function DependencyExplorerPage() {
  const activeId = useAppStore((state) => state.activeScenarioId)
  const [searchParams, setSearchParams] = useSearchParams()
  const [overlay, setOverlay] = useState<'scenario' | 'baseline'>(activeId ? 'scenario' : 'baseline')
  const graphOverlayId = overlay === 'scenario' ? activeId : null
  const { data: graph, isLoading, isError, error, refetch } = useGraph(graphOverlayId)
  const { data: campus } = useCampus()
  const [selectedId, setSelectedId] = useState<string | null>(searchParams.get('node'))
  const [depth, setDepth] = useState(2)
  const [enabledTypes, setEnabledTypes] = useState<Set<string>>(new Set(Object.keys(TYPE_META)))
  const [search, setSearch] = useState('')
  const [zoom, setZoom] = useState(1)
  const { data: impact, isLoading: impactLoading, isError: impactError } = useImpact(selectedId, graphOverlayId, depth)

  useEffect(() => {
    if (selectedId || !graph) return
    const rooms = graph.nodes.filter((node) => node.type === 'room').sort((a, b) => b.degree - a.degree)
    const fallback = rooms[0] ?? graph.nodes[0]
    if (fallback) {
      setSelectedId(fallback.id)
      setSearchParams({ node: fallback.id }, { replace: true })
    }
  }, [graph, selectedId, setSearchParams])

  const selectedNode = graph?.nodes.find((node) => node.id === selectedId) ?? null

  const searchResults = useMemo(() => {
    if (!graph || !search.trim()) return []
    const needle = search.trim().toLowerCase()
    return graph.nodes
      .filter((node) => `${node.label} ${node.sublabel} ${node.type}`.toLowerCase().includes(needle))
      .sort((a, b) => Number(b.affected) - Number(a.affected) || b.degree - a.degree)
      .slice(0, 9)
  }, [graph, search])

  const neighborhood = useMemo(() => {
    if (!impact || !graph || !selectedNode) return { nodes: [selectedNode].filter(Boolean) as GraphNode[], edges: [] as GraphEdge[], hidden: 0 }
    const allowed = new Set([selectedNode.id, ...impact.direct.map((node) => node.id), ...impact.indirect.map((node) => node.id)])
    const visible = graph.nodes.filter((node) => allowed.has(node.id) && enabledTypes.has(node.type))
    const priority = ['room', 'course', 'group', 'teacher', 'building', 'session', 'equipment']
    const directIds = new Set(impact.direct.map((node) => node.id))
    const capped = [
      ...visible.filter((node) => node.id === selectedNode.id || directIds.has(node.id)),
      ...visible
        .filter((node) => !directIds.has(node.id) && node.id !== selectedNode.id)
        .sort((a, b) => priority.indexOf(a.type) - priority.indexOf(b.type) || a.label.localeCompare(b.label))
        .slice(0, 46),
    ]
    const shownIds = new Set(capped.map((node) => node.id))
    const edges = graph.edges.filter((edge) => shownIds.has(edge.source) && shownIds.has(edge.target))
    return { nodes: capped, edges, hidden: Math.max(0, visible.length - capped.length) }
  }, [impact, graph, selectedNode, enabledTypes])

  const selectNode = (node: GraphNode) => {
    setSelectedId(node.id)
    setSearch('')
    setSearchParams({ node: node.id }, { replace: true })
  }

  const toggleType = (type: string) => {
    setEnabledTypes((previous) => {
      const next = new Set(previous)
      if (next.has(type)) next.delete(type)
      else next.add(type)
      return next
    })
  }

  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const node of graph?.nodes ?? []) counts[node.type] = (counts[node.type] ?? 0) + 1
    return counts
  }, [graph])

  if (isLoading) return <LoadingBlock label="Materialising the dependency graph" rows={8} />
  if (isError || !graph || !campus) {
    return <ErrorState title="Dependency graph unavailable" message={error instanceof Error ? error.message : 'The graph endpoint did not return a model.'} onRetry={() => refetch()} />
  }

  return (
    <div>
      <header className="mb-5 flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="telemetry text-cyan/80">Dependency explorer · relational model</span>
            <Badge tone="neutral">{graph.nodes.length} nodes · {graph.edges.length} edges</Badge>
            {overlay === 'scenario' && <Badge tone="warning" dot>scenario overlay</Badge>}
          </div>
          <h1 className="text-[26px] font-semibold leading-[1.1] tracking-[-0.03em] text-ink sm:text-[30px]">Dependency explorer</h1>
          <p className="mt-2 max-w-3xl text-[12.5px] leading-relaxed text-muted">
            Trace how campus spaces, courses, instructors, cohorts and sessions relate. The graph is generated from the persisted relational model; selecting a resource performs a bounded breadth-first impact analysis.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ScenarioSelector label="Run" />
          <Link to="/simulation" className="focus-ring inline-flex h-8 items-center gap-2 rounded-md border border-line px-3 text-[11.5px] text-muted hover:text-ink"><FlaskConical className="h-3.5 w-3.5" /> Plan a disruption</Link>
        </div>
      </header>

      <div className="mb-4"><PipelineStrip active="detect" scenarioId={activeId} /></div>
      <div className="mb-4"><ActiveScenarioBanner compact /></div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-5">
          <Panel>
            <div className="flex flex-wrap items-center gap-2 border-b border-lineSoft px-3 py-2.5">
              <div className="relative min-w-[180px] flex-1">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint" />
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find a building, room, course, instructor or session…" aria-label="Search dependency nodes" className="input-base h-8 pl-8 text-[10.5px]" />
                {searchResults.length > 0 && (
                  <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-40 overflow-hidden rounded-md border border-line bg-input shadow-float">
                    {searchResults.map((node) => (
                      <button key={node.id} type="button" onClick={() => selectNode(node)} className="flex w-full items-center gap-2 border-b border-lineSoft px-2.5 py-1.5 text-left last:border-b-0 hover:bg-subtleHover">
                        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: TYPE_META[node.type]?.color ?? '#38D9F5' }} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[10px] text-ink">{node.label}</span>
                          <span className="block truncate font-mono text-[8px] text-faint">{node.type} · {node.sublabel}</span>
                        </span>
                        {node.affected && <Badge tone="warning">affected</Badge>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <Segmented
                size="sm"
                value={overlay}
                onChange={(value) => { setOverlay(value); setZoom(1) }}
                options={[
                  { value: 'scenario', label: 'Scenario overlay' },
                  { value: 'baseline', label: 'Baseline' },
                ]}
              />
              <label className="flex items-center gap-1.5 font-mono text-[8px] uppercase tracking-[0.06em] text-faint">
                depth
                <select value={depth} onChange={(event) => setDepth(Number(event.target.value))} aria-label="Impact depth" className="input-base h-7 w-12 px-1.5 text-[10px]">
                  {[1, 2, 3].map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
              </label>
              <div className="ml-auto flex items-center gap-1">
                <Tooltip content="Zoom out"><button type="button" aria-label="Zoom out" onClick={() => setZoom((value) => Math.max(0.65, Number((value - 0.15).toFixed(2))))} className="focus-ring flex h-7 w-7 items-center justify-center rounded border border-line text-faint hover:text-ink"><Minus className="h-3 w-3" /></button></Tooltip>
                <span className="w-8 text-center font-mono text-[9px] text-faint">{Math.round(zoom * 100)}%</span>
                <Tooltip content="Zoom in"><button type="button" aria-label="Zoom in" onClick={() => setZoom((value) => Math.min(1.8, Number((value + 0.15).toFixed(2))))} className="focus-ring flex h-7 w-7 items-center justify-center rounded border border-line text-faint hover:text-ink"><Plus className="h-3 w-3" /></button></Tooltip>
                <Tooltip content="Reset view"><button type="button" aria-label="Reset graph view" onClick={() => setZoom(1)} className="focus-ring flex h-7 w-7 items-center justify-center rounded border border-line text-faint hover:text-ink"><Compass className="h-3 w-3" /></button></Tooltip>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 border-b border-lineSoft px-3 py-2">
              {Object.entries(TYPE_META).map(([type, meta]) => {
                const enabled = enabledTypes.has(type)
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => toggleType(type)}
                    aria-pressed={enabled}
                    className={cn('focus-ring flex items-center gap-1.5 rounded border px-1.5 py-1 font-mono text-[8px] uppercase tracking-[0.05em] transition-colors', enabled ? 'border-line bg-subtle text-muted' : 'border-lineSoft text-faint/40')}
                  >
                    <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: enabled ? meta.color : '#43536B' }} />
                    {typeCounts[type] ?? 0} {meta.label.toLowerCase()}
                  </button>
                )
              })}
              {overlay === 'scenario' && !activeId && <Badge tone="warning">no active run — showing baseline</Badge>}
            </div>

            <div className="relative bg-cell">
              {impactLoading && (
                <div className="absolute inset-0 z-20 flex items-center justify-center bg-cell/70">
                  <span className="flex items-center gap-2 rounded border border-line bg-panel px-3 py-2 text-[10px] text-faint"><CircleDot className="h-3 w-3 animate-pulse text-cyan" /> Tracing dependencies…</span>
                </div>
              )}
              {impactError && <div className="absolute left-3 top-3 z-20"><Badge tone="critical">impact analysis failed</Badge></div>}
              <GraphCanvas nodes={neighborhood.nodes} edges={neighborhood.edges} selected={selectedNode} onSelect={selectNode} zoom={zoom} />
              <div className="pointer-events-none absolute bottom-2 left-3 right-3 flex flex-wrap items-center justify-between gap-2 font-mono text-[7.5px] uppercase tracking-[0.06em] text-faint/80">
                <span>direct ring · indirect ring · edges from persisted relations</span>
                <span>{neighborhood.hidden > 0 ? `+${neighborhood.hidden} nodes hidden by type/focus cap` : `${neighborhood.nodes.length} nodes shown`}</span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-lineSoft px-3 py-2">
              {Object.entries(RELATION_COLORS).map(([relation, color]) => (
                <span key={relation} className="flex items-center gap-1 font-mono text-[7.5px] uppercase tracking-[0.05em] text-faint">
                  <span className="h-px w-4" style={{ backgroundColor: color }} /> {relation.replace(/_/g, ' ')}
                </span>
              ))}
            </div>
          </Panel>

          <div className="grid gap-5 lg:grid-cols-2">
            <Panel>
              <PanelHeader eyebrow="Impact summary" title="Dependency footprint" subtitle="Breadth-first traversal from the selected node, bounded by depth." />
              {impact ? (
                <div className="p-4">
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {[
                      { label: 'Direct', value: impact.summary.direct_nodes },
                      { label: 'Indirect', value: impact.summary.indirect_nodes },
                      { label: 'Sessions', value: impact.summary.sessions },
                      { label: 'Groups', value: impact.summary.groups },
                    ].map((item) => (
                      <div key={item.label} className="rounded border border-lineSoft bg-subtle px-2.5 py-2">
                        <div className="font-mono text-[7.5px] uppercase tracking-[0.06em] text-faint">{item.label}</div>
                        <div className="mt-0.5 font-mono text-[17px] font-semibold text-ink">{item.value}</div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 space-y-2">
                    <DependencyList title="Direct neighbours" nodes={impact.direct} onSelect={selectNode} />
                    <DependencyList title="Indirect neighbours" nodes={impact.indirect.slice(0, 12)} onSelect={selectNode} more={Math.max(0, impact.indirect.length - 12)} />
                  </div>
                </div>
              ) : (
                <div className="px-4 py-6 text-[10.5px] text-faint">Select a node to compute its dependency footprint.</div>
              )}
            </Panel>
            <Panel>
              <PanelHeader eyebrow="Replacement search" title="Eligible alternative rooms" subtitle="Rooms satisfying course type, equipment and capacity rules for affected courses." action={<Badge tone="neutral">{impact?.alternatives.length ?? 0}</Badge>} />
              {impact?.alternatives.length ? (
                <div className="max-h-[275px] overflow-y-auto scroll-thin">
                  {impact.alternatives.map((room) => (
                    <button
                      key={`${room.room_id}-${room.course_code}`}
                      type="button"
                      onClick={() => {
                        const node = graph.nodes.find((item) => item.type === 'room' && item.raw_id === room.room_id)
                        if (node) selectNode(node)
                      }}
                      className="focus-ring flex w-full items-center gap-2 border-b border-lineSoft px-4 py-2.5 text-left last:border-b-0 hover:bg-subtleHover"
                    >
                      <DoorOpen className="h-3.5 w-3.5 shrink-0 text-cyan/70" />
                      <span className="min-w-0 flex-1">
                        <span className="font-mono text-[10px] text-ink">{room.code}</span>
                        <span className="ml-2 text-[9px] text-faint">{room.building_id} · {room.kind}</span>
                      </span>
                      <span className="font-mono text-[8.5px] text-faint">{room.capacity} seats</span>
                      <span className="rounded border border-line px-1 py-0.5 font-mono text-[7.5px] text-faint">{room.course_code}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="px-4 py-6 text-[10.5px] leading-relaxed text-faint">
                  {impact ? 'No eligible replacement room was found for the affected courses under the current constraints.' : 'Select a room, course or session to search for eligible alternatives.'}
                </div>
              )}
              <div className="border-t border-lineSoft px-4 py-2 text-[8.5px] leading-relaxed text-faint">Eligibility is checked against synthesis rules; a suggested room is not a reserved booking.</div>
            </Panel>
          </div>
        </div>

        <div className="min-w-0 space-y-5">
          <Panel>
            <PanelHeader
              eyebrow="Node inspector"
              title={selectedNode ? selectedNode.label : 'No node selected'}
              subtitle={selectedNode ? `${TYPE_META[selectedNode.type]?.label ?? selectedNode.type} · ${selectedNode.sublabel}` : 'Choose a node in the graph or search.'}
              action={selectedNode?.affected ? <Badge tone="warning" dot>affected</Badge> : selectedNode ? <Badge tone="success">baseline</Badge> : undefined}
            />
            {selectedNode ? (
              <div className="p-4">
                <div className="flex items-center gap-2 rounded border border-lineSoft bg-input px-2.5 py-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded border" style={{ borderColor: `${TYPE_META[selectedNode.type]?.color}55`, backgroundColor: `${TYPE_META[selectedNode.type]?.color}14`, color: TYPE_META[selectedNode.type]?.color }}>
                    {(() => {
                      const Icon = TYPE_META[selectedNode.type]?.icon ?? Layers3
                      return <Icon className="h-3.5 w-3.5" />
                    })()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[11px] font-medium text-ink">{selectedNode.label}</div>
                    <div className="truncate font-mono text-[8px] text-faint">{selectedNode.id}</div>
                  </div>
                  <span className="font-mono text-[8px] text-faint">deg {selectedNode.degree}</span>
                </div>
                {selectedNode.impact_reason && <p className="mt-3 rounded border border-warning/20 bg-warning/[0.035] px-2.5 py-2 text-[10px] leading-relaxed text-warning/90">{selectedNode.impact_reason}</p>}
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div className="rounded border border-lineSoft px-2.5 py-2">
                    <div className="font-mono text-[7.5px] uppercase tracking-[0.06em] text-faint">Depth</div>
                    <div className="mt-0.5 font-mono text-[13px] text-ink">{impact?.depth ?? depth}</div>
                  </div>
                  <div className="rounded border border-lineSoft px-2.5 py-2">
                    <div className="font-mono text-[7.5px] uppercase tracking-[0.06em] text-faint">Rooms in impact</div>
                    <div className="mt-0.5 font-mono text-[13px] text-ink">{impact?.summary.rooms ?? '—'}</div>
                  </div>
                </div>
                <div className="mt-3">
                  <div className="mb-1.5 font-mono text-[8px] uppercase tracking-[0.08em] text-faint">Direct by type</div>
                  <div className="flex flex-wrap gap-1">
                    {Object.entries(impact?.direct_by_type ?? {}).map(([type, count]) => <Badge key={type} tone="neutral">{type} {count}</Badge>)}
                    {!Object.keys(impact?.direct_by_type ?? {}).length && <span className="text-[10px] text-faint">No direct neighbours.</span>}
                  </div>
                </div>
                <div className="mt-3">
                  <div className="mb-1.5 font-mono text-[8px] uppercase tracking-[0.08em] text-faint">Indirect by type</div>
                  <div className="flex flex-wrap gap-1">
                    {Object.entries(impact?.indirect_by_type ?? {}).map(([type, count]) => <Badge key={type} tone="neutral">{type} {count}</Badge>)}
                    {!Object.keys(impact?.indirect_by_type ?? {}).length && <span className="text-[10px] text-faint">No indirect neighbours.</span>}
                  </div>
                </div>
                <div className="mt-3 border-t border-lineSoft pt-3">
                  <div className="mb-1.5 font-mono text-[8px] uppercase tracking-[0.08em] text-faint">Most connected neighbours</div>
                  <div className="space-y-0.5">
                    {(impact?.direct ?? []).slice().sort((a, b) => b.degree - a.degree).slice(0, 5).map((node) => (
                      <button key={node.id} type="button" onClick={() => selectNode(node)} className="focus-ring flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-left hover:bg-subtleHover">
                        <span className="h-1 w-1 rounded-full" style={{ backgroundColor: TYPE_META[node.type]?.color }} />
                        <span className="min-w-0 flex-1 truncate text-[9.5px] text-muted">{node.label}</span>
                        <span className="font-mono text-[8px] text-faint">{node.degree}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link to="/campus" className="focus-ring inline-flex items-center gap-1 text-[9.5px] text-cyan/80 hover:text-cyan">Open in campus <ArrowRight className="h-3 w-3" /></Link>
                  <Link to="/optimizer" className="focus-ring inline-flex items-center gap-1 text-[9.5px] text-cyan/80 hover:text-cyan">Recovery plans <ArrowRight className="h-3 w-3" /></Link>
                </div>
              </div>
            ) : (
              <EmptyState title="Nothing selected" description="Pick a node from the graph or use the search field to inspect its dependency footprint." />
            )}
          </Panel>

          <Panel>
            <PanelHeader eyebrow="Affected sessions" title="Sessions in scope" subtitle="Sessions reachable within the selected depth." action={<Badge tone={impact?.sessions.length ? 'warning' : 'neutral'}>{impact?.sessions.length ?? 0}</Badge>} />
            <div className="max-h-[230px] overflow-y-auto scroll-thin">
              {impact?.sessions.length ? impact.sessions.slice(0, 20).map((session) => (
                <button key={session.id} type="button" onClick={() => selectNode(session)} className="focus-ring flex w-full items-center gap-2 border-b border-lineSoft px-4 py-2 text-left last:border-b-0 hover:bg-subtleHover">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: session.severity === 'critical' ? '#FF647C' : '#FF9F6B' }} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[9.5px] text-muted">{session.label}</span>
                    <span className="block truncate font-mono text-[8px] text-faint">{session.sublabel}</span>
                  </span>
                  {session.affected && <Badge tone="warning">affected</Badge>}
                </button>
              )) : <div className="px-4 py-5 text-[10px] text-faint">No sessions are reachable at this depth.</div>}
            </div>
          </Panel>

          <Panel className="p-4">
            <div className="flex items-center gap-2 text-[11px] font-medium text-ink"><GitBranch className="h-3.5 w-3.5 text-cyan/70" /> Graph semantics</div>
            <p className="mt-1.5 text-[9.5px] leading-relaxed text-faint">
              Edges are persisted relationships, not inferred correlations. Depth is a traversal limit, not a claim of real-world causality. Use it to find exposure paths, then validate with the simulator.
            </p>
            <div className="mt-2 border-t border-lineSoft pt-2">
              {Object.entries(RELATION_LABELS).map(([relation, text]) => (
                <div key={relation} className="flex gap-2 py-0.5 text-[8.5px] leading-relaxed">
                  <span className="w-20 shrink-0 font-mono text-faint">{relation}</span>
                  <span className="text-faint/80">{text}</span>
                </div>
              ))}
            </div>
            <Provenance className="mt-3">Generated from {graph.nodes.length} nodes and {graph.edges.length} persisted edges. Affected flags come from the scenario's stored graph overlay.</Provenance>
          </Panel>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-lineSoft pt-3 font-mono text-[8px] uppercase tracking-[0.08em] text-faint/80">
        <span className="flex items-center gap-1"><CircleDot className="h-2.5 w-2.5" /> {fmtNumber(graph.nodes.length)} model nodes</span>
        <span className="flex items-center gap-1"><GitBranch className="h-2.5 w-2.5" /> {fmtNumber(graph.edges.length)} relationships</span>
        <span className="flex items-center gap-1"><Zap className="h-2.5 w-2.5" /> depth bounded traversal</span>
        <span className="flex items-center gap-1"><Info className="h-2.5 w-2.5" /> no inferred edges</span>
      </div>
    </div>
  )
}

function DependencyList({ title, nodes, onSelect, more = 0 }: { title: string; nodes: GraphNode[]; onSelect: (node: GraphNode) => void; more?: number }) {
  if (!nodes.length) return null
  return (
    <div>
      <div className="mb-1 font-mono text-[8px] uppercase tracking-[0.08em] text-faint">{title} · {nodes.length}{more ? ` (+${more})` : ''}</div>
      <div className="flex flex-wrap gap-1">
        {nodes.map((node) => (
          <button key={node.id} type="button" onClick={() => onSelect(node)} className="focus-ring inline-flex items-center gap-1 rounded border border-lineSoft px-1.5 py-0.5 text-[8.5px] text-muted hover:border-line hover:text-ink">
            <span className="h-1 w-1 rounded-full" style={{ backgroundColor: TYPE_META[node.type]?.color }} />
            {node.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function GraphCanvas({ nodes, edges, selected, onSelect, zoom }: { nodes: GraphNode[]; edges: GraphEdge[]; selected: GraphNode | null; onSelect: (node: GraphNode) => void; zoom: number }) {
  const width = 760
  const height = 520
  const center = { x: width / 2, y: height / 2 }
  const positions = useMemo(() => {
    const map = new Map<string, { x: number; y: number; ring: number }>()
    if (!selected) return map
    map.set(selected.id, { ...center, ring: 0 })
    const others = nodes.filter((node) => node.id !== selected.id)
    const ordered = [
      ...others.filter((node) => node.degree >= 0 && edges.some((edge) => (edge.source === selected.id && edge.target === node.id) || (edge.target === selected.id && edge.source === node.id))),
      ...others.filter((node) => !edges.some((edge) => (edge.source === selected.id && edge.target === node.id) || (edge.target === selected.id && edge.source === node.id))),
    ]
    ordered.forEach((node) => {
      const isDirect = edges.some((edge) => (edge.source === selected.id && edge.target === node.id) || (edge.target === selected.id && edge.source === node.id))
      const ring = isDirect ? 1 : 2
      const ringNodes = ordered.filter((candidate) => {
        const candidateDirect = edges.some((edge) => (edge.source === selected.id && edge.target === candidate.id) || (edge.target === selected.id && edge.source === candidate.id))
        return (candidateDirect ? 1 : 2) === ring
      })
      const ringIndex = ringNodes.findIndex((candidate) => candidate.id === node.id)
      const angle = (ringIndex / Math.max(1, ringNodes.length)) * Math.PI * 2 - Math.PI / 2
      const radius = ring === 1 ? 155 : 245
      map.set(node.id, { x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius * 0.86, ring })
    })
    return map
  }, [nodes, edges, selected, center.x, center.y])

  if (!selected) return <div className="flex h-[420px] items-center justify-center text-[11px] text-faint">Select a node to render the impact neighbourhood.</div>

  return (
    <div className="h-[440px] w-full overflow-hidden sm:h-[500px]">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-full w-full" role="img" aria-label={`Dependency graph centred on ${selected.label}`}>
        <defs>
          <radialGradient id="graph-fade">
            <stop offset="0%" stopColor="#0B1728" />
            <stop offset="100%" stopColor="#070E19" />
          </radialGradient>
          <pattern id="graph-grid" width="28" height="28" patternUnits="userSpaceOnUse">
            <path d="M 28 0 L 0 0 0 28" fill="none" stroke="rgba(37,51,74,0.24)" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width={width} height={height} fill="url(#graph-fade)" />
        <rect width={width} height={height} fill="url(#graph-grid)" />
        <g transform={`translate(${center.x} ${center.y}) scale(${zoom}) translate(${-center.x} ${-center.y})`}>
          <circle cx={center.x} cy={center.y} r={155} fill="none" stroke="rgba(37,51,74,0.5)" strokeDasharray="2 6" />
          <circle cx={center.x} cy={center.y} r={245} fill="none" stroke="rgba(37,51,74,0.35)" strokeDasharray="2 6" />
          {edges.map((edge) => {
            const from = positions.get(edge.source)
            const to = positions.get(edge.target)
            if (!from || !to) return null
            return (
              <line
                key={edge.id}
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                stroke={RELATION_COLORS[edge.relation] ?? '#43536B'}
                strokeWidth={from.ring === 1 || to.ring === 1 ? 1.1 : 0.7}
                opacity={from.ring === 1 || to.ring === 1 ? 0.34 : 0.18}
              />
            )
          })}
          {nodes.map((node) => {
            const position = positions.get(node.id)
            if (!position) return null
            const meta = TYPE_META[node.type]
            const isSelected = node.id === selected.id
            const radius = isSelected ? 15 : position.ring === 1 ? 8 : 5.5
            const label = position.ring <= 1 || isSelected
            return (
              <g key={node.id} transform={`translate(${position.x} ${position.y})`} onClick={() => onSelect(node)} onKeyDown={(event) => { if (event.key === 'Enter') onSelect(node) }} role="button" tabIndex={0} aria-label={`${node.type} ${node.label}`} className="cursor-pointer outline-none">
                {node.affected && <circle r={radius + 5} fill="none" stroke="#F5B84B" strokeWidth="1" opacity="0.5" />}
                {isSelected && <circle r={radius + 9} fill="none" stroke={meta?.color ?? '#38D9F5'} strokeWidth="1" opacity="0.35" />}
                <circle r={radius} fill={isSelected ? '#0C1B2D' : '#0A1423'} stroke={meta?.color ?? '#38D9F5'} strokeWidth={isSelected ? 2 : 1.3} />
                {isSelected && <circle r={3.5} fill={meta?.color ?? '#38D9F5'} />}
                {!isSelected && node.type === 'session' && <circle r={1.5} fill={meta?.color} />}
                {label && (
                  <text x={0} y={radius + 12} textAnchor="middle" fill={isSelected ? '#F1F5FC' : '#9AA9BF'} fontSize={isSelected ? 11 : 8.5} fontFamily="Inter, sans-serif" fontWeight={isSelected ? 600 : 400}>
                    {node.label.length > 22 ? `${node.label.slice(0, 21)}…` : node.label}
                  </text>
                )}
                <title>{`${node.label} — ${node.sublabel}${node.affected ? ' • affected by scenario' : ''}`}</title>
              </g>
            )
          })}
        </g>
      </svg>
    </div>
  )
}
