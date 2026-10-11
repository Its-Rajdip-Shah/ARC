import { useEffect, useState } from 'react'
import { getMe, refreshTokens, initializeTimeZone } from '../api/auth'
import { useAuthStore } from '../stores/authStore'

// StrictMode mounts share token refresh and profile loading.
let hydrationPromise = null

function hydrateSession() {
  if (!hydrationPromise) {
    hydrationPromise = (async () => {
      const store = useAuthStore.getState()
      let session = store
      try {
        if (!store.accessToken && store.refreshToken) {
          const tokens = await refreshTokens(store.refreshToken)
          // A logout or a different login supersedes this request.
          if (useAuthStore.getState().refreshToken !== store.refreshToken) return
          store.setSession({ access: tokens.access, refresh: tokens.refresh })
        }
        const current = useAuthStore.getState()
        session = current
        if (current.accessToken && !current.user) {
          const profile = await getMe()
          if (useAuthStore.getState().accessToken === current.accessToken) {
            current.setUser(profile)
          }
        }
      } catch {
        const current = useAuthStore.getState()
        if (current.refreshToken === session.refreshToken && current.user === session.user) {
          current.clearSession()
        }
      }
    })().finally(() => { hydrationPromise = null })
  }
  return hydrationPromise
}

/** Load the profile and attempt timezone initialization before gated routes. */
export default function SessionHydrator({ children }) {
  const [ready, setReady] = useState(false)
  const [initializedUser, setInitializedUser] = useState(null)
  const user = useAuthStore((state) => state.user)
  const authenticated = useAuthStore((state) => Boolean(state.accessToken))

  useEffect(() => {
    let cancelled = false

    async function hydrate() {
      await hydrateSession()
      if (!cancelled) setReady(true)
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

  useEffect(() => {
    if (!authenticated || !user) return undefined
    let cancelled = false
    initializeTimeZone(user).then((profile) => {
      if (cancelled) return
      const store = useAuthStore.getState()
      if (store.user !== user || !store.accessToken) return
      if (profile !== user) store.setUser(profile)
      setInitializedUser(profile)
    })
    return () => { cancelled = true }
  }, [authenticated, user])

  if (!ready || (authenticated && user && initializedUser !== user)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-900 text-sm text-slate-500">
        Loading ARC…
      </div>
    )
  }

  return children
}
