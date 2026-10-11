import React from 'react'
import { fireEvent, render, screen, waitFor, cleanup } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

const api = vi.hoisted(() => ({ createItem: vi.fn(), updateItem: vi.fn(), listTags: vi.fn(), createTag: vi.fn(), listPrerequisites: vi.fn(), listItems: vi.fn(), addPrerequisite: vi.fn(), removePrerequisite: vi.fn() }))
vi.mock('../../../api/planning', () => api)
import CreatePlanningItemPanel from './CreatePlanningItemPanel'

const item = { id: 2, title: 'Task', item_type: 'TASK', start_date: null, due_date: null, duration_category: 'UNDER_8_HOURS', percent_completed: 25, remaining_fraction: '0.75', tags: [] }
function mount(props = {}) {
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(<QueryClientProvider client={cache}><CreatePlanningItemPanel {...props} /></QueryClientProvider>)
  return cache
}
afterEach(cleanup)
beforeEach(() => {
  vi.resetAllMocks()
  api.listTags.mockResolvedValue([{ id: 7, name: 'Study' }])
  api.listPrerequisites.mockResolvedValue([])
  api.listItems.mockResolvedValue({ results: [{ id: 2, title: 'Task' }, { id: 3, title: 'Prerequisite' }] })
  api.createItem.mockResolvedValue({ id: 10 })
  api.updateItem.mockResolvedValue(item)
})

test('child defaults inherit dates and tags; explicit clearing sends null without mutating parent', async () => {
  const parent = { start_date: '2026-11-01', due_date: '2026-11-05', tags: [{ id: 7, name: 'Study' }] }
  mount({ parentId: 1, parentItem: parent })
  expect(screen.getByLabelText('Start:').value).toBe(parent.start_date)
  expect(screen.getByLabelText('Due:').value).toBe(parent.due_date)
  fireEvent.change(screen.getByPlaceholderText('title...'), { target: { value: 'Child' } })
  fireEvent.change(screen.getByLabelText('Start:'), { target: { value: '' } })
  fireEvent.change(screen.getByLabelText('Due:'), { target: { value: '' } })
  fireEvent.click(screen.getByText('CREATE'))
  await waitFor(() => expect(api.createItem).toHaveBeenCalled())
  expect(api.createItem.mock.calls[0][0]).toMatchObject({ parent: 1, start_date: null, due_date: null, tag_ids: [7] })
  expect(parent.start_date).toBe('2026-11-01')
})

test('invalid date range is visible and blocks save', () => {
  mount({ editingItem: item })
  fireEvent.change(screen.getByLabelText('Start:'), { target: { value: '2026-11-06' } })
  fireEvent.change(screen.getByLabelText('Due:'), { target: { value: '2026-11-05' } })
  expect(screen.getByRole('alert').textContent).toContain('Due date cannot')
  expect(screen.getByText('SAVE').disabled).toBe(true)
  fireEvent.submit(screen.getByText('SAVE').closest('form'))
  expect(api.updateItem).not.toHaveBeenCalled()
})

test('edit uses its own null dates, shows progress, removes tags, and surfaces server errors', async () => {
  api.updateItem.mockRejectedValue({ response: { data: { due_date: ['Rejected deadline'] } } })
  mount({ editingItem: { ...item, tags: [{ id: 7, name: 'Study' }] }, parentItem: { start_date: '2026-11-01' } })
  expect(screen.getByLabelText('Start:').value).toBe('')
  expect(screen.getByRole('status').textContent).toContain('75%')
  fireEvent.click(await screen.findByText('Study'))
  fireEvent.click(screen.getByText('SAVE'))
  await screen.findByRole('alert')
  expect(screen.getByRole('alert').textContent).toContain('Rejected deadline')
  expect(api.updateItem.mock.calls[0]).toEqual([2, expect.objectContaining({ tag_ids: [], start_date: null, due_date: null })])
  expect(screen.getByText('Manage prerequisites').disabled).toBe(true)
})

test('prerequisites save independently, exclude self and duplicate edges, and show errors', async () => {
  api.listPrerequisites.mockResolvedValue([{ id: 4, title: 'Existing' }])
  api.listItems.mockResolvedValue({ results: [item, { id: 4, title: 'Existing' }, { id: 3, title: 'Prerequisite' }] })
  api.addPrerequisite.mockRejectedValue({ response: { data: { detail: ['This dependency would create a cycle.'] } } })
  api.removePrerequisite.mockResolvedValue([])
  mount({ editingItem: item })
  fireEvent.click(screen.getByText('Manage prerequisites'))
  expect(screen.queryByText('SAVE')).toBeNull()
  await screen.findByText('Remove Existing')
  fireEvent.change(screen.getByLabelText('Search prerequisites'), { target: { value: 'p' } })
  await screen.findByRole('option', { name: 'Prerequisite' })
  expect(screen.queryByRole('option', { name: 'Task' })).toBeNull()
  expect(screen.queryByRole('option', { name: 'Existing' })).toBeNull()
  fireEvent.change(screen.getByLabelText('Select prerequisite'), { target: { value: '3' } })
  fireEvent.click(screen.getByText('Add prerequisite'))
  await screen.findByRole('alert')
  expect(screen.getByRole('alert').textContent).toContain('cycle')
  expect(api.addPrerequisite).toHaveBeenCalledWith(2, 3)
  expect(api.updateItem).not.toHaveBeenCalled()
  fireEvent.click(screen.getByText('Remove Existing'))
  await waitFor(() => expect(api.removePrerequisite).toHaveBeenCalledWith(2, 4))
})

test('creating a tag selects it for task save and pending save blocks repeats', async () => {
  api.createTag.mockResolvedValue({ id: 8, name: 'New' })
  api.createItem.mockReturnValue(new Promise(() => {}))
  mount()
  fireEvent.change(screen.getByPlaceholderText('title...'), { target: { value: 'New task' } })
  fireEvent.change(screen.getByPlaceholderText('tags...'), { target: { value: 'New' } })
  fireEvent.click(screen.getByLabelText('Add tag'))
  await waitFor(() => expect(screen.getByPlaceholderText('tags...').value).toBe(''))
  fireEvent.click(screen.getByText('CREATE'))
  await screen.findByText('CREATING...')
  expect(screen.getByText('CREATING...').disabled).toBe(true)
  expect(api.createItem.mock.calls[0][0].tag_ids).toEqual([8])
})

test('create errors remain visible and editing stays pending until saved', async () => {
  api.createItem.mockRejectedValue({ response: { data: { title: ['Rejected task'] } } })
  mount()
  fireEvent.change(screen.getByPlaceholderText('title...'), { target: { value: 'Task' } })
  fireEvent.click(screen.getByText('CREATE'))
  await screen.findByRole('alert')
  expect(screen.getByRole('alert').textContent).toContain('Rejected task')
  cleanup()
  api.updateItem.mockReturnValue(new Promise(() => {}))
  mount({ editingItem: item })
  fireEvent.click(screen.getByText('SAVE'))
  await screen.findByText('SAVING...')
  expect(screen.getByText('SAVING...').disabled).toBe(true)
  expect(screen.getByText('Manage prerequisites').disabled).toBe(true)
})
