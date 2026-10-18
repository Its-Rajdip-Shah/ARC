import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { expect, it } from 'vitest'

import NotFoundPage from './NotFoundPage'

it('sends a lost visitor to sign in', () => {
  render(
    <MemoryRouter>
      <NotFoundPage />
    </MemoryRouter>,
  )

  expect(screen.getByRole('link', { name: 'Log in' }).getAttribute('href')).toBe('/login')
})
