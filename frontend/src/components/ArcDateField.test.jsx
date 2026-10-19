import React from 'react'
import {
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react'
import {
  afterEach,
  expect,
  it,
  vi,
} from 'vitest'

import ArcDateField from './ArcDateField'

afterEach(() => {
  cleanup()
})

it('renders a compact Timezones date card without extra icons', () => {
  const onChange = vi.fn()

  const { container } = render(
    <ArcDateField
      value="2026-11-08"
      onChange={onChange}
      aria-label="Start timezone"
      monthFormat="short"
      cardMode
    />,
  )

  expect(screen.getByRole('button', {
    name: 'Choose Start timezone',
  }).textContent).toBe('8th Nov 2026')

  expect(container.querySelector('.arc-date-field-card')).toBeTruthy()

  expect(screen.queryByRole('button', {
    name: 'Clear Start timezone',
  })).toBeNull()

  expect(screen.queryByRole('button', {
    name: 'Open calendar for Start timezone',
  })).toBeNull()
})

it('opens the custom calendar from the date card', () => {
  const onChange = vi.fn()

  render(
    <ArcDateField
      value="2026-11-08"
      onChange={onChange}
      aria-label="End timezone"
      monthFormat="short"
      cardMode
    />,
  )

  fireEvent.click(screen.getByRole('button', {
    name: 'Choose End timezone',
  }))

  expect(screen.getByRole('button', {
    name: 'Choose month',
  })).toBeTruthy()

  expect(screen.getByRole('button', {
    name: 'Edit calendar year',
  })).toBeTruthy()

  fireEvent.keyDown(document, { key: 'Escape' })

  expect(screen.queryByRole('button', {
    name: 'Choose month',
  })).toBeNull()
})

it('preserves full month names and clear controls outside card mode', () => {
  const onChange = vi.fn()

  render(
    <ArcDateField
      value="2026-11-08"
      onChange={onChange}
      aria-label="Task due date"
    />,
  )

  expect(screen.getByRole('button', {
    name: 'Choose Task due date',
  }).textContent).toBe('8th November 2026')

  fireEvent.click(screen.getByRole('button', {
    name: 'Clear Task due date',
  }))

  expect(onChange).toHaveBeenCalledWith({
    target: { value: '' },
  })
})

it('shows Select date for empty Timezones cards', () => {
  render(
    <ArcDateField
      value=""
      onChange={vi.fn()}
      aria-label="Start timezone"
      monthFormat="short"
      cardMode
    />,
  )

  expect(screen.getByRole('button', {
    name: 'Choose Start timezone',
  }).textContent).toBe('Select date')
})
