import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useMarks } from '../../hooks/useMarks'
import MarksPanel from './MarksPanel'

vi.mock('../../hooks/useMarks', () => ({ useMarks: vi.fn() }))

beforeEach(() => vi.clearAllMocks())

describe('Marks (FR-14)', () => {
  it('shows an empty state instead of a blank panel', () => {
    useMarks.mockReturnValue({ data: [], isPending: false, isError: false })
    render(<MarksPanel />)
    expect(screen.getByText(/No assessments to display yet/)).toBeTruthy()
  })

  it('keeps unmarked assessments distinct from zero', () => {
    useMarks.mockReturnValue({
      isPending: false,
      isError: false,
      data: [{
        root: { id: 1, title: 'ELEC3609' },
        assessments: [
          { id: 3, title: 'Assignment 1', weight_percent: '25.00', mark_achieved: '18.50' },
          { id: 4, title: 'Assignment 2', weight_percent: '30.00', mark_achieved: null },
        ],
        total_weight: '55.00', total_marks: '18.50', unmarked_count: 1,
      }],
    })
    render(<MarksPanel />)
    expect(screen.getByText('ELEC3609')).toBeTruthy()
    expect(screen.getByText('Not marked')).toBeTruthy()
    expect(screen.getByText('18.50')).toBeTruthy()
  })

  it('shows an actionable retry when the API fails', () => {
    const refetch = vi.fn()
    useMarks.mockReturnValue({
      isPending: false, isError: true, error: new Error('Network unavailable'), refetch,
    })
    render(<MarksPanel />)
    expect(screen.getByRole('alert')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(refetch).toHaveBeenCalled()
  })
})
