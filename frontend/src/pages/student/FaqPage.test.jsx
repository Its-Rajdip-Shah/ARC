import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { expect, it } from 'vitest'

import FaqPage from './FaqPage'

it('explains how to create a Canvas token and links the ARC settings page', () => {
  render(
    <MemoryRouter>
      <FaqPage />
    </MemoryRouter>,
  )

  expect(screen.getByRole('heading', { name: 'FAQ' })).toBeTruthy()
  expect(screen.getByRole('link', { name: 'Canvas account settings' }).getAttribute('href')).toBe(
    'https://canvas.sydney.edu.au/profile/settings',
  )
  expect(screen.getByRole('link', { name: 'Canvas settings in ARC' }).getAttribute('href')).toBe(
    '/settings?tab=integration',
  )
  expect(screen.getByText('What is ARC?')).toBeTruthy()
  expect(screen.getByText(/stores the token encrypted/)).toBeTruthy()
})
