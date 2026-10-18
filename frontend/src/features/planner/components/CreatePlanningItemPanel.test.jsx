import React from 'react'
import { act, fireEvent, render, screen, waitFor, cleanup } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

const api = vi.hoisted(() => ({ createItem: vi.fn(), updateItem: vi.fn(), listTags: vi.fn(), createTag: vi.fn(), updateTag: vi.fn(), deleteTag: vi.fn(), listPrerequisites: vi.fn(), listItems: vi.fn(), addPrerequisite: vi.fn(), removePrerequisite: vi.fn(), getDependencyGraph: vi.fn(), getPlanningTree: vi.fn(), getPriorityOrder: vi.fn(), reorderPriority: vi.fn(), getHistoryStatus: vi.fn(), undoPlanningAction: vi.fn(), redoPlanningAction: vi.fn(), completeItem: vi.fn(), deleteItem: vi.fn(), moveItem: vi.fn() }))
vi.mock('../../../api/planning', () => api)
vi.mock('../../../lib/calendarDates.js', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, userDateKey: vi.fn(actual.userDateKey) }
})
import { userDateKey } from '../../../lib/calendarDates.js'
import { useAuthStore } from '../../../stores/authStore.js'
import CreatePlanningItemPanel from './CreatePlanningItemPanel'
import DependencyGraphModal, { graphLayout } from './DependencyGraphModal'
import TaskPrerequisites from './TaskPrerequisites'

const saveSubmission = vi.fn()

const item = { id: 2, title: 'Task', item_type: 'TASK', start_date: null, due_date: null, duration_category: 'UNDER_8_HOURS', percent_completed: 25, remaining_fraction: '0.75', tags: [] }
function mount(props = {}) {
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(<QueryClientProvider client={cache}><CreatePlanningItemPanel onSave={saveSubmission} onCreate={({ payload }) => api.createItem(payload)} {...props} /></QueryClientProvider>)
  return cache
}
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})
beforeEach(() => {
  vi.resetAllMocks()
  userDateKey.mockReturnValue('2026-10-12')
  api.listTags.mockResolvedValue([{ id: 7, name: 'Study' }])
  api.getPriorityOrder.mockResolvedValue([{ item_id: 2, position: 1 }])
  api.listPrerequisites.mockResolvedValue([])
  api.listItems.mockResolvedValue({ results: [{ id: 2, title: 'Task' }, { id: 3, title: 'Prerequisite' }] })
  api.getDependencyGraph.mockResolvedValue({ task_id: 2, nodes: [{ id: 2, title: 'Task', item_type: 'TASK' }], edges: [] })
  api.createItem.mockResolvedValue({ id: 10 })
  api.updateItem.mockResolvedValue(item)
  api.updateTag.mockImplementation(async (id, payload) => ({ id, ...payload }))
  api.deleteTag.mockResolvedValue(null)
})

test('untouched creation priority stays outside the item payload and reorder submission', async () => {
  const onCreate = vi.fn()
  mount({ onCreate })
  await waitFor(() => expect(screen.getByLabelText('Priority position').value).toBe('2'))
  fireEvent.change(screen.getByPlaceholderText('title...'), { target: { value: 'Prioritised task' } })
  fireEvent.click(screen.getByRole('button', { name: '<1h' }))
  fireEvent.click(screen.getByText('CREATE'))
  await waitFor(() => expect(onCreate).toHaveBeenCalledOnce())
  expect(onCreate.mock.calls[0][0]).toMatchObject({ priorityPosition: null })
  expect(onCreate.mock.calls[0][0].payload).not.toHaveProperty('priority_position')
})

test('priority input clamps invalid, fractional, and out-of-range values without creating a reorder', async () => {
  const onCreate = vi.fn()
  mount({ onCreate })
  const priority = screen.getByLabelText('Priority position')
  await waitFor(() => expect(priority.value).toBe('2'))
  fireEvent.change(priority, { target: { value: '0' } })
  fireEvent.blur(priority)
  expect(priority.value).toBe('1')
  fireEvent.change(priority, { target: { value: '99' } })
  fireEvent.blur(priority)
  expect(priority.value).toBe('2')
  fireEvent.change(priority, { target: { value: '1.5' } })
  fireEvent.change(screen.getByPlaceholderText('title...'), { target: { value: 'Validated priority' } })
  fireEvent.click(screen.getByRole('button', { name: '<1h' }))
  fireEvent.click(screen.getByText('CREATE'))
  await waitFor(() => expect(onCreate).toHaveBeenCalledOnce())
  expect(onCreate.mock.calls[0][0]).toMatchObject({ priorityPosition: null })
})

test('priority editing starts at the task current priority', async () => {
  mount({ editingItem: { ...item, priority_position: 1 } })
  await waitFor(() => expect(screen.getByLabelText('Priority position').value).toBe('1'))
})

test('only an explicit different eligible edit priority is submitted for reorder', async () => {
  mount({ editingItem: { ...item, priority_position: 2 } })
  const priority = await screen.findByLabelText('Priority position')

  fireEvent.click(screen.getByText('SAVE'))
  await waitFor(() => expect(saveSubmission).toHaveBeenCalledOnce())
  expect(saveSubmission.mock.calls[0][0].priorityPosition).toBeNull()

  cleanup()
  saveSubmission.mockClear()
  mount({ editingItem: { ...item, priority_position: 2 } })
  fireEvent.change(await screen.findByLabelText('Priority position'), { target: { value: '1' } })
  fireEvent.click(screen.getByText('SAVE'))
  await waitFor(() => expect(saveSubmission).toHaveBeenCalledOnce())
  expect(saveSubmission.mock.calls[0][0].priorityPosition).toBe(1)

  cleanup()
  saveSubmission.mockClear()
  mount({ editingItem: item })
  fireEvent.change(await screen.findByLabelText('Priority position'), { target: { value: '1' } })
  fireEvent.click(screen.getByText('SAVE'))
  await waitFor(() => expect(saveSubmission).toHaveBeenCalledOnce())
  expect(saveSubmission.mock.calls[0][0].priorityPosition).toBeNull()
})

test('child defaults inherit dates and tags; explicit clearing sends null without mutating parent', async () => {
  const parent = { start_date: '2026-11-01', due_date: '2026-11-05', tags: [{ id: 7, name: 'Study' }] }
  mount({ parentId: 1, parentItem: parent })
  expect(screen.getByLabelText('Start:').value).toBe(parent.start_date)
  expect(screen.getByLabelText('Due:').value).toBe(parent.due_date)
  fireEvent.change(screen.getByPlaceholderText('title...'), { target: { value: 'Child' } })
  fireEvent.change(screen.getByLabelText('Start:'), { target: { value: '' } })
  fireEvent.change(screen.getByLabelText('Due:'), { target: { value: '' } })
  fireEvent.click(screen.getByRole('button', { name: '<1h' }))
  fireEvent.click(screen.getByText('CREATE'))
  await waitFor(() => expect(api.createItem).toHaveBeenCalled())
  expect(api.createItem.mock.calls[0][0]).toMatchObject({ parent: 1, start_date: null, due_date: null, tag_ids: [7] })
  expect(parent.start_date).toBe('2026-11-01')
})

test('untouched child and inherited edit due dates are omitted to preserve backend provenance', async () => {
  const onCreate = vi.fn()
  const parent = { start_date: null, due_date: '2026-11-05', tags: [] }
  mount({ parentId: 1, parentItem: parent, onCreate })
  fireEvent.change(screen.getByPlaceholderText('title...'), { target: { value: 'Inherited child' } })
  fireEvent.click(screen.getByRole('button', { name: '<1h' }))
  fireEvent.click(screen.getByText('CREATE'))
  await waitFor(() => expect(onCreate).toHaveBeenCalledOnce())
  expect(onCreate.mock.calls[0][0].payload).not.toHaveProperty('due_date')

  cleanup()
  mount({ editingItem: { ...item, due_date: parent.due_date, due_date_inherited: true } })
  fireEvent.click(screen.getByText('SAVE'))
  await waitFor(() => expect(saveSubmission).toHaveBeenCalled())
  expect(saveSubmission.mock.calls.at(-1)[0].payload).not.toHaveProperty('due_date')
})

test('invalid date range is visible and blocks save', () => {
  mount({ editingItem: item })
  fireEvent.change(screen.getByLabelText('Start:'), { target: { value: '2026-11-06' } })
  fireEvent.change(screen.getByLabelText('Due:'), { target: { value: '2026-11-05' } })
  expect(screen.getByRole('alert').textContent).toBe('Due date cannot be earlier than start date.')
  expect(screen.getByText('SAVE').disabled).toBe(true)
  fireEvent.submit(screen.getByText('SAVE').closest('form'))
  expect(saveSubmission).not.toHaveBeenCalled()
})

test('new task with yesterday due date is blocked with an accessible date error', () => {
  mount()
  fireEvent.change(screen.getByPlaceholderText('title...'), { target: { value: 'New task' } })
  fireEvent.click(screen.getByRole('button', { name: '<1h' }))
  const due = screen.getByLabelText('Due:')
  const start = screen.getByLabelText('Start:')
  fireEvent.change(due, { target: { value: '2026-10-11' } })
  const error = screen.getByRole('alert')
  expect(error.textContent).toBe('Due date cannot be earlier than today.')
  expect(due.getAttribute('aria-describedby')).toBe(error.id)
  expect(due.getAttribute('aria-invalid')).toBe('true')
  expect(start.hasAttribute('aria-invalid')).toBe(false)
  expect(start.hasAttribute('aria-describedby')).toBe(false)
  expect(start.hasAttribute('min')).toBe(false)
  expect(due.hasAttribute('min')).toBe(false)
  expect(due.value).toBe('2026-10-11')
  const create = screen.getByRole('button', { name: 'CREATE' })
  expect(create.disabled).toBe(true)
  fireEvent.submit(create.closest('form'))
  expect(api.createItem).not.toHaveBeenCalled()
  fireEvent.change(due, { target: { value: '2026-10-12' } })
  expect(screen.queryByRole('alert')).toBeNull()
  expect(due.hasAttribute('aria-invalid')).toBe(false)
  expect(due.hasAttribute('aria-describedby')).toBe(false)
  expect(create.disabled).toBe(false)
})

test.each(['2026-10-12', '2026-10-13'])('new task with today or tomorrow due date %s can submit', async (due_date) => {
  mount()
  fireEvent.change(screen.getByPlaceholderText('title...'), { target: { value: 'New task' } })
  fireEvent.click(screen.getByRole('button', { name: '<1h' }))
  fireEvent.change(screen.getByLabelText('Due:'), { target: { value: due_date } })
  expect(screen.queryByRole('alert')).toBeNull()
  const create = screen.getByRole('button', { name: 'CREATE' })
  expect(create.disabled).toBe(false)
  fireEvent.click(create)
  await waitFor(() => expect(api.createItem).toHaveBeenCalledOnce())
  expect(api.createItem.mock.calls[0][0]).toMatchObject({ due_date })
})

test('unchanged historical past due date permits unrelated edits', async () => {
  mount({ editingItem: { ...item, due_date: '2026-10-10' } })
  fireEvent.change(screen.getByPlaceholderText('title...'), { target: { value: 'Updated title' } })
  expect(screen.queryByRole('alert')).toBeNull()
  const save = screen.getByRole('button', { name: 'SAVE' })
  expect(save.disabled).toBe(false)
  fireEvent.click(save)
  await waitFor(() => expect(saveSubmission).toHaveBeenCalledWith(expect.objectContaining({ id: item.id, payload: expect.objectContaining({ title: 'Updated title', due_date: '2026-10-10' }) })))
})

test('changing historical due date to another past date blocks save and restoring it clears the error', () => {
  mount({ editingItem: { ...item, due_date: '2026-10-10' } })
  const due = screen.getByLabelText('Due:')
  fireEvent.change(due, { target: { value: '2026-10-11' } })
  const save = screen.getByRole('button', { name: 'SAVE' })
  expect(save.disabled).toBe(true)
  expect(screen.getByRole('alert').textContent).toBe('Due date cannot be earlier than today.')
  fireEvent.submit(save.closest('form'))
  expect(saveSubmission).not.toHaveBeenCalled()
  fireEvent.change(due, { target: { value: '2026-10-10' } })
  expect(save.disabled).toBe(false)
  expect(screen.queryByRole('alert')).toBeNull()
})

test('clearing a historical past due date remains allowed and sends null', async () => {
  mount({ editingItem: { ...item, due_date: '2026-10-10' } })
  fireEvent.change(screen.getByLabelText('Due:'), { target: { value: '' } })
  expect(screen.queryByRole('alert')).toBeNull()
  const save = screen.getByRole('button', { name: 'SAVE' })
  expect(save.disabled).toBe(false)
  fireEvent.click(save)
  await waitFor(() => expect(saveSubmission).toHaveBeenCalledWith(expect.objectContaining({ id: item.id, payload: expect.objectContaining({ due_date: null }) })))
})

test.each([
  ['Australia/Sydney', '2026-10-12T13:30:00Z', '2026-10-12', true],
  ['UTC', '2026-10-12T13:30:00Z', '2026-10-12', false],
  ['America/Los_Angeles', '2026-10-12T00:30:00Z', '2026-10-11', false],
  ['UTC', '2026-10-12T00:30:00Z', '2026-10-11', true],
])('account timezone %s at %s determines whether %s is past due', async (time_zone, instant, due_date, invalid) => {
  const actual = await vi.importActual('../../../lib/calendarDates.js')
  userDateKey.mockImplementation(actual.userDateKey)
  const previousUser = useAuthStore.getState().user
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(instant))
  useAuthStore.setState({ user: { time_zone } })
  try {
    mount()
    fireEvent.change(screen.getByPlaceholderText('title...'), { target: { value: 'Timezone task' } })
    fireEvent.click(screen.getByRole('button', { name: '<1h' }))
    fireEvent.change(screen.getByLabelText('Due:'), { target: { value: due_date } })
    expect(userDateKey).toHaveBeenCalledWith()
    const create = screen.getByRole('button', { name: 'CREATE' })
    expect(create.disabled).toBe(invalid)
    if (invalid) {
      expect(screen.getByRole('alert').textContent).toBe('Due date cannot be earlier than today.')
      fireEvent.submit(create.closest('form'))
      expect(api.createItem).not.toHaveBeenCalled()
    } else {
      expect(screen.queryByRole('alert')).toBeNull()
      fireEvent.click(create)
      await waitFor(() => expect(api.createItem).toHaveBeenCalledOnce())
      expect(api.createItem.mock.calls[0][0]).toMatchObject({ due_date })
    }
  } finally {
    useAuthStore.setState({ user: previousUser })
  }
})

test('edit uses its own null dates, shows progress, removes tags, and surfaces server errors', async () => {
  mount({ editError: { response: { data: { due_date: ['Rejected deadline'] } } }, editingItem: { ...item, tags: [{ id: 7, name: 'Study' }] }, parentItem: { start_date: '2026-11-01' } })
  expect(screen.getByLabelText('Start:').value).toBe('')
  expect(screen.getByRole('status').textContent).toContain('75%')
  fireEvent.click(await screen.findByRole('button', { name: 'Select tag Study' }))
  await waitFor(() =>
    expect(screen.queryByRole('button', { name: 'Unselect tag Study' })).toBeNull(),
  )
  fireEvent.click(screen.getByText('SAVE'))
  await screen.findByRole('alert')
  expect(screen.getByRole('alert').textContent).toContain('Rejected deadline')
  expect(saveSubmission).toHaveBeenCalledWith(expect.objectContaining({ id: 2, payload: expect.objectContaining({ tag_ids: [], start_date: null, due_date: null }) }))
  expect(screen.queryByRole('button', { name: 'Prerequisites' })).toBeNull()
})

test('prerequisites save independently, exclude self and duplicate edges, and show errors', async () => {
  api.listPrerequisites.mockResolvedValue([{ id: 4, title: 'Existing' }])
  api.listItems.mockResolvedValue({ results: [item, { id: 4, title: 'Existing' }, { id: 3, title: 'Prerequisite' }] })
  api.addPrerequisite.mockRejectedValue({ response: { data: { detail: ['This dependency would create a cycle.'] } } })
  api.removePrerequisite.mockResolvedValue([])
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(<QueryClientProvider client={cache}><TaskPrerequisites itemId={item.id} onBack={vi.fn()} /></QueryClientProvider>)
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
  expect(saveSubmission).not.toHaveBeenCalled()
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
  fireEvent.click(screen.getByRole('button', { name: '<1h' }))
  fireEvent.click(screen.getByText('CREATE'))
  expect(screen.getByText('CREATE').disabled).toBe(true)
  fireEvent.submit(screen.getByText('CREATE').closest('form'))
  expect(api.createItem).toHaveBeenCalledOnce()
  expect(api.createItem.mock.calls[0][0].tag_ids).toEqual([8])
})

test('create errors remain visible and SAVE submits immediately without awaiting a backend', async () => {
  mount({ createError: { response: { data: { error: { details: { title: ['Rejected task'] } } } } } })
  fireEvent.change(screen.getByPlaceholderText('title...'), { target: { value: 'Task' } })
  fireEvent.click(screen.getByRole('button', { name: '<1h' }))
  fireEvent.click(screen.getByText('CREATE'))
  await screen.findByRole('alert')
  expect(screen.getByRole('alert').textContent).toContain('Rejected task')
  cleanup()
  api.updateItem.mockReturnValue(new Promise(() => {}))
  mount({ editingItem: item })
  fireEvent.click(screen.getByText('SAVE'))
  expect(saveSubmission).toHaveBeenCalledOnce()
  expect(api.updateItem).not.toHaveBeenCalled()
  expect(screen.getByText('SAVE')).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Prerequisites' })).toBeNull()
})


test('editor omits prerequisites and delegates save without a form-owned mutation', () => {
  const onSave = vi.fn(() => new Promise(() => {}))
  const cache = mount({ editingItem: item, onSave })
  const invalidate = vi.spyOn(cache, 'invalidateQueries')
  expect(screen.queryByRole('button', { name: 'Prerequisites' })).toBeNull()
  fireEvent.click(screen.getByText('SAVE'))
  expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ id: item.id,
    payload: expect.objectContaining({ title: item.title }) }))
  expect(api.updateItem).not.toHaveBeenCalled()
  expect(invalidate).not.toHaveBeenCalled()
})

test('dependency button follows either edge direction and opening it preserves an unsaved title', async () => {
  api.getDependencyGraph.mockResolvedValue({ task_id: 2, nodes: [{ id: 1, title: 'Before', item_type: 'TASK' }, { id: 2, title: 'Task', item_type: 'TASK' }], edges: [{ prerequisite_id: 1, dependent_id: 2 }] })
  mount({ editingItem: item })
  fireEvent.change(screen.getByPlaceholderText('title...'), { target: { value: 'Unsaved title' } })
  fireEvent.click(await screen.findByRole('button', { name: 'Dependencies' }))
  expect(await screen.findByRole('dialog', { name: 'Dependencies' })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Close dependency graph' }))
  expect(screen.getByPlaceholderText('title...').value).toBe('Unsaved title')
  expect(saveSubmission).not.toHaveBeenCalled()
})

test('dependency graph distinguishes matching titles, closes on Escape/backdrop, and lays out branches', async () => {
  const onClose = vi.fn()
  api.getDependencyGraph.mockResolvedValue({ nodes: [{ id: 1, title: 'Matching', item_type: 'TASK' }, { id: 2, title: 'Matching', item_type: 'TASK' }, { id: 3, title: 'End', item_type: 'TASK' }], edges: [{ prerequisite_id: 1, dependent_id: 2 }, { prerequisite_id: 2, dependent_id: 3 }] })
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={cache}><DependencyGraphModal task={item} onClose={onClose} /></QueryClientProvider>)
  expect(await screen.findByLabelText('Dependency graph')).toBeTruthy()
  expect(screen.getByLabelText(/Matching, Root level, task ID 1/)).toBeTruthy()
  expect(screen.getByLabelText(/Matching, Root level, task ID 2/)).toBeTruthy()
  fireEvent.keyDown(window, { key: 'Escape' })
  fireEvent.mouseDown(screen.getByRole('presentation'))
  expect(onClose).toHaveBeenCalledTimes(2)
  const layout = graphLayout([{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }], [{ prerequisite_id: 1, dependent_id: 2 }, { prerequisite_id: 1, dependent_id: 3 }, { prerequisite_id: 2, dependent_id: 4 }, { prerequisite_id: 3, dependent_id: 4 }])
  expect(layout.positions.get(2).y).toBe(layout.positions.get(3).y)
  expect(layout.positions.get(4).y).toBeGreaterThan(layout.positions.get(2).y)
})


const estimates = [
  ['UNDER_20_MINUTES', '<20m'], ['UNDER_1_HOUR', '<1h'], ['UNDER_4_HOURS', '<4h'],
  ['UNDER_8_HOURS', '<8h'], ['UNDER_16_HOURS', '<16h'], ['OVER_16_HOURS', '>16h'],
]

test.each(['Task', 'Assignment'])('new %s cannot submit without an original estimate', (type) => {
  mount()
  fireEvent.click(screen.getByRole('button', { name: type }))
  fireEvent.change(screen.getByPlaceholderText('title...'), { target: { value: 'New item' } })
  const create = screen.getByRole('button', { name: 'CREATE' })
  const feedback = screen.getByRole('status')
  expect(feedback.textContent).toBe('Choose an original estimate.')
  expect(screen.getByRole('group', { name: 'Original estimate' }).getAttribute('aria-describedby')).toBe(feedback.id)
  expect(create.disabled).toBe(true)
  fireEvent.click(create)
  fireEvent.submit(create.closest('form'))
  expect(api.createItem).not.toHaveBeenCalled()
})

test.each(['Task', 'Assignment'])('selecting an estimate enables new %s submission', async (type) => {
  mount()
  fireEvent.click(screen.getByRole('button', { name: type }))
  fireEvent.change(screen.getByPlaceholderText('title...'), { target: { value: 'New item' } })
  fireEvent.click(screen.getByRole('button', { name: '<1h' }))
  expect(screen.queryByText('Choose an original estimate.')).toBeNull()
  const create = screen.getByRole('button', { name: 'CREATE' })
  expect(create.disabled).toBe(false)
  fireEvent.click(create)
  await waitFor(() => expect(api.createItem).toHaveBeenCalledOnce())
  expect(api.createItem.mock.calls[0][0]).toMatchObject({
    item_type: type.toUpperCase(), duration_category: 'UNDER_1_HOUR',
  })
})

test('deselecting the original estimate blocks creation again', () => {
  mount()
  fireEvent.change(screen.getByPlaceholderText('title...'), { target: { value: 'New task' } })
  const estimate = screen.getByRole('button', { name: '<1h' })
  const create = screen.getByRole('button', { name: 'CREATE' })
  fireEvent.click(estimate)
  expect(create.disabled).toBe(false)
  fireEvent.click(estimate)
  expect(estimate.getAttribute('aria-pressed')).toBe('false')
  expect(create.disabled).toBe(true)
  expect(screen.getByRole('status').textContent).toBe('Choose an original estimate.')
  fireEvent.submit(create.closest('form'))
  expect(api.createItem).not.toHaveBeenCalled()
})

test.each([null, undefined, ''])('historical item with estimate %s can save unrelated edits', async (duration_category) => {
  mount({ editingItem: { ...item, duration_category } })
  fireEvent.change(screen.getByPlaceholderText('title...'), { target: { value: 'Updated title' } })
  expect(screen.queryByText('Choose an original estimate.')).toBeNull()
  const save = screen.getByRole('button', { name: 'SAVE' })
  expect(save.disabled).toBe(false)
  fireEvent.click(save)
  await waitFor(() => expect(saveSubmission).toHaveBeenCalledWith(expect.objectContaining({ id: item.id, payload: expect.objectContaining({ title: 'Updated title' }) })))
  expect(saveSubmission.mock.calls[0][0].payload).not.toHaveProperty('duration_category')
  expect(api.createItem).not.toHaveBeenCalled()
})

test('all six original estimate categories remain available when creating', () => {
  mount()
  const selector = screen.getByRole('group', { name: 'Original estimate' })
  expect([...selector.querySelectorAll('button')].map((button) => button.textContent.trim())).toEqual(estimates.map(([, label]) => label))
})

test.each(estimates.slice(0, 3))('progress is hidden for %s, including the 240-minute boundary', (duration_category) => {
  mount({ editingItem: { ...item, duration_category } })
  expect(screen.queryByRole('status')).toBeNull()
})

test.each(estimates.slice(3))('progress is compact above 240 minutes for %s and uses canonical computed percentages', (duration_category) => {
  mount({ editingItem: { ...item, duration_category, percent_completed: '37.5', remaining_fraction: '0.607' } })
  expect(screen.getByRole('status').textContent).toBe('Progress 37.5% · Remaining 61%')
  expect(screen.queryByText(/Progress is maintained/)).toBeNull()
})

test('progress visibility responds immediately to estimate edits and deselection', () => {
  mount({ editingItem: { ...item, duration_category: 'UNDER_4_HOURS' } })
  expect(screen.queryByRole('status')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '<8h' }))
  expect(screen.getByRole('status').textContent).toBe('Progress 25% · Remaining 75%')
  fireEvent.click(screen.getByRole('button', { name: '<8h' }))
  expect(screen.queryByRole('status')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '>16h' }))
  expect(screen.getByRole('status')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: '<1h' }))
  expect(screen.queryByRole('status')).toBeNull()
})

test('estimate selector retains all six options in the required row-major three-column order', () => {
  mount({ editingItem: item })
  const selector = screen.getByRole('group', { name: 'Original estimate' })
  expect([...selector.querySelectorAll('button')].map((button) => button.textContent.trim())).toEqual(estimates.map(([, label]) => label))
  expect(selector.classList.contains('grid')).toBe(true)
  expect(selector.classList.contains('grid-cols-3')).toBe(true)
  expect(selector.querySelector('[aria-pressed="true"]').textContent.trim()).toBe('<8h')
})

test.each(estimates)('selecting %s saves its unchanged canonical estimate value', async (duration_category, label) => {
  mount({ editingItem: { ...item, duration_category: null } })
  const button = screen.getByRole('button', { name: label })
  expect(button.type).toBe('button')
  fireEvent.click(button)
  expect(button.getAttribute('aria-pressed')).toBe('true')
  fireEvent.click(screen.getByText('SAVE'))
  await waitFor(() => expect(saveSubmission).toHaveBeenCalledWith(expect.objectContaining({ id: item.id, payload: expect.objectContaining({ duration_category }) })))
})

test('missing remaining work is not manufactured from the completion percentage', () => {
  mount({ editingItem: { ...item, remaining_fraction: null } })
  expect(screen.getByRole('status').textContent).toBe('Progress 25%')
})

test.runIf(process.env.EDITOR_BROWSER_TESTS === '1')('estimate grid has two equal-width rows without horizontal overflow in the actual editor', async () => {
  const { chromium } = await import('@playwright/test')
  const { readFileSync, readdirSync } = await import('node:fs')
  const { resolve, join } = await import('node:path')
  const assets = resolve('dist/assets')
  const css = readdirSync(assets).filter((name) => name.endsWith('.css')).map((name) => readFileSync(join(assets, name), 'utf8')).join('\n')
  mount({ editingItem: item })
  const html = screen.getByText('SAVE').closest('aside').outerHTML
  const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN })
  try {
    const page = await browser.newPage({ viewport: { width: 320, height: 900 } })
    await page.setContent(`<style>${css}</style>${html}`)
    const geometry = await page.evaluate(() => {
      const panel = document.querySelector('aside')
      const grid = document.querySelector('[aria-label="Original estimate"]')
      const buttons = [...grid.children].map((node) => {
        const rect = node.getBoundingClientRect()
        return { width: rect.width, top: rect.top, left: rect.left, right: rect.right }
      })
      return { display: getComputedStyle(grid).display, columns: getComputedStyle(grid).gridTemplateColumns.split(' '), panelWidth: panel.clientWidth, panelScroll: panel.scrollWidth, gridWidth: grid.clientWidth, gridScroll: grid.scrollWidth, buttons }
    })
    expect(geometry.display).toBe('grid')
    expect(geometry.columns).toHaveLength(3)
    expect(new Set(geometry.buttons.map((button) => button.top)).size).toBe(2)
    expect(geometry.buttons[0].top).toBe(geometry.buttons[2].top)
    expect(geometry.buttons[3].top).toBe(geometry.buttons[5].top)
    expect(geometry.buttons[3].top).toBeGreaterThan(geometry.buttons[0].top)
    expect(geometry.buttons.every((button) => Math.abs(button.width - geometry.buttons[0].width) < 1)).toBe(true)
    expect(geometry.panelScroll).toBeLessThanOrEqual(geometry.panelWidth)
    expect(geometry.gridScroll).toBeLessThanOrEqual(geometry.gridWidth)
  } finally { await browser.close() }
})

import { MemoryRouter } from 'react-router-dom'
import PlannerPage from '../PlannerPage'
vi.mock('./PlannerSidebar', () => ({ default: () => null }))
vi.mock('../../focus/FocusSchedulerMascot', () => ({ default: () => null }))
vi.mock('./StudyPlanModal', () => ({ default: () => null }))
vi.mock('./PriorityPanel', () => ({ default: () => null }))

function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
async function mountPage() {
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  api.getPlanningTree.mockResolvedValue([{ id: 1, title: 'Parent', is_completed: false, children: [] }])
  api.getHistoryStatus.mockResolvedValue({ can_undo: true, can_redo: true })
  render(<QueryClientProvider client={cache}><MemoryRouter><PlannerPage /></MemoryRouter></QueryClientProvider>)
  await screen.findByText('Parent')
  return cache
}
function fillCreate(title = 'New work') {
  fireEvent.change(screen.getByPlaceholderText('title...'), { target: { value: title } })
  fireEvent.click(screen.getByRole('button', { name: '<1h' }))
}

function openNestedCreate(parentTitle = 'Parent') {
  const card = screen.getByText(parentTitle).closest('[data-arc-planner-card-id]')
  if (!card) throw new Error(`Missing Planner card for ${parentTitle}`)
  fireEvent.mouseEnter(card)
  fireEvent.click(screen.getByRole('button', {
    name: `Create nested item under ${parentTitle}`,
  }))
}

test('valid nested task closes immediately, survives refetch, locks history and reconciles the real ID', async () => {
  const request = deferred()
  api.createItem.mockReturnValue(request.promise)
  const cache = await mountPage()
  openNestedCreate()
  fillCreate()
  fireEvent.click(screen.getByText('CREATE'))
  expect(screen.queryByPlaceholderText('title...')).toBeNull()
  expect(await screen.findByText('New work')).toBeTruthy()
  const pending = cache.getQueryData(['planning', 'tree'])[0].children[0]
  expect(pending.id).toMatch(/^client:create:/)
  expect(pending.parent).toBe(1)
  expect(screen.getByRole('button', { name: 'Undo' }).disabled).toBe(true)
  expect(screen.getByRole('button', { name: 'Redo' }).disabled).toBe(true)
  fireEvent.keyDown(window, { key: 'z', ctrlKey: true })
  expect(api.undoPlanningAction).not.toHaveBeenCalled()
  await act(async () => { await cache.invalidateQueries({ queryKey: ['planning', 'tree'] }) })
  expect(screen.getByText('New work')).toBeTruthy()
  const real = { id: 88, parent: 1, title: 'Server work', children: [] }
  api.getPlanningTree.mockResolvedValue([
    { id: 1, title: 'Parent changed', children: [real] },
  ])
  await act(async () => { request.resolve(real) })
  await screen.findByText('Server work')
  await waitFor(() => expect(screen.getByRole('button', { name: 'Undo' }).disabled).toBe(false))
  expect(cache.getQueryData(['planning', 'tree'])[0].children[0].id).toBe(88)
  expect(screen.queryByText('Pending save')).toBeNull()
})

test('failed child restores every assignment field, shows server errors and retains unrelated changes', async () => {
  const request = deferred()
  api.createItem.mockReturnValueOnce(request.promise)
  const cache = await mountPage()
  fireEvent.mouseEnter(screen.getByText('Parent').closest('[data-arc-planner-card-id]'))
  fireEvent.click(screen.getByRole('button', { name: 'Create nested item under Parent' }))
  fireEvent.click(screen.getByText('Assignment'))
  fillCreate('  Draft assignment  ')
  fireEvent.change(screen.getByPlaceholderText('description...'), { target: { value: '  Exact description  ' } })
  fireEvent.click(await screen.findByRole('button', { name: 'Select tag Study' }))
  await screen.findByRole('button', { name: 'Unselect tag Study' })
  fireEvent.change(screen.getByPlaceholderText('tags...'), { target: { value: 'unfinished tag' } })
  fireEvent.change(screen.getByLabelText('Start:'), { target: { value: '2026-11-01' } })
  fireEvent.change(screen.getByLabelText('Due:'), { target: { value: '2026-11-02' } })
  fireEvent.change(screen.getByLabelText(/Weightage:/), { target: { value: '12.50' } })
  fireEvent.change(screen.getByPlaceholderText('submission link...'), { target: { value: 'https://example.com/submit' } })
  expect(screen.getByRole('button', { name: 'Unselect tag Study' })).toBeTruthy()
  fireEvent.click(screen.getByText('CREATE'))
  await waitFor(() => expect(api.createItem).toHaveBeenCalledOnce())
  const pending = cache.getQueryData(['planning', 'tree'])[0].children[0]
  expect(pending.parent).toBe(1)
  expect(document.querySelector(`[data-item-id="${pending.id}"]`).getAttribute('data-parent-id')).toBe('1')
  act(() => cache.setQueryData(['planning', 'tree'], (tree) => [...tree, { id: 10, title: 'Unrelated', children: [] }]))
  await act(async () => { request.reject({ response: { data: { error: { code: 'validation_error', details: { title: ['Rejected task'] } } } } }) })
  await screen.findByPlaceholderText('title...')
  expect(screen.getByPlaceholderText('title...').value).toBe('  Draft assignment  ')
  expect(screen.getByPlaceholderText('description...').value).toBe('  Exact description  ')
  expect(screen.getByPlaceholderText('tags...').value).toBe('unfinished tag')
  expect(screen.getByLabelText('Start:').value).toBe('2026-11-01')
  expect(screen.getByLabelText('Due:').value).toBe('2026-11-02')
  expect(screen.getByLabelText(/Weightage:/).value).toBe('12.50')
  expect(screen.getByPlaceholderText('submission link...').value).toBe('https://example.com/submit')
  expect(screen.getByRole('button', { name: '<1h' }).getAttribute('aria-pressed')).toBe('true')
  expect(screen.getByRole('alert').textContent).toContain('Rejected task')
  expect(cache.getQueryData(['planning', 'tree'])[0].children).toEqual([])
  expect(cache.getQueryData(['planning', 'tree'])[1].title).toBe('Unrelated')
  fireEvent.click(screen.getByText('CREATE'))
  await waitFor(() => expect(api.createItem).toHaveBeenCalledTimes(2))
  expect(api.createItem.mock.calls[1][0].tag_ids).toEqual([7])
})

test('provisional rows cannot invoke backend actions or structural shortcuts', async () => {
  api.createItem.mockReturnValue(new Promise(() => {}))
  const cache = await mountPage()
  openNestedCreate()
  fillCreate()
  fireEvent.click(screen.getByText('CREATE'))
  const title = await screen.findByText('New work')
  fireEvent.mouseEnter(title.closest('[data-arc-planner-card-id]'))
  for (const name of ['Mark New work complete', 'Edit New work', 'Delete New work', 'Create nested item under New work']) {
    const button = screen.getByRole('button', { name })
    expect(button.disabled).toBe(true)
    fireEvent.click(button)
  }
  fireEvent.doubleClick(title)
  fireEvent.click(title, { ctrlKey: true, detail: 1 })
  fireEvent.keyDown(window, { key: 'Delete', ctrlKey: true })
  fireEvent.keyDown(window, { key: 'Tab' })
  expect(api.completeItem).not.toHaveBeenCalled()
  expect(api.deleteItem).not.toHaveBeenCalled()
  expect(api.moveItem).not.toHaveBeenCalled()
  expect(screen.queryByPlaceholderText('title...')).toBeNull()
  expect(cache.getQueryData(['planning', 'tree'])[0].children[0].is_provisional).toBe(true)
})

test('failure preserves a newer panel and offers explicit recovery', async () => {
  const request = deferred()
  api.createItem.mockReturnValue(request.promise)
  await mountPage()
  openNestedCreate()
  fillCreate('Earlier draft')
  fireEvent.click(screen.getByText('CREATE'))
  await waitFor(() => expect(api.createItem).toHaveBeenCalledOnce())
  fireEvent.doubleClick(screen.getByText('Parent'))
  expect(screen.getByText('SAVE')).toBeTruthy()
  await act(async () => { request.reject(new Error('Offline')) })
  expect(screen.getByText('SAVE')).toBeTruthy()
  expect(screen.getByPlaceholderText('title...').value).toBe('Parent')
  fireEvent.click(await screen.findByRole('button', { name: 'Recover draft: Earlier draft' }))
  expect(screen.getByPlaceholderText('title...').value).toBe('Earlier draft')
  expect(screen.getByRole('alert').textContent).toContain('Offline')
})

test('create submits one immutable payload and raw form snapshot', () => {
  const onCreate = vi.fn()
  mount({ onCreate })
  fillCreate('  Raw title  ')
  const form = screen.getByText('CREATE').closest('form')
  fireEvent.submit(form)
  fireEvent.submit(form)
  expect(onCreate).toHaveBeenCalledOnce()
  const snapshot = onCreate.mock.calls[0][0]
  expect(snapshot.payload.title).toBe('Raw title')
  expect(snapshot.form.title).toBe('  Raw title  ')
  expect(Object.isFrozen(snapshot.payload)).toBe(true)
  expect(Object.isFrozen(snapshot.form.selectedTagIds)).toBe(true)
})

const editForm = {
  itemType: 'ASSIGNMENT', title: '  Edited assignment  ', description: '  Exact description  ',
  tagInput: 'unfinished tag', selectedTagIds: [7], startDate: '2026-11-01', dueDate: '2026-11-02',
  durationCategory: 'UNDER_1_HOUR', weightPercent: '12.50', submissionUrl: 'https://example.com/submit',
}

test('failed EDIT restores all form fields and SAVE passes one immutable snapshot immediately', async () => {
  const onSave = vi.fn(() => new Promise(() => {}))
  mount({ editingItem: item, editDraft: editForm, editError: { response: { data: { title: ['Rejected edit'] } } }, onSave })
  await screen.findByRole('button', { name: 'Unselect tag Study' })
  expect(screen.getByPlaceholderText('title...').value).toBe(editForm.title)
  expect(screen.getByPlaceholderText('description...').value).toBe(editForm.description)
  expect(screen.getByPlaceholderText('tags...').value).toBe(editForm.tagInput)
  expect(screen.getByLabelText('Start:').value).toBe(editForm.startDate)
  expect(screen.getByLabelText('Due:').value).toBe(editForm.dueDate)
  expect(screen.getByLabelText(/Weightage:/).value).toBe(editForm.weightPercent)
  expect(screen.getByPlaceholderText('submission link...').value).toBe(editForm.submissionUrl)
  expect(screen.getByRole('button', { name: '<1h' }).getAttribute('aria-pressed')).toBe('true')
  expect(
    screen.getAllByRole('alert').some(
      (alert) => alert.textContent.includes('Rejected edit'),
    ),
  ).toBe(true)
  const form = screen.getByText('SAVE').closest('form')
  fireEvent.submit(form)
  fireEvent.submit(form)
  expect(onSave).toHaveBeenCalledOnce()
  const submission = onSave.mock.calls[0][0]
  expect(submission.form).toMatchObject(editForm)
  expect(submission.payload).toEqual({ item_type: 'ASSIGNMENT', title: 'Edited assignment', description: 'Exact description',
    tag_ids: [7], start_date: '2026-11-01', due_date: '2026-11-02', duration_category: 'UNDER_1_HOUR',
    assignment_detail: { weight_percent: 12.5, submission_url: editForm.submissionUrl } })
  expect(submission.tags).toEqual([{ id: 7, name: 'Study' }])
  for (const value of [submission.form, submission.form.selectedTagIds, submission.payload, submission.payload.tag_ids, submission.payload.assignment_detail]) {
    expect(Object.isFrozen(value)).toBe(true)
  }
  expect(api.updateItem).not.toHaveBeenCalled()
})

test('SAVE closes before PATCH resolves, survives stale reads, locks history and reconciles server fields', async () => {
  const request = deferred()
  api.updateItem.mockReturnValue(request.promise)
  const cache = await mountPage()
  fireEvent.doubleClick(screen.getByText('Parent'))
  fireEvent.change(screen.getByPlaceholderText('title...'), { target: { value: 'Edited parent' } })
  fireEvent.click(screen.getByText('SAVE'))
  expect(screen.queryByPlaceholderText('title...')).toBeNull()
  expect(cache.getQueryData(['planning', 'tree'])[0].title).toBe('Edited parent')
  await waitFor(() => expect(api.updateItem).toHaveBeenCalledOnce())
  expect(api.updateItem).toHaveBeenCalledWith(1, expect.objectContaining({ title: 'Edited parent' }))
  expect(screen.getByRole('button', { name: 'Undo' }).disabled).toBe(true)
  expect(screen.getByRole('button', { name: 'Redo' }).disabled).toBe(true)
  fireEvent.keyDown(window, { key: 'z', ctrlKey: true })
  expect(api.undoPlanningAction).not.toHaveBeenCalled()
  fireEvent.doubleClick(screen.getByText('Edited parent'))
  expect(screen.queryByPlaceholderText('title...')).toBeNull()
  await act(async () => { await cache.invalidateQueries({ queryKey: ['planning', 'tree'] }) })
  expect(cache.getQueryData(['planning', 'tree'])[0].title).toBe('Edited parent')
  const server = { id: 1, title: 'Server parent', children: [] }
  api.getPlanningTree.mockResolvedValue([server])
  await act(async () => { request.resolve(server) })
  await screen.findByText('Server parent')
  await waitFor(() => expect(screen.getByRole('button', { name: 'Undo' }).disabled).toBe(false))
  expect(screen.queryByPlaceholderText('title...')).toBeNull()
})

test('ordinary due-date edits never invoke priority reorder', async () => {
  api.updateItem.mockResolvedValue({ id: 1, title: 'Parent', due_date: '2026-11-02', children: [] })
  await mountPage()
  fireEvent.doubleClick(screen.getByText('Parent'))
  fireEvent.change(screen.getByLabelText('Due:'), { target: { value: '2026-11-02' } })
  fireEvent.click(screen.getByText('SAVE'))

  await waitFor(() => expect(api.updateItem).toHaveBeenCalledOnce())
  expect(api.reorderPriority).not.toHaveBeenCalled()
})


test('failed SAVE rolls back edited fields, preserves other changes, reopens the draft and permits retry', async () => {
  const request = deferred()
  api.updateItem.mockReturnValueOnce(request.promise)
  const cache = await mountPage()
  fireEvent.doubleClick(screen.getByText('Parent'))
  fireEvent.change(screen.getByPlaceholderText('title...'), { target: { value: '  Preserved title  ' } })
  fireEvent.change(screen.getByPlaceholderText('tags...'), { target: { value: 'unfinished tag' } })
  fireEvent.click(screen.getByText('SAVE'))
  await waitFor(() => expect(api.updateItem).toHaveBeenCalledOnce())
  act(() => cache.setQueryData(['planning', 'tree'], (tree) => [
    { ...tree[0], is_completed: true }, { id: 10, title: 'Unrelated', children: [] },
  ]))
  await act(async () => { request.reject({ response: { data: { title: ['Rejected edit'] } } }) })
  await screen.findByPlaceholderText('title...')
  expect(screen.getByPlaceholderText('title...').value).toBe('  Preserved title  ')
  expect(screen.getByPlaceholderText('tags...').value).toBe('unfinished tag')
  expect(
    screen.getAllByRole('alert').some(
      (alert) => alert.textContent.includes('Rejected edit'),
    ),
  ).toBe(true)
  expect(cache.getQueryData(['planning', 'tree'])[0]).toMatchObject({ title: 'Parent', is_completed: true })
  expect(cache.getQueryData(['planning', 'tree'])[1].title).toBe('Unrelated')
  api.updateItem.mockResolvedValue({ id: 1, title: 'Saved', children: [] })
  fireEvent.click(screen.getByText('SAVE'))
  await waitFor(() => expect(api.updateItem).toHaveBeenCalledTimes(2))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Undo' }).disabled).toBe(false))
  expect(screen.queryByText('Recover edits')).toBeNull()
  expect(screen.queryByPlaceholderText('title...')).toBeNull()
})

test('failed edits survive another editor and CREATE panels until explicit recovery or dismissal', async () => {
  const request = deferred()
  api.updateItem.mockReturnValue(request.promise)
  const cache = await mountPage()
  act(() => cache.setQueryData(['planning', 'tree'], (tree) => [...tree, { id: 3, title: 'Other task', children: [] }]))
  fireEvent.doubleClick(screen.getByText('Parent'))
  fireEvent.change(screen.getByPlaceholderText('title...'), { target: { value: 'Preserved edit' } })
  fireEvent.click(screen.getByText('SAVE'))
  await waitFor(() => expect(api.updateItem).toHaveBeenCalledOnce())
  fireEvent.doubleClick(screen.getByText('Other task'))
  expect(screen.queryByPlaceholderText('title...')).toBeNull()
  openNestedCreate('Other task')
  expect(screen.getByPlaceholderText('title...').value).toBe('')
  await act(async () => { request.reject(new Error('Offline')) })
  expect(screen.getByPlaceholderText('title...').value).toBe('')
  fireEvent.click(screen.getByLabelText('Close task panel'))
  fireEvent.doubleClick(screen.getByText('Other task'))
  expect(screen.getByPlaceholderText('title...').value).toBe('Other task')
  fireEvent.click(screen.getByLabelText('Close task panel'))
  fireEvent.click(screen.getByText('Recover edits'))
  expect(screen.getByPlaceholderText('title...').value).toBe('Preserved edit')
  expect(screen.getByRole('alert').textContent).toContain('Offline')
  fireEvent.click(screen.getByLabelText('Close task panel'))
  fireEvent.click(screen.getByText('Dismiss edit error'))
  expect(screen.queryByText('Recover edits')).toBeNull()
})

test('missing edited task issues no PATCH and preserves the submitted draft with an error', async () => {
  const cache = await mountPage()
  fireEvent.doubleClick(screen.getByText('Parent'))
  act(() => cache.setQueryData(['planning', 'tree'], []))
  fireEvent.click(screen.getByText('SAVE'))
  expect(api.updateItem).not.toHaveBeenCalled()
  expect(screen.getByRole('alert').textContent).toContain('Your edits are preserved')
  expect(screen.getByRole('alert').textContent).toContain('no longer exists')
})

function rowFor(title) {
  return screen.getByText(title).closest('[data-planner-item-id]')
}

function expectPendingBadge(badge) {
  expect(badge.className).toContain('bg-transparent')
  expect(badge.className).toContain('text-[#7c9cde]')
  expect(badge.className).toContain('pointer-events-none')
  expect(badge.querySelector('svg').getAttribute('aria-hidden')).toBe('true')
  expect(badge.querySelector('svg').getAttribute('stroke-width')).toBe('2.2')
  expect(screen.queryByText('Pending save')).toBeNull()
}

test.each(['CREATE', 'SAVE'])('%s badge follows its item ID from pending to confirmed and expires at 1000ms', async (action) => {
  const request = deferred()
  if (action === 'CREATE') api.createItem.mockReturnValue(request.promise)
  else api.updateItem.mockReturnValue(request.promise)
  const cache = await mountPage()
  vi.useFakeTimers()
  if (action === 'CREATE') {
    openNestedCreate()
    fillCreate('New badge')
  } else fireEvent.doubleClick(screen.getByText('Parent'))
  fireEvent.click(screen.getByText(action))
  await act(async () => { await vi.advanceTimersByTimeAsync(0) })
  const tree = cache.getQueryData(['planning', 'tree'])
  const pendingItem = action === 'CREATE' ? tree[0].children[0] : tree[0]
  const badge = screen.getByRole('status', { name: action === 'CREATE' ? 'Creating item' : 'Saving changes' })
  expectPendingBadge(badge)
  expect(badge.closest('[data-planner-item-id]').dataset.plannerItemId).toBe(String(pendingItem.id))
  if (action === 'CREATE') {
    expect(pendingItem.id).toMatch(/^client:create:/)
    expect(rowFor('Parent').querySelector('[role="status"]')).toBeNull()
  } else {
    const complete = screen.getByRole('button', { name: 'Mark Parent complete' })
    expect(complete.disabled).toBe(false)
    expect(complete.getAttribute('aria-pressed')).toBe('false')
    api.completeItem.mockResolvedValue({})
    api.getPlanningTree.mockResolvedValue([{ id: 1, title: 'Parent', is_completed: true, children: [] }])
    fireEvent.click(complete)
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(api.completeItem).toHaveBeenCalledWith(1, { completed: true })
    expect(screen.getByRole('button', { name: 'Reopen Parent' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('status', { name: 'Saving changes' })).toBeTruthy()
  }
  const server = { id: action === 'CREATE' ? 88 : 1, title: 'Confirmed badge', is_completed: action === 'SAVE', children: [] }
  api.getPlanningTree.mockResolvedValue(
    action === 'CREATE'
      ? [{ id: 1, title: 'Parent', children: [{ ...server, parent: 1 }] }]
      : [server],
  )
  await act(async () => { request.resolve(server); await vi.advanceTimersByTimeAsync(0) })
  const confirmed = screen.getByRole('status', { name: 'Changes saved' })
  expect(confirmed.className).toContain('bg-[#7c9cde]')
  expect(confirmed.className).toContain('text-[#171a36]')
  expect(confirmed.getAttribute('title')).toBe('Saved')
  expect(confirmed.closest('[data-planner-item-id]').dataset.plannerItemId).toBe(String(server.id))
  expect(screen.queryByRole('status', { name: /Creating item|Saving changes/ })).toBeNull()
  if (action === 'CREATE') expect(document.querySelector(`[data-planner-item-id="${pendingItem.id}"]`)).toBeNull()
  else expect(screen.getByRole('button', { name: 'Reopen Confirmed badge' }).getAttribute('aria-pressed')).toBe('true')
  await act(async () => { await vi.advanceTimersByTimeAsync(999) })
  expect(screen.getByRole('status', { name: 'Changes saved' })).toBeTruthy()
  await act(async () => { await vi.advanceTimersByTimeAsync(1) })
  expect(screen.queryByRole('status', { name: 'Changes saved' })).toBeNull()
})

test.each(['CREATE', 'SAVE'])('%s failure removes the pending badge', async (action) => {
  const request = deferred()
  if (action === 'CREATE') api.createItem.mockReturnValue(request.promise)
  else api.updateItem.mockReturnValue(request.promise)
  await mountPage()
  if (action === 'CREATE') {
    openNestedCreate()
    fillCreate('Failed badge')
  } else fireEvent.doubleClick(screen.getByText('Parent'))
  fireEvent.click(screen.getByText(action))
  expect(await screen.findByRole('status', { name: action === 'CREATE' ? 'Creating item' : 'Saving changes' })).toBeTruthy()
  await act(async () => { request.reject(new Error('Offline')) })
  await screen.findByPlaceholderText('title...')
  expect(screen.queryByRole('status', { name: /Creating item|Saving changes|Changes saved/ })).toBeNull()
  expect(screen.getByRole('alert').textContent).toContain('Offline')
})

test.each(['success', 'failure'])('global edit lock blocks task B and duplicate SAVE until task A %s', async (outcome) => {
  const request = deferred()
  api.updateItem.mockReturnValue(request.promise)
  const cache = await mountPage()
  const other = { id: 2, title: 'Other task', children: [] }
  act(() => cache.setQueryData(['planning', 'tree'], (tree) => [...tree, other]))
  await screen.findByText('Other task')
  fireEvent.doubleClick(screen.getByText('Parent'))
  const form = screen.getByText('SAVE').closest('form')
  act(() => {
    fireEvent.submit(form)
    fireEvent.submit(form)
    fireEvent.doubleClick(screen.getByText('Other task'))
  })
  await waitFor(() => expect(api.updateItem).toHaveBeenCalledOnce())
  expect(screen.queryByPlaceholderText('title...')).toBeNull()
  fireEvent.mouseEnter(rowFor('Other task').querySelector('[data-arc-planner-card-id]'))
  expect(screen.getByRole('button', { name: 'Edit Other task' }).disabled).toBe(true)
  expect(rowFor('Other task').querySelector('[role="status"]')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Edit Other task' }))
  fireEvent.doubleClick(screen.getByText('Other task'))
  expect(screen.queryByPlaceholderText('title...')).toBeNull()
  expect(screen.getByRole('button', { name: 'Mark Other task complete' }).disabled).toBe(false)
  expect(screen.getByRole('button', { name: 'Create nested item under Other task' }).disabled).toBe(false)
  expect(screen.getByRole('button', { name: 'Undo' }).disabled).toBe(true)
  expect(screen.getByRole('button', { name: 'Redo' }).disabled).toBe(true)
  for (const key of ['z', 'y']) fireEvent.keyDown(window, { key, ctrlKey: true })
  expect(api.undoPlanningAction).not.toHaveBeenCalled()
  expect(api.redoPlanningAction).not.toHaveBeenCalled()
  if (outcome === 'success') {
    const server = { id: 1, title: 'Parent', children: [] }
    api.getPlanningTree.mockResolvedValue([server, other])
    await act(async () => { request.resolve(server) })
  } else {
    await act(async () => { request.reject(new Error('Offline')) })
    await screen.findByPlaceholderText('title...')
    fireEvent.click(screen.getByLabelText('Close task panel'))
  }
  await waitFor(() => expect(screen.getByRole('button', { name: 'Edit Other task' }).disabled).toBe(false))
  fireEvent.click(screen.getByRole('button', { name: 'Edit Other task' }))
  expect(screen.getByPlaceholderText('title...').value).toBe('Other task')
  expect(api.updateItem).toHaveBeenCalledOnce()
})


test('renames a tag without toggling its selection', async () => {
  mount()
  fireEvent.doubleClick(await screen.findByRole('button', { name: 'Select tag Study' }))
  fireEvent.change(screen.getByRole('textbox', { name: 'Rename Study' }), {
    target: { value: 'Revision' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Save rename Study' }))
  await waitFor(() =>
    expect(api.updateTag).toHaveBeenCalledWith(7, { name: 'Revision' }),
  )
  expect(api.deleteTag).not.toHaveBeenCalled()
})

test('canceling tag deletion leaves the tag intact', async () => {
  mount()
  fireEvent.click(await screen.findByRole('button', { name: 'Delete tag Study' }))
  expect(screen.getByRole('alertdialog').textContent).toContain('all tasks')
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(screen.queryByRole('alertdialog')).toBeNull()
  expect(api.deleteTag).not.toHaveBeenCalled()
})

test('tag deletion requires confirmation and removes its selected ID', async () => {
  mount({ editingItem: { ...item, tags: [{ id: 7, name: 'Study' }] } })
  const tagButton = await screen.findByRole('button', { name: 'Select tag Study' })
  expect(tagButton.getAttribute('aria-pressed')).toBe('true')
  fireEvent.click(screen.getByRole('button', { name: 'Delete tag Study' }))
  expect(api.deleteTag).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
  await waitFor(() => expect(api.deleteTag).toHaveBeenCalledWith(7))
  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
  fireEvent.click(screen.getByRole('button', { name: 'SAVE' }))
  expect(saveSubmission).toHaveBeenCalled()
  expect(saveSubmission.mock.calls[0][0].payload.tag_ids).toEqual([])
})

test('failed tag rename displays feedback and preserves edit mode', async () => {
  api.updateTag.mockRejectedValueOnce(new Error('network'))
  mount()
  fireEvent.doubleClick(await screen.findByRole('button', { name: 'Select tag Study' }))
  fireEvent.change(screen.getByRole('textbox', { name: 'Rename Study' }), {
    target: { value: 'Revision' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Save rename Study' }))
  expect(await screen.findByRole('alert')).toHaveProperty(
    'textContent',
    'Could not rename tag. Please try again.',
  )
  expect(screen.getByRole('textbox', { name: 'Rename Study' })).toBeTruthy()
})

test('failed tag deletion keeps confirmation open', async () => {
  api.deleteTag.mockRejectedValueOnce(new Error('network'))
  mount()
  fireEvent.click(await screen.findByRole('button', { name: 'Delete tag Study' }))
  fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
  await waitFor(() => expect(api.deleteTag).toHaveBeenCalledWith(7))
  expect(await screen.findByRole('alert')).toHaveProperty(
    'textContent',
    'Could not delete tag. Please try again.',
  )
  expect(screen.getByRole('alertdialog')).toBeTruthy()
})


test('selected tags appear as removable chips without disabling tag creation', async () => {
  mount({ editingItem: { ...item, tags: [{ id: 7, name: 'Study' }] } })

  const chip = await screen.findByRole('button', { name: 'Unselect tag Study' })
  expect(chip).toBeTruthy()

  const input = screen.getByRole('textbox', { name: 'Tags' })
  fireEvent.change(input, { target: { value: 'New tag' } })
  expect(input.value).toBe('New tag')

  fireEvent.click(chip)

  expect(screen.queryByRole('button', { name: 'Unselect tag Study' })).toBeNull()
  expect(input.value).toBe('New tag')

  fireEvent.click(screen.getByRole('button', { name: 'SAVE' }))
  expect(saveSubmission.mock.calls[0][0].payload.tag_ids).toEqual([])
})

test('single-click adds a chip and its cross unselects without deleting globally', async () => {
  mount()

  fireEvent.click(await screen.findByRole('button', { name: 'Select tag Study' }))
  const chip = await screen.findByRole('button', { name: 'Unselect tag Study' })

  expect(screen.getByRole('button', { name: 'Select tag Study' }).getAttribute('aria-pressed')).toBe('true')

  fireEvent.click(chip)

  expect(screen.queryByRole('button', { name: 'Unselect tag Study' })).toBeNull()
  expect(api.deleteTag).not.toHaveBeenCalled()
})

test('creating a new tag adds a chip and keeps the input usable', async () => {
  api.createTag.mockResolvedValue({ id: 8, name: 'New' })
  api.listTags.mockResolvedValue([
    { id: 7, name: 'Study' },
    { id: 8, name: 'New' },
  ])

  mount()

  const input = screen.getByRole('textbox', { name: 'Tags' })
  fireEvent.change(input, { target: { value: 'New' } })
  fireEvent.click(screen.getByRole('button', { name: 'Add tag' }))

  await screen.findByRole('button', { name: 'Unselect tag New' })
  expect(input.value).toBe('')

  fireEvent.change(input, { target: { value: 'Another' } })
  expect(input.value).toBe('Another')
})


test('assignment weightage outside 0–100 blocks submission', () => {
  mount()
  fireEvent.click(screen.getByRole('button', { name: 'Assignment' }))
  fireEvent.change(screen.getByPlaceholderText('title...'), {
    target: { value: 'Assignment' },
  })
  fireEvent.click(screen.getByRole('button', { name: '<1h' }))
  fireEvent.change(screen.getByLabelText(/Weightage:/), {
    target: { value: '101' },
  })

  expect(screen.getByRole('alert').textContent).toContain(
    'Weightage must be between 0 and 100',
  )
  expect(screen.getByRole('button', { name: 'CREATE' }).disabled).toBe(true)
  expect(api.createItem).not.toHaveBeenCalled()
})

test('invalid assignment submission link blocks submission', () => {
  mount()
  fireEvent.click(screen.getByRole('button', { name: 'Assignment' }))
  fireEvent.change(screen.getByPlaceholderText('title...'), {
    target: { value: 'Assignment' },
  })
  fireEvent.click(screen.getByRole('button', { name: '<1h' }))
  fireEvent.change(screen.getByPlaceholderText('submission link...'), {
    target: { value: 'not-a-url' },
  })

  expect(screen.getByRole('alert').textContent).toContain(
    'Enter a valid http:// or https:// submission link.',
  )
  expect(screen.getByRole('button', { name: 'CREATE' }).disabled).toBe(true)
  expect(api.createItem).not.toHaveBeenCalled()
})
