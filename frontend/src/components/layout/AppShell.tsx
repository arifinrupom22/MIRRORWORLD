import { Command, Database, ShieldCheck } from 'lucide-react'
import { useEffect } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { useAppStore } from '../../store/appStore'
import { CommandPalette } from './CommandPalette'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'
import { ToastViewport } from '../ui'
import { GuidedTour } from '../GuidedTour'

export function AppShell() {
  const location = useLocation()
  const setMobileNavOpen = useAppStore((state) => state.setMobileNavOpen)
  const setCommandOpen = useAppStore((state) => state.setCommandOpen)

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' })
    setMobileNavOpen(false)
  }, [location.pathname, setMobileNavOpen])

  return (
    <div className="app-backdrop flex min-h-screen">
      <a
        href="#main-content"
        className="sr-only z-[120] rounded-md border border-cyan bg-panel px-3 py-2 text-[12px] text-ink focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Skip to main content
      </a>
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main id="main-content" className="relative flex-1">
          <div key={location.pathname} className="mx-auto w-full max-w-[1600px] animate-fade-in px-4 py-5 sm:px-5 lg:px-6 lg:py-7">
            <Outlet />
          </div>
        </main>
        <footer className="mx-auto flex w-full max-w-[1600px] flex-col gap-3 border-t border-lineSoft px-4 py-4 text-[9.5px] text-faint sm:flex-row sm:items-center sm:justify-between sm:px-5 lg:px-6">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <span className="flex items-center gap-1.5 font-mono uppercase tracking-[0.1em]">
              <ShieldCheck className="h-3 w-3 text-success/70" /> Synthetic campus · no operational data
            </span>
            <span className="flex items-center gap-1.5 font-mono uppercase tracking-[0.1em]">
              <Database className="h-3 w-3 text-blue/70" /> CP-SAT seed 42
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <Link to="/method" className="link-underline hover:text-muted">
              Method & limitations
            </Link>
            <Link to="/history" className="link-underline hover:text-muted">
              Audit trail
            </Link>
            <button
              type="button"
              onClick={() => setCommandOpen(true)}
              className="inline-flex items-center gap-1 font-mono uppercase tracking-[0.1em] hover:text-muted"
            >
              <Command className="h-3 w-3" /> K search
            </button>
          </div>
        </footer>
      </div>
      <CommandPalette />
      <ToastViewport />
      <GuidedTour />
    </div>
  )
}
