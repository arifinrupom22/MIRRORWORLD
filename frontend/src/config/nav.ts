import {
  BarChart3,
  BookOpen,
  Building2,
  Database,
  FlaskConical,
  GitBranch,
  History,
  LayoutDashboard,
  SlidersHorizontal,
  Sparkles,
  type LucideIcon,
} from 'lucide-react'

export interface NavItem {
  label: string
  path: string
  icon: LucideIcon
  badge?: string
  exact?: boolean
  description: string
}

export interface NavGroup {
  label: string
  items: NavItem[]
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Operations',
    items: [
      {
        label: 'Overview',
        path: '/',
        icon: LayoutDashboard,
        badge: 'LIVE',
        exact: true,
        description: 'Campus health, alerts and recent runs',
      },
      {
        label: 'Digital campus',
        path: '/campus',
        icon: Building2,
        badge: 'MAP',
        description: 'Spatial rooms, availability and schedules',
      },
    ],
  },
  {
    label: 'Decision engines',
    items: [
      {
        label: 'Simulation studio',
        path: '/simulation',
        icon: FlaskConical,
        badge: 'SIM',
        description: 'Configure a counterfactual and detect impact',
      },
      {
        label: 'Dependency explorer',
        path: '/dependencies',
        icon: GitBranch,
        badge: 'GRAPH',
        description: 'Trace resources, sessions and groups',
      },
      {
        label: 'Schedule optimizer',
        path: '/optimizer',
        icon: SlidersHorizontal,
        badge: 'CP-SAT',
        description: 'Generate and audit recovery plans B–D',
      },
      {
        label: 'Mirror AI',
        path: '/mirror-ai',
        icon: Sparkles,
        badge: 'AI',
        description: 'Ask grounded questions about the twin',
      },
    ],
  },
  {
    label: 'Analysis',
    items: [
      {
        label: 'Scenario comparison',
        path: '/comparison',
        icon: BarChart3,
        badge: 'DIFF',
        description: 'Baseline, scenario and plan side by side',
      },
      {
        label: 'Run history',
        path: '/history',
        icon: History,
        description: 'Reproducible experiments and audit trail',
      },
    ],
  },
  {
    label: 'Model',
    items: [
      {
        label: 'Campus model',
        path: '/model',
        icon: Database,
        description: 'Rooms, instructors and cohorts',
      },
    ],
  },
  {
    label: 'Reference',
    items: [
      {
        label: 'Method & evidence',
        path: '/method',
        icon: BookOpen,
        description: 'Constraints, formulas and limitations',
      },
    ],
  },
]

export const ALL_NAV_ITEMS = NAV_GROUPS.flatMap((group) => group.items)

export function routeMeta(pathname: string) {
  if (pathname === '/') return { group: 'Operations', label: 'Overview', item: ALL_NAV_ITEMS[0] }
  const item = ALL_NAV_ITEMS.find((candidate) => pathname.startsWith(candidate.path) && candidate.path !== '/')
  if (item) {
    const group = NAV_GROUPS.find((candidate) => candidate.items.some((entry) => entry.path === item.path))
    return { group: group?.label ?? 'Workspace', label: item.label, item }
  }
  return { group: 'MIRRORWORLD', label: 'Workspace', item: ALL_NAV_ITEMS[0] }
}
