import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../assets/auth/login-background.png', () => ({ default: 'bg.png' }))
vi.mock('../../api/auth', () => ({
  requestPasswordReset: vi.fn(),
  passwordResetStatus: vi.fn(),
  confirmPasswordReset: vi.fn(),
}))

import { confirmPasswordReset, passwordResetStatus, requestPasswordReset } from '../../api/auth'
import ForgotPasswordPage from './ForgotPasswordPage'

describe('ForgotPasswordPage', () => {
  beforeEach(() => {
    sessionStorage.clear()
    requestPasswordReset.mockReset()
    passwordResetStatus.mockReset()
    confirmPasswordReset.mockReset()
  })

  it('keeps the browser on the request until an administrator approves it', async () => {
    requestPasswordReset.mockResolvedValue({
      detail: 'If an account exists, an administrator has been asked to approve a reset. Keep this page open in this browser.',
      request_token: 'token-1',
    })
    passwordResetStatus.mockResolvedValue({ status: 'pending' })

    render(
      <MemoryRouter>
        <ForgotPasswordPage />
      </MemoryRouter>,
    )

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'alice@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'REQUEST' }))

    expect((await screen.findByRole('status')).textContent).toContain('Keep this page open')
    expect(sessionStorage.getItem('arc.password-reset-token')).toBe('token-1')
    await waitFor(() => expect(passwordResetStatus).toHaveBeenCalledWith('token-1'))
    expect(screen.queryByLabelText('New password')).toBeNull()
  })

  it('asks for a new password only after the request is approved', async () => {
    sessionStorage.setItem('arc.password-reset-token', 'token-1')
    passwordResetStatus.mockResolvedValue({ status: 'approved' })
    confirmPasswordReset.mockResolvedValue({ detail: 'Password updated.' })

    render(
      <MemoryRouter>
        <ForgotPasswordPage />
      </MemoryRouter>,
    )

    expect(await screen.findByLabelText('New password')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'fresh-stamp-7-river' } })
    fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'fresh-stamp-7-river' } })
    fireEvent.click(screen.getByRole('button', { name: 'SAVE' }))

    expect((await screen.findByRole('status')).textContent).toContain('Password updated.')
    expect(confirmPasswordReset).toHaveBeenCalledWith({
      request_token: 'token-1',
      new_password: 'fresh-stamp-7-river',
    })
    expect(sessionStorage.getItem('arc.password-reset-token')).toBeNull()
  })
})
