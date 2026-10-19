import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import {
  confirmAuthenticatorRecovery,
  confirmMfaEnrolment,
  confirmPasswordReset,
  passwordResetStatus,
  requestAuthenticatorRecovery,
  requestPasswordReset,
} from '../../api/auth'
import loginBackground from '../../assets/auth/login-background.png'
import { errorMessage } from '../../lib/errors'

const STORAGE_KEY = 'arc.password-reset-token'
const PURPOSE_KEY = 'arc.password-reset-purpose'
const fieldClass =
  'h-[55px] w-full bg-[#1D4074] px-4 text-lg text-white outline-none placeholder:text-[#B7A6EC] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:px-12'

function storedToken() {
  return sessionStorage.getItem(STORAGE_KEY) || ''
}

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [purpose, setPurpose] = useState(() => sessionStorage.getItem(PURPOSE_KEY) || 'password')
  const [token, setToken] = useState(storedToken)
  const [status, setStatus] = useState(storedToken() ? 'pending' : 'start')
  const [enrolment, setEnrolment] = useState(null)
  const [code, setCode] = useState('')
  const [detail, setDetail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!token || status !== 'pending') return undefined
    let cancelled = false

    async function poll() {
      try {
        const body = await passwordResetStatus(token)
        if (cancelled) return
        if (body.status === 'pending' || body.status === 'approved') {
          setStatus(body.status)
          return
        }
        sessionStorage.removeItem(STORAGE_KEY)
        setToken('')
        setStatus(body.status)
      } catch (pollError) {
        if (!cancelled) setError(errorMessage(pollError, 'Could not check the reset.'))
      }
    }

    poll()
    const id = window.setInterval(poll, 4000)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [token, status])

  async function submitEmail(event) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const request = purpose === 'authenticator' ? requestAuthenticatorRecovery : requestPasswordReset
      const body = await request({ email })
      sessionStorage.setItem(STORAGE_KEY, body.request_token)
      sessionStorage.setItem(PURPOSE_KEY, purpose)
      setToken(body.request_token)
      setDetail(body.detail)
      setStatus('pending')
    } catch (requestError) {
      setError(errorMessage(requestError, 'Could not request a reset.'))
    } finally {
      setBusy(false)
    }
  }

  async function submitPassword(event) {
    event.preventDefault()
    setError(null)
    if (newPassword !== confirmPassword) {
      setError('The new passwords do not match.')
      return
    }
    setBusy(true)
    try {
      await confirmPasswordReset({ request_token: token, new_password: newPassword })
      sessionStorage.removeItem(STORAGE_KEY)
      sessionStorage.removeItem(PURPOSE_KEY)
      setToken('')
      setStatus('done')
    } catch (confirmError) {
      setError(errorMessage(confirmError, 'Could not update the password.'))
    } finally {
      setBusy(false)
    }
  }

  async function startAuthenticator(event) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      setEnrolment(await confirmAuthenticatorRecovery({ request_token: token }))
    } catch (confirmError) {
      setError(errorMessage(confirmError, 'Could not start authenticator setup.'))
    } finally {
      setBusy(false)
    }
  }

  async function finishAuthenticator(event) {
    event.preventDefault()
    if (!enrolment || code.trim().length !== 6) return
    setBusy(true)
    setError(null)
    try {
      await confirmMfaEnrolment({
        enrolment_token: enrolment.enrolment_token,
        code: code.trim(),
      })
      sessionStorage.removeItem(STORAGE_KEY)
      sessionStorage.removeItem(PURPOSE_KEY)
      setToken('')
      setStatus('done')
    } catch (confirmError) {
      setError(errorMessage(confirmError, 'That code was not accepted.'))
    } finally {
      setBusy(false)
    }
  }

  function startAgain() {
    sessionStorage.removeItem(STORAGE_KEY)
    sessionStorage.removeItem(PURPOSE_KEY)
    setToken('')
    setPurpose('password')
    setEnrolment(null)
    setStatus('start')
    setError(null)
    setDetail('')
  }

  return (
    <main
      className="relative flex min-h-screen items-center justify-center overflow-y-auto bg-[#152C72] bg-cover bg-center"
      style={{ backgroundImage: `url(${loginBackground})` }}
    >
      <section className="relative my-6 w-[499px] max-w-[calc(100vw-32px)] bg-[#7D98D7]/40 px-6 py-6 text-white sm:px-[61px]">
        <h1 className="text-center text-[32px] font-semibold tracking-wide">
          RESET PASSWORD
        </h1>

        {status === 'start' && (
          <form className="mt-8" onSubmit={submitEmail}>
            <fieldset className="mb-4">
              <legend className="mb-2 text-sm font-medium">What do you need?</legend>
              <label className="mr-4 text-sm">
                <input
                  type="radio"
                  name="recovery"
                  value="password"
                  checked={purpose === 'password'}
                  onChange={() => setPurpose('password')}
                />
                {' '}Password
              </label>
              <label className="text-sm">
                <input
                  type="radio"
                  name="recovery"
                  value="authenticator"
                  checked={purpose === 'authenticator'}
                  onChange={() => setPurpose('authenticator')}
                />
                {' '}Authenticator
              </label>
            </fieldset>
            <label className="block text-sm font-medium">
              Email
              <input
                type="email"
                required
                autoComplete="username"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className={`mt-2 ${fieldClass}`}
              />
            </label>
            <button
              type="submit"
              disabled={busy}
              className="mx-auto mt-10 block h-[58px] w-[172px] bg-[#C3D19B] text-lg font-semibold text-black disabled:opacity-60"
            >
              {busy ? 'SENDING...' : 'REQUEST'}
            </button>
          </form>
        )}

        {status === 'pending' && (
          <p role="status" className="mt-8 text-center text-sm leading-6">
            {detail || 'If an account exists, an administrator has been asked to approve a reset. Keep this page open in this browser.'}
          </p>
        )}

        {status === 'approved' && purpose === 'authenticator' && !enrolment && (
          <form className="mt-8" onSubmit={startAuthenticator}>
            <p className="text-sm leading-6">An administrator approved a new authenticator. Your password stays the same.</p>
            <button
              type="submit"
              disabled={busy}
              className="mx-auto mt-10 block h-[58px] w-[172px] bg-[#C3D19B] text-lg font-semibold text-black disabled:opacity-60"
            >
              {busy ? 'STARTING...' : 'CONTINUE'}
            </button>
          </form>
        )}

        {status === 'approved' && enrolment && (
          <form className="mt-8" onSubmit={finishAuthenticator}>
            <p className="text-center text-sm">Scan this code, then enter the six digits.</p>
            <img
              alt="Authenticator QR code"
              src={`data:image/png;base64,${enrolment.mfa.qr_png_base64}`}
              className="mx-auto mt-4 size-40 bg-white p-2"
            />
            <label className="mt-4 block text-sm font-medium">
              Authentication code
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                className={`mt-2 ${fieldClass}`}
              />
            </label>
            <button
              type="submit"
              disabled={busy || code.length !== 6}
              className="mx-auto mt-10 block h-[58px] w-[172px] bg-[#C3D19B] text-lg font-semibold text-black disabled:opacity-60"
            >
              {busy ? 'SAVING...' : 'SAVE CODE'}
            </button>
          </form>
        )}

        {status === 'approved' && purpose !== 'authenticator' && (
          <form className="mt-8" onSubmit={submitPassword}>
            <p className="text-sm leading-6">An administrator approved this reset. Choose a new password.</p>
            <label className="mt-4 block text-sm font-medium">
              New password
              <input
                type="password"
                required
                autoComplete="new-password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                className={`mt-2 ${fieldClass}`}
              />
            </label>
            <label className="mt-4 block text-sm font-medium">
              Confirm new password
              <input
                type="password"
                required
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                className={`mt-2 ${fieldClass}`}
              />
            </label>
            <button
              type="submit"
              disabled={busy}
              className="mx-auto mt-10 block h-[58px] w-[172px] bg-[#C3D19B] text-lg font-semibold text-black disabled:opacity-60"
            >
              {busy ? 'SAVING...' : 'SAVE'}
            </button>
          </form>
        )}

        {status === 'done' && (
          <p role="status" className="mt-8 text-center text-sm">
            {purpose === 'authenticator'
              ? 'Authenticator replaced. Sign in with the new code and your current password.'
              : 'Password updated. You can sign in with the new one.'}
          </p>
        )}

        {(status === 'expired' || status === 'consumed') && (
          <div className="mt-8 text-center text-sm">
            <p>This reset is no longer open.</p>
            <button type="button" onClick={startAgain} className="mt-4 underline">
              Start again
            </button>
          </div>
        )}

        {error && (
          <p role="alert" className="mt-4 text-center text-sm text-red-200">{error}</p>
        )}

        <p className="mt-6 text-center text-sm text-[#D8CDF8]">
          <Link to="/login" className="underline">Back to sign in</Link>
        </p>
      </section>
    </main>
  )
}
