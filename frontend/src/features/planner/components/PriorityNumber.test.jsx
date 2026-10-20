import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'

import PriorityNumber from './PriorityNumber'

afterEach(cleanup)

const row = { item_id: 11, title: 'Submit system design report', position: 1 }

test('rejects a priority of 0 instead of silently keeping position 1', () => {
  const onMove = vi.fn()
  render(<PriorityNumber row={row} count={7} onMove={onMove} />)
  fireEvent.click(screen.getByRole('button', { name: 'Edit priority 1 for Submit system design report' }))
  const field = screen.getByRole('textbox', { name: 'Global priority for Submit system design report' })
  fireEvent.change(field, { target: { value: '0' } })
  fireEvent.keyDown(field, { key: 'Enter' })
  expect(screen.getByRole('alert').textContent).toBe('Positions are limited to 1 through 7.')
  expect(onMove).not.toHaveBeenCalled()
})

test('moves to an in-range priority', () => {
  const onMove = vi.fn()
  render(<PriorityNumber row={row} count={7} onMove={onMove} />)
  fireEvent.click(screen.getByRole('button', { name: 'Edit priority 1 for Submit system design report' }))
  const field = screen.getByRole('textbox', { name: 'Global priority for Submit system design report' })
  fireEvent.change(field, { target: { value: '3' } })
  fireEvent.keyDown(field, { key: 'Enter' })
  expect(onMove).toHaveBeenCalledWith(11, 3)
})
