import React from 'react'

import {
  act,
  fireEvent,
  render,
  screen,
} from '@testing-library/react'

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from 'vitest'


const mutationCalls = []


vi.mock(
  '../../hooks/useFocus',
  () => ({
    useBatchAnchorFocus() {
      return {
        mutate(
          variables,
          callbacks,
        ) {
          mutationCalls.push({
            variables,
            callbacks,
          })
        },
      }
    },
  }),
)


vi.mock(
  '@dnd-kit/core',
  async () => {
    const React =
      await import(
        'react'
      )

    return {
      DndContext({
        children,
      }) {
        return React.createElement(
          React.Fragment,
          null,
          children,
        )
      },

      DragOverlay({
        children,
      }) {
        return React.createElement(
          React.Fragment,
          null,
          children,
        )
      },

      KeyboardSensor:
        function KeyboardSensor() {},

      PointerSensor:
        function PointerSensor() {},

      closestCenter() {
        return []
      },

      rectIntersection() {
        return []
      },

      useDroppable() {
        return {
          isOver:
            false,

          setNodeRef() {},
        }
      },

      useSensor(
        sensor,
        options,
      ) {
        return {
          sensor,
          options,
        }
      },

      useSensors(
        ...sensors
      ) {
        return sensors
      },
    }
  },
)


vi.mock(
  '@dnd-kit/sortable',
  async () => {
    const React =
      await import(
        'react'
      )

    return {
      SortableContext({
        children,
      }) {
        return React.createElement(
          React.Fragment,
          null,
          children,
        )
      },

      sortableKeyboardCoordinates() {},

      verticalListSortingStrategy:
        {},

      useSortable() {
        return {
          attributes:
            {},

          listeners:
            {},

          setNodeRef() {},

          setActivatorNodeRef() {},

          transform:
            null,

          transition:
            undefined,

          isDragging:
            false,
        }
      },
    }
  },
)


vi.mock(
  '@dnd-kit/utilities',
  () => ({
    CSS: {
      Translate: {
        toString() {
          return undefined
        },
      },
    },
  }),
)


import FocusQueueManager from './FocusQueueManager'


function candidate(
  id,
  title,
  rank,
) {
  return {
    item_id:
      id,

    title,

    item_type:
      'TASK',

    duration_category:
      'UNDER_4_HOURS',

    scheduled_date:
      '2026-10-01',

    execution_rank:
      rank,

    manual_requested_date:
      null,

    manual_requested_order:
      null,

    priority_position:
      rank,

    sibling_order:
      rank,

    hierarchy_path: [
      title,
    ],

    is_current:
      false,

    is_pinned:
      false,

    is_completed:
      false,
  }
}


function queueTitles(
  container,
) {
  return [
    ...container.querySelectorAll(
      '.focus-queue-row .focus-task-copy strong',
    ),
  ].map(
    (node) =>
      node.textContent,
  )
}


function renderManager() {
  return render(
    <FocusQueueManager
      bucketId="boss"
      data={{
        today:
          '2026-10-01',

        candidates: [
          candidate(
            1,
            '1',
            1,
          ),

          candidate(
            2,
            '2',
            2,
          ),

          candidate(
            3,
            '3',
            3,
          ),

          candidate(
            4,
            '4',
            4,
          ),
        ],
      }}
      globalFind={null}
      pinnedItemIds={new Set()}
      onTogglePinned={() => {}}
      onSetCurrent={() => {}}
      onComplete={() => {}}
      onClose={() => {}}
      onAutomatic={() => {}}
      currentBusy={false}
      completionBusy={false}
      planningBusy={false}
    />,
  )
}


describe(
  'FocusQueueManager pending-intent acknowledgement',
  () => {
    beforeEach(
      () => {
        mutationCalls.length =
          0

        vi.useFakeTimers()
      },
    )

    afterEach(
      () => {
        vi.runOnlyPendingTimers()
        vi.useRealTimers()
      },
    )


    test(
      'RED: newer movement survives when older save succeeds before newer debounce fires',
      async () => {
        const {
          container,
        } =
          renderManager()

        expect(
          queueTitles(
            container,
          ),
        ).toEqual([
          '1',
          '2',
          '3',
          '4',
        ])


        /*
         * Movement A:
         *
         * 1 2 3 4
         *     ↑
         *
         * becomes:
         *
         * 1 3 2 4
         */
        await act(
          async () => {
            fireEvent.click(
              screen.getByRole(
                'button',
                {
                  name:
                    'Move 3 up',
                },
              ),
            )
          },
        )

        expect(
          queueTitles(
            container,
          ),
        ).toEqual([
          '1',
          '3',
          '2',
          '4',
        ])


        /*
         * Let A's 180 ms debounce fire.
         * A is now the in-flight mutation.
         */
        await act(
          async () => {
            vi.advanceTimersByTime(
              180,
            )
          },
        )

        expect(
          mutationCalls,
        ).toHaveLength(
          1,
        )


        /*
         * Movement B occurs while A is in flight.
         *
         * Current local queue:
         *
         * 1 3 2 4
         *
         * Move 4 up:
         *
         * 1 3 4 2
         *
         * Crucially, DO NOT let B's debounce fire yet.
         */
        await act(
          async () => {
            fireEvent.click(
              screen.getByRole(
                'button',
                {
                  name:
                    'Move 4 up',
                },
              ),
            )
          },
        )

        expect(
          queueTitles(
            container,
          ),
        ).toEqual([
          '1',
          '3',
          '4',
          '2',
        ])


        /*
         * A returns BEFORE B's debounce fires.
         *
         * Correct behavior:
         * A may be acknowledged, but B must remain pending.
         */
        await act(
          async () => {
            mutationCalls[
              0
            ].callbacks.onSuccess()
          },
        )


        /*
         * B must still be visible locally after A's acknowledgement.
         */
        expect(
          queueTitles(
            container,
          ),
        ).toEqual([
          '1',
          '3',
          '4',
          '2',
        ])


        /*
         * Now B's original debounce deadline arrives.
         */
        await act(
          async () => {
            vi.advanceTimersByTime(
              180,
            )
          },
        )


        /*
         * Correct contract:
         * B must become a second HTTP mutation.
         *
         * The current implementation is expected to fail here because
         * A's onSuccess clears latestSaveRef before B's timer fires.
         */
        expect(
          mutationCalls,
        ).toHaveLength(
          2,
        )


        const secondChanges =
          mutationCalls[
            1
          ].variables.changes

        expect(
          secondChanges.map(
            ({
              item_id,
              order,
            }) => [
              item_id,
              order,
            ],
          ),
        ).toEqual([
          [3, 2],
          [4, 3],
        ])
      },
    )
  },
)
