/**
 * Guided tour.
 *
 * A short, skippable walkthrough of the platform's own workflow
 * (MODEL → DETECT → SIMULATE → OPTIMIZE → COMPARE) plus Mirror AI. Each step
 * navigates to a real page and highlights a real element with a selector that
 * already exists — the tour never invents UI, and if an anchor is missing the
 * step still renders as a plain card so the tour cannot break a page.
 *
 * Seen state is stored locally; the tour can be relaunched from the top bar.
 */
import { ArrowLeft, ArrowRight, Compass, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAppStore } from '../store/appStore'
import { cn } from '../lib/utils'
import { Button } from './ui'

interface TourStep {
  route: string
  eyebrow: string
  title: string
  body: string
  anchor?: string
  hint?: string
}

const STEPS: TourStep[] = [
  {
    route: '/',
    eyebrow: 'Step 1 · Operations',
    title: 'Start from campus health',
    body:
      'Every figure here is recomputed from the persisted campus dataset and the stored run history — nothing on this page is hard-coded.',
    anchor: 'main h1',
    hint: 'Alerts open the page that can act on them.',
  },
  {
    route: '/campus',
    eyebrow: 'Step 2 · Digital campus',
    title: 'Inspect the twin spatially',
    body:
      'The 3D twin and the 2D plan are drawn from the same building footprints. Heights follow the stored floor counts, and the movement arcs are the same transitions the timetable produces.',
    anchor: 'canvas',
    hint: 'Switch to 2D plan if the browser cannot create a WebGL context.',
  },
  {
    route: '/simulation',
    eyebrow: 'Step 3 · Simulation studio',
    title: 'Configure a disruption',
    body:
      'Close a room, remove an instructor, surge an intake or change a policy, then assess the counterfactual. Parameter changes are explicit and reversible.',
    anchor: 'main h1',
    hint: 'Nothing is applied to the baseline until you save a scenario.',
  },
  {
    route: '/optimizer',
    eyebrow: 'Step 4 · Schedule optimizer',
    title: 'Recover the timetable',
    body:
      'The CP-SAT job tries documented recovery strategies and stores each plan with its solver status, objective terms and runtime, so feasibility claims stay auditable.',
    anchor: 'main h1',
    hint: 'A heuristic plan is labelled as heuristic — never as optimal.',
  },
  {
    route: '/comparison',
    eyebrow: 'Step 5 · Comparison',
    title: 'Compare baseline, scenario and plan',
    body:
      'Differences are computed per metric against the baseline, so a recovery plan can be defended with evidence rather than a headline number.',
    anchor: 'main h1',
  },
  {
    route: '/mirror-ai',
    eyebrow: 'Step 6 · Mirror AI',
    title: 'Ask in plain language',
    body:
      'Mirror AI is grounded in the same services you have just used. With no model key configured it answers from a deterministic rule engine and says so — it never impersonates a model.',
    anchor: 'textarea',
    hint: 'Add MIRROR_AI_API_KEY to backend/.env to enable a language model.',
  },
]

const STORAGE_KEY = 'mirrorworld-tour-seen'
const CARD_ESTIMATE = 236

export function GuidedTour() {
  const open = useAppStore((state) => state.tourOpen)
  const setOpen = useAppStore((state) => state.setTourOpen)
  const location = useLocation()
  const navigate = useNavigate()
  const [index, setIndex] = useState(0)
  const [rect, setRect] = useState<{ top: number; left: number; width: number; height: number } | null>(null)
  const cardRef = useRef<HTMLDivElement | null>(null)

  const step = STEPS[index]
  const isLast = index === STEPS.length - 1

  const close = useCallback(() => {
    setOpen(false)
    try {
      window.localStorage.setItem(STORAGE_KEY, '1')
    } catch {
      /* storage unavailable — the tour simply reappears next visit */
    }
    cardRef.current?.blur()
  }, [setOpen])

  // First run: offer the tour once, on the overview, without blocking the page.
  useEffect(() => {
    let seen = true
    try {
      seen = window.localStorage.getItem(STORAGE_KEY) !== null
    } catch {
      seen = true
    }
    if (seen) return
    const timer = window.setTimeout(() => setOpen(true), 900)
    return () => window.clearTimeout(timer)
  }, [setOpen])

  // Opening always restarts from the step nearest the current page.
  useEffect(() => {
    if (!open) return
    const match = STEPS.findIndex((candidate) => candidate.route === location.pathname)
    setIndex(match >= 0 ? match : 0)
    // Only re-align on open, not on every navigation the tour itself causes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    if (!open) return
    cardRef.current?.focus()
  }, [open, index])

  // Navigate to the step's page, then measure its anchor once it has painted.
  useEffect(() => {
    if (!open) return
    const stepRoute = STEPS[index].route
    if (location.pathname !== stepRoute) {
      navigate(stepRoute)
      return
    }
    let frame = 0
    let timer = 0

    const measure = () => {
      const anchor = STEPS[index].anchor
      const element = anchor ? document.querySelector(anchor) : null
      if (!element) {
        setRect(null)
        return
      }
      const box = element.getBoundingClientRect()
      setRect({ top: box.top, left: box.left, width: box.width, height: box.height })
    }

    const settle = () => {
      const anchor = STEPS[index].anchor
      const element = anchor ? document.querySelector(anchor) : null
      element?.scrollIntoView({ block: 'center', behavior: 'smooth' })
      timer = window.setTimeout(measure, 380)
    }

    frame = window.requestAnimationFrame(settle)
    const onResize = () => measure()
    window.addEventListener('resize', onResize)
    window.addEventListener('scroll', onResize, { passive: true })
    return () => {
      window.cancelAnimationFrame(frame)
      window.clearTimeout(timer)
      window.removeEventListener('resize', onResize)
      window.removeEventListener('scroll', onResize)
    }
  }, [open, index, location.pathname, navigate])

  useEffect(() => {
    if (!open) return
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        close()
      } else if (event.key === 'ArrowRight') {
        event.preventDefault()
        setIndex((current) => (current === STEPS.length - 1 ? current : current + 1))
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault()
        setIndex((current) => (current === 0 ? 0 : current - 1))
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, close])

  const cardPosition = useMemo(() => {
    if (typeof window === 'undefined') return null
    const width = Math.min(420, window.innerWidth - 32)
    const left = window.innerWidth >= 1024 ? window.innerWidth - width - 32 : 16
    if (!rect) return { left, top: window.innerHeight - CARD_ESTIMATE - 32, width }
    const below = rect.top + rect.height + 20
    const top = below + CARD_ESTIMATE < window.innerHeight ? below : Math.max(16, rect.top - CARD_ESTIMATE - 20)
    return { left, top: Math.min(top, window.innerHeight - CARD_ESTIMATE - 16), width }
  }, [rect])

  if (!open || !cardPosition) return null

  return (
    <div className="fixed inset-0 z-[90]" role="dialog" aria-modal="true" aria-label="Guided tour">
      <div className="absolute inset-0 bg-overlay/45" onClick={close} aria-hidden />
      {rect && (
        <div
          aria-hidden
          className="pointer-events-none absolute rounded-lg border-2 border-cyan/80 shadow-[0_0_0_1px_rgba(56,217,245,0.35),0_0_28px_-6px_rgba(56,217,245,0.55)] transition-[top,left,width,height] duration-200"
          style={{
            top: Math.max(8, rect.top - 8),
            left: Math.max(8, rect.left - 8),
            width: rect.width + 16,
            height: rect.height + 16,
          }}
        />
      )}

      <div
        ref={cardRef}
        tabIndex={-1}
        className="absolute overflow-hidden rounded-xl border border-line bg-popover shadow-float animate-fade-up focus:outline-none"
        style={{ left: cardPosition.left, top: cardPosition.top, width: cardPosition.width }}
      >
        <div className="flex items-start justify-between gap-3 border-b border-lineSoft bg-subtle px-4 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 font-mono text-[8px] uppercase tracking-telemetry text-cyan/80">
              <Compass className="h-3 w-3" /> {step.eyebrow}
            </div>
            <div className="mt-1 text-[13px] font-semibold leading-snug text-ink">{step.title}</div>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Close guided tour"
            className="focus-ring -mr-1 -mt-1 rounded p-1 text-faint hover:text-ink"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="px-4 py-3">
          <p className="text-[11.5px] leading-relaxed text-muted">{step.body}</p>
          {step.hint && (
            <p className="mt-2 rounded border border-lineSoft bg-subtle px-2.5 py-1.5 text-[10.5px] leading-relaxed text-faint">
              {step.hint}
            </p>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-lineSoft px-4 py-2.5">
          <div className="flex items-center gap-1" aria-hidden>
            {STEPS.map((candidate, position) => (
              <span
                key={candidate.route}
                className={cn(
                  'h-1.5 rounded-full transition-all',
                  position === index ? 'w-4 bg-cyan' : 'w-1.5 bg-line',
                )}
              />
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              size="xs"
              variant="ghost"
              disabled={index === 0}
              onClick={() => setIndex((current) => Math.max(0, current - 1))}
              iconLeft={<ArrowLeft className="h-3 w-3" />}
            >
              Back
            </Button>
            {isLast ? (
              <Button size="xs" variant="primary" onClick={close}>
                Finish
              </Button>
            ) : (
              <Button
                size="xs"
                variant="secondary"
                onClick={() => setIndex((current) => Math.min(STEPS.length - 1, current + 1))}
                iconRight={<ArrowRight className="h-3 w-3" />}
              >
                Next
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
