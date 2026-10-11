import React, { StrictMode } from 'react'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn() }))
vi.mock('../lib/apiClient', () => ({ apiClient: api }))

import SessionHydrator from './SessionHydrator'
import { useAuthStore } from '../stores/authStore'

const profile = (time_zone = null, id = 1) => ({ id, email: `user${id}@example.com`, time_zone })
const gate = () => render(<StrictMode><SessionHydrator><div>Scheduling page</div></SessionHydrator></StrictMode>)
const visible = () => screen.findByText('Scheduling page')

beforeEach(() => {
  vi.resetAllMocks()
  useAuthStore.getState().clearSession()
  api.patch.mockImplementation(async (_url, data) => ({ data: { ...useAuthStore.getState().user, ...data } }))
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  useAuthStore.getState().clearSession()
})

test('hydrates a refresh-only session and initializes timezone once in StrictMode', async () => {
  useAuthStore.setState({ refreshToken: 'refresh' })
  api.post.mockResolvedValue({ data: { access: 'access', refresh: 'rotated' } })
  api.get.mockResolvedValue({ data: profile() })
  gate()
  await visible()
  expect(api.post).toHaveBeenCalledTimes(1)
  expect(api.post).toHaveBeenCalledWith('auth/token/refresh/', { refresh: 'refresh' })
  expect(api.get).toHaveBeenCalledTimes(1)
  expect(api.patch).toHaveBeenCalledTimes(1)
  expect(api.patch).toHaveBeenCalledWith('auth/me/', { time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone }, { timeout: 10000 })
  expect(useAuthStore.getState().user.time_zone).toBeTruthy()
  expect(useAuthStore.getState().refreshToken).toBe('rotated')
})

test('an already hydrated null preference gates children until PATCH completes', async () => {
  const user = profile()
  useAuthStore.getState().setSession({ access: 'access', user })
  let finish
  api.patch.mockImplementation(() => new Promise((resolve) => { finish = resolve }))
  gate()
  await waitFor(() => expect(api.patch).toHaveBeenCalledTimes(1))
  expect(screen.queryByText('Scheduling page')).toBeNull()
  await act(async () => finish({ data: { ...user, time_zone: 'Asia/Tokyo' } }))
  await visible()
  expect(useAuthStore.getState().user.time_zone).toBe('Asia/Tokyo')
  expect(api.get).not.toHaveBeenCalled()
})

test.each(['UTC', 'America/Los_Angeles'])('never overwrites an existing %s preference', async (zone) => {
  useAuthStore.getState().setSession({ access: 'access', user: profile(zone) })
  gate()
  await visible()
  expect(api.patch).not.toHaveBeenCalled()
})

test('does not initialize while unauthenticated', async () => {
  gate()
  await visible()
  expect(api.patch).not.toHaveBeenCalled()
  expect(api.get).not.toHaveBeenCalled()
})

test('PATCH failure preserves the session and releases the page', async () => {
  useAuthStore.getState().setSession({ access: 'access', user: profile() })
  api.patch.mockRejectedValue(new Error('offline'))
  gate()
  await visible()
  expect(api.patch).toHaveBeenCalledTimes(1)
  expect(useAuthStore.getState().accessToken).toBe('access')
  expect(useAuthStore.getState().user.time_zone).toBeNull()
})

test.each(['Not/AZone', undefined])('unsupported browser timezone %s leaves UTC fallback intact', async (zone) => {
  vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(() => ({
    resolvedOptions: () => ({ timeZone: zone }),
    format: () => { throw new RangeError('unsupported') },
  }))
  useAuthStore.getState().setSession({ access: 'access', user: profile() })
  gate()
  await visible()
  expect(api.patch).not.toHaveBeenCalled()
  expect(useAuthStore.getState().user.time_zone).toBeNull()
})

test('a later MFA login is initialized even after unauthenticated hydration', async () => {
  gate()
  await visible()
  await act(async () => useAuthStore.getState().setSession({ access: 'mfa-access', user: profile() }))
  await visible()
  expect(api.patch).toHaveBeenCalledTimes(1)
})

test('a late initialization response cannot restore a logged-out user', async () => {
  useAuthStore.getState().setSession({ access: 'access', user: profile() })
  let finish
  api.patch.mockImplementation(() => new Promise((resolve) => { finish = resolve }))
  gate()
  await waitFor(() => expect(api.patch).toHaveBeenCalledTimes(1))
  await act(async () => useAuthStore.getState().clearSession())
  await act(async () => finish({ data: profile('Asia/Tokyo') }))
  await visible()
  expect(useAuthStore.getState().user).toBeNull()
})


test.each(['refresh', 'profile'])('%s hydration failure clears the session', async (stage) => {
  useAuthStore.setState({ refreshToken: 'refresh' })
  if (stage === 'refresh') api.post.mockRejectedValue(new Error('expired'))
  else {
    api.post.mockResolvedValue({ data: { access: 'access', refresh: 'rotated' } })
    api.get.mockRejectedValue(new Error('profile unavailable'))
  }
  gate()
  await visible()
  expect(useAuthStore.getState().accessToken).toBeNull()
  expect(useAuthStore.getState().refreshToken).toBeNull()
  expect(useAuthStore.getState().user).toBeNull()
  expect(api.patch).not.toHaveBeenCalled()
})
