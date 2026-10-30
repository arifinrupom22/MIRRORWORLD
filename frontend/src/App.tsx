import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Route, Routes } from 'react-router-dom'
import { AppShell } from './components/layout/AppShell'
import { Button, EmptyState } from './components/ui'
import { CampusModelPage } from './pages/CampusModelPage'
import { ComparisonPage } from './pages/ComparisonPage'
import { DependencyExplorerPage } from './pages/DependencyExplorerPage'
import { DigitalCampusPage } from './pages/DigitalCampusPage'
import { HistoryPage } from './pages/HistoryPage'
import { MethodologyPage } from './pages/MethodologyPage'
import { OperationsOverviewPage } from './pages/OperationsOverviewPage'
import { ScheduleOptimizerPage } from './pages/ScheduleOptimizerPage'
import { SimulationStudioPage } from './pages/SimulationStudioPage'

class AppErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; message: string }> {
  state = { hasError: false, message: '' }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, message: error.message }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('MIRRORWORLD render error', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="app-backdrop flex min-h-screen items-center justify-center p-6">
          <div className="panel w-full max-w-lg">
            <EmptyState
              title="The interface encountered an unexpected error"
              description={this.state.message || 'Reload the workspace to restore the last saved state.'}
              action={
                <Button variant="primary" onClick={() => window.location.reload()}>
                  Reload workspace
                </Button>
              }
            />
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

function NotFoundPage() {
  return (
    <div className="panel">
      <EmptyState
        title="This workspace page does not exist"
        description="The route is not part of the MIRRORWORLD workspace. Return to operations or open the method reference."
        action={
          <Button variant="primary" onClick={() => (window.location.href = '/')}>
            Return to overview
          </Button>
        }
      />
    </div>
  )
}

export default function App() {
  return (
    <AppErrorBoundary>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<OperationsOverviewPage />} />
          <Route path="/campus" element={<DigitalCampusPage />} />
          <Route path="/simulation" element={<SimulationStudioPage />} />
          <Route path="/dependencies" element={<DependencyExplorerPage />} />
          <Route path="/optimizer" element={<ScheduleOptimizerPage />} />
          <Route path="/comparison" element={<ComparisonPage />} />
          <Route path="/model" element={<CampusModelPage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/method" element={<MethodologyPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </AppErrorBoundary>
  )
}
