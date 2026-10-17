import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import FocusTaskRow from './FocusTaskRow'

function renderTask(description, overrides = {}) {
  const onTogglePinned = vi.fn()

  const candidate = {
    item_id: 101,
    title: 'Test task',
    description,
    duration_category: 'UNDER_1_HOUR',
    percent_completed: 0,
    ...overrides,
  }

  const view = render(
    <FocusTaskRow
      candidate={candidate}
      today="2026-10-17"
      pinned
      onTogglePinned={onTogglePinned}
      onSetCurrent={vi.fn()}
      onComplete={vi.fn()}
      onAutomatic={vi.fn()}
    />,
  )

  return { ...view, onTogglePinned }
}

describe('Focus task description expansion', () => {
  it('renders short descriptions without a toggle', () => {
    renderTask('Short description')

    expect(screen.getByText('Short description')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Show more' })).toBeNull()
  })

  it('expands and collapses long descriptions without toggling the card', () => {
    const description = 'A'.repeat(200) + ' IMPORTANT END'
    const { onTogglePinned } = renderTask(description)

    expect(screen.queryByText(description)).toBeNull()

    const more = screen.getByRole('button', { name: 'Show more' })
    expect(more.getAttribute('aria-expanded')).toBe('false')

    fireEvent.click(more)

    expect(screen.getByText(description)).toBeTruthy()
    expect(onTogglePinned).not.toHaveBeenCalled()

    const less = screen.getByRole('button', { name: 'Show less' })
    expect(less.getAttribute('aria-expanded')).toBe('true')

    fireEvent.click(less)

    expect(screen.queryByText(description)).toBeNull()
    expect(onTogglePinned).not.toHaveBeenCalled()
  })

  it('maintains independent expansion state for different tasks', () => {
    const first = 'F'.repeat(220)
    const second = 'S'.repeat(220)

    render(
      <>
        <FocusTaskRow
          candidate={{ item_id: 1, title: 'First', description: first }}
          today="2026-10-17"
          pinned
          onTogglePinned={vi.fn()}
          onSetCurrent={vi.fn()}
          onComplete={vi.fn()}
          onAutomatic={vi.fn()}
        />
        <FocusTaskRow
          candidate={{ item_id: 2, title: 'Second', description: second }}
          today="2026-10-17"
          pinned
          onTogglePinned={vi.fn()}
          onSetCurrent={vi.fn()}
          onComplete={vi.fn()}
          onAutomatic={vi.fn()}
        />
      </>,
    )

    fireEvent.click(screen.getAllByRole('button', { name: 'Show more' })[0])

    expect(screen.getByText(first)).toBeTruthy()
    expect(screen.queryByText(second)).toBeNull()
    expect(screen.getAllByRole('button', { name: 'Show more' })).toHaveLength(1)
  })
})
