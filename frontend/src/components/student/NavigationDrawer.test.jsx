import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import NavigationDrawer from './NavigationDrawer'

function setup(path = '/planner') {
  const onClose = vi.fn()
  const onOpenDialog = vi.fn()
  render(
    <MemoryRouter initialEntries={[path]}>
      <NavigationDrawer isOpen onClose={onClose} onOpenDialog={onOpenDialog} />
    </MemoryRouter>,
  )
  return { onClose, onOpenDialog }
}

describe('student drawer', () => {
  it('opens the Marks dialog, rather than navigating to a dead destination', () => {
    const { onClose, onOpenDialog } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Marks' }))
    expect(onOpenDialog).toHaveBeenCalledWith('marks')
    expect(onClose).toHaveBeenCalled()
  })

  it('provides distinct Account and Canvas Sync entries', () => {
    const { onOpenDialog } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Account' }))
    expect(onOpenDialog).toHaveBeenCalledWith('account')
    fireEvent.click(screen.getByRole('button', { name: 'Sync' }))
    expect(onOpenDialog).toHaveBeenCalledWith('sync')
  })

  it('marks Priority as the current planning page', () => {
    setup('/priority')
    expect(screen.getByRole('button', { name: 'Priority' }).getAttribute('aria-current')).toBe('page')
    expect(screen.getByRole('button', { name: 'Canvas settings' })).toBeTruthy()
  })

  it('closes on Escape and marks only the active page', () => {
    const { onClose } = setup('/planner')
    expect(screen.getByRole('button', { name: 'Planner' }).getAttribute('aria-current')).toBe('page')
    expect(screen.getByRole('button', { name: 'Timeline' }).getAttribute('aria-current')).toBe(null)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })
})
