import assert from 'node:assert/strict'
import test from 'node:test'

import {
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
