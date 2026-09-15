import { useEffect, useState } from 'react'
import { getMe, refreshTokens } from '../api/auth'
import { useAuthStore } from '../stores/authStore'

/**
 * Access tokens live only in memory. After a reload we still have the
 * refresh token in localStorage, so mint a new access token and reload /me
 * before any gated route decides who the visitor is.
 */
export default function SessionHydrator({ children }) {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function hydrate() {
      const store = useAuthStore.getState()
      try {
        if (!store.accessToken && store.refreshToken) {
          const tokens = await refreshTokens(store.refreshToken)
          store.setSession({ access: tokens.access, refresh: tokens.refresh })
        }
        if (useAuthStore.getState().accessToken && !useAuthStore.getState().user) {
          const profile = await getMe()
          useAuthStore.getState().setUser(profile)
        }
      } catch {
        useAuthStore.getState().clearSession()
      } finally {
        if (!cancelled) setReady(true)
      }
    }

    const persist = useAuthStore.persist
    if (persist.hasHydrated()) {
      hydrate()
      return () => {
        cancelled = true
      }
    }

    const unsub = persist.onFinishHydration(() => {
      hydrate()
    })
    return () => {
      cancelled = true
      unsub()
    }
  }, [])

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-900 text-sm text-slate-500">
        Loading ARC…
      </div>
    )
  }

  return children
}
