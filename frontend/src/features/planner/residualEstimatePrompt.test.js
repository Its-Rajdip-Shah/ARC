import { describe, expect, it } from 'vitest'
import { newlyActionableParent } from './residualEstimatePrompt'

function parent(completedStates, estimate = 'UNDER_16_HOURS') {
  return [{
    id: 10,
    title: 'Revamp Everything',
    is_completed: false,
    duration_category: estimate,
    children: completedStates.map((completed, index) => ({
      id: index + 1,
      is_completed: completed,
      children: [],
    })),
  }]
}

describe('residual estimate prompt transition', () => {
  it('detects completion of the final unfinished child', () => {
    expect(
      newlyActionableParent(
        parent([true, false]),
        parent([true, true]),
        2,
      ),
    ).toEqual({
      id: 10,
      title: 'Revamp Everything',
      duration_category: 'UNDER_16_HOURS',
    })
  })

  it('does not prompt while another child remains unfinished', () => {
    expect(
      newlyActionableParent(
        parent([false, false]),
        parent([true, false]),
        1,
      ),
    ).toBeNull()
  })

  it('does not prompt for an already completed child', () => {
    expect(
      newlyActionableParent(
        parent([true]),
        parent([true]),
        1,
      ),
    ).toBeNull()
  })

  it('does not prompt when a child is reopened', () => {
    expect(
      newlyActionableParent(
        parent([true]),
        parent([false]),
        1,
      ),
    ).toBeNull()
  })

  it('does not prompt for a root task', () => {
    const before = [{
      id: 1,
      is_completed: false,
      children: [],
    }]

    const after = [{
      id: 1,
      is_completed: true,
      children: [],
    }]

    expect(
      newlyActionableParent(before, after, 1),
    ).toBeNull()
  })

  it('preserves the current parent estimate', () => {
    expect(
      newlyActionableParent(
        parent([false], 'UNDER_4_HOURS'),
        parent([true], 'UNDER_4_HOURS'),
        1,
      )?.duration_category,
    ).toBe('UNDER_4_HOURS')
  })
})
