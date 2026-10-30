import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface AppState {
  activeScenarioId: string | null
  activeScenarioName: string | null
  sidebarCollapsed: boolean
  mobileNavOpen: boolean
  commandOpen: boolean
  notificationsOpen: boolean
  setActiveScenario: (id: string, name: string) => void
  clearActiveScenario: () => void
  toggleSidebar: () => void
  setMobileNavOpen: (open: boolean) => void
  setCommandOpen: (open: boolean) => void
  setNotificationsOpen: (open: boolean) => void
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      activeScenarioId: null,
      activeScenarioName: null,
      sidebarCollapsed: false,
      mobileNavOpen: false,
      commandOpen: false,
      notificationsOpen: false,
      setActiveScenario: (id, name) => set({ activeScenarioId: id, activeScenarioName: name }),
      clearActiveScenario: () => set({ activeScenarioId: null, activeScenarioName: null }),
      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      setMobileNavOpen: (open) => set({ mobileNavOpen: open }),
      setCommandOpen: (open) => set({ commandOpen: open }),
      setNotificationsOpen: (open) => set({ notificationsOpen: open }),
    }),
    {
      name: 'mirrorworld-ui',
      partialize: (state) => ({
        activeScenarioId: state.activeScenarioId,
        activeScenarioName: state.activeScenarioName,
        sidebarCollapsed: state.sidebarCollapsed,
      }),
    },
  ),
)

export type ToastTone = 'success' | 'error' | 'info'

export interface ToastItem {
  id: string
  title: string
  description?: string
  tone: ToastTone
}

interface ToastState {
  toasts: ToastItem[]
  push: (toast: Omit<ToastItem, 'id'>) => string
  dismiss: (id: string) => void
}

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  push: (toast) => {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`
    set((state) => ({ toasts: [...state.toasts, { ...toast, id }].slice(-4) }))
    window.setTimeout(() => get().dismiss(id), 5200)
    return id
  },
  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),
}))

export function toast(title: string, tone: ToastTone = 'info', description?: string) {
  useToastStore.getState().push({ title, tone, description })
}
