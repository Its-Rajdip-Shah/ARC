import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import AdminRoute from './AdminRoute'
import StudentRoute from './StudentRoute'
import { useAuthStore } from '../stores/authStore'

function mount(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/login" element={<h1>Sign in</h1>} />
        <Route path="/admin/login" element={<h1>Staff sign in</h1>} />
        <Route path="/admin" element={<h1>Staff home</h1>} />
        <Route path="/" element={<h1>Home</h1>} />
        <Route element={<StudentRoute />}>
          <Route path="/planner" element={<h1>Planner</h1>} />
        </Route>
        <Route element={<AdminRoute />}>
          <Route path="/admin/overview" element={<h1>Overview</h1>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  useAuthStore.getState().clearSession()
})

afterEach(() => {
  cleanup()
  useAuthStore.getState().clearSession()
})

test('a visitor with no session is sent to student sign-in', () => {
  mount('/planner')
  expect(screen.getByRole('heading', { name: 'Sign in' })).toBeTruthy()
})

test('a refresh token is enough to enter the student planner', () => {
  useAuthStore.setState({ refreshToken: 'refresh' })
  mount('/planner')
  expect(screen.getByRole('heading', { name: 'Planner' })).toBeTruthy()
})

test('an administrator session does not stay on a student page', () => {
  useAuthStore.setState({
    accessToken: 'access',
    refreshToken: 'refresh',
    user: { is_admin: true },
  })
  mount('/planner')
  expect(screen.getByRole('heading', { name: 'Staff home' })).toBeTruthy()
})

test('staff pages without an access token go to the staff sign-in', () => {
  mount('/admin/overview')
  expect(screen.getByRole('heading', { name: 'Staff sign in' })).toBeTruthy()
})

test('a staff access token waits until the profile is restored', () => {
  useAuthStore.setState({ accessToken: 'access' })
  mount('/admin/overview')
  expect(screen.getByText('Restoring your staff session…')).toBeTruthy()
})

test('a student access token cannot open a staff page', () => {
  useAuthStore.setState({
    accessToken: 'access',
    user: { is_admin: false },
  })
  mount('/admin/overview')
  expect(screen.getByRole('heading', { name: 'Home' })).toBeTruthy()
})

test('an administrator with a profile reaches the staff page', () => {
  useAuthStore.setState({
    accessToken: 'access',
    user: { is_admin: true },
  })
  mount('/admin/overview')
  expect(screen.getByRole('heading', { name: 'Overview' })).toBeTruthy()
})
