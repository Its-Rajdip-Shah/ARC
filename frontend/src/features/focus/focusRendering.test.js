import assert from 'node:assert/strict'
import {
  test,
} from 'node:test'

import {
  FOCUS_BUCKETS,
  FOCUS_VISIBLE_LIMIT,
  ancestorLabel,
  bucketForCategory,
  durationLabel,
  candidatesForBucket,
  dateGroupLabel,
  duePressureLabel,
  scheduledRelativeLabel,
  visibleCandidatesForBucket,
} from './focusModel.js'

test('three Focus presentation buckets preserve all six canonical duration categories', () => {
  assert.equal(
    FOCUS_VISIBLE_LIMIT,
    3,
  )

  assert.deepEqual(
    FOCUS_BUCKETS.map(
      (bucket) => bucket.label,
    ),
    [
      'BOSS FIGHTS',
      'SIDE QUESTS',
      'QUICK WINS',
    ],
  )

  assert.equal(
    bucketForCategory(
      'UNDER_20_MINUTES',
    ).id,
    'quick',
  )

  assert.equal(
    bucketForCategory(
      'UNDER_1_HOUR',
    ).id,
    'side',
  )

  for (const category of [
    'UNDER_4_HOURS',
    'UNDER_8_HOURS',
    'UNDER_16_HOURS',
    'OVER_16_HOURS',
  ]) {
    assert.equal(
      bucketForCategory(
        category,
      ).id,
      'boss',
    )
  }
})

test('main Focus shows only first three candidates from canonical queue order', () => {
  const candidates = [
    1,
    2,
    3,
    4,
    5,
  ].map(
    (id) => ({
      item_id: id,
      duration_category:
        'UNDER_4_HOURS',
    }),
  )

  const boss =
    FOCUS_BUCKETS[0]

  assert.deepEqual(
    candidatesForBucket(
      candidates,
      boss,
    ).map(
      (candidate) =>
        candidate.item_id,
    ),
    [
      1,
      2,
      3,
      4,
      5,
    ],
  )

  assert.deepEqual(
    visibleCandidatesForBucket(
      candidates,
      boss,
    ).map(
      (candidate) =>
        candidate.item_id,
    ),
    [
      1,
      2,
      3,
    ],
  )
})

test('leaf title metadata uses ancestry separately', () => {
  assert.equal(
    ancestorLabel({
      hierarchy_path: [
        'UNI',
        'ELEC3609',
        'Assignment 2',
        'Focus View',
      ],
    }),
    'UNI | ELEC3609 | Assignment 2',
  )
})

test('scheduled date is presented relatively', () => {
  assert.equal(
    scheduledRelativeLabel(
      {
        scheduled_date:
          '2026-09-29',
      },
      '2026-09-29',
    ),
    'Today',
  )

  assert.equal(
    scheduledRelativeLabel(
      {
        scheduled_date:
          '2026-09-30',
      },
      '2026-09-29',
    ),
    'Tomorrow',
  )

  assert.equal(
    scheduledRelativeLabel(
      {
        scheduled_date:
          '2026-10-03',
      },
      '2026-09-29',
    ),
    'In 4 days',
  )
})



test('friendly duration labels are presentation-only', () => {
  assert.equal(
    durationLabel(
      'UNDER_20_MINUTES',
    ),
    '<20m',
  )

  assert.equal(
    durationLabel(
      'UNDER_1_HOUR',
    ),
    '<1h',
  )

  assert.equal(
    durationLabel(
      'UNDER_4_HOURS',
    ),
    '<4h',
  )

  assert.equal(
    durationLabel(
      'UNDER_8_HOURS',
    ),
    '<8h',
  )

  assert.equal(
    durationLabel(
      'UNDER_16_HOURS',
    ),
    '<16h',
  )

  assert.equal(
    durationLabel(
      'OVER_16_HOURS',
    ),
    '>16h',
  )
})


test('current focus floats into the visible three without rewriting queue order', () => {
  const candidates = [
    1,
    2,
    3,
    4,
    5,
  ].map(
    (id) => ({
      item_id: id,
      duration_category:
        'UNDER_4_HOURS',
      is_current:
        id === 5,
    }),
  )

  const boss =
    FOCUS_BUCKETS[0]

  assert.deepEqual(
    candidatesForBucket(
      candidates,
      boss,
    ).map(
      (candidate) =>
        candidate.item_id,
    ),
    [
      1,
      2,
      3,
      4,
      5,
    ],
  )

  assert.deepEqual(
    visibleCandidatesForBucket(
      candidates,
      boss,
    ).map(
      (candidate) =>
        candidate.item_id,
    ),
    [
      5,
      1,
      2,
    ],
  )
})



test('schedule labels switch to compact absolute dates after fourteen days', () => {
  assert.equal(
    scheduledRelativeLabel(
      {
        scheduled_date:
          '2026-10-13',
      },
      '2026-09-29',
    ),
    'In 14 days',
  )

  assert.equal(
    scheduledRelativeLabel(
      {
        scheduled_date:
          '2026-10-14',
      },
      '2026-09-29',
    ),
    '14 Oct',
  )
})


test('due pressure uses compact human labels', () => {
  assert.equal(
    duePressureLabel(
      {
        due_date:
          '2026-09-29',
      },
      '2026-09-29',
    ),
    'Due today',
  )

  assert.equal(
    duePressureLabel(
      {
        due_date:
          '2026-10-04',
      },
      '2026-09-29',
    ),
    'Due in 5d',
  )

  assert.equal(
    duePressureLabel(
      {
        due_date:
          '2026-09-27',
      },
      '2026-09-29',
    ),
    '2d overdue',
  )
})


test('queue groups use today tomorrow then absolute date and weekday', () => {
  assert.equal(
    dateGroupLabel(
      '2026-09-29',
      '2026-09-29',
    ),
    'TODAY',
  )

  assert.equal(
    dateGroupLabel(
      '2026-09-30',
      '2026-09-29',
    ),
    'TOMORROW',
  )

  assert.match(
    dateGroupLabel(
      '2026-10-03',
      '2026-09-29',
    ),
    /^03 OCT · /,
  )
})
