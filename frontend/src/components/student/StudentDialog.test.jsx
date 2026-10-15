import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import StudentDialog from './StudentDialog'

describe('student modal accessibility', () => {
  it('has a dialog label and dismisses with Escape', () => {
    const onClose = vi.fn()
    render(<StudentDialog title="Account" onClose={onClose}><button type="button">Test action</button></StudentDialog>)
    const dialog = screen.getByRole('dialog', { name: 'Account' })
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
  })
})
