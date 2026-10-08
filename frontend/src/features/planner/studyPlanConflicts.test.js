import assert from 'node:assert/strict'
import { test } from 'node:test'

import { sessionConflicts } from './studyPlanConflicts.js'

const WINDOW = [{ weekday: 0, start: '09:00', end: '17:00' }]

function session(overrides = {}) {
  return {
    date: '2026-10-05',
    start_time: '10:00',
    duration_minutes: 60,
    due_date: '2026-10-12',
    ...overrides,
  }
}

test('a session inside the window and before the deadline is clear', () => {
  assert.deepEqual(sessionConflicts(session(), WINDOW), [])
})

test('moving the start outside the window flags it immediately', () => {
  assert.deepEqual(
    sessionConflicts(session({ start_time: '18:00' }), WINDOW),
    ['outside_availability'],
  )
})

test('a date after the due date is flagged', () => {
  assert.deepEqual(
    sessionConflicts(session({ date: '2026-10-12', due_date: '2026-10-05' }), WINDOW),
    ['after_deadline'],
  )
})

test('a session that runs past midnight is outside a same-day window', () => {
  assert.deepEqual(
    sessionConflicts(session({ start_time: '23:00', duration_minutes: 90 }), [{
      weekday: 0, start: '22:00', end: '23:59',
    }]),
    ['outside_availability'],
  )
})
