import { Building2, CornerDownLeft, Database, FlaskConical, GitBranch, Search, Users, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { ALL_NAV_ITEMS } from '../../config/nav'
import { useCampus, useScenarios } from '../../lib/hooks'
import { cn, KIND_LABELS } from '../../lib/utils'
import { useAppStore } from '../../store/appStore'

interface PaletteResult {
  id: string
  group: string
  label: string
  sublabel: string
  icon: typeof Search
  action: () => void
}

export function CommandPalette() {
  const open = useAppStore((state) => state.commandOpen)
  const setOpen = useAppStore((state) => state.setCommandOpen)
  const setActiveScenario = useAppStore((state) => state.setActiveScenario)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const campus = useCampus()
  const scenarios = useScenarios()
  const navigate = useNavigate()

  useEffect(() => {
    if (!open) return
    setQuery('')
    setActiveIndex(0)
    const timer = window.setTimeout(() => inputRef.current?.focus(), 40)
    document.body.style.overflow = 'hidden'
    return () => {
      window.clearTimeout(timer)
      document.body.style.overflow = ''
    }
  }, [open])

  const results = useMemo<PaletteResult[]>(() => {
    const q = query.trim().toLowerCase()
    const items: PaletteResult[] = []

    const go = (path: string) => () => {
      setOpen(false)
      navigate(path)
    }

    for (const page of ALL_NAV_ITEMS) {
      if (!q || page.label.toLowerCase().includes(q) || page.description.toLowerCase().includes(q)) {
        items.push({
          id: `page:${page.path}`,
          group: 'Workspace',
          label: page.label,
          sublabel: page.description,
          icon: page.icon,
          action: go(page.path),
        })
      }
    }

    if (q && campus.data) {
      for (const room of campus.data.rooms) {
        if (`${room.code} ${room.name} ${room.building_name ?? ''} ${room.kind}`.toLowerCase().includes(q)) {
          items.push({
            id: `room:${room.id}`,
            group: 'Rooms',
            label: `${room.code} · ${room.name}`,
            sublabel: `${room.kind === 'lab' ? 'Laboratory' : 'Classroom'} · ${room.capacity} seats · ${room.building_name ?? room.building_id}`,
            icon: Building2,
            action: go(`/campus?room=${encodeURIComponent(room.id)}`),
          })
        }
      }
      for (const teacher of campus.data.teachers) {
        if (`${teacher.name} ${teacher.department} ${teacher.title}`.toLowerCase().includes(q)) {
          items.push({
            id: `teacher:${teacher.id}`,
            group: 'Instructors',
            label: teacher.name,
            sublabel: `${teacher.department} · ${teacher.title} · ${teacher.max_weekly_hours}h limit`,
            icon: Users,
            action: go(`/dependencies?node=teacher:${teacher.id}`),
          })
        }
      }
      for (const group of campus.data.groups) {
        if (`${group.name} ${group.department} ${group.batch}`.toLowerCase().includes(q)) {
          items.push({
            id: `group:${group.id}`,
            group: 'Cohorts',
            label: group.name,
            sublabel: `${group.department} · ${group.size} students`,
            icon: Users,
            action: go(`/dependencies?node=group:${group.id}`),
          })
        }
      }
      for (const course of campus.data.courses) {
        if (`${course.code} ${course.title} ${course.department}`.toLowerCase().includes(q)) {
          items.push({
            id: `course:${course.id}`,
            group: 'Courses',
            label: `${course.code} · ${course.title}`,
            sublabel: `${course.department}${course.needs_lab ? ` · ${course.needs_lab} lab` : ''}`,
            icon: Database,
            action: go(`/dependencies?node=course:${course.id}`),
          })
        }
      }
    }

    if (q && scenarios.data) {
      for (const scenario of scenarios.data.scenarios.slice(0, 12)) {
        if (`${scenario.name} ${scenario.kind} ${scenario.status}`.toLowerCase().includes(q)) {
          items.push({
            id: `scenario:${scenario.id}`,
            group: 'Saved runs',
            label: scenario.name,
            sublabel: `${KIND_LABELS[scenario.kind] ?? scenario.kind} · ${scenario.status} · ${scenario.plan_count} plans`,
            icon: FlaskConical,
            action: () => {
              setActiveScenario(scenario.id, scenario.name)
              setOpen(false)
              navigate(`/simulation?scenario=${scenario.id}`)
            },
          })
        }
      }
    }

    if (q) {
      items.push({
        id: 'action:new-simulation',
        group: 'Actions',
        label: 'New simulation',
        sublabel: 'Start a counterfactual scenario from the baseline',
        icon: FlaskConical,
        action: go('/simulation?new=1'),
      })
      items.push({
        id: 'action:graph',
        group: 'Actions',
        label: 'Open dependency graph',
        sublabel: 'Trace resource relationships and impact',
        icon: GitBranch,
        action: go('/dependencies'),
      })
    }

    return items.slice(0, 40)
  }, [query, campus.data, scenarios.data, navigate, setOpen, setActiveScenario])

  useEffect(() => {
    setActiveIndex(0)
  }, [query])

  useEffect(() => {
    if (activeIndex >= results.length) setActiveIndex(Math.max(0, results.length - 1))
  }, [results.length, activeIndex])

  const handleKeyDown = (event: ReactKeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      setOpen(false)
    } else if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((index) => Math.min(results.length - 1, index + 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((index) => Math.max(0, index - 1))
    } else if (event.key === 'Enter' && results[activeIndex]) {
      event.preventDefault()
      results[activeIndex].action()
    }
  }

  if (!open) return null

  let lastGroup = ''
  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-start justify-center px-4 pt-[9vh]" role="presentation">
      <div className="absolute inset-0 bg-overlay/80 backdrop-blur-[3px] animate-fade-in" onClick={() => setOpen(false)} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Global search"
        className="relative w-full max-w-2xl overflow-hidden rounded-xl border border-line bg-subbase shadow-float animate-fade-up"
        onKeyDown={handleKeyDown}
      >
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Search className="h-4 w-4 shrink-0 text-cyan" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search pages, rooms, instructors, cohorts, courses, saved runs…"
            aria-label="Search MIRRORWORLD"
            className="h-14 min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-faint"
          />
          <kbd className="kbd">ESC</kbd>
          <button type="button" aria-label="Close search" onClick={() => setOpen(false)} className="rounded p-1 text-faint hover:text-ink">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[min(460px,60vh)] overflow-y-auto px-2 py-2 scroll-thin" role="listbox" aria-label="Search results">
          {results.length === 0 ? (
            <div className="px-4 py-12 text-center">
              <div className="text-[12px] font-medium text-ink">No matches found</div>
              <div className="mt-1 text-[11px] text-faint">Try a room code, instructor surname, course code or run name.</div>
            </div>
          ) : (
            results.map((result, index) => {
              const showGroup = result.group !== lastGroup
              lastGroup = result.group
              const Icon = result.icon
              return (
                <div key={result.id}>
                  {showGroup && <div className="px-2.5 pb-1 pt-2 font-mono text-[8px] uppercase tracking-[0.14em] text-faint">{result.group}</div>}
                  <button
                    type="button"
                    role="option"
                    aria-selected={index === activeIndex}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={result.action}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left transition-colors',
                      index === activeIndex ? 'bg-cyan/[0.08]' : 'hover:bg-subtleHover',
                    )}
                  >
                    <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded border', index === activeIndex ? 'border-cyan/25 bg-cyan/10 text-cyan' : 'border-line bg-subtle text-faint')}>
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[11.5px] font-medium text-ink">{result.label}</span>
                      <span className="block truncate text-[10px] text-faint">{result.sublabel}</span>
                    </span>
                    {index === activeIndex && <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-faint" />}
                  </button>
                </div>
              )
            })
          )}
        </div>
        <div className="flex items-center justify-between border-t border-lineSoft bg-subtle px-4 py-2 text-[9px] text-faint">
          <span className="flex items-center gap-3">
            <span><kbd className="kbd">↑</kbd> <kbd className="kbd">↓</kbd> navigate</span>
            <span><kbd className="kbd">↵</kbd> open</span>
          </span>
          <span className="font-mono uppercase tracking-[0.1em]">Synthetic campus · {campus.data?.summary.rooms ?? '—'} rooms</span>
        </div>
      </div>
    </div>,
    document.body,
  )
}
