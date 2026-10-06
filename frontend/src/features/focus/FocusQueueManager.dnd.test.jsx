import React from 'react'

import {
  act,
  render,
} from '@testing-library/react'

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from 'vitest'


const harness =
  vi.hoisted(
    () => ({
      dndProps:
        null,

      mutationCalls:
        [],

      sortableIds:
        [],

      closestCenterContainers:
        [],
    }),
  )


vi.mock(
  '../../hooks/useFocus',
  () => ({
    useBatchAnchorFocus() {
      return {
        mutate(
          variables,
          callbacks,
        ) {
          harness
            .mutationCalls
            .push({
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
      DndContext(
        props,
      ) {
        harness.dndProps =
          props

        return React.createElement(
          React.Fragment,
          null,
          props.children,
        )
      },

      /*
       * The real DragOverlay is visually separate from the queue.
       *
       * This unit harness is testing semantic queue order, not overlay
       * rendering, so do not insert a duplicate draggable row into the DOM.
       */
      DragOverlay() {
        return null
      },

      KeyboardSensor:
        function KeyboardSensor() {},

      PointerSensor:
        function PointerSensor() {},

      closestCenter(args) {
        harness.closestCenterContainers =
          Array.from(
            args
              ?.droppableContainers
              ?? [],
          ).map(
            (container) =>
              String(
                container.id,
              ),
          )

        return []
      },

      rectIntersection() {
        throw new Error(
          'Focus collision detection must not hard-prioritise date boundaries via rectIntersection',
        )
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

      useSortable({
        id,
      }) {
        harness.sortableIds.push(
          String(id),
        )

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


test(
  'REAL DATE BOUNDARY: date headings participate in the sortable sequence',
  () => {
    harness.sortableIds = []

    renderManager([
      {
        ...candidate(
          1,
          'Today A',
          1,
        ),

        scheduled_date:
          '2026-10-01',
      },

      {
        ...candidate(
          2,
          'Tomorrow B',
          1,
        ),

        scheduled_date:
          '2026-10-02',
      },
    ])

    expect(
      harness.sortableIds,
    ).toContain(
      'date-boundary:2026-10-01',
    )

    expect(
      harness.sortableIds,
    ).toContain(
      'date-boundary:2026-10-02',
    )

    expect(
      harness.sortableIds,
    ).toContain(
      '1',
    )

    expect(
      harness.sortableIds,
    ).toContain(
      '2',
    )
  },
)


test(
  'REAL DATE BOUNDARY: collision detection does not treat headings as hard rect-intersection walls',
  () => {
    renderManager([
      candidate(
        1,
        'A',
        1,
      ),
    ])

    expect(
      () =>
        harness
          .dndProps
          .collisionDetection({
            collisionRect: {
              top: 0,
              left: 0,
              right: 100,
              bottom: 100,
              width: 100,
              height: 100,
            },

            droppableContainers: [
              {
                id:
                  'date-boundary:2026-10-01',
              },

              {
                id:
                  1,
              },
            ],
          }),
    ).not.toThrow()

    expect(
      harness.closestCenterContainers,
    ).toEqual([
      'date-boundary:2026-10-01',
      '1',
    ])
  },
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


function renderManager(
  rows,
) {
  return render(
    <FocusQueueManager
      bucketId="boss"
      data={{
        today:
          '2026-10-01',

        candidates:
          rows,
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


function activeEvent({
  id,
  initialTop,
  translatedTop,
  height = 40,
}) {
  return {
    id,

    rect: {
      current: {
        initial: {
          top:
            initialTop,

          height,
        },

        translated: {
          top:
            translatedTop,

          height,
        },
      },
    },
  }
}


function overEvent({
  id,
  top,
  height = 40,
}) {
  return {
    id,

    rect: {
      top,
      height,
    },
  }
}


describe(
  'FocusQueueManager DnD semantic destination',
  () => {
    beforeEach(
      () => {
        harness.dndProps =
          null

        harness.mutationCalls.length =
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
      'RED: adjacent upward drag over preceding row commits the visually targeted preceding slot',
      async () => {
        const {
          container,
        } =
          renderManager([
            candidate(
              1,
              'Timeline View',
              1,
            ),

            candidate(
              2,
              'google authentication set up',
              2,
            ),
          ])

        expect(
          queueTitles(
            container,
          ),
        ).toEqual([
          'Timeline View',
          'google authentication set up',
        ])

        /*
         * Source Google is below Timeline.
         *
         * The dragged card has entered Timeline's collision target, so the
         * sortable preview semantics indicate Google's occupied destination
         * is Timeline's current index.
         *
         * Deliberately keep the ACTIVE CARD CENTER just below Timeline's
         * center. Current Focus midpoint arithmetic interprets that as
         * "after Timeline", producing the original slot and therefore a
         * no-op.
         */
        const active =
          activeEvent({
            id:
              2,

            initialTop:
              60,

            translatedTop:
              10,
          })

        const over =
          overEvent({
            id:
              1,

            top:
              0,
          })

        await act(
          async () => {
            harness
              .dndProps
              .onDragStart({
                active,
              })

            harness
              .dndProps
              .onDragMove({
                active,
                over,
              })

            harness
              .dndProps
              .onDragEnd({
                active,
                over,
              })
          },
        )

        /*
         * Intended semantic contract:
         *
         * If the visual sortable target is Timeline's occupied slot,
         * Google must be committed into that same slot.
         *
         * Current implementation is expected to FAIL and remain:
         *
         * Timeline, Google
         */
        expect(
          queueTitles(
            container,
          ),
        ).toEqual([
          'google authentication set up',
          'Timeline View',
        ])

        /*
         * A genuine movement must schedule persistence.
         */
        await act(
          async () => {
            vi.advanceTimersByTime(
              180,
            )
          },
        )

        expect(
          harness.mutationCalls,
        ).toHaveLength(
          1,
        )
      },
    )


    test(
      'RED: drag end uses the final collision target instead of a stale earlier projection',
      async () => {
        const {
          container,
        } =
          renderManager([
            candidate(
              1,
              'A',
              1,
            ),

            candidate(
              2,
              'B',
              2,
            ),

            candidate(
              3,
              'C',
              3,
            ),
          ])

        expect(
          queueTitles(
            container,
          ),
        ).toEqual([
          'A',
          'B',
          'C',
        ])

        const activeOverB =
          activeEvent({
            id:
              3,

            initialTop:
              100,

            /*
             * Center = 65.
             * B center = 80.
             * Therefore this means BEFORE B.
             */
            translatedTop:
              45,
          })

        const overB =
          overEvent({
            id:
              2,

            top:
              60,
          })

        await act(
          async () => {
            harness
              .dndProps
              .onDragStart({
                active:
                  activeOverB,
              })

            /*
             * Stored projection now points before B:
             *
             * A, C, B
             */
            harness
              .dndProps
              .onDragMove({
                active:
                  activeOverB,

                over:
                  overB,
              })
          },
        )


        /*
         * The final release event is now over A, before A.
         *
         * There is intentionally NO intervening onDragMove call.
         *
         * Correct drop semantics must consume the final event:
         *
         * C, A, B
         */
        const activeOverA =
          activeEvent({
            id:
              3,

            initialTop:
              100,

            translatedTop:
              -25,
          })

        const overA =
          overEvent({
            id:
              1,

            top:
              0,
          })

        await act(
          async () => {
            harness
              .dndProps
              .onDragEnd({
                active:
                  activeOverA,

                over:
                  overA,
              })
          },
        )

        /*
         * Current implementation is expected to FAIL here because
         * dragProjectionRef was already non-null and therefore wins over the
         * final event projection.
         *
         * Expected: C A B
         * Current:  A C B
         */
        expect(
          queueTitles(
            container,
          ),
        ).toEqual([
          'C',
          'A',
          'B',
        ])
      },
    )
  },
)


test(
  'canonical reconciliation must not replace the drag baseline while a drag is active',
  async () => {
    const {
      container,
      rerender,
    } =
      renderManager([
        candidate(
          1,
          'A',
          1,
        ),

        candidate(
          2,
          'B',
          2,
        ),

        candidate(
          3,
          'C',
          3,
        ),
      ])

    expect(
      queueTitles(
        container,
      ),
    ).toEqual([
      'A',
      'B',
      'C',
    ])


    /*
     * Start dragging C.
     *
     * dragOriginRef captures:
     *
     * A, B, C
     */
    const active =
      activeEvent({
        id:
          3,

        initialTop:
          100,

        translatedTop:
          45,
      })

    await act(
      async () => {
        harness
          .dndProps
          .onDragStart({
            active,
          })
      },
    )


    /*
     * While the drag is still active, canonical query data changes.
     *
     * Simulate a previous save/reconciliation producing:
     *
     * B, A, C
     *
     * The manager must NOT replace the local drag baseline while the
     * gesture is active.
     */
    rerender(
      <FocusQueueManager
        bucketId="boss"
        data={{
          today:
            '2026-10-01',

          candidates: [
            candidate(
              2,
              'B',
              1,
            ),

            candidate(
              1,
              'A',
              2,
            ),

            candidate(
              3,
              'C',
              3,
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


    /*
     * Correct interaction contract:
     *
     * active drag protects the original visible queue until drop/cancel.
     */
    expect(
      queueTitles(
        container,
      ),
    ).toEqual([
      'A',
      'B',
      'C',
    ])


    /*
     * Release C over A.
     *
     * Drop must apply against the same baseline captured at drag start,
     * not a canonical state that appeared mid-gesture.
     */
    const overA =
      overEvent({
        id:
          1,

        top:
          0,
      })

    const activeOverA =
      activeEvent({
        id:
          3,

        initialTop:
          100,

        translatedTop:
          -25,
      })

    await act(
      async () => {
        harness
          .dndProps
          .onDragEnd({
            active:
              activeOverA,

            over:
              overA,
          })
      },
    )

    expect(
      queueTitles(
        container,
      ),
    ).toEqual([
      'C',
      'A',
      'B',
    ])
  },
)

test(
  'canonical reconciliation resumes after cancel',
  async () => {
    const {
      container,
      rerender,
    } =
      renderManager([
        candidate(
          1,
          'A',
          1,
        ),

        candidate(
          2,
          'B',
          2,
        ),

        candidate(
          3,
          'C',
          3,
        ),
      ])

    expect(
      queueTitles(
        container,
      ),
    ).toEqual([
      'A',
      'B',
      'C',
    ])


    /*
     * Start dragging C.
     *
     * dragOriginRef captures:
     *
     * A, B, C
     */
    const active =
      activeEvent({
        id:
          3,

        initialTop:
          100,

        translatedTop:
          45,
      })

    await act(
      async () => {
        harness
          .dndProps
          .onDragStart({
            active,
          })
      },
    )


    /*
     * While the drag is still active, canonical query data changes.
     *
     * Simulate a previous save/reconciliation producing:
     *
     * B, A, C
     *
     * The manager must NOT replace the local drag baseline while the
     * gesture is active.
     */
    rerender(
      <FocusQueueManager
        bucketId="boss"
        data={{
          today:
            '2026-10-01',

          candidates: [
            candidate(
              2,
              'B',
              1,
            ),

            candidate(
              1,
              'A',
              2,
            ),

            candidate(
              3,
              'C',
              3,
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


    /*
     * Correct interaction contract:
     *
     * active drag protects the original visible queue until drop/cancel.
     */
    expect(
      queueTitles(
        container,
      ),
    ).toEqual([
      'A',
      'B',
      'C',
    ])


    await act(async () => { harness.dndProps.onDragCancel() })
    expect(queueTitles(container)).toEqual(['B', 'A', 'C'])
  }
)

test(
  'canonical reconciliation resumes after no-op drop',
  async () => {
    const {
      container,
      rerender,
    } =
      renderManager([
        candidate(
          1,
          'A',
          1,
        ),

        candidate(
          2,
          'B',
          2,
        ),

        candidate(
          3,
          'C',
          3,
        ),
      ])

    expect(
      queueTitles(
        container,
      ),
    ).toEqual([
      'A',
      'B',
      'C',
    ])


    /*
     * Start dragging C.
     *
     * dragOriginRef captures:
     *
     * A, B, C
     */
    const active =
      activeEvent({
        id:
          3,

        initialTop:
          100,

        translatedTop:
          45,
      })

    await act(
      async () => {
        harness
          .dndProps
          .onDragStart({
            active,
          })
      },
    )


    /*
     * While the drag is still active, canonical query data changes.
     *
     * Simulate a previous save/reconciliation producing:
     *
     * B, A, C
     *
     * The manager must NOT replace the local drag baseline while the
     * gesture is active.
     */
    rerender(
      <FocusQueueManager
        bucketId="boss"
        data={{
          today:
            '2026-10-01',

          candidates: [
            candidate(
              2,
              'B',
              1,
            ),

            candidate(
              1,
              'A',
              2,
            ),

            candidate(
              3,
              'C',
              3,
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


    /*
     * Correct interaction contract:
     *
     * active drag protects the original visible queue until drop/cancel.
     */
    expect(
      queueTitles(
        container,
      ),
    ).toEqual([
      'A',
      'B',
      'C',
    ])


    await act(async () => { harness.dndProps.onDragEnd({ active, over: overEvent({ id: 3, top: 100 }) }) })
    expect(queueTitles(container)).toEqual(['B', 'A', 'C'])
  }
)


test(
  'REAL DND downward occupied slot persists exactly where sortable preview opens space',
  async () => {
    const {
      container,
    } =
      renderManager([
        candidate(
          1,
          'A',
          1,
        ),

        candidate(
          2,
          'B',
          2,
        ),

        candidate(
          3,
          'C',
          3,
        ),

        candidate(
          4,
          'D',
          4,
        ),

        candidate(
          5,
          'E',
          5,
        ),
      ])

    expect(
      queueTitles(
        container,
      ),
    ).toEqual([
      'A',
      'B',
      'C',
      'D',
      'E',
    ])

    const active =
      activeEvent({
        id:
          1,

        initialTop:
          0,

        translatedTop:
          60,
      })

    const over =
      overEvent({
        id:
          2,

        top:
          40,
      })

    await act(
      async () => {
        harness
          .dndProps
          .onDragStart({
            active,
          })

        harness
          .dndProps
          .onDragMove({
            active,
            over,
          })

        harness
          .dndProps
          .onDragEnd({
            active,
            over,
          })
      },
    )

    expect(
      queueTitles(
        container,
      ),
    ).toEqual([
      'B',
      'A',
      'C',
      'D',
      'E',
    ])

  },
)
