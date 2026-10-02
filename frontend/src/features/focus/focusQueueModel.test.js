import assert from 'node:assert/strict'
import test from 'node:test'

import {
  changedQueueItemIds,
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
      {
        item_id: 3,
        date: TODAY,
        order: 3,
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
  'BEHAVIOR rank edit anchors exactly the displaced span',
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
      changedQueueItemIds(
        initial,
        moved,
      )

    assert.deepEqual(
      [
        ...touched,
      ].sort(),
      [
        2,
        3,
      ],
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
  'BEHAVIOR arrow move anchors exactly moved + displaced sibling',
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
      changedQueueItemIds(
        initial,
        moved,
      )

    assert.deepEqual(
      [
        ...touched,
      ].sort(),
      [
        2,
        3,
      ],
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
        {
          item_id: 2,
          date: today,
          order: 4,
        },
      ],
    )
  },
)


test(
  'BEHAVIOR DnD anchors exactly the visibly displaced rows',
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
      changedQueueItemIds(
        initial,
        moved,
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
  'BEHAVIOR long move anchors every row in the displaced span but nothing else',
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
  'BEHAVIOR rapid moves accumulate intent from the latest local queue',
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
      changedQueueItemIds(
        initial,
        first,
      )

    assert.deepEqual(
      [
        ...firstTouched,
      ].sort(),
      [
        2,
        3,
      ],
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

    for (
      const itemId
      of changedQueueItemIds(
        first,
        second,
      )
    ) {
      cumulativeTouched.add(
        itemId,
      )
    }

    const changes =
      changesForTouchedRows(
        second,
        cumulativeTouched,
        new Set([
          today,
        ]),
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
        {
          item_id: 3,
          date: today,
          order: 4,
        },
      ],
      (
        'The latest queued save must describe the current local arrangement, '
        + 'including earlier still-pending displaced anchors.'
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
