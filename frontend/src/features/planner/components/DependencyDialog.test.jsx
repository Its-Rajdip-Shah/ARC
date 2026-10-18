import React from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import DependencyDialog from './DependencyDialog'
import * as api from '../../../api/planning'

vi.mock('../../../api/planning', () => ({
  addPrerequisite: vi.fn(),
  listItems: vi.fn(),
  listPrerequisites: vi.fn(),
}))

const fixed = { id: 1, title: 'Fixed task', children: [] }
const other = { id: 2, title: 'Write report', children: [] }
const tree = [{ id: 10, title: 'Semester', children: [{ id: 11, title: 'ELEC3609', children: [other] }, fixed] }]

function mount({ prerequisites = [], candidates = [fixed, other, { id: 3, title: 'Other work' }], ...props } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  api.listItems.mockResolvedValue({ results: candidates })
  api.listPrerequisites.mockResolvedValue(prerequisites)
  return render(<QueryClientProvider client={client}><DependencyDialog fixedTask={fixed} planningTree={tree} onClose={vi.fn()} onCreated={vi.fn()} {...props} /></QueryClientProvider>)
}

afterEach(() => { cleanup(); vi.clearAllMocks() })

it('keeps the clicked task in the fixed first slot while selecting and reversing direction', async () => {
  mount()
  await screen.findByRole('button', { name: /Write report/ })
  fireEvent.click(screen.getByRole('button', { name: /Write report/ }))
  expect(screen.getByLabelText('Dependency direction').textContent).toContain('Fixed task')
  expect(screen.getByLabelText('Dependency direction').textContent).toContain('Write report')
  fireEvent.click(screen.getByRole('button', { name: 'Reverse dependency direction' }))
  expect(screen.getByLabelText('Dependency direction').textContent).toContain('Fixed task')
  expect(screen.getByLabelText('Dependency direction').textContent).toContain('Write report')
  expect(screen.getByText((_, node) => node?.textContent === 'Write report is the predecessor; Fixed task depends on it.')).toBeTruthy()
})

it('shows hierarchy context, title-only search, and supports drag selection', async () => {
  mount()
  await screen.findByText('Semester › ELEC3609')
  fireEvent.change(screen.getByLabelText('Search tasks by title'), { target: { value: 'report' } })
  expect(screen.queryByRole('button', { name: 'Other work' })).toBeNull()
  await screen.findByRole('button', { name: /Write report/ })
  const dataTransfer = { data: {}, setData(type, value) { this.data[type] = value }, getData(type) { return this.data[type] } }
  fireEvent.dragStart(screen.getByRole('button', { name: /Write report/ }), { dataTransfer })
  fireEvent.drop(screen.getByText('Drag a task here to select the other task.'), { dataTransfer })
  expect(screen.getByLabelText('Dependency direction').textContent).toContain('Write report')
})

it('maps normal and reversed directions to the canonical dependent endpoint', async () => {
  const onCreated = vi.fn()
  api.addPrerequisite.mockResolvedValue([])
  mount({ onCreated })
  fireEvent.click(await screen.findByRole('button', { name: /Write report/ }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Create dependency' }).disabled).toBe(false))
  fireEvent.click(screen.getByRole('button', { name: 'Create dependency' }))
  await waitFor(() => expect(api.addPrerequisite).toHaveBeenCalledWith(2, 1))
  await waitFor(() => expect(onCreated).toHaveBeenCalledOnce())
  cleanup(); vi.clearAllMocks()
  mount({ onCreated })
  fireEvent.click(await screen.findByRole('button', { name: /Write report/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Reverse dependency direction' }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Create dependency' }).disabled).toBe(false))
  fireEvent.click(screen.getByRole('button', { name: 'Create dependency' }))
  await waitFor(() => expect(api.addPrerequisite).toHaveBeenCalledWith(1, 2))
})

it('closes without changes on cancel, close, and Escape', async () => {
  for (const action of ['Cancel', 'Close dependency dialog', 'escape']) {
    const onClose = vi.fn()
    mount({ onClose })
    if (action === 'escape') fireEvent.keyDown(window, { key: 'Escape' })
    else fireEvent.click(await screen.findByRole('button', { name: action }))
    expect(onClose).toHaveBeenCalledOnce()
    cleanup()
  }
  expect(api.addPrerequisite).not.toHaveBeenCalled()
})

it('blocks duplicate dependencies and retains selections after a rejected cycle', async () => {
  mount({ prerequisites: [fixed] })
  fireEvent.click(await screen.findByRole('button', { name: /Write report/ }))
  await screen.findByText('This dependency already exists.')
  expect(screen.getByRole('button', { name: 'Create dependency' }).disabled).toBe(true)
  cleanup(); vi.clearAllMocks()
  api.addPrerequisite.mockRejectedValue({ response: { data: { detail: 'This dependency would create a cycle.' } } })
  mount({ candidates: [fixed, other] })
  fireEvent.click(await screen.findByRole('button', { name: /Write report/ }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Create dependency' }).disabled).toBe(false))
  fireEvent.click(screen.getByRole('button', { name: 'Create dependency' }))
  await screen.findByText('This dependency would create a cycle.')
  expect(screen.getByLabelText('Dependency direction').textContent).toContain('Write report')
})

it('prevents duplicate submissions while creation is pending', async () => {
  api.addPrerequisite.mockReturnValue(new Promise(() => {}))
  mount()
  fireEvent.click(await screen.findByRole('button', { name: /Write report/ }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Create dependency' }).disabled).toBe(false))
  fireEvent.click(screen.getByRole('button', { name: 'Create dependency' }))
  await waitFor(() => expect(api.addPrerequisite).toHaveBeenCalledOnce())
  expect(screen.getByRole('button', { name: 'Creating…' }).disabled).toBe(true)
  expect(api.addPrerequisite).toHaveBeenCalledOnce()
})
