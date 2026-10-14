import assert from 'node:assert/strict'
import test from 'node:test'

import {
  changedQueueItemIds,
  directMovementIntent,
  movementIntentsForMove,
  changesForTouchedRows,
  makeQueueGroups,
  moveQueueItem,
  moveQueueItemByGlobalPosition,
  moveQueueItemToSlot,
  queueItemPositionChanged,
  queuePositionMap,
} from './focusQueueModel.js'


const TODAY = '2026-09-29'
const TOMORROW = '2026-09-30'


function row(
  itemId,
  date,
  extras = {},
) {
  return {
    item_id:
      itemId,
    title:
      `Task ${itemId}`,
    scheduled_date:
      date,
    ...extras,
  }
}


test('today and tomorrow remain available as queue drop groups', () => {
  const groups =
    makeQueueGroups(
      [
        row(
          1,
          '2026-10-03',
        ),
      ],
      TODAY,
    )

  assert.deepEqual(
    groups.map(
      (group) =>
        group.date,
    ),
    [
      TODAY,
      TOMORROW,
      '2026-10-03',
    ],
  )
})


test('same-day movement works upward', () => {
  const groups =
    makeQueueGroups(
      [
        row(1, TODAY),
        row(2, TODAY),
        row(3, TODAY),
      ],
      TODAY,
    )

  const moved =
    moveQueueItem(
      groups,
      3,
      TODAY,
      1,
    )

  assert.deepEqual(
    moved[0].rows.map(
      (candidate) =>
        candidate.item_id,
    ),
    [
      3,
      1,
      2,
    ],
  )
})


test('same-day movement works downward', () => {
  const groups =
    makeQueueGroups(
      [
        row(1, TODAY),
        row(2, TODAY),
        row(3, TODAY),
      ],
      TODAY,
    )

  const moved =
    moveQueueItem(
      groups,
      1,
      TODAY,
      2,
    )

  assert.deepEqual(
    moved[0].rows.map(
      (candidate) =>
        candidate.item_id,
    ),
    [
      2,
      1,
      3,
    ],
  )
})


test('visual positions continue across dates', () => {
  const groups =
    makeQueueGroups(
      [
        row(1, TODAY),
        row(2, TOMORROW),
        row(3, TOMORROW),
      ],
      TODAY,
    )

  const positions =
    queuePositionMap(
      groups,
    )

  assert.equal(
    positions.get(1),
    1,
  )

  assert.equal(
    positions.get(2),
    2,
  )

  assert.equal(
    positions.get(3),
    3,
  )
})


test('global position movement can cross date boundary', () => {
  const groups =
    makeQueueGroups(
      [
        row(1, TODAY),
        row(2, TODAY),
        row(3, TOMORROW),
        row(4, TOMORROW),
      ],
      TODAY,
    )

  const moved =
    moveQueueItemByGlobalPosition(
      groups,
      1,
      3,
    )

  assert.deepEqual(
    moved[0].rows.map(
      (candidate) =>
        candidate.item_id,
    ),
    [
      2,
    ],
  )

  assert.deepEqual(
    moved[1].rows.map(
      (candidate) =>
        candidate.item_id,
    ),
    [
      3,
      1,
      4,
    ],
  )
})


test('autosave does not anchor untouched automatic rows', () => {
  const groups =
    makeQueueGroups(
      [
        row(1, TODAY),
        row(2, TODAY),
        row(
          3,
          TODAY,
          {
            manual_requested_date:
              TODAY,
            manual_requested_order:
              3,
          },
        ),
      ],
      TODAY,
    )

  const changes =
    changesForTouchedRows(
      groups,
      new Set([
        1,
      ]),
      new Set([
        TODAY,
      ]),
    )

  assert.deepEqual(
    changes,
    [
      {
        item_id: 1,
        date: TODAY,
        order: 1,
      },
    ],
  )
})



test('explicit insertion slots place cross-date drops exactly', () => {
  const groups =
    makeQueueGroups(
      [
        row(1, TODAY),
        row(2, TOMORROW),
        row(3, TOMORROW),
        row(4, TOMORROW),
      ],
      TODAY,
    )

  const moved =
    moveQueueItemToSlot(
      groups,
      1,
      TOMORROW,
      1,
    )

  assert.deepEqual(
    moved[1].rows.map(
      (candidate) =>
        candidate.item_id,
    ),
    [
      2,
      1,
      3,
      4,
    ],
  )
})


test('explicit insertion slots work downward inside one date', () => {
  const groups =
    makeQueueGroups(
      [
        row(1, TODAY),
        row(2, TODAY),
        row(3, TODAY),
      ],
      TODAY,
    )

  const moved =
    moveQueueItemToSlot(
      groups,
      1,
      TODAY,
      2,
    )

  assert.deepEqual(
    moved[0].rows.map(
      (candidate) =>
        candidate.item_id,
    ),
    [
      2,
      1,
      3,
    ],
  )
})


test('dropping a queue item back into its original position is a no-op', () => {
  const groups =
    makeQueueGroups(
      [
        row(1, TODAY),
        row(2, TODAY),
        row(3, TOMORROW),
      ],
      TODAY,
    )

  const unchanged =
    moveQueueItemToSlot(
      groups,
      2,
      TODAY,
      1,
    )

  assert.equal(
    queueItemPositionChanged(
      groups,
      unchanged,
      2,
    ),
    false,
  )
})


test('queue position change detects cross-date movement', () => {
  const groups =
    makeQueueGroups(
      [
        row(1, TODAY),
        row(2, TODAY),
        row(3, TOMORROW),
      ],
      TODAY,
    )

  const moved =
    moveQueueItemToSlot(
      groups,
      2,
      TOMORROW,
      0,
    )

  assert.equal(
    queueItemPositionChanged(
      groups,
      moved,
      2,
    ),
    true,
  )
})


test('same-day slot move can place third item after fourth item', () => {
  const groups =
    makeQueueGroups(
      [
        row(1, TODAY),
        row(2, TODAY),
        row(3, TODAY),
        row(4, TODAY),
      ],
      TODAY,
    )

  const moved =
    moveQueueItemToSlot(
      groups,
      3,
      TODAY,
      4,
    )

  assert.deepEqual(
    moved[0].rows.map(
      (candidate) =>
        candidate.item_id,
    ),
    [
      1,
      2,
      4,
      3,
    ],
  )
})


test('same-day slot move can place second item at end', () => {
  const groups =
    makeQueueGroups(
      [
        row(1, TODAY),
        row(2, TODAY),
        row(3, TODAY),
        row(4, TODAY),
      ],
      TODAY,
    )

  const moved =
    moveQueueItemToSlot(
      groups,
      2,
      TODAY,
      4,
    )

  assert.deepEqual(
    moved[0].rows.map(
      (candidate) =>
        candidate.item_id,
    ),
    [
      1,
      3,
      4,
      2,
    ],
  )
})


test('same-day slot move between first and second remains exact', () => {
  const groups =
    makeQueueGroups(
      [
        row(1, TODAY),
        row(2, TODAY),
        row(3, TODAY),
        row(4, TODAY),
      ],
      TODAY,
    )

  const moved =
    moveQueueItemToSlot(
      groups,
      3,
      TODAY,
      1,
    )

  assert.deepEqual(
    moved[0].rows.map(
      (candidate) =>
        candidate.item_id,
    ),
    [
      1,
      3,
      2,
      4,
    ],
  )
})


test('same-day exact original slot remains a no-op', () => {
  const groups =
    makeQueueGroups(
      [
        row(1, TODAY),
        row(2, TODAY),
        row(3, TODAY),
        row(4, TODAY),
      ],
      TODAY,
    )

  const moved =
    moveQueueItemToSlot(
      groups,
      3,
      TODAY,
      2,
    )

  assert.equal(
    queueItemPositionChanged(
      groups,
      moved,
      3,
    ),
    false,
  )
})


test(
  'date-local nudge never crosses into another date',
  () => {
    const groups =
      makeQueueGroups(
        [
          row(1, TODAY),
          row(2, TODAY),
          row(3, TOMORROW),
          row(4, TOMORROW),
        ],
        TODAY,
      )

    const moved =
      moveQueueItem(
        groups,
        2,
        TODAY,
        1,
      )

    assert.deepEqual(
      moved[0].rows.map(
        (candidate) =>
          candidate.item_id,
      ),
      [
        2,
        1,
      ],
    )

    assert.deepEqual(
      moved[1].rows.map(
        (candidate) =>
          candidate.item_id,
      ),
      [
        3,
        4,
      ],
    )
  },
)


test(
  'rank edit anchors only the directly moved task',
  () => {
    const today =
      '2026-10-01'

    const initial = [
      {
        date:
          today,

        rows: [
          {
            item_id: 1,
            scheduled_date: today,
            manual_requested_date: null,
          },
          {
            item_id: 3,
            scheduled_date: today,
            manual_requested_date: null,
          },
          {
            item_id: 2,
            scheduled_date: today,
            manual_requested_date: null,
          },
          {
            item_id: 4,
            scheduled_date: today,
            manual_requested_date: null,
          },
        ],
      },
    ]

    const moved =
      moveQueueItemByGlobalPosition(
        initial,
        2,
        2,
      )

    assert.deepEqual(
      moved[0].rows.map(
        (row) =>
          row.item_id,
      ),
      [
        1,
        2,
        3,
        4,
      ],
    )

    const touched =
      new Set([2])

    assert.deepEqual(
      [
        ...touched,
      ].sort(),
      [2],
    )

    const changes =
      changesForTouchedRows(
        moved,
        touched,
        new Set([
          today,
        ]),
      )

    assert.deepEqual(
      changes,
      [
        {
          item_id: 2,
          date: today,
          order: 2,
        },
      ],
    )
  },
)


test(
  'arrow move anchors only the directly moved task',
  () => {
    const today =
      '2026-10-01'

    const initial = [
      {
        date:
          today,

        rows: [
          {
            item_id: 1,
            scheduled_date: today,
            manual_requested_date: null,
          },
          {
            item_id: 4,
            scheduled_date: today,
            manual_requested_date: null,
          },
          {
            item_id: 2,
            scheduled_date: today,
            manual_requested_date: null,
          },
          {
            item_id: 3,
            scheduled_date: today,
            manual_requested_date: null,
          },
        ],
      },
    ]

    const moved =
      moveQueueItem(
        initial,
        3,
        today,
        3,
      )

    assert.deepEqual(
      moved[0].rows.map(
        (row) =>
          row.item_id,
      ),
      [
        1,
        4,
        3,
        2,
      ],
    )

    const touched =
      new Set([3])

    assert.deepEqual(
      [
        ...touched,
      ].sort(),
      [3],
    )

    const changes =
      changesForTouchedRows(
        moved,
        touched,
        new Set([
          today,
        ]),
      )

    assert.deepEqual(
      changes,
      [
        {
          item_id: 3,
          date: today,
          order: 3,
        },
      ],
    )
  },
)


test(
  'DnD anchors only the directly moved task',
  () => {
    const today =
      '2026-10-01'

    const initial = [
      {
        date:
          today,

        rows: [
          {
            item_id: 1,
            scheduled_date: today,
            manual_requested_date: null,
          },
          {
            item_id: 3,
            scheduled_date: today,
            manual_requested_date: null,
          },
          {
            item_id: 2,
            scheduled_date: today,
            manual_requested_date: null,
          },
          {
            item_id: 4,
            scheduled_date: today,
            manual_requested_date: null,
          },
        ],
      },
    ]

    const moved =
      moveQueueItemToSlot(
        initial,
        2,
        today,
        1,
      )

    assert.deepEqual(
      moved[0].rows.map(
        (row) =>
          row.item_id,
      ),
      [
        1,
        2,
        3,
        4,
      ],
    )

    const touched =
      new Set([2])

    const changes =
      changesForTouchedRows(
        moved,
        touched,
        new Set([
          today,
        ]),
      )

    assert.deepEqual(
      changes,
      [
        {
          item_id: 2,
          date: today,
          order: 2,
        },
      ],
    )
  },
)


test(
  'long projection identifies displacement without implying anchor intent',
  () => {
    const today =
      '2026-10-01'

    const initial = [
      {
        date:
          today,

        rows: [
          row(1, today),
          row(2, today),
          row(3, today),
          row(4, today),
          row(5, today),
        ],
      },
    ]

    const moved =
      moveQueueItem(
        initial,
        5,
        today,
        2,
      )

    assert.deepEqual(
      moved[0].rows.map(
        (candidate) =>
          candidate.item_id,
      ),
      [
        1,
        5,
        2,
        3,
        4,
      ],
    )

    assert.deepEqual(
      [
        ...changedQueueItemIds(
          initial,
          moved,
        ),
      ].sort(),
      [
        2,
        3,
        4,
        5,
      ],
    )
  },
)


test(
  'rapid moves preserve only directly requested date/order intents',
  () => {
    const today =
      '2026-10-01'

    const initial = [
      {
        date:
          today,

        rows: [
          row(1, today),
          row(3, today),
          row(2, today),
          row(4, today),
        ],
      },
    ]

    const first =
      moveQueueItemByGlobalPosition(
        initial,
        2,
        2,
      )

    const firstTouched =
      new Set([2])

    assert.deepEqual(
      [
        ...firstTouched,
      ].sort(),
      [2],
    )

    const second =
      moveQueueItemByGlobalPosition(
        first,
        4,
        2,
      )

    assert.deepEqual(
      second[0].rows.map(
        (candidate) =>
          candidate.item_id,
      ),
      [
        1,
        4,
        2,
        3,
      ],
    )

    const cumulativeTouched =
      new Set(
        firstTouched,
      )

    cumulativeTouched.add(4)
    const intents = movementIntentsForMove(first, second, 4, movementIntentsForMove(initial, first, 2))

    const changes =
      changesForTouchedRows(
        second,
        cumulativeTouched,
        new Set([
          today,
        ]),
        intents,
      )

    assert.deepEqual(
      changes,
      [
        {
          item_id: 4,
          date: today,
          order: 2,
        },
        {
          item_id: 2,
          date: today,
          order: 3,
        },
      ],
      (
        'The latest queued save must include earlier explicitly moved tasks, '
        + 'without promoting incidental displacement.'
      ),
    )
  },
)


test(
  'RED: untouched date-only Timeline anchor is not promoted to Focus order',
  () => {
    const today =
      '2026-10-01'

    const groups = [
      {
        date:
          today,

        rows: [
          {
            item_id: 1,
            scheduled_date: today,

            /*
             * Timeline anchor only:
             * fixed date, no Focus order intent.
             */
            manual_requested_date:
              today,

            manual_requested_order:
              null,
          },

          {
            item_id: 3,
            scheduled_date: today,
            manual_requested_date:
              null,
            manual_requested_order:
              null,
          },

          {
            item_id: 2,
            scheduled_date: today,
            manual_requested_date:
              null,
            manual_requested_order:
              null,
          },

          {
            item_id: 4,
            scheduled_date: today,
            manual_requested_date:
              null,
            manual_requested_order:
              null,
          },
        ],
      },
    ]

    /*
     * The user moved only tasks 2 and 3.
     *
     * Task 1 is date-anchored by Timeline but was neither directly touched
     * nor displaced.
     */
    const changes =
      changesForTouchedRows(
        groups,
        new Set([
          2,
          3,
        ]),
        new Set([
          today,
        ]),
      )

    assert.deepEqual(
      changes,
      [
        {
          item_id:
            3,

          date:
            today,

          order:
            2,
        },

        {
          item_id:
            2,

          date:
            today,

          order:
            3,
        },
      ],
    )
  },
)


test(
  'REAL RANK boundary keeps moving task on current date when requested rank touches both dates',
  () => {
    const groups =
      makeQueueGroups(
        [
          row(2, TODAY),
          row(3, TODAY),
          row(1, TODAY),
          row(4, TODAY),
          row(5, TODAY),

          row(6, TOMORROW),
          row(7, TOMORROW),
        ],
        TODAY,
      )

    const moved =
      moveQueueItemByGlobalPosition(
        groups,
        1,
        5,
      )

    assert.deepEqual(
      moved[0].rows.map(
        (candidate) =>
          candidate.item_id,
      ),
      [
        2,
        3,
        4,
        5,
        1,
      ],
    )

    assert.deepEqual(
      moved[1].rows.map(
        (candidate) =>
          candidate.item_id,
      ),
      [
        6,
        7,
      ],
    )
  },
)


test('occupied slot preserves the requested destination instead of silently substituting it', () => {
  const rows = [1, 2].map((id) => row(id, TODAY, {
    manual_requested_date: TODAY, manual_requested_order: id, manual_anchor_origin_date: TODAY,
    focus_bucket: 'boss',
  }))
  const before = structuredClone(rows)
  const groups = makeQueueGroups([...rows, row(3, TODAY, { focus_bucket: 'boss' })], TODAY)
  const next = moveQueueItem(groups, 3, TODAY, 1)
  const intent = directMovementIntent(next, 3)
  assert.deepEqual(intent, { item_id: 3, date: TODAY, order: 1 })
  assert.deepEqual(changesForTouchedRows(next, new Set([3]), new Set([TODAY]), new Map([[3, intent]])), [intent])
  assert.deepEqual(rows, before)
})

test('slot requests stay exact for occupied and independent Focus buckets', () => {
  const groups = makeQueueGroups([
    row(1, TODAY, { focus_bucket: 'quick', manual_requested_date: TODAY, manual_requested_order: 1 }),
    row(2, TODAY, { focus_bucket: 'boss', duration_category: 'UNDER_8_HOURS' }),
  ], TODAY)
  assert.equal(directMovementIntent(moveQueueItem(groups, 2, TODAY, 1), 2).order, 1)
  groups[0].rows[1].focus_bucket = 'quick'
  assert.equal(directMovementIntent(moveQueueItem(groups, 2, TODAY, 1), 2).order, 1)
})

test('cross-date drag anchors only the dragged task', () => {
  const groups = makeQueueGroups([row(1, TODAY), row(2, TOMORROW), row(3, TOMORROW)], TODAY)
  const next = moveQueueItemToSlot(groups, 3, TODAY, 0)
  const intent = directMovementIntent(next, 3)
  assert.deepEqual(changesForTouchedRows(next, new Set([3]), new Set([TODAY, TOMORROW]), new Map([[3, intent]])), [
    { item_id: 3, date: TODAY, order: 1 },
  ])
})

test('repeated moves update earlier explicit intents to preserve the latest requested order', () => {
  const groups = makeQueueGroups([row(1, TODAY), row(2, TODAY), row(3, TODAY), row(4, TODAY)], TODAY)
  const first = moveQueueItem(groups, 3, TODAY, 2)
  const firstIntents = movementIntentsForMove(groups, first, 3)
  const next = moveQueueItem(first, 4, TODAY, 2)
  const intents = movementIntentsForMove(first, next, 4, firstIntents)
  assert.deepEqual(changesForTouchedRows(next, new Set([3, 4]), new Set([TODAY]), intents), [
    { item_id: 4, date: TODAY, order: 2 },
    { item_id: 3, date: TODAY, order: 3 },
  ])
  assert.equal(intents.size, 2)
})

function anchoredRows(count) {
  return Array.from({ length: count }, (_, index) => row(index + 1, TODAY, {
    focus_bucket: 'boss', manual_requested_date: TODAY,
    manual_requested_order: index + 1, manual_anchor_origin_date: '2026-09-28',
  }))
}

test('positions 5 and 6 exchange occupied slots in one anchor-preserving batch', () => {
  const before = makeQueueGroups(anchoredRows(6), TODAY)
  const after = moveQueueItem(before, 6, TODAY, 5)
  const intents = movementIntentsForMove(before, after, 6)
  assert.deepEqual([...intents.values()], [
    { item_id: 6, date: TODAY, order: 5, order_only: true },
    { item_id: 5, date: TODAY, order: 6, order_only: true },
  ])
  assert.deepEqual(after[0].rows.map(row => row.item_id), [1, 2, 3, 4, 6, 5])
  assert.equal(before[0].rows[4].manual_anchor_origin_date, '2026-09-28')
})

test('drag 4 above 2 and repeated moves renumber only affected anchored rows', () => {
  let groups = makeQueueGroups(anchoredRows(6), TODAY)
  let intents = new Map()
  for (const position of [2, 1, 2, 3, 6]) {
    const next = moveQueueItem(groups, 4, TODAY, position)
    intents = movementIntentsForMove(groups, next, 4, intents)
    assert.equal(next[0].rows[position - 1].item_id, 4)
    const effective = next[0].rows.map((row, index) => intents.get(row.item_id)?.order ?? row.manual_requested_order)
    assert.deepEqual(effective, [1, 2, 3, 4, 5, 6])
    groups = next
  }
})

test('mixed movement renumbers existing anchors but never anchors displaced automatic rows', () => {
  const rows = anchoredRows(4)
  rows[1] = row(2, TODAY, { focus_bucket: 'boss' })
  const before = makeQueueGroups(rows, TODAY)
  const after = moveQueueItem(before, 4, TODAY, 2)
  const intents = movementIntentsForMove(before, after, 4)
  assert.equal(intents.has(2), false)
  assert.deepEqual(intents.get(3), { item_id: 3, date: TODAY, order: 4, order_only: true })
  const autoMove = movementIntentsForMove(before, moveQueueItem(before, 2, TODAY, 1), 2)
  assert.deepEqual(autoMove.get(2), { item_id: 2, date: TODAY, order: 1 })
  assert.equal(autoMove.get(1).order_only, true)
})

test('cross-date movement changes only the selected date and renumbers occupied anchors', () => {
  const before = makeQueueGroups([...anchoredRows(2), row(3, TOMORROW)], TODAY)
  const after = moveQueueItem(before, 3, TODAY, 1)
  assert.deepEqual([...movementIntentsForMove(before, after, 3).values()], [
    { item_id: 3, date: TODAY, order: 1 },
    { item_id: 1, date: TODAY, order: 2, order_only: true },
    { item_id: 2, date: TODAY, order: 3, order_only: true },
  ])
})

test('cross-date occupied drop shifts anchored destination rows without anchoring automatic neighbours', () => {
  const before = makeQueueGroups([
    ...anchoredRows(2),
    row(3, TOMORROW, { manual_requested_date: TOMORROW, manual_requested_order: 1 }),
    row(4, TOMORROW),
  ], TODAY)
  const after = moveQueueItem(before, 2, TOMORROW, 1)
  const intents = movementIntentsForMove(before, after, 2)
  assert.deepEqual([...intents.values()], [
    { item_id: 2, date: TOMORROW, order: 1 },
    { item_id: 3, date: TOMORROW, order: 2, order_only: true },
  ])
  assert.equal(intents.has(4), false)
})
