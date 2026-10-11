import { beforeEach, expect, test, vi } from 'vitest'

const cache = vi.hoisted(() => ({ data: null, history: null }))
vi.mock('@tanstack/react-query', () => ({
  useMutation: (options) => options,
  useQuery: vi.fn(),
  useQueryClient: () => ({
    cancelQueries: vi.fn().mockResolvedValue(undefined),
    invalidateQueries: vi.fn().mockResolvedValue(undefined),
    getQueryData: () => cache.data,
    setQueryData: (key, value) => {
      if (key[1] === 'focus') cache.data = value
      else if (key[1] === 'history') cache.history = value
    },
  }),
}))

import { useBatchAnchorFocus } from './useFocus'

beforeEach(() => {
  cache.data = { candidates: [1, 2, 3].map((id) => ({
    item_id: id, scheduled_date: '2026-10-01',
    manual_requested_date: id < 3 ? '2026-10-01' : null,
    manual_requested_order: id < 3 ? id : null,
    manual_anchor_origin_date: id < 3 ? '2026-09-30' : null,
  })) }
})

const request = {
  changes: [{ item_id: 3, date: '2026-10-02', order: 1 }],
  optimisticOrderIds: [3, 1, 2],
}

test('optimistic reorder changes anchor metadata only for direct intent', async () => {
  const before = structuredClone(cache.data)
  await useBatchAnchorFocus().onMutate(request)
  expect(cache.data.candidates.map((row) => row.item_id)).toEqual([3, 1, 2])
  expect(cache.data.candidates.slice(1)).toEqual(before.candidates.slice(0, 2))
  expect(cache.data.candidates[0]).toMatchObject({
    manual_requested_date: '2026-10-02', manual_requested_order: 1,
    manual_anchor_origin_date: '2026-10-02',
  })
})

test('409 and other failures restore the previous canonical cache', async () => {
  const before = cache.data
  const mutation = useBatchAnchorFocus()
  const context = await mutation.onMutate(request)
  mutation.onError({ response: { status: 409 } }, request, context)
  expect(cache.data).toBe(before)
})

test('successful canonical Focus response replaces optimistic ordering', async () => {
  const mutation = useBatchAnchorFocus()
  const canonical = structuredClone(cache.data)
  await mutation.onMutate(request)
  mutation.onSuccess({ focus: canonical, can_undo: true, can_redo: false })
  expect(cache.data).toBe(canonical)
  expect(cache.history).toEqual({ can_undo: true, can_redo: false })
})
