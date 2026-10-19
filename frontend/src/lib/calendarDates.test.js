import { afterEach, expect, test, vi } from 'vitest'
import { userDateKey } from './calendarDates'
import { useAuthStore } from '../stores/authStore'
import { todayKey, addDays } from '../features/timeline/timelineDates'
import { addDaysIso } from '../features/focus/focusQueueModel'
import { dayDifference } from '../features/focus/focusModel'

afterEach(() => {
  vi.useRealTimers()
  useAuthStore.getState().clearSession()
})

test.each([
  ['2026-10-11T00:30:00Z', 'America/Los_Angeles', '2026-10-10'],
  ['2026-10-11T00:30:00Z', 'Asia/Tokyo', '2026-10-11'],
  ['2026-10-11T23:30:00Z', 'Asia/Tokyo', '2026-10-12'],
  ['2026-10-11T23:30:00Z', null, '2026-10-11'],
  ['2026-10-11T23:30:00Z', 'Invalid/Zone', '2026-10-11'],
  ['2026-10-04T12:59:59Z', 'Australia/Sydney', '2026-10-04'],
  ['2026-10-04T13:00:00Z', 'Australia/Sydney', '2026-10-05'],
  ['2026-11-01T08:59:59Z', 'America/Los_Angeles', '2026-11-01'],
  ['2026-11-01T09:00:00Z', 'America/Los_Angeles', '2026-11-01'],
])('calendar %s in %s is %s', (at, zone, expected) => {
  expect(userDateKey(new Date(at), zone)).toBe(expected)
})

test('Timeline today uses the authenticated preference and UTC when unset', () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-11T00:30:00Z'))
  useAuthStore.getState().setUser({ id: 1, time_zone: 'America/Los_Angeles' })
  expect(todayKey()).toBe('2026-10-10')
  useAuthStore.getState().setUser({ id: 1, time_zone: 'Asia/Tokyo' })
  expect(todayKey()).toBe('2026-10-11')
  useAuthStore.getState().setUser({ id: 1, time_zone: null })
  expect(todayKey()).toBe('2026-10-11')
})

test('date-only Focus and Timeline arithmetic stays aligned across DST and leap days', () => {
  for (const [date, next] of [
    ['2026-10-04', '2026-10-05'], ['2026-11-01', '2026-11-02'],
    ['2024-02-28', '2024-02-29'], ['2026-12-31', '2027-01-01'],
  ]) {
    expect(addDays(date, 1)).toBe(next)
    expect(addDaysIso(date, 1)).toBe(next)
    expect(dayDifference(next, date)).toBe(1)
  }
})
