import { ChevronsLeft, ChevronsRight, CircleAlert, X } from 'lucide-react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { NAV_GROUPS } from '../../config/nav'
import { cn } from '../../lib/utils'
import { useAppStore } from '../../store/appStore'
import { Brand, BrandMark } from '../Brand'
import { IconButton, StatusDot, Tooltip } from '../ui'

export function Sidebar() {
  const {
    activeScenarioId,
    activeScenarioName,
    sidebarCollapsed,
    mobileNavOpen,
    toggleSidebar,
    setMobileNavOpen,
    clearActiveScenario,
  } = useAppStore()
  const navigate = useNavigate()

  const clearScenario = () => {
    clearActiveScenario()
    setMobileNavOpen(false)
    navigate('/simulation')
  }

  return (
    <>
      <div
        className={cn(
          'fixed inset-0 z-40 bg-overlay/70 backdrop-blur-sm transition-opacity lg:hidden',
          mobileNavOpen ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
        onClick={() => setMobileNavOpen(false)}
        aria-hidden
      />
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-[272px] shrink-0 flex-col border-r border-line bg-subbase transition-[width,transform] duration-200 lg:sticky lg:top-0 lg:z-30 lg:h-screen lg:translate-x-0',
          sidebarCollapsed ? 'lg:w-[76px]' : 'lg:w-[248px]',
          mobileNavOpen ? 'translate-x-0' : '-translate-x-full',
        )}
        aria-label="Primary navigation"
      >
        <div className={cn('flex h-[62px] shrink-0 items-center border-b border-lineSoft px-4', sidebarCollapsed && 'lg:justify-center lg:px-2')}>
          <Link to="/" className="focus-ring rounded" aria-label="MIRRORWORLD overview">
            {sidebarCollapsed ? <BrandMark className="hidden lg:block" /> : <Brand />}
          </Link>
          <div className="ml-auto flex items-center gap-1">
            <IconButton
              label="Close navigation"
              variant="ghost"
              size="sm"
              className="lg:hidden"
              onClick={() => setMobileNavOpen(false)}
            >
              <X className="h-4 w-4" />
            </IconButton>
            <IconButton
              label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              variant="ghost"
              size="sm"
              className="hidden lg:inline-flex"
              onClick={toggleSidebar}
            >
              {sidebarCollapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
            </IconButton>
          </div>
        </div>

        <div className={cn('border-b border-lineSoft px-3 py-3', sidebarCollapsed && 'lg:px-2')}>
          <div className={cn('rounded-md border border-lineSoft bg-subtle px-2.5 py-2', sidebarCollapsed && 'lg:flex lg:justify-center lg:border-0 lg:bg-transparent lg:p-0')}>
            {sidebarCollapsed ? (
              <Tooltip content="Fall 2026 · Week 7 · Synthetic dataset">
                <span className="flex h-7 w-7 items-center justify-center rounded border border-line bg-input font-mono text-[8px] text-cyan">F26</span>
              </Tooltip>
            ) : (
              <>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[8px] uppercase tracking-telemetry text-faint">Academic term</span>
                  <span className="h-1.5 w-1.5 rounded-full bg-success/80" aria-hidden />
                </div>
                <div className="mt-1 text-[11px] font-medium text-ink">Fall 2026 · Week 7</div>
                <div className="mt-0.5 font-mono text-[8px] uppercase tracking-[0.09em] text-faint">Synthetic demo dataset</div>
              </>
            )}
          </div>
        </div>

        <nav className="min-h-0 flex-1 overflow-y-auto px-2 py-4 scroll-thin">
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="mb-4 last:mb-0">
              {!sidebarCollapsed && <div className="mb-1.5 px-2.5 font-mono text-[8px] font-medium uppercase tracking-[0.16em] text-faint/70">{group.label}</div>}
              {sidebarCollapsed && <div className="mx-auto mb-2 h-px w-6 bg-line" />}
              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  const Icon = item.icon
                  const link = (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      end={item.exact}
                      onClick={() => setMobileNavOpen(false)}
                      className={({ isActive }) =>
                        cn(
                          'group relative flex h-8 items-center gap-2.5 rounded-md border border-transparent px-2.5 text-[11.5px] transition-colors',
                          sidebarCollapsed && 'lg:justify-center lg:px-0',
                          isActive
                            ? 'border-cyan/[0.14] bg-cyan/[0.07] text-ink'
                            : 'text-muted hover:bg-subtleHover hover:text-ink',
                        )
                      }
                    >
                      {({ isActive }) => (
                        <>
                          {isActive && <span className="absolute left-0 top-1/2 h-4 w-px -translate-y-1/2 bg-cyan" aria-hidden />}
                          <Icon className={cn('h-[15px] w-[15px] shrink-0', isActive ? 'text-cyan' : 'text-faint group-hover:text-muted')} />
                          {!sidebarCollapsed && (
                            <>
                              <span className="truncate">{item.label}</span>
                              {item.badge && (
                                <span className={cn('ml-auto rounded border px-1 py-0.5 font-mono text-[7px] tracking-[0.06em]', isActive ? 'border-cyan/20 bg-cyan/[0.08] text-cyan/80' : 'border-lineSoft text-faint/70')}>
                                  {item.badge}
                                </span>
                              )}
                            </>
                          )}
                        </>
                      )}
                    </NavLink>
                  )
                  return (
                    <li key={item.path}>
                      {sidebarCollapsed ? (
                        <Tooltip content={item.label} side="bottom">
                          <div className="w-full">{link}</div>
                        </Tooltip>
                      ) : (
                        link
                      )}
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </nav>

        {activeScenarioId && (
          <div className={cn('border-t border-lineSoft p-2.5', sidebarCollapsed && 'lg:px-2')}>
            {sidebarCollapsed ? (
              <Tooltip content={`Active scenario · ${activeScenarioName ?? 'Untitled'}`} side="top">
                <Link
                  to={`/simulation?scenario=${activeScenarioId}`}
                  className="mx-auto flex h-8 w-8 items-center justify-center rounded border border-violet/30 bg-violet/10 text-violet"
                  aria-label="Open active scenario"
                >
                  <CircleAlert className="h-3.5 w-3.5" />
                </Link>
              </Tooltip>
            ) : (
              <div className="rounded-md border border-violet/20 bg-violet/[0.055] p-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-mono text-[8px] uppercase tracking-telemetry text-violet/80">Active scenario</div>
                    <Link to={`/simulation?scenario=${activeScenarioId}`} className="mt-1 block truncate text-[10.5px] font-medium text-ink hover:text-violet">
                      {activeScenarioName ?? 'Untitled scenario'}
                    </Link>
                  </div>
                  <button type="button" onClick={clearScenario} className="rounded p-0.5 text-faint hover:text-ink" aria-label="Clear active scenario" title="Clear active scenario">
                    <X className="h-3 w-3" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        <div className={cn('shrink-0 border-t border-lineSoft bg-subbase/70 p-3', sidebarCollapsed && 'lg:px-2')}>
          <div className={cn('flex items-center gap-2 rounded-md border border-lineSoft bg-subtle px-2.5 py-2', sidebarCollapsed && 'lg:justify-center lg:border-0 lg:bg-transparent lg:p-0')}>
            <StatusDot tone="success" pulse />
            {!sidebarCollapsed && (
              <div className="min-w-0">
                <div className="font-mono text-[8px] uppercase tracking-[0.12em] text-success/90">CP-SAT solver ready</div>
                <div className="mt-0.5 font-mono text-[8px] text-faint">seed 42 · single worker</div>
              </div>
            )}
          </div>
          {!sidebarCollapsed && (
            <div className="mt-3 flex items-center gap-2 px-1">
              <div className="flex h-7 w-7 items-center justify-center rounded-full border border-line bg-popover font-mono text-[9px] text-cyan">DO</div>
              <div className="min-w-0">
                <div className="truncate text-[10.5px] font-medium text-ink">Demo operator</div>
                <div className="font-mono text-[8px] uppercase tracking-[0.08em] text-faint">Single-operator mode</div>
              </div>
            </div>
          )}
        </div>
      </aside>
    </>
  )
}
