import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../api/auth', () => ({
  changePassword: vi.fn(),
}))

import { changePassword } from '../api/auth'
import { useAuthStore } from '../stores/authStore'
import PasswordChangeForm from './PasswordChangeForm'

describe('PasswordChangeForm', () => {
  beforeEach(() => {
    changePassword.mockReset()
    useAuthStore.getState().clearSession()
    useAuthStore.getState().setSession({
      access: 'old-access',
      refresh: 'old-refresh',
      user: { id: 1, email: 'alice@example.com' },
    })
  })

  it('replaces the session tokens after the current password is accepted', async () => {
    changePassword.mockResolvedValue({ access: 'new-access', refresh: 'new-refresh' })
    render(<PasswordChangeForm />)

    fireEvent.change(screen.getByLabelText('Current password'), { target: { value: 'old-password' } })
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'fresh-stamp-7-river' } })
    fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'fresh-stamp-7-river' } })
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }))

    expect((await screen.findByRole('status')).textContent).toContain('Password updated.')
    expect(changePassword).toHaveBeenCalledWith({
      current_password: 'old-password',
      new_password: 'fresh-stamp-7-river',
    })
    expect(useAuthStore.getState().accessToken).toBe('new-access')
    expect(useAuthStore.getState().refreshToken).toBe('new-refresh')
  })

  it('does not call the API when the confirmation does not match', () => {
    render(<PasswordChangeForm />)

    fireEvent.change(screen.getByLabelText('Current password'), { target: { value: 'old-password' } })
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'fresh-stamp-7-river' } })
    fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'different-password' } })
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }))

    expect(screen.getByRole('alert').textContent).toContain('The new passwords do not match.')
    expect(changePassword).not.toHaveBeenCalled()
  })
})
