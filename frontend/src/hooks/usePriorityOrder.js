import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import {
  useRef,
} from 'react'

import {
  getPriorityOrder,
  reorderPriority,
} from '../api/planning'
import {
  createLatestIntentQueue,
} from '../lib/latestIntentQueue'
import {
  reorderPriorityRows,
} from '../lib/planningOptimistic'


const priorityKey = [
  'planning',
  'priority',
]


export function usePriorityOrder() {
  return useQuery({
    queryKey:
      priorityKey,
    queryFn:
      getPriorityOrder,
  })
}


export function useReorderPriority() {
  const queryClient =
    useQueryClient()

  const queueRef =
    useRef(null)

  if (
    queueRef.current ===
    null
  ) {
    queueRef.current =
      createLatestIntentQueue(
        reorderPriority,
      )
  }

  const mutation =
    useMutation({
      mutationKey: [
        'planning',
        'scheduler',
        'priority',
        'reorder',
      ],

      /*
       * `promise` represents the whole current queue drain, not just the
       * first HTTP request. React Query therefore keeps one reconciliation
       * state while superseded intermediate intent is skipped.
       */
      mutationFn({
        promise,
      }) {
        return promise
      },

      async onSuccess(data) {
        /*
         * An older read must never overwrite the final coalesced response.
         */
        await queryClient.cancelQueries({
          queryKey:
            priorityKey,
        })

        queryClient.setQueryData(
          priorityKey,
          data,
        )

        /*
         * The scheduler has already completed synchronously on the server.
         * Mark every other planning projection stale, but do not keep the
         * interaction pending while those reads refresh.
         *
         * Existing Timeline data remains rendered during its refetch, so the
         * user always sees the last confirmed schedule until the new one
         * arrives.
         */
        void Promise.all([
          queryClient.invalidateQueries({
            queryKey: [
              'planning',
              'history',
            ],
          }),

          queryClient.invalidateQueries({
            queryKey: [
              'planning',
              'tree',
            ],
            refetchType:
              'all',
          }),

          queryClient.invalidateQueries({
            queryKey: [
              'planning',
              'timeline',
            ],
          }),

          queryClient.invalidateQueries({
            queryKey: [
              'planning',
              'focus',
            ],
          }),
        ])
      },

      onError() {
        /*
         * One of the already-started requests may have committed before a
         * later request failed. Refetch authoritative state rather than
         * rolling back to a potentially older client snapshot.
         */
        void queryClient.invalidateQueries({
          queryKey: [
            'planning',
          ],
        })
      },
    })

  function mutate(
    payload,
    options,
  ) {
    /*
     * Cancel any older Priority read before writing the instantaneous local
     * projection.
     */
    void queryClient.cancelQueries({
      queryKey:
        priorityKey,
    })

    queryClient.setQueryData(
      priorityKey,
      (rows) =>
        reorderPriorityRows(
          rows,
          payload.item_id,
          payload.new_position,
        ),
    )

    const queue =
      queueRef.current

    const wasRunning =
      queue.isRunning()

    const promise =
      queue.push(
        payload,
      )

    /*
     * If a request is already running, push() has replaced only the queued
     * not-yet-started intent. The original React Query mutation remains
     * pending until that queue drains.
     */
    if (wasRunning) {
      return
    }

    mutation.mutate(
      {
        promise,
      },
      options,
    )
  }

  return {
    ...mutation,
    mutate,
  }
}
