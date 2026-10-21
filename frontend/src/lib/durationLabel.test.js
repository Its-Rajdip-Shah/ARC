import { expect, test } from 'vitest'

import { durationEstimateLabel } from './durationLabel'

test('planner estimates use the same words as the timeline cards', () => {
  expect(durationEstimateLabel('UNDER_4_HOURS')).toBe('Under 4 hours')
  expect(durationEstimateLabel('UNDER_20_MINUTES')).toBe('Under 20 minutes')
  expect(durationEstimateLabel('UNDER_4_HOURS')).not.toBe('UNDER_4_HOURS')
})

test('an unknown estimate is not shown as a raw code', () => {
  expect(durationEstimateLabel('OVER_60_MIN')).toBe('')
  expect(durationEstimateLabel(null)).toBe('')
})
