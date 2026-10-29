import { create } from 'zustand'
import type { ClusterSummary, RabbitMQUser } from '@/lib/rabbitmq/types'

/**
 * Client-side auth state. Stores only UI display data.
 * Actual credentials live in the httpOnly cookie managed server-side.
 */
interface AuthState {
  authenticated: boolean
  user: RabbitMQUser | null
  cluster: ClusterSummary | null
  hydrated: boolean
  setAuth: (user: RabbitMQUser, cluster?: ClusterSummary | null) => void
  clearAuth: () => void
  hydrate: () => Promise<void>
}

export const useAuth = create<AuthState>()((set, get) => ({
  authenticated: false,
  user: null,
  cluster: null,
  hydrated: false,
  setAuth: (user, cluster = null) =>
    set({ authenticated: true, user, cluster, hydrated: true }),
  clearAuth: () =>
    set({ authenticated: false, user: null, cluster: null, hydrated: true }),
  // Restore user info after a full page reload (cookie survives, store doesn't)
  hydrate: async () => {
    if (get().hydrated) return
    try {
      const res = await fetch('/api/auth/me')
      if (res.ok) {
        const data = await res.json()
        if (data.authenticated && data.user) {
          set({
            authenticated: true,
            user: data.user,
            cluster: data.cluster ?? null,
            hydrated: true,
          })
          return
        }
      }
    } catch {
      // Network error — leave state as-is; polling will surface problems
    }
    set({ hydrated: true })
  },
}))
