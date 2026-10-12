import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import App from '../../App'
import { readFileSync } from 'node:fs'

import { useAuthStore } from '../../stores/authStore'

const priorityStyles = readFileSync('src/features/planner/components/PriorityPanel.css', 'utf8')
const layoutStyles = readFileSync('src/components/student/StudentLayout.css', 'utf8')

const data = vi.hoisted(() => {
  const roots = [{ id: 1, title: 'Root one', is_completed: false, children: [{ id: 101, title: 'Nested parent', is_completed: false, start_date: '2026-10-12', children: [{ id: 102, title: 'Completed child', is_completed: true, due_date: '2026-10-15', children: [] }] }] }, { id: 2, title: 'Root two', children: [] }]
  const rows = [
    { item_id: 11, title: 'First task', position: 1, root: roots[0] },
    { item_id: 12, title: 'Second task', position: 2, root: roots[0] },
    { item_id: 13, title: 'Other work', position: 3, root: roots[1] },
  ]
  return { roots, rows, reorder: vi.fn(), priorityRefetch: vi.fn(), treeRefetch: vi.fn(), reset: vi.fn(), undo: vi.fn(), redo: vi.fn(), loading: false, reordering: false, success: false }
})
vi.mock('../../components/SessionHydrator', () => ({ default: ({ children }) => children }))
vi.mock('../../pages/student/StudentLoginPage', () => ({ default: () => <h1>Student login</h1> }))
vi.mock('../timeline/TimelinePage', () => ({ default: () => <h1>Existing timeline</h1> }))
vi.mock('../focus/FocusPage', () => ({ default: () => <h1>Existing focus</h1> }))
vi.mock('../../hooks/usePlanningTree', () => ({ usePlanningTree: () => ({ data: data.roots, refetch: data.treeRefetch, isLoading: data.loading, isPending: data.loading }) }))
vi.mock('../../hooks/usePriorityOrder', () => ({
  usePriorityOrder: () => ({ data: data.rows, refetch: data.priorityRefetch }),
  useReorderPriority: () => ({ mutate: data.reorder, reset: data.reset, isPending: data.reordering, isSuccess: data.success }),
}))
vi.mock('../../api/planning', async (importOriginal) => ({
  ...await importOriginal(),
  getHistoryStatus: async () => ({ can_undo: true, can_redo: true }),
  undoPlanningAction: (...args) => data.undo(...args),
  redoPlanningAction: (...args) => data.redo(...args),
}))
// Keep the real sidebar, Priority content, toolbar, cards and DnD. Isolate the
// unrelated tree/editor workflows; give root scrolling a rendered target.
vi.mock('./components/PlannerTree', () => ({ default: ({ items, searchQuery, showOverdue }) => <div aria-label="Planner tree">
  <span>{searchQuery}</span><span>{showOverdue ? 'Overdue only' : 'All roots'}</span>
  {items.map((root) => <div key={root.id} data-planner-item-id={root.id}>{root.title}</div>)}
</div> }))

let client
function open(path = '/priority', authenticated = true) {
  if (authenticated) useAuthStore.getState().setSession({ access: 'test', user: { id: 1, is_admin: false } })
  window.history.replaceState({}, '', path)
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(<QueryClientProvider client={client}><App /></QueryClientProvider>)
}
function switchTo(name) {
  fireEvent.click(within(screen.getByRole('navigation', { name: 'Planning view' })).getByRole('link', { name }))
}
beforeEach(() => {
  useAuthStore.getState().clearSession()
  data.loading = false
  data.reordering = false
  data.success = false
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })))
  data.undo.mockResolvedValue({ can_undo: true, can_redo: true, changed: true })
  data.redo.mockResolvedValue({ can_undo: true, can_redo: true, changed: true })
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() })
})
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); client?.clear(); useAuthStore.getState().clearSession(); vi.restoreAllMocks(); delete HTMLElement.prototype.scrollIntoView })

it('shows four accessible navigation links in order with Priority active', () => {
  open()
  const links = within(screen.getByRole('navigation', { name: 'Planning view' })).getAllByRole('link')
  expect(links.map((link) => link.textContent)).toEqual(['Planner', 'Priority', 'Timeline', 'Focus'])
  expect(links.map((link) => link.getAttribute('href'))).toEqual(['/planner', '/priority', '/timeline', '/focus'])
  expect(links[1].getAttribute('aria-current')).toBe('page')
})

it('retains one viewport-positioned navbar across all four views without remounting it', () => {
  const { container } = open('/planner')
  const style = document.createElement('style')
  style.textContent = layoutStyles
  container.append(style)
  const navbar = screen.getByRole('navigation', { name: 'Planning view' })
  const sharedContainer = navbar.closest('.student-view-nav')
  for (const view of ['Planner', 'Priority', 'Timeline', 'Focus', 'Planner']) {
    switchTo(view)
    expect(screen.getAllByRole('navigation', { name: 'Planning view' })).toEqual([navbar])
    expect(within(navbar).getAllByRole('link')).toHaveLength(4)
    expect(within(navbar).getByRole('link', { name: view }).getAttribute('aria-current')).toBe('page')
    expect(navbar.closest('.student-view-nav')).toBe(sharedContainer)
    const position = getComputedStyle(sharedContainer)
    expect(position.position).toBe('fixed')
    expect(position.left).toBe('50%')
    expect(position.transform).toBe('translateX(-50%)')
    expect(position.top).toBe('var(--student-nav-top)')
    expect(position.width).toBe('calc(100% - 32px)')
    expect(position.maxWidth).toBe('361px')
    expect(container.querySelectorAll('.student-view-nav')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Open navigation menu' }).disabled).toBe(false)
    if (view === 'Planner' || view === 'Priority') {
      expect(screen.getByRole('searchbox').disabled).toBe(false)
    } else {
      expect(screen.getByRole('heading', { name: `Existing ${view.toLowerCase()}` })).toBeTruthy()
    }
  }
  // The responsive second row is shared, with enough clearance for its 26px nav.
  const responsive = Array.from(style.sheet.cssRules).find((rule) => rule.conditionText === '(max-width: 1200px)')
  const variables = responsive.cssRules[0].style
  expect(variables.getPropertyValue('--student-nav-top').trim()).toBe('52px')
  expect(variables.getPropertyValue('--student-header-height').trim()).toBe('80px')
  expect(priorityStyles).not.toContain('.priority-view-nav')
})
it('protects direct Priority entry using the existing student authentication', () => {
  open('/priority', false)
  expect(screen.getByRole('heading', { name: 'Student login' })).toBeTruthy()
  expect(window.location.pathname).toBe('/login')
  expect(screen.queryByRole('navigation', { name: 'Planner navigation' })).toBeNull()
})
it('removes Priority sidebar contents, retains ARC, and fills the viewport header', () => {
  const { container } = open()
  expect(screen.queryByRole('navigation', { name: 'Planner navigation' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Add root' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Overdue' })).toBeNull()
  expect(screen.getByRole('img', { name: 'ARC' }).getAttribute('src')).toContain('arc-logo.svg')
  expect(container.querySelector('header.fixed').className).toContain('left-0')
  expect(container.querySelector('header.fixed').className).toContain('student-header')
  expect(screen.queryByLabelText('Planner tree')).toBeNull()
})
it('retains drag handles, arrow ordering and numeric priority editing', () => {
  open()
  expect(screen.getByRole('button', { name: 'Reorder First task' })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Move First task down' }))
  expect(data.reorder).toHaveBeenCalledWith({ item_id: 11, new_position: 2 })
  fireEvent.click(screen.getByRole('button', { name: 'Edit priority 2 for First task' }))
  const input = screen.getByRole('textbox', { name: 'Global priority for First task' })
  fireEvent.change(input, { target: { value: '1' } })
  fireEvent.keyDown(input, { key: 'Enter' })
  expect(data.reorder).toHaveBeenCalledWith({ item_id: 11, new_position: 1 })
})
it('retains Priority search, match navigation and clear controls', () => {
  open()
  fireEvent.change(screen.getByRole('searchbox', { name: 'Find in shown priority tasks' }), { target: { value: 'Second' } })
  expect(screen.getByText('1 / 1')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Next match' }).disabled).toBe(false)
  fireEvent.click(screen.getByRole('button', { name: 'Next match' }))
  expect(screen.getByRole('article', { name: 'Second task, Root one, priority 2' }).className).toContain('priority-current-match')
  fireEvent.click(screen.getByRole('button', { name: 'Clear find' }))
  expect(screen.getByRole('searchbox').value).toBe('')
})
it('retains undo/redo mutations and keyboard history shortcuts', async () => {
  open()
  await waitFor(() => expect(screen.getByRole('button', { name: 'Undo' }).disabled).toBe(false))
  fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
  await waitFor(() => expect(data.undo).toHaveBeenCalledTimes(1))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Redo' }).disabled).toBe(false))
  fireEvent.click(screen.getByRole('button', { name: 'Redo' }))
  await waitFor(() => expect(data.redo).toHaveBeenCalledTimes(1))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Undo' }).disabled).toBe(false))
  fireEvent.keyDown(window, { key: 'z', ctrlKey: true })
  await waitFor(() => expect(data.undo).toHaveBeenCalledTimes(2))
})
it('removes the Priority slide-out toggle from Planner', () => {
  open('/planner')
  expect(screen.getByLabelText('Planner tree')).toBeTruthy()
  expect(screen.getByRole('navigation', { name: 'Planner navigation' })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Add root' })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Overdue' })).toBeTruthy()
  expect(screen.queryByRole('button', { name: /priority view/i })).toBeNull()
  expect(screen.queryByRole('heading', { name: 'Priority' })).toBeNull()
})
it('retains Planner sidebar root scrolling', async () => {
  open('/planner')
  fireEvent.click(within(screen.getByRole('navigation', { name: 'Planner navigation' })).getByRole('button', { name: 'Root one' }))
  await waitFor(() => expect(window.location.pathname).toBe('/planner'))
  await waitFor(() => expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' }))
  expect(HTMLElement.prototype.scrollIntoView.mock.instances.at(-1).getAttribute('data-planner-item-id')).toBe('1')
})
it('switches Planner and Priority repeatedly while retaining Planner preferences', () => {
  open('/planner')
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'remember search' } })
  for (let index = 0; index < 3; index += 1) {
    switchTo('Priority')
    expect(screen.getByRole('region', { name: 'Priority' })).toBeTruthy()
    expect(screen.queryByRole('navigation', { name: 'Planner navigation' })).toBeNull()
    switchTo('Planner')
    expect(screen.getByRole('searchbox').value).toBe('remember search')
    expect(screen.getByLabelText('Planner tree')).toBeTruthy()
  }
})
it.each([['Timeline', '/timeline'], ['Focus', '/focus']])('keeps the existing %s route with the shared viewport header', (name, path) => {
  const { container } = open()
  switchTo(name)
  expect(window.location.pathname).toBe(path)
  expect(screen.getByRole('heading', { name: `Existing ${name.toLowerCase()}` })).toBeTruthy()
  expect(container.querySelector('header.fixed').className).toContain('student-header')
  expect(container.querySelector('header.fixed').className).toContain('left-0')
  expect(screen.queryByRole('navigation', { name: 'Planner navigation' })).toBeNull()
})

it('waits for the planning tree before scrolling a root requested in Planner', async () => {
  const view = open('/planner')
  data.loading = true
  fireEvent.click(within(screen.getByRole('navigation', { name: 'Planner navigation' })).getByRole('button', { name: 'Root one' }))
  expect(window.location.pathname).toBe('/planner')
  expect(screen.getByText('Loading planner...')).toBeTruthy()
  expect(HTMLElement.prototype.scrollIntoView).not.toHaveBeenCalled()
  data.loading = false
  view.rerender(<QueryClientProvider client={client}><App /></QueryClientProvider>)
  await waitFor(() => expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalledOnce())
})

it('keeps the same Priority search input focused while typing a multi-character query', () => {
  open()
  const input = screen.getByRole('searchbox', { name: 'Find in shown priority tasks' })
  input.focus()
  for (const query of ['S', 'Se', 'Sec', 'Seco', 'Secon', 'Second']) {
    fireEvent.change(input, { target: { value: query } })
    expect(screen.getByRole('searchbox')).toBe(input)
    expect(document.activeElement).toBe(input)
    expect(input.value).toBe(query)
  }
  expect(screen.getByText('1 / 1')).toBeTruthy()
  expect(screen.getByRole('article', { name: 'Second task, Root one, priority 2' }).className).toContain('priority-current-match')
})

it('navigates search matches with Enter, Shift+Enter and buttons without stealing input focus', () => {
  open()
  const input = screen.getByRole('searchbox')
  input.focus()
  fireEvent.change(input, { target: { value: 'task' } })
  expect(screen.getByText('1 / 2')).toBeTruthy()
  fireEvent.keyDown(input, { key: 'Enter' })
  expect(screen.getByText('2 / 2')).toBeTruthy()
  expect(document.activeElement).toBe(input)
  fireEvent.keyDown(input, { key: 'Enter', shiftKey: true })
  expect(screen.getByText('1 / 2')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Next match' }))
  expect(screen.getByText('2 / 2')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Previous match' }))
  expect(screen.getByText('1 / 2')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Clear find' }))
  expect(input.value).toBe('')
  expect(screen.queryByText('1 / 2')).toBeNull()
})


it('caps and centers the responsive toolbar, removes the title and retains the header', () => {
  const { container } = open()
  const style = document.createElement('style')
  style.textContent = priorityStyles
  container.append(style)
  const toolbar = screen.getByRole('group', { name: 'Priority tools' })
  expect(getComputedStyle(toolbar).maxWidth).toBe('900px')
  expect(getComputedStyle(toolbar).width).toBe('100%')
  expect(getComputedStyle(toolbar.parentElement).marginLeft).toBe('auto')
  expect(getComputedStyle(toolbar.parentElement).marginRight).toBe('auto')
  expect(getComputedStyle(toolbar.parentElement).width).toBe('calc(100% - 64px)')
  expect(priorityStyles).toContain('width: calc(100% - 24px)')
  expect(container.querySelector('.priority-board').closest('.priority-toolbar-area')).toBeNull()
  const input = screen.getByRole('searchbox')
  input.focus()
  expect(getComputedStyle(input).outline).toBe('none')
  expect(screen.queryByRole('heading', { name: 'Priority' })).toBeNull()
  expect(screen.getByRole('region', { name: 'Priority' })).toBeTruthy()
  expect(screen.getByRole('img', { name: 'ARC' })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Open navigation menu' })).toBeTruthy()
})

it('keeps the saved confirmation near the toolbar without a layout row and preserves reset timing', () => {
  vi.useFakeTimers()
  data.success = true
  const { container } = open()
  const style = document.createElement('style')
  style.textContent = priorityStyles
  container.append(style)
  const feedback = screen.getByText('Priority saved.')
  expect(feedback.parentElement).toBe(screen.getByRole('group', { name: 'Priority tools' }).parentElement)
  expect(feedback.getAttribute('role')).toBe('status')
  expect(feedback.getAttribute('aria-live')).toBe('polite')
  expect(getComputedStyle(feedback).position).toBe('absolute')
  act(() => vi.advanceTimersByTime(2199))
  expect(data.reset).not.toHaveBeenCalled()
  act(() => vi.advanceTimersByTime(1))
  expect(data.reset).toHaveBeenCalledOnce()
})

function shownTasks() {
  return within(screen.getByRole('list', { name: 'Global priority order' }))
    .getAllByRole('article').map((card) => card.getAttribute('aria-label'))
}
function rootButton(name = 'Root one') {
  return screen.getByRole('button', { name })
}
function leaveHeadings() {
  fireEvent.pointerLeave(rootButton().parentElement)
}

it('previews exactly the clicked filter and restores all rows on leaving the heading region', () => {
  vi.useFakeTimers()
  const { container } = open()
  const all = shownTasks()
  const first = rootButton()
  fireEvent.pointerEnter(first)
  act(() => vi.advanceTimersByTime(400))
  const preview = shownTasks()
  expect(preview).toHaveLength(2)
  expect(first.getAttribute('aria-pressed')).toBe('false')
  expect(screen.queryByText('Other work')).toBeNull()
  expect(container.querySelector('.priority-root-preview')).toBeNull()
  expect(screen.queryByRole('region', { name: /hierarchy preview/ })).toBeNull()
  expect(screen.queryByText('Completed child')).toBeNull()
  leaveHeadings()
  expect(shownTasks()).toEqual(all)
  fireEvent.click(first)
  expect(shownTasks()).toEqual(preview)
  expect(first.getAttribute('aria-pressed')).toBe('true')
  leaveHeadings()
  expect(shownTasks()).toEqual(preview)
  expect(data.reorder).not.toHaveBeenCalled()
  expect(data.priorityRefetch).not.toHaveBeenCalled()
  expect(data.treeRefetch).not.toHaveBeenCalled()
})

it('previews between roots without changing commitment or clearing in the heading gap', () => {
  vi.useFakeTimers()
  open()
  const first = rootButton()
  const second = rootButton('Root two')
  fireEvent.click(first)
  const committed = shownTasks()
  fireEvent.pointerEnter(first)
  expect(shownTasks()).toEqual(committed)
  fireEvent.pointerLeave(first, { relatedTarget: first.parentElement })
  expect(shownTasks()).toEqual(committed)
  fireEvent.pointerEnter(second)
  act(() => vi.advanceTimersByTime(400))
  expect(shownTasks()).toHaveLength(1)
  expect(screen.getByText('Other work')).toBeTruthy()
  expect(first.getAttribute('aria-pressed')).toBe('true')
  expect(second.getAttribute('aria-pressed')).toBe('false')
  leaveHeadings()
  expect(shownTasks()).toEqual(committed)
  fireEvent.pointerEnter(second)
  fireEvent.click(second)
  leaveHeadings()
  expect(screen.queryByText('First task')).toBeNull()
  expect(second.getAttribute('aria-pressed')).toBe('true')
  fireEvent.pointerEnter(second)
  fireEvent.click(second)
  expect(shownTasks()).toHaveLength(3)
  expect(window.location.pathname).toBe('/priority')
  expect(data.reorder).not.toHaveBeenCalled()
  expect(data.priorityRefetch).not.toHaveBeenCalled()
  expect(data.treeRefetch).not.toHaveBeenCalled()
})

it('previews on keyboard focus, restores on blur, and cancels with Escape', () => {
  open()
  const first = rootButton()
  act(() => first.focus())
  expect(shownTasks()).toHaveLength(2)
  expect(document.activeElement).toBe(first)
  fireEvent.keyDown(first, { key: 'Escape' })
  expect(shownTasks()).toHaveLength(3)
  act(() => rootButton('Root two').focus())
  expect(shownTasks()).toHaveLength(1)
  act(() => screen.getByRole('searchbox').focus())
  expect(shownTasks()).toHaveLength(3)
})

it('keeps search focus and the preview through row rerenders and permits filtered global ordering', () => {
  vi.useFakeTimers()
  open()
  const input = screen.getByRole('searchbox')
  input.focus()
  fireEvent.pointerEnter(rootButton())
  act(() => vi.advanceTimersByTime(400))
  for (const query of ['t', 'ta', 'task']) {
    fireEvent.change(input, { target: { value: query } })
    expect(document.activeElement).toBe(input)
    expect(shownTasks()).toHaveLength(2)
  }
  fireEvent.keyDown(input, { key: 'Enter' })
  expect(document.activeElement).toBe(input)
  expect(screen.getByText('2 / 2')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Move Second task down' }))
  expect(data.reorder).toHaveBeenCalledWith({ item_id: 12, new_position: 3 })
  expect(shownTasks()).toHaveLength(2)
  leaveHeadings()
  expect(shownTasks()).toEqual([
    'First task, Root one, priority 1',
    'Other work, Root two, priority 2',
    'Second task, Root one, priority 3',
  ])
})

it('retains touch click filtering without hover or pointer-induced focus previews', () => {
  window.matchMedia.mockReturnValue({ matches: false })
  open()
  const first = rootButton()
  const touch = new Event('pointerdown', { bubbles: true })
  Object.defineProperty(touch, 'pointerType', { value: 'touch' })
  fireEvent(first, touch)
  act(() => first.focus())
  fireEvent.pointerEnter(first)
  expect(shownTasks()).toHaveLength(3)
  fireEvent.click(first)
  leaveHeadings()
  expect(shownTasks()).toHaveLength(2)
  expect(first.getAttribute('aria-pressed')).toBe('true')
  fireEvent.keyDown(first, { key: 'Tab' })
  act(() => rootButton('Root two').focus())
  expect(shownTasks()).toHaveLength(1)
})

it('keeps the board unchanged at 399ms and previews at exactly 400ms', () => {
  vi.useFakeTimers()
  open()
  const all = shownTasks()
  fireEvent.pointerEnter(rootButton())
  act(() => vi.advanceTimersByTime(399))
  expect(shownTasks()).toEqual(all)
  act(() => vi.advanceTimersByTime(1))
  expect(shownTasks()).toHaveLength(2)
  expect(rootButton().getAttribute('aria-pressed')).toBe('false')
  expect(data.reorder).not.toHaveBeenCalled()
  expect(data.priorityRefetch).not.toHaveBeenCalled()
  expect(data.treeRefetch).not.toHaveBeenCalled()
})

it('cancels a short hover even when the pointer stays in the heading region', () => {
  vi.useFakeTimers()
  open()
  const all = shownTasks()
  const first = rootButton()
  fireEvent.pointerEnter(first)
  act(() => vi.advanceTimersByTime(399))
  fireEvent.pointerLeave(first, { relatedTarget: first.parentElement })
  act(() => vi.advanceTimersByTime(1000))
  expect(shownTasks()).toEqual(all)
})

it('starts a fresh delay between roots and skips intermediate previews during quick movement', () => {
  vi.useFakeTimers()
  open()
  const all = shownTasks()
  const first = rootButton()
  const second = rootButton('Root two')
  fireEvent.pointerEnter(first)
  act(() => vi.advanceTimersByTime(300))
  fireEvent.pointerLeave(first, { relatedTarget: second })
  act(() => vi.advanceTimersByTime(399))
  expect(shownTasks()).toEqual(all)
  act(() => vi.advanceTimersByTime(1))
  expect(shownTasks()).toEqual(['Other work, Root two, priority 3'])
  expect(first.getAttribute('aria-pressed')).toBe('false')
  expect(second.getAttribute('aria-pressed')).toBe('false')
})

it('restores the committed filter immediately when leaving an active preview', () => {
  vi.useFakeTimers()
  open()
  fireEvent.click(rootButton())
  const committed = shownTasks()
  fireEvent.pointerEnter(rootButton('Root two'))
  act(() => vi.advanceTimersByTime(400))
  expect(shownTasks()).toHaveLength(1)
  leaveHeadings()
  expect(shownTasks()).toEqual(committed)
  act(() => vi.advanceTimersByTime(1000))
  expect(shownTasks()).toEqual(committed)
})

it('commits clicks immediately and never lets a pending hover override the clicked selection', () => {
  vi.useFakeTimers()
  open()
  fireEvent.pointerEnter(rootButton())
  act(() => vi.advanceTimersByTime(200))
  fireEvent.click(rootButton('Root two'))
  expect(shownTasks()).toEqual(['Other work, Root two, priority 3'])
  expect(rootButton('Root two').getAttribute('aria-pressed')).toBe('true')
  act(() => vi.advanceTimersByTime(1000))
  expect(shownTasks()).toEqual(['Other work, Root two, priority 3'])
  // Clicking the pending root commits immediately; toggling it off before
  // the old deadline must keep the all-roots selection.
  fireEvent.pointerEnter(rootButton())
  fireEvent.click(rootButton())
  expect(shownTasks()).toHaveLength(2)
  fireEvent.click(rootButton())
  act(() => vi.advanceTimersByTime(1000))
  expect(shownTasks()).toHaveLength(3)
})

it('Escape cancels pending and active pointer previews without changing commitment', () => {
  vi.useFakeTimers()
  open()
  fireEvent.click(rootButton())
  const committed = shownTasks()
  fireEvent.pointerEnter(rootButton('Root two'))
  act(() => vi.advanceTimersByTime(399))
  fireEvent.keyDown(window, { key: 'Escape' })
  act(() => vi.advanceTimersByTime(1000))
  expect(shownTasks()).toEqual(committed)
  leaveHeadings()
  fireEvent.pointerEnter(rootButton('Root two'))
  act(() => vi.advanceTimersByTime(400))
  expect(shownTasks()).toHaveLength(1)
  fireEvent.keyDown(window, { key: 'Escape' })
  expect(shownTasks()).toEqual(committed)
})

it('keyboard focus previews immediately and cancels an older pointer timer', () => {
  vi.useFakeTimers()
  open()
  fireEvent.pointerEnter(rootButton())
  act(() => vi.advanceTimersByTime(200))
  act(() => rootButton('Root two').focus())
  expect(shownTasks()).toEqual(['Other work, Root two, priority 3'])
  act(() => vi.advanceTimersByTime(1000))
  expect(shownTasks()).toEqual(['Other work, Root two, priority 3'])
})

it('cleans up a pending intentional-hover timer on unmount', () => {
  vi.useFakeTimers()
  const view = open()
  const schedule = vi.spyOn(window, 'setTimeout')
  const cancel = vi.spyOn(window, 'clearTimeout')
  fireEvent.pointerEnter(rootButton())
  const timerIndex = schedule.mock.calls.findIndex((call) => call[1] === 400)
  expect(timerIndex).toBeGreaterThanOrEqual(0)
  const timer = schedule.mock.results[timerIndex].value
  view.unmount()
  expect(cancel).toHaveBeenCalledWith(timer)
  act(() => vi.advanceTimersByTime(1000))
})
