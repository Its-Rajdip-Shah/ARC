import React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import ArcDateCalendar from './ArcDateCalendar'

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(new Date(2026, 9, 17, 12))
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

it('opens on the selected date and distinguishes today from selection', () => {
  render(
    <ArcDateCalendar
      anchor="2026-10-12"
      onChoose={vi.fn()}
    />,
  )

  expect(screen.getByRole('button', {
    name: 'Choose month',
  }).textContent).toBe('October')

  expect(screen.getByRole('button', {
    name: '2026-10-12',
  }).getAttribute('aria-pressed')).toBe('true')

  expect(screen.getByRole('button', {
    name: '2026-10-17',
  }).dataset.today).toBe('true')
})

it('switches to months, highlights the current month, and returns to days', () => {
  render(
    <ArcDateCalendar
      anchor="2027-02-15"
      onChoose={vi.fn()}
    />,
  )

  fireEvent.click(screen.getByRole('button', {
    name: 'Choose month',
  }))

  expect(screen.getByRole('button', {
    name: 'Select Feb',
  })).toBeTruthy()

  fireEvent.click(screen.getByRole('button', {
    name: 'Select Dec',
  }))

  expect(screen.getByRole('button', {
    name: 'Choose month',
  }).textContent).toBe('December')

  expect(screen.getByRole('button', {
    name: '2027-12-15',
  })).toBeTruthy()
})

it('edits the year without selecting a date', () => {
  const onChoose = vi.fn()

  render(
    <ArcDateCalendar
      anchor="2026-10-12"
      onChoose={onChoose}
    />,
  )

  fireEvent.click(screen.getByRole('button', {
    name: 'Edit calendar year',
  }))

  fireEvent.change(screen.getByRole('textbox', {
    name: 'Calendar year',
  }), {
    target: { value: '2028' },
  })

  fireEvent.blur(screen.getByRole('textbox', {
    name: 'Calendar year',
  }))

  expect(screen.getByRole('button', {
    name: '2028-10-12',
  })).toBeTruthy()

  expect(onChoose).not.toHaveBeenCalled()
})

it('Today navigates without selecting, then day selection emits ISO date', () => {
  const onChoose = vi.fn()

  render(
    <ArcDateCalendar
      anchor="2027-02-15"
      onChoose={onChoose}
    />,
  )

  fireEvent.click(screen.getByRole('button', {
    name: 'Today',
  }))

  expect(screen.getByRole('button', {
    name: '2026-10-17',
  }).dataset.today).toBe('true')

  expect(onChoose).not.toHaveBeenCalled()

  fireEvent.click(screen.getByRole('button', {
    name: '2026-10-20',
  }))

  expect(onChoose).toHaveBeenCalledExactlyOnceWith('2026-10-20')
})
