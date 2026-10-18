import { useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { adminLogin, adminVerifyMfa } from '../../api/auth'
import { errorMessage } from '../../lib/errors'
import { queryClient } from '../../lib/queryClient'
import { useAuthStore } from '../../stores/authStore'

/**
 * FR-15: a dedicated staff sign-in. Posts only to /api/auth/admin/login/ and
 * /api/auth/admin/login/mfa/. A student password is rejected by the backend
 * with not_an_administrator; this page never falls back to the student login
 * or to Django's /admin/.
 */
export default function AdminLoginPage() {
  const user = useAuthStore((state) => state.user)
  const accessToken = useAuthStore((state) => state.accessToken)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [mfaToken, setMfaToken] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  if (accessToken && user?.is_admin) {
    return <Navigate to="/admin" replace />
  }

  async function submitCredentials(event) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const pending = await adminLogin({ email: email.trim(), password })
      setMfaToken(pending.mfa_token)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function submitTotp(event) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const session = await adminVerifyMfa({
        mfa_token: mfaToken,
        code: code.trim(),
      })
      useAuthStore.getState().setSession({
        access: session.access,
        refresh: session.refresh,
        user: session.user,
      })
      queryClient.clear()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-900 p-4 text-slate-100">
      <div className="w-full max-w-md space-y-6">
        <header>
          <p className="text-xs font-medium tracking-[0.2em] text-emerald-400 uppercase">
            ARC · Staff console
          </p>
          <h1 className="mt-2 text-3xl font-bold">Privileged sign-in</h1>
          <p className="mt-2 text-sm text-slate-400">
            This entry is for operators who manage account access. Student
            logins cannot continue here, and this screen does not open Django&apos;s
            built-in admin.
          </p>
        </header>

        <div className="rounded-lg border border-slate-700 bg-slate-800 p-5 shadow-md">
          {!mfaToken ? (
            <form className="space-y-4" onSubmit={submitCredentials}>
              <label className="block text-sm">
                <span className="text-slate-400">Email</span>
                <input
                  type="email"
                  autoComplete="username"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-600 bg-slate-950 px-3 py-2 text-slate-100 outline-none focus:border-emerald-400"
                />
              </label>
              <label className="block text-sm">
                <span className="text-slate-400">Password</span>
                <input
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-600 bg-slate-950 px-3 py-2 text-slate-100 outline-none focus:border-emerald-400"
                />
              </label>
              <button
                type="submit"
                disabled={busy}
                className="w-full rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:bg-slate-700 disabled:text-slate-400"
              >
                {busy ? 'Checking…' : 'Continue'}
              </button>
            </form>
          ) : (
            <form className="space-y-4" onSubmit={submitTotp}>
              <p className="text-sm text-slate-400">
                Enter the six-digit code from your authenticator app for{' '}
                <span className="font-mono text-emerald-400">{email}</span>.
              </p>
              <label className="block text-sm">
                <span className="text-slate-400">Authentication code</span>
                <input
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  required
                  minLength={6}
                  maxLength={6}
                  value={code}
                  onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
                  className="mt-1 w-full rounded-md border border-slate-600 bg-slate-950 px-3 py-2 font-mono tracking-[0.4em] text-slate-100 outline-none focus:border-emerald-400"
                />
              </label>
              <button
                type="submit"
                disabled={busy || code.length !== 6}
                className="w-full rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:bg-slate-700 disabled:text-slate-400"
              >
                {busy ? 'Verifying…' : 'Enter console'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setMfaToken(null)
                  setCode('')
                  setError(null)
                }}
                className="w-full text-sm text-slate-500 hover:text-slate-300"
              >
                Use a different account
              </button>
            </form>
          )}

          {error && (
            <p className="mt-4 rounded-md border border-rose-900 bg-rose-950/40 px-3 py-2 text-sm text-rose-300">
              {error}
            </p>
          )}
        </div>

        <p className="text-center text-sm text-slate-500">
          <Link to="/forgot-password" className="text-emerald-400 hover:text-emerald-300">
            Forgot your password?
          </Link>
        </p>
        <p className="text-center text-sm text-slate-500">
          <Link to="/" className="text-emerald-400 hover:text-emerald-300">
            Back to the student app
          </Link>
        </p>
      </div>
    </div>
  )
}
