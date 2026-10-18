import { expect, test } from 'vitest'

import { userDateKey } from '../../../lib/calendarDates'
import { filterOverdueTree } from './PlannerTree'


test('Overdue excludes completed work and restores reopened past-due work on the user calendar date', () => {
  const today = userDateKey(
    new Date('2026-10-11T00:30:00Z'),
    'America/Los_Angeles',
  )

  const { items, matchedIds } = filterOverdueTree([
    {
      id: 1,
      title: 'Completed yesterday',
      item_type: 'TASK',
      due_date: '2026-10-09',
      is_completed: true,
      children: [],
    },
    {
      id: 2,
      title: 'Reopened yesterday',
      item_type: 'TASK',
      due_date: '2026-10-09',
      is_completed: false,
      children: [],
    },
    {
      id: 3,
      title: 'Past-due goal',
      item_type: 'GOAL',
      due_date: '2026-10-09',
      is_completed: false,
      children: [],
    },
    {
      id: 4,
      title: 'Past-due assignment',
      item_type: 'ASSIGNMENT',
      due_date: '2026-10-09',
      is_completed: false,
      children: [],
    },
  ], today)

  expect(today).toBe('2026-10-10')
  expect(items.map((item) => item.id)).toEqual([2, 4])
  expect([...matchedIds]).toEqual([2, 4])
})

test('Overdue separates carried and expired anchor history from deadline misses', () => {
  const { items, matchedIds } = filterOverdueTree([
    { id: 1, item_type: 'TASK', due_date: '2026-10-01', is_completed: false, children: [] },
    { id: 2, item_type: 'TASK', is_completed: false, manual_requested_date: '2026-10-10', manual_anchor_origin_date: '2026-10-08', children: [] },
    { id: 3, item_type: 'TASK', is_completed: false, expired_manual_requested_date: '2026-10-01', children: [] },
    { id: 4, item_type: 'TASK', due_date: '2026-10-01', is_completed: false, manual_requested_date: '2026-10-10', manual_anchor_origin_date: '2026-10-08', children: [] },
  ], '2026-10-10')

  expect(items.filter((item) => item.overdue_section === 'Deadline Overdue').map((item) => item.id)).toEqual([1, 4])
  expect(items.filter((item) => item.overdue_section === 'Anchor Overdue').map((item) => item.id)).toEqual([2, 3])
  expect([...matchedIds]).toEqual([1, 4, 2, 3])
})
