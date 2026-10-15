import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { login, verifyMfa } from '../../api/auth'
import loginBackground from '../../assets/auth/login-background.png'
import { useAuthStore } from '../../stores/authStore'
import { errorMessage } from '../../lib/errors'

const fieldClass =
  'h-[55px] w-full bg-[#1D4074] px-4 text-lg text-white outline-none placeholder:text-[#B7A6EC] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:px-12'

export default function StudentLoginPage() {
  const navigate = useNavigate()
  const setSession = useAuthStore((state) => state.setSession)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mfaToken, setMfaToken] = useState(null)
  const [code, setCode] = useState(Array(6).fill(''))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const codeRefs = useRef([])

  async function submitCredentials(event) {
    event.preventDefault()
    setBusy(true)
    setError(null)

    try {
      const data = await login({ email, password })
      setMfaToken(data.mfa_token)
      requestAnimationFrame(() => codeRefs.current[0]?.focus())
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function submitTotp(event) {
    event.preventDefault()

    const totp = code.join('')
    if (totp.length !== 6 || !mfaToken) return

    setBusy(true)
    setError(null)

    try {
      const session = await verifyMfa({
        mfa_token: mfaToken,
        code: totp,
      })

      setSession(session)
      navigate('/planner', { replace: true })
    } catch (err) {
      setError(errorMessage(err))
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
    const digits = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6).split('')
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
          WELCOME
        </h1>

        {!mfaToken ? (
          <form className="mt-8" onSubmit={submitCredentials}>
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

            <label className="mt-[17px] block text-sm font-medium">
              Password
              <input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className={`mt-2 ${fieldClass}`}
              />
            </label>

            <button
              type="submit"
              disabled={busy}
              className="mx-auto mt-10 block h-[58px] w-[172px] bg-[#C3D19B] text-lg font-semibold text-black disabled:opacity-60"
            >
              {busy ? 'CHECKING...' : 'LOG IN'}
            </button>
          </form>
        ) : (
          <form className="mt-8" onSubmit={submitTotp}>
            <p className="mb-2 text-lg font-medium">ENTER CODE</p>

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
              className="mx-auto mt-10 block h-[58px] w-[172px] bg-[#C3D19B] text-lg font-semibold text-black disabled:opacity-60"
            >
              {busy ? 'VERIFYING...' : 'LOG IN'}
            </button>

            <button
              type="button"
              onClick={() => {
                setMfaToken(null)
                setCode(Array(6).fill(''))
                setError(null)
              }}
              className="mt-3 block w-full text-center text-sm text-[#D8CDF8]"
            >
              Use a different account
            </button>
          </form>
        )}

        {error && (
          <p role="alert" className="mt-4 text-center text-sm text-red-200">{error}</p>
        )}

        {!mfaToken && (
          <p className="mt-3 text-center text-lg text-[#D8CDF8]">
            New to ARC?{' '}
            <Link to="/register" className="underline">
              Create an account
            </Link>
          </p>
        )}
      </section>
    </main>
  )
}
