import {
  useRef,
  useState,
} from 'react'

import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'

import {
  anchorTimelineItem,
  completeItem,
  getHistoryStatus,
  redoPlanningAction,
  rescheduleTimeline,
  undoPlanningAction,
  updateTimelineOverload,
} from '../../api/planning'

export function invalidatePlanningQueries(client) {
  return client.invalidateQueries({
    queryKey: [
      'planning',
    ],
  })
}


function patchTimelineCompletion(
  data,
  ids,
  completed,
) {
  if (!data?.groups) {
    return data
  }

  return {
    ...data,

    groups:
      data.groups.map(
        (group) => ({
          ...group,

          items:
            group.items.map(
              (item) => {
                if (
                  !ids.has(
                    item.id,
                  )
                ) {
                  return item
                }

                const pendingDisplayDate =
                  !completed &&
                  !item.scheduled_date
                    ? (
                        item.timeline_pending_display_date ??
                        item.completed_display_date ??
                        null
                      )
                    : null

                return {
                  ...item,

                  is_completed:
                    completed,

                  /*
                   * Pure presentation state while authoritative reopen +
                   * scheduler reconciliation is still running.
                   *
                   * This is NEVER persisted and NEVER sent to the scheduler.
                   */
                  timeline_pending_display_date:
                    pendingDisplayDate,
                }
              },
            ),
        }),
      ),
  }
}

function patchUniverseCompletion(
  rows,
  ids,
  completed,
) {
  if (
    !Array.isArray(rows)
  ) {
    return rows
  }

  return rows.map(
    (item) => {
      if (
        !ids.has(
          item.id,
        )
      ) {
        return item
      }

      return {
        ...item,

        is_completed:
          completed,

        timeline_pending_display_date:
          !completed &&
          !item.scheduled_date
            ? (
                item.timeline_pending_display_date ??
                item.completed_display_date ??
                null
              )
            : null,
      }
    },
  )
}

export default function useTimelineActions() {
  const client =
    useQueryClient()

  const completionQueues =
    useRef(
      new Map(),
    )

  const [
    completionPendingCount,
    setCompletionPendingCount,
  ] = useState(0)

  const history =
    useQuery({
      queryKey: [
        'planning',
        'history',
      ],

      queryFn:
        getHistoryStatus,
    })

  function applyCompletion(
    ids,
    completed,
  ) {
    for (
      const [
        key,
        data,
      ]
      of client.getQueriesData({
        queryKey: [
          'planning',
          'timeline',
        ],
      })
    ) {
      client.setQueryData(
        key,
        patchTimelineCompletion(
          data,
          ids,
          completed,
        ),
      )
    }

    for (
      const [
        key,
        data,
      ]
      of client.getQueriesData({
        queryKey: [
          'planning',
          'timeline-universe',
        ],
      })
    ) {
      client.setQueryData(
        key,
        patchUniverseCompletion(
          data,
          ids,
          completed,
        ),
      )
    }
  }

  async function driveCompletion(
    id,
    state,
  ) {
    if (state.running) {
      return state.promise
    }

    state.running =
      true

    setCompletionPendingCount(
      (count) =>
        count + 1,
    )

    state.promise =
      (async () => {
        try {
          while (true) {
            const requested =
              state.desired

            const result =
              await completeItem(
                id,
                {
                  completed:
                    requested,
                },
              )

            const confirmed =
              Boolean(
                result
                  ?.item
                  ?.is_completed,
              )

            const affected =
              new Set(
                result
                  ?.affected_ids ??
                [id],
              )

            /*
             * Apply canonical descendant effects from the server first.
             */
            applyCompletion(
              affected,
              confirmed,
            )

            /*
             * The user may have clicked again while Django was scheduling.
             * Keep the visible checkbox at their newest intent rather than
             * flashing back to the previous confirmed state.
             */
            if (
              state.desired !==
              confirmed
            ) {
              applyCompletion(
                new Set([id]),
                state.desired,
              )

              continue
            }

            break
          }
        } catch (error) {
          /*
           * Let authoritative state repair the optimistic cache on failure.
           */
          void invalidatePlanningQueries(client)

          throw error

        } finally {
          state.running =
            false

          completionQueues.current
            .delete(id)

          setCompletionPendingCount(
            (count) =>
              Math.max(
                0,
                count - 1,
              ),
          )

          /*
           * Reconcile all derived schedule/tree state after the latest
           * coalesced intent settles. Do not await this refetch.
           */
          void invalidatePlanningQueries(client)
        }
      })()

    return state.promise
  }

  function queueCompletion(
    payload,
  ) {
    let state =
      completionQueues.current
        .get(
          payload.id,
        )

    if (!state) {
      state = {
        desired:
          payload.completed,

        running:
          false,

        promise:
          null,
      }

      completionQueues.current
        .set(
          payload.id,
          state,
        )
    }

    state.desired =
      payload.completed

    /*
     * Immediate UI response.
     */
    applyCompletion(
      new Set([
        payload.id,
      ]),
      payload.completed,
    )

    return driveCompletion(
      payload.id,
      state,
    )
  }

  const mutation =
    useMutation({
      mutationKey: [
        'planning',
        'timeline',
        'mutation',
      ],

      mutationFn: ({
        type,
        payload,
      }) => {
        switch (type) {
          case 'reschedule':
            return rescheduleTimeline()

          case 'undo':
            return undoPlanningAction()

          case 'redo':
            return redoPlanningAction()

          case 'overload':
            return updateTimelineOverload(
              payload,
            )

          case 'anchor':
            return anchorTimelineItem(
              payload,
            )

          default:
            throw new Error(
              'Unknown Timeline action',
            )
        }
      },

      onSuccess: () => {
        void invalidatePlanningQueries(client)
      },
    })

  const detail =
    mutation.error
      ?.response
      ?.data

  const error =
    detail?.conflicts
      ?.map(
        (conflict) =>
          (
            conflict.item_id
              ? (
                  'Item ' +
                  conflict.item_id +
                  ': '
                )
              : ''
          ) +
          conflict.code
            .replaceAll(
              '_',
              ' ',
            ),
      )
      .join('; ') ||
    (
      detail
        ? Object.entries(
            detail,
          )
            .map(
              ([
                key,
                value,
              ]) =>
                key +
                ': ' +
                String(value),
            )
            .join('; ')
        : mutation.error
            ?.message
    )

  const rescheduling =
    mutation.isPending &&
    mutation.variables?.type ===
      'reschedule'

  return {
    history,

    /*
     * Busy now means a blocking non-completion Timeline command.
     * Completion has its own per-item intent queue and never globally locks
     * all task checkboxes.
     */
    busy:
      mutation.isPending,

    rescheduling,

    schedulerBusy:
      mutation.isPending ||
      completionPendingCount > 0,

    completionPendingCount,

    error,

    run(
      type,
      payload,
    ) {
      if (
        type ===
        'complete'
      ) {
        return queueCompletion(
          payload,
        )
      }

      return mutation.mutateAsync({
        type,
        payload,
      })
    },
  }
}
