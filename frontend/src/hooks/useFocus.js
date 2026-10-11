import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'

import {
  completeItem,
  getFocus,
  setCurrentFocus,
  doTodayFocus,
  returnFocusToAutomatic,
  anchorFocusBatch,
  reprioritiseFocus,
} from '../api/planning'
import {
  createSerialActionQueue,
} from '../lib/latestIntentQueue'

const focusKey = ['planning', 'focus']


const automaticFocusQueue =
  createSerialActionQueue(
    returnFocusToAutomatic,
  )


function invalidatePlanning(
  queryClient,
) {
  return queryClient.invalidateQueries({
    queryKey: [
      'planning',
    ],
  })
}

export function useFocus() {
  return useQuery({
    queryKey: focusKey,
    queryFn: getFocus,
  })
}

export function useSetCurrentFocus() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: setCurrentFocus,

    onSuccess(data) {
      queryClient.setQueryData(
        focusKey,
        data,
      )
    },
  })
}

export function useDoTodayFocus() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: [
      'planning',
      'scheduler',
      'focus',
      'do-today',
    ],

    mutationFn: doTodayFocus,

    async onSuccess() {
      await invalidatePlanning(
        queryClient,
      )
    },
  })
}

export function useReturnFocusToAutomatic() {
  const queryClient =
    useQueryClient()

  return useMutation({
    mutationKey: [
      'planning',
      'scheduler',
      'focus',
      'automatic',
    ],

    mutationFn(payload) {
      return automaticFocusQueue.push(
        payload,
      )
    },

    async onMutate({
      item_id: itemId,
    }) {
      await queryClient.cancelQueries({
        queryKey:
          focusKey,
      })

      queryClient.setQueryData(
        focusKey,
        (previous) => {
          if (!previous) {
            return previous
          }

          const patch =
            (candidate) =>
              candidate.item_id
              === itemId
                ? {
                    ...candidate,
                    manual_requested_date:
                      null,
                    manual_requested_order:
                      null,
                  }
                : candidate

          return {
            ...previous,

            candidates:
              (
                previous.candidates
                ?? []
              ).map(
                patch,
              ),

            groups:
              Object.fromEntries(
                Object.entries(
                  previous.groups
                  ?? {},
                ).map(
                  ([
                    key,
                    rows,
                  ]) => [
                    key,
                    rows.map(
                      patch,
                    ),
                  ],
                ),
              ),
          }
        },
      )
    },

    async onSettled() {
      /*
       * Do not let the response for unanchor A refresh over optimistic
       * unanchors B/C/D. Refresh only after the shared serial queue drains.
       */
      await automaticFocusQueue.whenIdle()

      void invalidatePlanning(
        queryClient,
      )
    },
  })
}

export function useReprioritiseFocus() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: [
      'planning',
      'scheduler',
      'focus',
      'reprioritise',
    ],

    mutationFn: reprioritiseFocus,

    async onSuccess(data) {
      queryClient.setQueryData(
        focusKey,
        data,
      )

      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['planning', 'priority'],
        }),
        queryClient.invalidateQueries({
          queryKey: ['planning', 'timeline'],
        }),
        queryClient.invalidateQueries({
          queryKey: ['planning', 'tree'],
        }),
      ])
    },
  })
}


export function useCompleteFocus() {
  const queryClient =
    useQueryClient()

  return useMutation({
    mutationFn: ({
      itemId,
      completed,
    }) =>
      completeItem(
        itemId,
        {
          completed,
          reschedule: false,
        },
      ),

    async onMutate({
      itemId,
      completed,
    }) {
      await queryClient.cancelQueries({
        queryKey: focusKey,
      })

      const previous =
        queryClient.getQueryData(
          focusKey,
        )

      if (
        previous
        && completed
      ) {
        const removeItem =
          (rows = []) =>
            rows.filter(
              (candidate) =>
                candidate.item_id
                !== itemId,
            )

        const groups =
          Object.fromEntries(
            Object.entries(
              previous.groups ?? {},
            ).map(
              ([
                key,
                rows,
              ]) => [
                key,
                removeItem(rows),
              ],
            ),
          )

        queryClient.setQueryData(
          focusKey,
          {
            ...previous,
            candidates:
              removeItem(
                previous.candidates,
              ),
            groups,
            current_item_id:
              previous.current_item_id
              === itemId
                ? null
                : previous.current_item_id,
          },
        )
      }

      return {
        previous,
      }
    },

    onError(
      _error,
      _variables,
      context,
    ) {
      if (context?.previous) {
        queryClient.setQueryData(
          focusKey,
          context.previous,
        )
      }
    },

    async onSettled() {
      await queryClient.invalidateQueries({
        queryKey: [
          'planning',
        ],
      })
    },
  })
}



export function useBatchAnchorFocus() {
  const queryClient =
    useQueryClient()

  return useMutation({
    mutationKey: [
      'planning',
      'scheduler',
      'focus',
      'anchor-batch',
    ],

    mutationFn({
      changes,
      expectedQueue,
    }) {
      return anchorFocusBatch({
        changes,
        ...(expectedQueue ? { expected_queue: expectedQueue } : {}),
      })
    },

    async onMutate({
      changes,
      optimisticOrderIds,
    }) {
      await queryClient.cancelQueries({
        queryKey:
          focusKey,
      })

      const previous =
        queryClient.getQueryData(
          focusKey,
        )

      if (
        !previous
        || !Array.isArray(
          optimisticOrderIds,
        )
      ) {
        return {
          previous,
        }
      }

      const changeById =
        new Map(
          changes.map(
            (change) => [
              change.item_id,
              change,
            ],
          ),
        )

      const patch =
        (candidate) => {
          const change =
            changeById.get(
              candidate.item_id,
            )

          if (!change) {
            return candidate
          }

          return {
            ...candidate,

            scheduled_date:
              change.date,

            manual_requested_date:
              change.date,

            manual_requested_order:
              change.order,

            manual_anchor_origin_date:
              change.order_only ? candidate.manual_anchor_origin_date : change.date,
          }
        }

      const currentCandidates =
        (
          previous.candidates
          ?? []
        ).map(
          patch,
        )

      const byId =
        new Map(
          currentCandidates.map(
            (candidate) => [
              candidate.item_id,
              candidate,
            ],
          ),
        )

      const orderedBucket =
        optimisticOrderIds
          .map(
            (itemId) =>
              byId.get(
                itemId,
              ),
          )
          .filter(Boolean)

      const bucketIds =
        new Set(
          optimisticOrderIds,
        )

      let cursor = 0

      const candidates =
        currentCandidates.map(
          (candidate) => {
            if (
              !bucketIds.has(
                candidate.item_id,
              )
            ) {
              return candidate
            }

            const next =
              orderedBucket[
                cursor
              ]
              ?? candidate

            cursor += 1

            return next
          },
        )

      queryClient.setQueryData(
        focusKey,
        {
          ...previous,
          candidates,
        },
      )

      return {
        previous,
      }
    },

    onError(
      _error,
      _variables,
      context,
    ) {
      if (
        context?.previous
      ) {
        queryClient.setQueryData(
          focusKey,
          context.previous,
        )
      }
    },

    onSuccess(data) {
      if (data.focus) {
        queryClient.setQueryData(
          focusKey,
          data.focus,
        )
      }

      queryClient.setQueryData(
        [
          'planning',
          'history',
        ],
        {
          can_undo:
            Boolean(
              data.can_undo,
            ),

          can_redo:
            Boolean(
              data.can_redo,
            ),
        },
      )

      /*
       * Reconciliation is background work. Do not keep the visible Focus
       * interaction pending while unrelated projections refetch.
       */
      void Promise.all([
        queryClient.invalidateQueries({
          queryKey: [
            'planning',
            'timeline',
          ],
        }),

        queryClient.invalidateQueries({
          queryKey: [
            'planning',
            'priority',
          ],
        }),

        queryClient.invalidateQueries({
          queryKey: [
            'planning',
            'tree',
          ],
        }),
      ])
    },
  })
}
