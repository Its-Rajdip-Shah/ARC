import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'

import MarksPage from './MarksPage'

vi.mock('../../hooks/useCanvas', () => ({
  useSyncCanvas: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))

const { idle, markGroups } = vi.hoisted(() => ({
  idle: { mutateAsync: vi.fn(), reset: vi.fn(), isPending: false, isError: false, data: null },
  markGroups: [
    {
      root: { id: 1, title: 'ELEC3609' },
      assessments: [
        { id: 1, title: 'Report', weight_percent: '25.00', mark_achieved: null },
        { id: 2, title: 'Quiz', weight_percent: '10.00', mark_achieved: '8.50' },
      ],
      total_marks: '0.85',
      total_weight: '35.00',
      unmarked_count: 1,
    },
    {
      root: { id: 2, title: 'MATH2021' },
      assessments: [
        { id: 3, title: 'Final exam', weight_percent: '60.00', mark_achieved: null },
      ],
      total_marks: '0.00',
      total_weight: '60.00',
      unmarked_count: 1,
    },
  ],
}))

vi.mock('../../hooks/useMarks', () => ({
  useMarks: () => ({
    data: markGroups,
    isPending: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  }),
  useUpdateAssignmentMark: () => idle,
  useUpdateManualWeight: () => idle,
  useSimulateMarks: () => idle,
  useReorderMarks: () => idle,
  useCreateAssessment: () => idle,
  useDeleteAssessment: () => idle,
}))

afterEach(cleanup)

test('pluralises the assessment count and keeps a single assessment singular', () => {
  render(<MarksPage />)
  expect(screen.getByText(/2 assessments/)).toBeTruthy()
  expect(screen.getByText(/1 assessment(?!s)/)).toBeTruthy()
  expect(screen.queryByText(/^2 assessment ·/)).toBeNull()
})
