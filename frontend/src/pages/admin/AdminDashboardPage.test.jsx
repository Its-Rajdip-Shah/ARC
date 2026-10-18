import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const harness = vi.hoisted(() => ({
  rows: [],
  approve: vi.fn(),
}))

vi.mock('../../hooks/useAdmin', () => ({
  useAdminStats: () => ({ data: null, isError: false }),
  useAdminUsers: () => ({ data: { results: [] } }),
  usePasswordResets: () => ({ data: harness.rows, isError: false }),
  useApprovePasswordReset: () => ({ mutateAsync: harness.approve, isPending: false }),
}))

vi.mock('../../components/PasswordChangeForm', () => ({
  default: () => <form aria-label="Change your password" />,
}))

import AdminDashboardPage from './AdminDashboardPage'

describe('AdminDashboardPage password resets', () => {
  beforeEach(() => {
    harness.rows = []
    harness.approve.mockReset()
    harness.approve.mockResolvedValue({ status: 'approved' })
  })

  it('shows an empty queue until a student asks for a reset', () => {
    render(
      <MemoryRouter>
        <AdminDashboardPage />
      </MemoryRouter>,
    )

    expect(screen.getByText('No open reset requests.')).toBeTruthy()
    expect(screen.getByRole('form', { name: 'Change your password' })).toBeTruthy()
  })

  it('lets any signed-in administrator approve the request', () => {
    harness.rows = [{
      id: 'request-1',
      email: 'alice@example.com',
      created_at: '2026-10-18T04:00:00Z',
      status: 'pending',
    }]

    render(
      <MemoryRouter>
        <AdminDashboardPage />
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
    expect(harness.approve).toHaveBeenCalledWith('request-1')
  })
})
