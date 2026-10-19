import { useState } from 'react'

import { changePassword } from '../api/auth'
import { errorMessage } from '../lib/errors'
import { useAuthStore } from '../stores/authStore'

const VARIANTS = {
  arc: {
    label: 'block text-sm text-arc-text-secondary',
    input: 'mt-2 h-[44px] w-full rounded-[10px] bg-[#1D4074] px-3 text-arc-text outline-none',
    button: 'rounded-[10px] bg-[#C3D19B] px-4 py-2 text-sm font-semibold text-black disabled:opacity-60',
    ok: 'text-sm text-arc-accent',
    error: 'text-sm text-arc-danger-light',
  },
  staff: {
    label: 'block text-sm text-slate-400',
    input: 'mt-1 w-full rounded-md border border-slate-600 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-400',
    button: 'rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-60',
    ok: 'text-sm text-emerald-300',
    error: 'text-sm text-rose-300',
  },
}

export default function PasswordChangeForm({ variant = 'arc' }) {
  const styles = VARIANTS[variant]
  const setSession = useAuthStore((state) => state.setSession)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [banner, setBanner] = useState(null)

  async function onSubmit(event) {
    event.preventDefault()
    setBanner(null)
    if (newPassword !== confirmPassword) {
      setBanner({ tone: 'error', text: 'The new passwords do not match.' })
      return
    }
    setBusy(true)
    try {
      const data = await changePassword({
        current_password: currentPassword,
        new_password: newPassword,
      })
      setSession({ access: data.access, refresh: data.refresh })
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setBanner({ tone: 'ok', text: 'Password updated.' })
    } catch (error) {
      setBanner({ tone: 'error', text: errorMessage(error, 'Password could not be changed.') })
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <label className={styles.label}>
        Current password
        <input
          type="password"
          autoComplete="current-password"
          required
          value={currentPassword}
          onChange={(event) => setCurrentPassword(event.target.value)}
          className={styles.input}
        />
      </label>
      <label className={styles.label}>
        New password
        <input
          type="password"
          autoComplete="new-password"
          required
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
          className={styles.input}
        />
      </label>
      <label className={styles.label}>
        Confirm new password
        <input
          type="password"
          autoComplete="new-password"
          required
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          className={styles.input}
        />
      </label>
      {banner && (
        <p role={banner.tone === 'error' ? 'alert' : 'status'} className={banner.tone === 'error' ? styles.error : styles.ok}>
          {banner.text}
        </p>
      )}
      <button type="submit" disabled={busy} className={styles.button}>
        {busy ? 'Saving…' : 'Change password'}
      </button>
    </form>
  )
}
