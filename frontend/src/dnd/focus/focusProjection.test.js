import assert from 'node:assert/strict'
import test from 'node:test'

import {
  projectFocusDrop,
} from './focusProjection.js'


const TODAY = '2026-10-01'
const TOMORROW = '2026-10-02'


function row(itemId) {
  return {
    item_id:
      itemId,
  }
}


function groups() {
  return [
    {
      date:
        TODAY,

      rows: [
        row(1),
        row(2),
      ],
    },

    {
      date:
        TOMORROW,

      rows: [
        row(3),
        row(4),
      ],
    },
  ]
}


test(
  'FOCUS task target selects the targets occupied sortable slot',
  () => {
    assert.deepEqual(
      projectFocusDrop({
        groups:
          groups(),

        activeId: 1,
        overId: 2,
      }),
      {
        date:
          TODAY,

        slotIndex: 1,
      },
    )
  },
)


test(
  'FOCUS task target is not reinterpreted by dragged-card midpoint',
  () => {
    assert.deepEqual(
      projectFocusDrop({
        groups:
          groups(),

        activeId: 1,
        overId: 2,
      }),
      {
        date:
          TODAY,

        slotIndex: 1,
      },
    )
  },
)


test(
  'FOCUS downward date crossing prepends to next date',
  () => {
    assert.deepEqual(
      projectFocusDrop({
        groups:
          groups(),

        activeId: 1,

        overId:
          `date-boundary:${TOMORROW}`,

        movingUp: false,
      }),
      {
        date:
          TOMORROW,

        slotIndex: 0,
      },
    )
  },
)


test(
  'FOCUS upward date crossing appends to previous date',
  () => {
    assert.deepEqual(
      projectFocusDrop({
        groups:
          groups(),

        activeId: 4,

        overId:
          `date-boundary:${TOMORROW}`,

        movingUp: true,
      }),
      {
        date:
          TODAY,

        slotIndex: 2,
      },
    )
  },
)


test(
  'FOCUS queue end appends to final date',
  () => {
    assert.deepEqual(
      projectFocusDrop({
        groups:
          groups(),

        activeId: 1,

        overId:
          `queue-end:${TOMORROW}`,
      }),
      {
        date:
          TOMORROW,

        slotIndex: 2,
      },
    )
  },
)
