import React from 'react'
import { act, renderHook, waitFor, cleanup } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, expect, test, vi } from 'vitest'
const api = vi.hoisted(() => ({ getPriorityOrder: vi.fn(), reorderPriority: vi.fn() }))
vi.mock('../api/planning', () => api)
import { usePriorityOrder, useReorderPriority } from './usePriorityOrder'
afterEach(() => { cleanup(); vi.resetAllMocks() })
const rows = [{ item_id: 1, position: 1 }, { item_id: 2, position: 2 }]
function setup() {
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const invalidation = vi.spyOn(cache, 'invalidateQueries')
  const wrapper = ({ children }) => <QueryClientProvider client={cache}>{children}</QueryClientProvider>
  const hook = renderHook(() => ({ order: usePriorityOrder(), mutation: useReorderPriority() }), { wrapper })
  return { cache, invalidation, ...hook }
}
test('priority rejection restores server order after optimistic movement', async () => {
  api.getPriorityOrder.mockResolvedValue(rows)
  let reject
  api.reorderPriority.mockImplementation(() => new Promise((_, fail) => { reject = fail }))
  const { cache, result } = setup()
  await waitFor(() => expect(result.current.order.isSuccess).toBe(true))
  act(() => result.current.mutation.mutate({ item_id: 2, new_position: 1 }))
  expect(cache.getQueryData(['planning', 'priority']).map((r) => r.item_id)).toEqual([2, 1])
  await act(async () => reject(new Error('Rejected ordering')))
  await waitFor(() => expect(result.current.mutation.isError).toBe(true))
  await waitFor(() => expect(cache.getQueryData(['planning', 'priority'])).toEqual(rows))
})
test('priority success adopts canonical ordering and refreshes planning projections', async () => {
  api.getPriorityOrder.mockResolvedValue(rows)
  const canonical = [{ item_id: 2, position: 1 }, { item_id: 1, position: 2 }]
  api.reorderPriority.mockResolvedValue(canonical)
  const { cache, result, invalidation } = setup()
  await waitFor(() => expect(result.current.order.isSuccess).toBe(true))
  act(() => result.current.mutation.mutate({ item_id: 2, new_position: 1 }))
  await waitFor(() => expect(result.current.mutation.isSuccess).toBe(true))
  expect(cache.getQueryData(['planning', 'priority'])).toEqual(canonical)
  for (const projection of ['tree', 'history', 'timeline', 'focus']) {
    expect(invalidation.mock.calls.some(([options]) => options.queryKey[1] === projection)).toBe(true)
  }
})
