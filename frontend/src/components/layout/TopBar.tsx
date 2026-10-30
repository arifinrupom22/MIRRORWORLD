import { AlertTriangle, Bell, Menu, Moon, Plus, Search, ShieldAlert, Sun } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { routeMeta } from '../../config/nav'
import { useOverview } from '../../lib/hooks'
import { cn } from '../../lib/utils'
import { useAppStore } from '../../store/appStore'
import { BreadcrumbChevron, Button, IconButton, StatusDot } from '../ui'

export function TopBar() {
  const location = useLocation()
  const navigate = useNavigate()
  const meta = routeMeta(location.pathname)
  const { setMobileNavOpen, setCommandOpen, notificationsOpen, setNotificationsOpen, clearActiveScenario } = useAppStore()
  const overview = useOverview()
  const alerts = overview.data?.alerts ?? []
  const [utc, setUtc] = useState(() => new Date())
  const [theme, setTheme] = useState<'bright' | 'dark'>(() =>
    document.documentElement.dataset.theme === 'dark' ? 'dark' : 'bright',
  )
  const popoverRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const timer = window.setInterval(() => setUtc(new Date()), 30_000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!notificationsOpen) return
    const handler = (event: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) setNotificationsOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [notificationsOpen, setNotificationsOpen])

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setCommandOpen(true)
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [setCommandOpen])

  const openAlert = (action: string) => {
    setNotificationsOpen(false)
    if (action === 'campus') navigate('/model')
    else navigate('/simulation')
  }

  const toggleTheme = () => {
    const nextTheme = theme === 'bright' ? 'dark' : 'bright'
    document.documentElement.dataset.theme = nextTheme === 'dark' ? 'dark' : ''
    window.localStorage.setItem('mirrorworld-theme', nextTheme)
    setTheme(nextTheme)
  }

  return (
    <header className="sticky top-0 z-30 flex h-[62px] shrink-0 items-center gap-3 border-b border-line bg-canvas/88 px-4 backdrop-blur-md lg:px-6">
      <IconButton label="Open navigation" variant="ghost" className="lg:hidden" onClick={() => setMobileNavOpen(true)}>
        <Menu className="h-4 w-4" />
      </IconButton>

      <div className="hidden min-w-0 items-center gap-2 md:flex">
        <span className="font-mono text-[8.5px] uppercase tracking-telemetry text-faint">{meta.group}</span>
        <BreadcrumbChevron />
        <span className="truncate text-[11.5px] font-medium text-ink">{meta.label}</span>
      </div>
      <Link to="/" className="md:hidden" aria-label="MIRRORWORLD home">
        <span className="font-mono text-[9px] tracking-[0.14em] text-ink">MIRRORWORLD</span>
      </Link>

      <div className="ml-auto flex min-w-0 items-center gap-1.5 sm:gap-2">
        <button
          type="button"
          onClick={() => setCommandOpen(true)}
          className="focus-ring group flex h-8 items-center gap-2 rounded-md border border-line bg-input/70 px-2.5 text-left text-[11px] text-faint transition-colors hover:border-lineHover hover:text-muted lg:w-[248px]"
          aria-label="Search campus and runs"
        >
          <Search className="h-3.5 w-3.5 shrink-0" />
          <span className="hidden flex-1 truncate lg:block">Search campus, runs…</span>
          <kbd className="kbd hidden lg:inline-flex">⌘K</kbd>
        </button>

        <div className="hidden items-center gap-2 rounded-md border border-line bg-subtle px-2.5 py-1.5 xl:flex">
          <StatusDot tone="success" />
          <div className="leading-tight">
            <div className="font-mono text-[8px] uppercase tracking-[0.1em] text-faint">Fall 2026 · Week 7</div>
            <div className="font-mono text-[8.5px] text-muted">synthetic dataset</div>
          </div>
        </div>

        <div className="hidden min-w-[92px] border-l border-lineSoft pl-3 text-right md:block">
          <div className="font-mono text-[10px] tabular-nums text-ink">
            {utc.toISOString().slice(11, 16)} <span className="text-[8px] text-faint">UTC</span>
          </div>
          <div className="font-mono text-[8px] uppercase tracking-[0.08em] text-faint">
            {utc.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
          </div>
        </div>

        <button
          type="button"
          onClick={toggleTheme}
          aria-label={`Switch to ${theme === 'bright' ? 'dark' : 'bright'} mode`}
          className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-md border border-line bg-subtle px-2.5 text-[10px] font-medium text-muted transition-colors hover:bg-subtleHover hover:text-ink"
        >
          {theme === 'bright' ? <Moon className="h-3.5 w-3.5" /> : <Sun className="h-3.5 w-3.5" />}
          <span className="hidden sm:inline">{theme === 'bright' ? 'Dark Mode' : 'Bright Mode'}</span>
        </button>

        <div className="relative" ref={popoverRef}>
          <button
            type="button"
            aria-label={`Open alerts (${alerts.length})`}
            aria-expanded={notificationsOpen}
            onClick={() => setNotificationsOpen(!notificationsOpen)}
            className={cn(
              'focus-ring relative flex h-8 w-8 items-center justify-center rounded-md border text-muted transition-colors',
              notificationsOpen ? 'border-lineHover bg-subtleHover text-ink' : 'border-line bg-subtle hover:text-ink',
            )}
          >
            <Bell className="h-3.5 w-3.5" />
            {alerts.length > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full border border-canvas bg-critical px-1 font-mono text-[8px] font-semibold text-white">
                {alerts.length > 9 ? '9+' : alerts.length}
              </span>
            )}
          </button>
          {notificationsOpen && (
            <div className="absolute right-0 top-[calc(100%+8px)] z-50 w-[min(360px,calc(100vw-2rem))] overflow-hidden rounded-lg border border-line bg-popover shadow-float animate-fade-up">
              <div className="flex items-center justify-between border-b border-lineSoft px-3.5 py-2.5">
                <div>
                  <div className="telemetry">Constraint alerts</div>
                  <div className="mt-0.5 text-[11px] font-medium text-ink">{alerts.length} open on baseline</div>
                </div>
                <ShieldAlert className="h-4 w-4 text-warning" />
              </div>
              <div className="max-h-[320px] overflow-y-auto scroll-thin">
                {alerts.length === 0 ? (
                  <div className="px-3.5 py-6 text-center text-[11px] text-faint">No open baseline alerts.</div>
                ) : (
                  alerts.slice(0, 6).map((alert) => (
                    <button
                      key={alert.id}
                      type="button"
                      onClick={() => openAlert(alert.action)}
                      className="flex w-full items-start gap-2.5 border-b border-lineSoft px-3.5 py-2.5 text-left last:border-b-0 hover:bg-subtleHover"
                    >
                      <AlertTriangle className={cn('mt-0.5 h-3.5 w-3.5 shrink-0', alert.severity === 'critical' ? 'text-critical' : 'text-warning')} />
                      <span className="min-w-0">
                        <span className="flex items-center gap-2">
                          <span className="font-mono text-[7.5px] uppercase tracking-[0.1em] text-faint">{alert.category}</span>
                          {alert.slot && <span className="font-mono text-[7.5px] text-faint/80">{alert.slot}</span>}
                        </span>
                        <span className="mt-0.5 block truncate text-[11px] font-medium text-ink">{alert.title}</span>
                        <span className="mt-0.5 block line-clamp-2 text-[10px] leading-relaxed text-faint">{alert.detail}</span>
                      </span>
                    </button>
                  ))
                )}
              </div>
              <div className="flex items-center justify-between border-t border-lineSoft bg-subtle px-3.5 py-2">
                <span className="font-mono text-[8px] text-faint">
                  {overview.data ? `${overview.data.metrics.hard_issue_count} hard issues · baseline` : 'Loading alerts…'}
                </span>
                <button type="button" onClick={() => { setNotificationsOpen(false); navigate('/') }} className="text-[10px] font-medium text-cyan hover:text-ink">
                  Open overview
                </button>
              </div>
            </div>
          )}
        </div>

        <Button
          variant="primary"
          size="sm"
          iconLeft={<Plus className="h-3.5 w-3.5" />}
          onClick={() => {
            clearActiveScenario()
            navigate('/simulation?new=1')
          }}
          className="hidden sm:inline-flex"
        >
          New simulation
        </Button>
      </div>
    </header>
  )
}
