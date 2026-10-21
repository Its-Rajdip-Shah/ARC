import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { confirmMfaEnrolment, login, register, verifyMfa } from '../../api/auth'
import loginBackground from '../../assets/auth/login-background.png'
import { errorMessage } from '../../lib/errors'
import { queryClient } from '../../lib/queryClient'
import { totpNow, waitForNextTotpStep } from '../../lib/totp'
import { useAuthStore } from '../../stores/authStore'

const inputClass =
  'h-[55px] w-full bg-[#1D4074] px-4 text-lg text-white outline-none placeholder:text-[#B7A6EC] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:px-12'
const buttonClass =
  'mx-auto mt-10 block h-[58px] w-[172px] bg-[#C3D19B] text-lg font-semibold text-black disabled:opacity-60'

export default function StudentRegisterPage() {
  const navigate = useNavigate()
  const setSession = useAuthStore((state) => state.setSession)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [schedulerFlavour, setSchedulerFlavour] = useState('')
  const [enrolment, setEnrolment] = useState(null)
  const [code, setCode] = useState(Array(6).fill(''))
  const [busy, setBusy] = useState(false)
  const [signingIn, setSigningIn] = useState(false)
  const [error, setError] = useState(null)

  const codeRefs = useRef([])

  async function submitCredentials(event) {
    event.preventDefault()
    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setBusy(true)
    setError(null)

    try {
      const data = await register({
        email: email.trim(),
        password,
        scheduler_flavour: schedulerFlavour,
      })
      setEnrolment({
        token: data.enrolment_token,
        secret: data.mfa.secret,
        qr: data.mfa.qr_png_base64,
      })
      requestAnimationFrame(() => codeRefs.current[0]?.focus())
    } catch (err) {
      setError(errorMessage(err, 'Unable to create an account.'))
    } finally {
      setBusy(false)
    }
  }

  async function submitEnrolment(event) {
    event.preventDefault()

    const totp = code.join('')
    if (totp.length !== 6 || !enrolment) return

    setBusy(true)
    setError(null)

    try {
      await confirmMfaEnrolment({
        enrolment_token: enrolment.token,
        code: totp,
      })
      setSigningIn(true)
      await waitForNextTotpStep()

      const pending = await login({ email: email.trim(), password })
      const loginCode = await totpNow(enrolment.secret)
      const session = await verifyMfa({
        mfa_token: pending.mfa_token,
        code: loginCode,
      })

      queryClient.clear()
      setSession(session)
      navigate('/planner', { replace: true })
    } catch (err) {
      setSigningIn(false)
      setError(
        errorMessage(
          err,
          'Account created, but sign-in did not finish. Try logging in.',
        ),
      )
    } finally {
      setBusy(false)
    }
  }

  function updateCode(index, value) {
    const digit = value.replace(/\D/g, '').slice(-1)
    const next = [...code]
    next[index] = digit
    setCode(next)
    if (digit && index < 5) {
      codeRefs.current[index + 1]?.focus()
    }
  }

  function handleCodeKeyDown(index, event) {
    if (event.key === 'Backspace' && !code[index] && index > 0) {
      codeRefs.current[index - 1]?.focus()
    }
  }

  function handleCodePaste(event) {
    const digits = event.clipboardData
      .getData('text')
      .replace(/\D/g, '')
      .slice(0, 6)
      .split('')
    if (!digits.length) return
    event.preventDefault()
    const next = Array(6).fill('')
    digits.forEach((digit, index) => {
      next[index] = digit
    })
    setCode(next)
    codeRefs.current[Math.min(digits.length, 5)]?.focus()
  }

  return (
    <main
      className="relative flex min-h-screen items-center justify-center overflow-y-auto bg-[#152C72] bg-cover bg-center"
      style={{ backgroundImage: `url(${loginBackground})` }}
    >
      <section className="relative my-6 w-[499px] max-w-[calc(100vw-32px)] bg-[#7D98D7]/40 px-6 py-6 text-white sm:px-[61px]">
        <h1 className="text-center text-[32px] font-semibold tracking-wide">
          {enrolment ? 'AUTHENTICATOR' : 'SIGN UP'}
        </h1>

        {signingIn ? (
          <p className="mt-8 text-center text-lg text-[#D8CDF8]">
            Authenticator connected. Signing you in…
          </p>
        ) : !enrolment ? (
          <form className="mt-8" onSubmit={submitCredentials}>
            <label className="block text-sm font-medium">
              Email
              <input
                type="email"
                required
                autoComplete="username"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className={`mt-2 ${inputClass}`}
              />
            </label>
            <label className="mt-[17px] block text-sm font-medium">
              Password
              <input
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                aria-describedby="password-rules"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className={`mt-2 ${inputClass}`}
              />
            </label>
            <p id="password-rules" className="mt-2 text-sm text-[#D8CDF8]">
              At least 8 characters. Not a common password, and not only numbers.
            </p>
            <label className="mt-[17px] block text-sm font-medium">
              Confirm password
              <input
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                className={`mt-2 ${inputClass}`}
              />
            </label>
            <fieldset className="mt-6">
  <legend className="mb-2 text-lg font-semibold">
    Choose your scheduling style
  </legend>

  <p className="mb-4 text-sm text-[#D8CDF8]">
    This controls how aggressively ARC schedules your tasks.
    You can change it later in Timeline.
  </p>

  <div className="flex flex-col gap-4 sm:flex-row">
    <label className="flex flex-1 cursor-pointer flex-col gap-2 bg-[#1D4074] p-4">
      <span className="flex items-center gap-2 font-semibold">
        <input
          type="radio"
          name="schedulerFlavour"
          value="lock-in"
          checked={schedulerFlavour === 'lock-in'}
          onChange={(event) => setSchedulerFlavour(event.target.value)}
          required
        />
        Locked-In
      </span>
      <span className="text-sm text-[#D8CDF8]">
        More aggressive task scheduling.
      </span>
    </label>

    <label className="flex flex-1 cursor-pointer flex-col gap-2 bg-[#1D4074] p-4">
      <span className="flex items-center gap-2 font-semibold">
        <input
          type="radio"
          name="schedulerFlavour"
          value="monk"
          checked={schedulerFlavour === 'monk'}
          onChange={(event) => setSchedulerFlavour(event.target.value)}
          required
        />
        Monk
      </span>
      <span className="text-sm text-[#D8CDF8]">
        Calmer, less aggressive scheduling.
      </span>
    </label>
  </div>
</fieldset>
            <button type="submit" disabled={busy} className={buttonClass}>
              {busy ? 'CREATING...' : 'SIGN UP'}
            </button>
          </form>
        ) : (
          <form className="mt-8" onSubmit={submitEnrolment}>
            <p className="text-center text-sm text-[#D8CDF8]">
              Scan this code in an authenticator app, then enter the six-digit
              code.
            </p>
            <img
              alt="Authenticator QR code"
              src={`data:image/png;base64,${enrolment.qr}`}
              className="mx-auto mt-4 size-40 bg-white p-2"
            />
            <p className="mt-3 break-all text-center font-mono text-xs text-[#D8CDF8]">
              {enrolment.secret}
            </p>
            <p className="mt-4 mb-2 text-lg font-medium">ENTER CODE</p>
            <div className="flex justify-between">
              {code.map((digit, index) => (
                <input
                  key={index}
                  ref={(element) => {
                    codeRefs.current[index] = element
                  }}
                  aria-label={`Authentication code digit ${index + 1}`}
                  inputMode="numeric"
                  autoComplete={index === 0 ? 'one-time-code' : 'off'}
                  maxLength={1}
                  value={digit}
                  onChange={(event) => updateCode(index, event.target.value)}
                  onKeyDown={(event) => handleCodeKeyDown(index, event)}
                  onPaste={index === 0 ? handleCodePaste : undefined}
                  className="h-[55px] w-[59px] bg-[#1D4074] text-center text-2xl text-[#B7A6EC] outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                />
              ))}
            </div>
            <button
              type="submit"
              disabled={busy || code.join('').length !== 6}
              className={buttonClass}
            >
              {busy ? 'VERIFYING...' : 'CONTINUE'}
            </button>
          </form>
        )}

        {error && (
          <p role="alert" className="mt-4 text-center text-sm text-red-200">{error}</p>
        )}

        {!signingIn && (
          <p className="mt-3 text-center text-lg text-[#D8CDF8]">
            Already have an account?{' '}
            <Link to="/login" className="underline">
              Log in
            </Link>
          </p>
        )}
      </section>
    </main>
  )
}
