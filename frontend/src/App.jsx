import { useCallback, useEffect, useState } from 'react'
import { confirmMfaEnrolment, getMe, login, register, verifyMfa } from './api/auth'
import { useHealth } from './hooks/useHealth'
import { useMe } from './hooks/useMe'
import { totpNow, waitForNextTotpStep } from './lib/totp'
import { queryClient } from './lib/queryClient'
import { useAuthStore } from './stores/authStore'

const PING_PASSWORD = 'ArcPing-pass-1234'
const GARBAGE_TOKEN = 'eyJhbGciOiJub25lIn0.e30.force-401'

const STEP_META = [
  { id: 'health', label: 'GET /api/health/', hint: 'Unauthenticated reachability' },
  { id: 'register', label: 'POST /api/auth/register/', hint: 'Create a throwaway account' },
  { id: 'enrol', label: 'POST /api/auth/mfa/enroll/confirm/', hint: 'Prove the TOTP secret' },
  { id: 'login', label: 'POST /api/auth/login/ + /login/mfa/', hint: 'Two-step JWT MFA' },
  { id: 'me', label: 'GET /api/auth/me/', hint: 'Authenticated identity' },
]

function errorMessage(error) {
  return (
    error?.response?.data?.error?.message ||
    error?.message ||
    'Request failed'
  )
}

function StatusDot({ state }) {
  const colour =
    state === 'ok'
      ? 'bg-emerald-400'
      : state === 'error'
        ? 'bg-rose-400'
        : state === 'running'
          ? 'bg-amber-400 animate-pulse'
          : 'bg-slate-600'
  return <span className={`inline-block size-2.5 rounded-full ${colour}`} />
}

export default function ConnectionStatus() {
  const health = useHealth()
  const accessToken = useAuthStore((state) => state.accessToken)
  const refreshToken = useAuthStore((state) => state.refreshToken)
  const storedUser = useAuthStore((state) => state.user)
  const me = useMe({ enabled: Boolean(accessToken) })

  const [steps, setSteps] = useState(() =>
    Object.fromEntries(STEP_META.map((step) => [step.id, { state: 'idle', detail: '' }])),
  )
  const [email, setEmail] = useState(null)
  const [forceResult, setForceResult] = useState({ state: 'idle', detail: '' })
  const [handshakeError, setHandshakeError] = useState(null)

  const patchStep = useCallback((id, patch) => {
    setSteps((current) => ({ ...current, [id]: { ...current[id], ...patch } }))
  }, [])

  useEffect(() => {
    if (health.isPending) {
      patchStep('health', { state: 'running', detail: 'Waiting…' })
    } else if (health.isSuccess) {
      patchStep('health', {
        state: 'ok',
        detail: health.data?.message || 'Backend is reachable',
      })
    } else if (health.isError) {
      patchStep('health', { state: 'error', detail: errorMessage(health.error) })
    }
  }, [health.isPending, health.isSuccess, health.isError, health.data, health.error, patchStep])

  useEffect(() => {
    let cancelled = false

    async function handshake() {
        const pingEmail = `ping.${Date.now()}.${crypto.randomUUID().slice(0, 8)}@example.com`
      try {
        patchStep('register', { state: 'running', detail: pingEmail })
        const registered = await register({ email: pingEmail, password: PING_PASSWORD })
        if (cancelled) return
        patchStep('register', { state: 'ok', detail: pingEmail })

        patchStep('enrol', { state: 'running', detail: 'Submitting current TOTP' })
        const enrolCode = await totpNow(registered.mfa.secret)
        await confirmMfaEnrolment({
          enrolment_token: registered.enrolment_token,
          code: enrolCode,
        })
        if (cancelled) return
        patchStep('enrol', { state: 'ok', detail: `Enrolled with ${enrolCode}` })

        patchStep('login', {
          state: 'running',
          detail: 'Waiting for the next TOTP window (replay protection)',
        })
        await waitForNextTotpStep()
        if (cancelled) return

        const pending = await login({ email: pingEmail, password: PING_PASSWORD })
        const loginCode = await totpNow(registered.mfa.secret)
        const session = await verifyMfa({
          mfa_token: pending.mfa_token,
          code: loginCode,
        })
        if (cancelled) return

        useAuthStore.getState().setSession({
          access: session.access,
          refresh: session.refresh,
          user: session.user,
        })
        patchStep('login', { state: 'ok', detail: `Access held in memory · TOTP ${loginCode}` })

        patchStep('me', { state: 'running', detail: 'Fetching the signed-in account' })
        const profile = await getMe()
        if (cancelled) return
        useAuthStore.getState().setUser(profile)
        setEmail(profile.email)
        queryClient.setQueryData(['auth', 'me'], profile)
        patchStep('me', { state: 'ok', detail: profile.email })
      } catch (error) {
        if (cancelled) return
        setHandshakeError(errorMessage(error))
        setSteps((current) => {
          const next = { ...current }
          for (const id of ['register', 'enrol', 'login', 'me']) {
            if (next[id].state === 'running') {
              next[id] = { state: 'error', detail: errorMessage(error) }
              break
            }
          }
          return next
        })
      }
    }

    handshake()
    return () => {
      cancelled = true
    }
  }, [patchStep])

  async function force401() {
    setForceResult({ state: 'running', detail: 'Swapping in a garbage access token…' })
    useAuthStore.getState().setAccessToken(GARBAGE_TOKEN)
    try {
      const [first, second] = await Promise.all([getMe(), getMe()])
      queryClient.setQueryData(['auth', 'me'], first)
      useAuthStore.getState().setUser(first)
      setEmail(first.email)
      const persisted = window.localStorage.getItem('arc-auth')
      setForceResult({
        state: 'ok',
        detail:
          `Two parallel /me calls recovered via a single refresh. ` +
          `${first.email} / ${second.email}. ` +
          `Refresh still in localStorage: ${Boolean(persisted && persisted.includes('refreshToken'))}.`,
      })
    } catch (error) {
      setForceResult({ state: 'error', detail: errorMessage(error) })
    }
  }

  const sessionReady = Boolean(accessToken && email)
  const displayedEmail = me.data?.email || storedUser?.email || email

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-900 p-4 text-slate-100">
      <div className="w-full max-w-2xl space-y-6">
        <header>
          <p className="text-xs font-medium tracking-[0.2em] text-emerald-400 uppercase">
            ARC · Phase 6
          </p>
          <h1 className="mt-2 text-3xl font-bold">Connection status</h1>
          <p className="mt-2 text-sm text-slate-400">
            Proves the Axios client can reach the backend, complete the two-step
            MFA login, and recover from an expired access token without a visible
            error.
          </p>
        </header>

        <ol className="divide-y divide-slate-700 overflow-hidden rounded-lg border border-slate-700 bg-slate-800 shadow-md">
          {STEP_META.map((step) => {
            const row = steps[step.id]
            return (
              <li key={step.id} className="flex items-start gap-3 p-4">
                <StatusDot state={row.state} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-mono text-sm text-slate-200">{step.label}</span>
                    <span className="text-xs tracking-wide text-slate-500 uppercase">
                      {row.state}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{step.hint}</p>
                  {row.detail && (
                    <p
                      className={`mt-2 font-mono text-sm ${
                        row.state === 'error' ? 'text-rose-400' : 'text-emerald-400'
                      }`}
                    >
                      {row.detail}
                    </p>
                  )}
                </div>
              </li>
            )
          })}
        </ol>

        {handshakeError && (
          <p className="rounded-lg border border-rose-900 bg-rose-950/40 px-4 py-3 text-sm text-rose-300">
            Handshake stopped: {handshakeError}
          </p>
        )}

        <section className="rounded-lg border border-slate-700 bg-slate-800 p-4">
          <h2 className="text-sm font-semibold text-slate-200">Signed-in account</h2>
          <p className="mt-2 font-mono text-lg text-emerald-400">
            {displayedEmail || 'Waiting for GET /api/auth/me/…'}
          </p>
          <p className="mt-2 text-xs text-slate-500">
            Access token {accessToken ? 'in memory' : 'absent'} · refresh token{' '}
            {refreshToken ? 'in localStorage' : 'absent'}
          </p>
        </section>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={force401}
            disabled={!sessionReady || forceResult.state === 'running'}
            className="rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
          >
            Force 401
          </button>
          <p className="text-xs text-slate-500">
            Replaces the access token with garbage, then fires two concurrent
            /me requests so the interceptor has to queue them behind one refresh.
          </p>
        </div>

        {forceResult.state !== 'idle' && (
          <p
            className={`rounded-lg border px-4 py-3 font-mono text-sm ${
              forceResult.state === 'error'
                ? 'border-rose-900 bg-rose-950/40 text-rose-300'
                : forceResult.state === 'running'
                  ? 'border-amber-900 bg-amber-950/40 text-amber-300'
                  : 'border-emerald-900 bg-emerald-950/30 text-emerald-400'
            }`}
          >
            {forceResult.detail}
          </p>
        )}
      </div>
    </div>
  )
}
