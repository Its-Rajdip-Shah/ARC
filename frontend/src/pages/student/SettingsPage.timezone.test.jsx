import React from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

const api = vi.hoisted(() => ({
  patch: vi.fn(),
}))

vi.mock('../../lib/apiClient', () => ({
  apiClient: api,
}))

vi.mock('../../hooks/useCanvas', () => ({
  useCanvasConnection: vi.fn(),
  useCanvasCourses: vi.fn(),
  useDeleteCanvasConnection: vi.fn(),
  useSaveCanvasConnection: vi.fn(),
  useSaveCanvasCourses: vi.fn(),
  useSyncCanvas: vi.fn(),
  useTestCanvasConnection: vi.fn(),
}))

// Account details are unrelated to timezone mutation behaviour.
// Keep this test independent of the profile-fetch request.
vi.mock('../../hooks/useMe', () => ({
  useMe: () => ({
    data: null,
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  }),
}))

vi.mock('../../hooks/useSchedulerSettings', () => ({
  useSchedulerSettings: () => ({
    data: { flavour: 'monk' },
    isPending: false,
    isError: false,
    saving: false,
    setFlavour: vi.fn(),
  }),
}))

import SettingsPage from './SettingsPage'
import { useAuthStore } from '../../stores/authStore'

const profile = (id = 1, time_zone = 'UTC') => ({
  id,
  email: `user${id}@example.com`,
  time_zone,
})

let queryClient

function renderSettings() {
  queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })

  const invalidate = vi.spyOn(queryClient, 'invalidateQueries')

  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/settings?tab=account']}>
        <SettingsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )

  return invalidate
}

function selector() {
  return screen.getByLabelText('Account timezone')
}

beforeEach(() => {
  vi.resetAllMocks()
  useAuthStore.getState().clearSession()
  useAuthStore.getState().setSession({
    access: 'first-access',
    refresh: 'first-refresh',
    user: profile(),
  })
})

afterEach(() => {
  cleanup()
  queryClient?.clear()
  useAuthStore.getState().clearSession()
})

test('renders the stored timezone and preserves scheduler controls', () => {
  renderSettings()

  expect(selector().value).toBe('UTC')
  expect(screen.getByText('Scheduler intensity')).toBeTruthy()
  expect(screen.getByText('Locked-In')).toBeTruthy()
  expect(screen.getByText('Monk', { selector: 'strong' })).toBeTruthy()
  expect(api.patch).not.toHaveBeenCalled()
})

test('saves timezone, updates auth state, and invalidates queries', async () => {
  const updated = profile(1, 'Asia/Tokyo')
  api.patch.mockResolvedValue({ data: updated })
  const invalidate = renderSettings()

  fireEvent.change(selector(), { target: { value: 'Asia/Tokyo' } })

  await waitFor(() => {
    expect(screen.getByText('Timezone saved.')).toBeTruthy()
  })

  expect(api.patch).toHaveBeenCalledWith(
    'auth/me/',
    { time_zone: 'Asia/Tokyo' },
    { timeout: 10000 },
  )
  expect(useAuthStore.getState().user).toEqual(updated)
  expect(selector().value).toBe('Asia/Tokyo')
  expect(invalidate).toHaveBeenCalled()
})

test('failed save preserves the stored timezone and displays an error', async () => {
  api.patch.mockRejectedValue(new Error('Network unavailable'))
  const invalidate = renderSettings()

  fireEvent.change(selector(), { target: { value: 'Asia/Tokyo' } })

  await waitFor(() => {
    expect(screen.getByRole('alert')).toBeTruthy()
  })

  expect(useAuthStore.getState().user.time_zone).toBe('UTC')
  expect(selector().value).toBe('UTC')
  expect(invalidate).not.toHaveBeenCalled()
})

test('late save cannot overwrite a different authenticated account', async () => {
  let finish
  api.patch.mockImplementation(
    () => new Promise((resolve) => { finish = resolve }),
  )

  const invalidate = renderSettings()

  fireEvent.change(selector(), { target: { value: 'Asia/Tokyo' } })

  await waitFor(() => {
    expect(api.patch).toHaveBeenCalledTimes(1)
  })

  act(() => {
    useAuthStore.getState().setSession({
      access: 'second-access',
      refresh: 'second-refresh',
      user: profile(2, 'Europe/London'),
    })
  })

  await act(async () => {
    finish({ data: profile(1, 'Asia/Tokyo') })
  })

  expect(useAuthStore.getState().user).toEqual(profile(2, 'Europe/London'))
  expect(invalidate).not.toHaveBeenCalled()
})

test('late save cannot overwrite a refreshed session for the same account', async () => {
  let finish
  api.patch.mockImplementation(
    () => new Promise((resolve) => { finish = resolve }),
  )

  const invalidate = renderSettings()

  fireEvent.change(selector(), { target: { value: 'Asia/Tokyo' } })

  await waitFor(() => {
    expect(api.patch).toHaveBeenCalledTimes(1)
  })

  act(() => {
    useAuthStore.getState().setSession({
      access: 'new-access',
      refresh: 'new-refresh',
      user: profile(1, 'Europe/London'),
    })
  })

  await act(async () => {
    finish({ data: profile(1, 'Asia/Tokyo') })
  })

  expect(useAuthStore.getState().user.time_zone).toBe('Europe/London')
  expect(invalidate).not.toHaveBeenCalled()
})

test('late failure does not show an error after switching accounts', async () => {
  let fail
  api.patch.mockImplementation(
    () => new Promise((_resolve, reject) => { fail = reject }),
  )

  const invalidate = renderSettings()

  fireEvent.change(selector(), { target: { value: 'Asia/Tokyo' } })

  await waitFor(() => {
    expect(api.patch).toHaveBeenCalledTimes(1)
  })

  act(() => {
    useAuthStore.getState().setSession({
      access: 'second-access',
      refresh: 'second-refresh',
      user: profile(2, 'Europe/London'),
    })
  })

  await act(async () => {
    fail(new Error('Old request failed'))
  })

  expect(useAuthStore.getState().user).toEqual(profile(2, 'Europe/London'))
  expect(screen.queryByRole('alert')).toBeNull()
  expect(invalidate).not.toHaveBeenCalled()
})
