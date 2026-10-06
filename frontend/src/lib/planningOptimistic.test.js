import assert from 'node:assert/strict'
import {
  test,
} from 'node:test'

import {
  patchPlanningTreeCompletion,
  reorderPriorityRows,
} from './planningOptimistic.js'


test(
  'priority optimistic reorder preserves rows and renumbers positions',
  () => {
    const rows = [
      {
        item_id: 1,
        position: 1,
        title: 'A',
      },
      {
        item_id: 2,
        position: 2,
        title: 'B',
      },
      {
        item_id: 3,
        position: 3,
        title: 'C',
      },
    ]

    const result =
      reorderPriorityRows(
        rows,
        1,
        3,
      )

    assert.deepEqual(
      result.map(
        (row) => [
          row.item_id,
          row.position,
        ],
      ),
      [
        [2, 1],
        [3, 2],
        [1, 3],
      ],
    )
  },
)


test(
  'optimistic parent completion completes the visible subtree',
  () => {
    const tree = [
      {
        id: 1,
        is_completed: false,
        children: [
          {
            id: 2,
            is_completed: false,
            children: [],
          },
          {
            id: 3,
            is_completed: false,
            children: [
              {
                id: 4,
                is_completed: false,
                children: [],
              },
            ],
          },
        ],
      },
    ]

    const result =
      patchPlanningTreeCompletion(
        tree,
        1,
        true,
      )

    assert.equal(
      result[0].is_completed,
      true,
    )

    assert.equal(
      result[0]
        .children[0]
        .is_completed,
      true,
    )

    assert.equal(
      result[0]
        .children[1]
        .children[0]
        .is_completed,
      true,
    )
  },
)


test(
  'optimistic reopen changes only the requested item',
  () => {
    const tree = [
      {
        id: 1,
        is_completed: true,
        children: [
          {
            id: 2,
            is_completed: true,
            children: [],
          },
        ],
      },
    ]

    const result =
      patchPlanningTreeCompletion(
        tree,
        1,
        false,
      )

    assert.equal(
      result[0].is_completed,
      false,
    )

    assert.equal(
      result[0]
        .children[0]
        .is_completed,
      true,
    )
  },
)
