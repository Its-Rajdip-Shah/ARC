import assert from 'node:assert/strict'
import {
  test,
} from 'node:test'

import {
  plannerVisualGapIndex,
} from './plannerVisualPlacement.js'


test(
  'every visible gap resolves to its exact stationary index',
  () => {
    const rows = [
      100,
      2,
      3,
      1,
      4,
      7,
      6,
      5,
      8,
    ].map(
      (id, index) => ({
        id,
        centerY:
          100 + index * 40,
      }),
    )

    for (
      let gap = 0;
      gap <= rows.length;
      gap += 1
    ) {
      let activeCenterY

      if (gap === 0) {
        activeCenterY =
          rows[0].centerY - 20

      } else if (
        gap === rows.length
      ) {
        activeCenterY =
          rows.at(-1).centerY + 20

      } else {
        activeCenterY =
          (
            rows[gap - 1].centerY
            + rows[gap].centerY
          ) / 2
      }

      assert.equal(
        plannerVisualGapIndex({
          rows,
          activeId: 999,
          activeCenterY,
        }),
        gap,
        `gap=${gap}`,
      )
    }
  },
)


test(
  'moving subtree is excluded as one unit from visual gap counting',
  () => {
    const rows = [
      { id: 100, centerY: 100 },
      { id: 1, centerY: 140 },
      { id: 11, centerY: 180 },
      { id: 111, centerY: 220 },
      { id: 4, centerY: 260 },
      { id: 7, centerY: 300 },
      { id: 6, centerY: 340 },
    ]

    assert.equal(
      plannerVisualGapIndex({
        rows,
        activeId: 1,
        descendantIds: [
          11,
          111,
        ],
        activeCenterY: 320,
      }),
      3,
    )
  },
)
