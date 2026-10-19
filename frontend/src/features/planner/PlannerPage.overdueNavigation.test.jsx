import React from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import StudentLayout from '../../components/student/StudentLayout'
import PlannerPage from './PlannerPage'
import { filterOverdueTree } from './components/PlannerTree'
import { userDateKey } from '../../lib/calendarDates'

const data = vi.hoisted(() => ({ roots: [] }))
vi.mock('../../hooks/usePlanningTree', () => ({
  usePlanningTree: () => ({ data: data.roots, isLoading: false, isError: false, refetch: vi.fn() }),
}))
vi.mock('../../api/planning', async (load) => ({
  ...await load(),
  getHistoryStatus: async () => ({ can_undo: false, can_redo: false }),
}))
// Preserve the real navigation bar, layout, PlannerPage, PlannerSidebar and PlannerTree.
// Isolate Priority content, whose behavior is not under test.
vi.mock('./components/PriorityPanel', () => ({
  default: () => <section aria-label="Priority fixture">Priority fixture</section>,
}))

let client
let scrollCalls
let originalScroll
let originalRaf
let originalCancel

function makeItems() {
  return [{
    id: 100, title: 'University work', item_type: 'GOAL', is_completed: false,
    children: [
      { id: 101, title: 'Deadline regression task', item_type: 'TASK',
        due_date: '2020-01-01', deadline_overdue: true, is_completed: false, children: [] },
      { id: 102, title: 'Expired anchor regression task', item_type: 'TASK',
        due_date: '2099-12-31', expired_manual_requested_date: '2020-01-02',
        expired_anchor_history: true, is_completed: false, children: [] },
    ],
  }]
}

function RoutePath() {
  return <output data-testid="route-path">{useLocation().pathname}</output>
}

function mount(start = '/planner', roots = makeItems()) {
  data.roots = roots
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[start]}>
        <RoutePath />
        <Routes>
          <Route element={<StudentLayout />}>
            <Route path="/planner" element={<PlannerPage />} />
            <Route path="/priority" element={<PlannerPage />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

function sidebar() {
  return within(screen.getByRole('navigation', { name: 'Planner navigation' }))
}
function viewNav() {
  return within(screen.getByRole('navigation', { name: 'Planning view' }))
}
function overdue() {
  fireEvent.click(sidebar().getByRole('button', { name: 'Overdue' }))
}
function child(section) {
  return within(screen.getByRole('group', { name: 'Overdue sections' }))
    .getByRole('button', { name: section === 'deadline' ? 'Deadline' : 'Anchor' })
}
function choose(section) { fireEvent.click(child(section)) }
async function scrolledTo(section) {
  const id = `planner-overdue-${section}`
  await waitFor(() => {
    const actual = document.getElementById(id)
    expect(actual).not.toBeNull()
    expect(actual.isConnected).toBe(true)
    expect(actual.tagName).toBe('H2')
    expect(scrollCalls.some(({ element, options }) =>
      element === actual && options?.block === 'start')).toBe(true)
  })
}

beforeEach(() => {
  data.roots = makeItems()
  scrollCalls = []
  originalScroll = HTMLElement.prototype.scrollIntoView
  originalRaf = globalThis.requestAnimationFrame
  originalCancel = globalThis.cancelAnimationFrame
  HTMLElement.prototype.scrollIntoView = function (options) {
    scrollCalls.push({ element: this, options })
  }
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0)
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id)
  window.localStorage.clear()
})
afterEach(() => {
  cleanup()
  client?.clear()
  if (originalScroll === undefined) delete HTMLElement.prototype.scrollIntoView
  else HTMLElement.prototype.scrollIntoView = originalScroll
  if (originalRaf === undefined) delete globalThis.requestAnimationFrame
  else globalThis.requestAnimationFrame = originalRaf
  if (originalCancel === undefined) delete globalThis.cancelAnimationFrame
  else globalThis.cancelAnimationFrame = originalCancel
  window.localStorage.clear()
  vi.restoreAllMocks()
})

it('Planner task list owns scrolling independently of the search toolbar', () => {
  mount()

  const search = screen.getByRole('searchbox', { name: 'Search tasks' })
  const taskList = screen.getByRole('region', { name: 'Planner task list' })

  expect(taskList.className).toContain('overflow-y-auto')
  expect(taskList.className).toContain('min-h-0')
  expect(taskList.contains(search)).toBe(false)
  expect(taskList.compareDocumentPosition(search) & Node.DOCUMENT_POSITION_PRECEDING)
    .toBeTruthy()

  expect(search.closest('.sticky')).toBeNull()
  expect(screen.getByText('Deadline regression task')).toBeTruthy()
})

it('shows a non-interactive deadline marker only for incomplete overdue Planner cards', () => {
  const { container, rerender } = mount()
  expect(screen.getByRole('img', { name: 'Deadline overdue' })).toBeTruthy()
  const marker = container.querySelector('[aria-label="Deadline overdue"]')
  expect(marker.className).toContain('pointer-events-none')
  expect(marker.className).toContain('border-[#e0b84f]')
  expect(marker.className).toContain('bg-[#e0b84f]')
  expect(marker.className).not.toContain('bg-red')
  expect(marker.style.left).toBe('33px')

  const completed = makeItems()
  completed[0].children[0].is_completed = true
  data.roots = completed
  rerender(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/planner']}>
        <RoutePath />
        <Routes><Route element={<StudentLayout />}><Route path="/planner" element={<PlannerPage />} /></Route></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  expect(screen.queryByRole('img', { name: 'Deadline overdue' })).toBeNull()
})

it('aligns a nested overdue marker to its rightmost own indentation rail', () => {
  const nested = [{
    id: 100, title: 'Root', item_type: 'GOAL', is_completed: false, children: [{
      id: 101, title: 'Parent', item_type: 'TASK', is_completed: false, children: [{
        id: 102, title: 'Deep overdue task', item_type: 'TASK', due_date: '2020-01-01',
        deadline_overdue: true, is_completed: false, children: [],
      }],
    }],
  }]
  const { container } = mount('/planner', nested)
  const marker = container.querySelector('[data-arc-planner-card-id="102"] [data-arc-overdue-marker]')
  expect(marker).not.toBeNull()
  expect(marker.style.left).toBe('75px')
})

it('HA1 harness: matches overdue classification and mounts actual Planner components', () => {
  const classified = filterOverdueTree(makeItems(), userDateKey())
  expect(classified.items.map((item) => item.overdue_section))
    .toEqual(['Deadline Overdue', 'Anchor Overdue'])
  mount()
  expect(screen.getByRole('navigation', { name: 'Planning view' })).toBeTruthy()
  expect(screen.getByRole('navigation', { name: 'Planner navigation' })).toBeTruthy()
  expect(screen.getByRole('searchbox', { name: 'Search tasks' })).toBeTruthy()
})

it('HA1 navigation: Deadline targets the actual connected heading', async () => {
  mount()
  overdue()
  choose('deadline')
  await scrolledTo('deadline')
  expect(child('deadline').getAttribute('aria-current')).toBe('location')
  expect(child('anchor').hasAttribute('aria-current')).toBe(false)
  expect(screen.getByText('Deadline regression task')).toBeTruthy()
})

it('HA1 navigation: Anchor updates active selection and scrolls its heading', async () => {
  mount()
  overdue()
  choose('deadline')
  await scrolledTo('deadline')
  choose('anchor')
  await scrolledTo('anchor')
  expect(child('anchor').getAttribute('aria-current')).toBe('location')
  expect(child('deadline').hasAttribute('aria-current')).toBe(false)
  expect(screen.getByText('Expired anchor regression task')).toBeTruthy()
})

it('HA1 navigation: section selection clears incompatible search', async () => {
  mount()
  const search = screen.getByRole('searchbox', { name: 'Search tasks' })
  fireEvent.change(search, { target: { value: 'no-match-xyz' } })
  expect(search.value).toBe('no-match-xyz')
  overdue()
  choose('deadline')
  expect(search.value).toBe('')
  await scrolledTo('deadline')
  expect(screen.getByText('Deadline regression task')).toBeTruthy()
})

it('HA1 navigation: empty sections still have real scroll targets', async () => {
  mount('/planner', [])
  overdue()
  choose('deadline')
  await scrolledTo('deadline')
  choose('anchor')
  await scrolledTo('anchor')
  expect(screen.getByRole('heading', { name: 'Deadline Overdue' })).toBeTruthy()
  expect(screen.getByRole('heading', { name: 'Anchor Overdue' })).toBeTruthy()
})

it('HA1 navigation: real view NavLinks switch Priority and Planner', async () => {
  mount('/planner')
  fireEvent.click(viewNav().getByRole('link', { name: 'Priority' }))
  await waitFor(() => expect(screen.getByTestId('route-path').textContent).toBe('/priority'))
  expect(screen.getByRole('region', { name: 'Priority fixture' })).toBeTruthy()
  fireEvent.click(viewNav().getByRole('link', { name: 'Planner' }))
  await waitFor(() => expect(screen.getByTestId('route-path').textContent).toBe('/planner'))
  overdue()
  choose('anchor')
  await scrolledTo('anchor')
  fireEvent.click(viewNav().getByRole('link', { name: 'Priority' }))
  await waitFor(() => expect(screen.getByTestId('route-path').textContent).toBe('/priority'))
  fireEvent.click(viewNav().getByRole('link', { name: 'Planner' }))
  await waitFor(() => expect(screen.getByTestId('route-path').textContent).toBe('/planner'))

  // PlannerPage retains the active Overdue filter across view changes.
  // Clicking Overdue again would collapse it rather than expand it.
  expect(screen.getByRole('group', { name: 'Overdue sections' })).toBeTruthy()
  choose('deadline')
  await scrolledTo('deadline')
})

it('HA1 navigation: parent Overdue toggles off the filter and section selection', async () => {
  mount()
  overdue()
  choose('anchor')
  await scrolledTo('anchor')
  overdue()
  expect(screen.queryByRole('group', { name: 'Overdue sections' })).toBeNull()
  expect(document.getElementById('planner-overdue-deadline')).toBeNull()
  expect(document.getElementById('planner-overdue-anchor')).toBeNull()
})
