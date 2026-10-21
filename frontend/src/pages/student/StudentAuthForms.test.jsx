import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../assets/auth/login-background.png', () => ({ default: 'bg.png' }))
vi.mock('../../api/auth', () => ({
  login: vi.fn(),
  verifyMfa: vi.fn(),
  register: vi.fn(),
  confirmMfaEnrolment: vi.fn(),
}))
vi.mock('../../lib/totp', () => ({
  totpNow: vi.fn(),
  waitForNextTotpStep: vi.fn(),
}))

import { login, register } from '../../api/auth'
import StudentLoginPage from './StudentLoginPage'
import StudentRegisterPage from './StudentRegisterPage'

describe('student login', () => {
  beforeEach(() => {
    login.mockReset()
  })

  it('names the email and password fields and keeps a visible focus ring', () => {
    render(
      <MemoryRouter>
        <StudentLoginPage />
      </MemoryRouter>,
    )

    const email = screen.getByLabelText('Email')
    expect(email.className).toContain('focus-visible:outline')
    expect(screen.getByLabelText('Password').className).toContain('focus-visible:outline')
  })

  it('fills every code box when a six-digit code is pasted', async () => {
    login.mockResolvedValue({ mfa_token: 'pending' })
    render(
      <MemoryRouter>
        <StudentLoginPage />
      </MemoryRouter>,
    )

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'new@example.com' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'corr3ct-horse-battery' } })
    fireEvent.click(screen.getByRole('button', { name: 'LOG IN' }))

    const first = await screen.findByLabelText('Authentication code digit 1')
    fireEvent.paste(first, { clipboardData: { getData: () => '123456' } })

    expect(screen.getByLabelText('Authentication code digit 1').value).toBe('1')
    expect(screen.getByLabelText('Authentication code digit 6').value).toBe('6')
  })
})

describe('student signup', () => {
  beforeEach(() => {
    register.mockReset()
  })

  it('states the password rules and can scroll when the card is taller than the window', () => {
    const { container } = render(
      <MemoryRouter>
        <StudentRegisterPage />
      </MemoryRouter>,
    )

    expect(screen.getByText(/at least 8 characters/i)).toBeTruthy()
    const main = container.querySelector('main')
    expect(main.className).toContain('overflow-y-auto')
    expect(main.className).not.toContain('overflow-hidden')
  })

  it('shows the field error from a rejected signup', async () => {
    register.mockRejectedValue({
      message: 'Request failed with status code 400',
      response: {
        data: {
          error: {
            message: 'The submitted data is invalid.',
            fields: {
              password: ['This password is too short. It must contain at least 8 characters.'],
            },
          },
        },
      },
    })

    render(
      <MemoryRouter>
        <StudentRegisterPage />
      </MemoryRouter>,
    )

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'new@example.com' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'longenough' } })
    fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'longenough' } })
    fireEvent.click(screen.getByRole('radio', { name: /monk/i }))
    fireEvent.click(screen.getByRole('button', { name: 'SIGN UP' }))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('too short')
    expect(alert.textContent).not.toContain('The submitted data is invalid.')
  })

  it('does not show a live authenticator code after signup', async () => {
    register.mockResolvedValue({
      enrolment_token: 'enrol-token',
      mfa: { secret: 'JBSWY3DPEHPK3PXP', qr_png_base64: 'qr' },
    })

    render(
      <MemoryRouter>
        <StudentRegisterPage />
      </MemoryRouter>,
    )

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'new@example.com' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'longenough' } })
    fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'longenough' } })
    fireEvent.click(screen.getByRole('radio', { name: /monk/i }))
    fireEvent.click(screen.getByRole('button', { name: 'SIGN UP' }))

    expect(await screen.findByRole('heading', { name: 'AUTHENTICATOR' })).toBeTruthy()
    expect(screen.queryByText(/current code/i)).toBeNull()
  })
})
