import { describe, expect, it } from 'vitest'
import { classifyTimelineOverdue } from './timelineOverdue'

const today = '2026-10-17'

function task(overrides = {}) {
  return {
    id: 1,
    item_type: 'TASK',
    is_completed: false,
    ...overrides,
  }
}

describe('Timeline overdue classification', () => {
  it('classifies past deadlines', () => {
    expect(classifyTimelineOverdue(task({ due_date: '2026-10-16' }), today))
      .toBe('deadline')
  })

  it('does not classify deadlines due today', () => {
    expect(classifyTimelineOverdue(task({ due_date: today }), today))
      .toBeNull()
  })

  it('classifies carried anchors', () => {
    expect(classifyTimelineOverdue(task({
      manual_requested_date: '2026-10-17',
      manual_anchor_origin_date: '2026-10-15',
    }), today)).toBe('anchor')
  })

  it('classifies expired anchors', () => {
    expect(classifyTimelineOverdue(task({
      manual_anchor_origin_date: '2026-10-12',
    }), today)).toBe('anchor')
  })

  it('gives overdue deadlines precedence over anchors', () => {
    expect(classifyTimelineOverdue(task({
      due_date: '2026-10-16',
      active_carried_anchor: true,
    }), today)).toBe('deadline')
  })

  it('excludes completed items and non-actionable parents', () => {
    expect(classifyTimelineOverdue(task({
      is_completed: true,
      deadline_overdue: true,
    }), today)).toBeNull()

    expect(classifyTimelineOverdue(task({
      item_type: 'GOAL',
      deadline_overdue: true,
    }), today)).toBeNull()
  })

  it('recognizes backend overdue flags', () => {
    expect(classifyTimelineOverdue(task({
      deadline_overdue: true,
    }), today)).toBe('deadline')

    expect(classifyTimelineOverdue(task({
      expired_anchor_history: true,
    }), today)).toBe('anchor')
  })
})
