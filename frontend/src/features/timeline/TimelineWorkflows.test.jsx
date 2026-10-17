import React from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import TimelineCard from './TimelineCard'
import TimelineBoard from './TimelineBoard'
import TimelineSidebar from './TimelineSidebar'
import TimelineTaskNavigator from './TimelineTaskNavigator'
import { addDays, todayKey, makeScale } from './timelineDates'
import TimelinePage from './TimelinePage'
import AnchorDialog from './AnchorDialog'

const pageData = vi.hoisted(() => ({ roots: [], universe: [], groups: [], editor: vi.fn(), run: vi.fn(), windows: [], setFlavour: vi.fn() }))
vi.mock('../../stores/authStore', () => ({ useAuthStore: Object.assign((selector) => selector({ user: { id: 77 } }), { getState: () => ({ user: { id: 77 } }) }) }))
vi.mock('../../hooks/usePlanningTree', () => ({ usePlanningTree: () => ({ data: pageData.roots }) }))
vi.mock('../../hooks/useTimelineUniverse', () => ({ useTimelineUniverse: () => ({ data: pageData.universe }) }))
vi.mock('../../hooks/useTimeline', () => ({ useTimeline: (window) => {
  pageData.windows.push(window)
  return { data: { groups: pageData.groups, timezones: [] } }
} }))
vi.mock('../../hooks/useSchedulerSettings', () => ({ useSchedulerSettings: () => ({ data: { flavour: null }, setFlavour: pageData.setFlavour }) }))
vi.mock('./useTimelineActions', () => ({ default: () => ({ run: pageData.run }) }))
vi.mock('../planner/components/CreatePlanningItemPanel', () => ({ default: (props) => {
  pageData.editor(props)
  return <aside aria-label="Canonical editor"><button onClick={props.onClose}>Close editor</button></aside>
} }))
vi.mock('./TimelineToolbar', () => ({ default: ({ find, options, update, navigate }) => <div>
  <input aria-label="Timeline search" value={find.query} onChange={(event) => find.changeQuery(event.target.value)} />
  <button onClick={() => navigate(1)}>Next date window</button>
  <button onClick={() => update({ completed: !options.completed })}>Show completed</button>
</div> }))
vi.mock('./SchedulerRunButton', () => ({ default: () => <button>Run scheduler</button> }))
afterEach(() => { cleanup(); vi.useRealTimers() })
const task = {
  id: 42, render_id: '42:session:1', title: 'Canonical task', root: { id: 1, title: 'Root 1' },
  item_type: 'TASK', is_completed: false, scheduled_date: '2026-10-12', duration_category: 'UNDER_1_HOUR',
}
const find = { matchIds: new Set(), registerCard() {} }
const roots = [1, 2, 3].map((id) => ({ id, title: `Root ${id}` }))
const index = new Map([[1, [{ id: 42, title: task.title, date: task.scheduled_date }, { id: 43, title: 'Missing task', date: null, missingSchedule: true }]], [2, [{ id: 44, title: 'Other task', date: '2026-10-20', isCompleted: true }]]])

it('root arrows are sibling buttons and navigate without toggling selection', () => {
  const toggle = vi.fn(), navigateRoot = vi.fn()
  const { container } = render(<TimelineSidebar roots={roots} selected={[1]} toggle={toggle} rootLeafIndex={index} navigateRoot={navigateRoot} />)
  expect(container.querySelector('button button')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Next task in Root 1' }))
  fireEvent.click(screen.getByRole('button', { name: 'Previous task in Root 1' }))
  expect(navigateRoot.mock.calls).toEqual([[1, 1], [1, -1]])
  expect(toggle).not.toHaveBeenCalled()
  expect(screen.getByText('1/1')).toBeTruthy()
  expect(screen.getByText('1 schedule unavailable')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Root 1' }))
  expect(toggle).toHaveBeenCalledWith(1)
})

it.each([[1], [1, 2], [1, 2, 3]])('Deselect all visibility matches partial multiselection %j', (...selected) => {
  // Vitest expands each array row into arguments.
  const deselect = vi.fn()
  render(<TimelineSidebar roots={roots} selected={selected} toggle={vi.fn()} deselectRoots={deselect} />)
  const button = screen.queryByRole('button', { name: 'Deselect all' })
  expect(Boolean(button)).toBe(selected.length === 2)
  if (button) { fireEvent.click(button); expect(deselect).toHaveBeenCalledOnce() }
})

it('task double-click uses canonical ID and ignores checkbox, anchor and read-only cards', () => {
  const onEdit = vi.fn()
  const { container, rerender } = render(<TimelineCard item={task} find={find} onEdit={onEdit} />)
  fireEvent.doubleClick(screen.getByText(task.title))
  expect(onEdit).toHaveBeenCalledExactlyOnceWith(42)
  fireEvent.doubleClick(screen.getByRole('checkbox'))
  fireEvent.doubleClick(screen.getByRole('button', { name: 'Anchor Canonical task' }))
  expect(onEdit).toHaveBeenCalledTimes(1)
  rerender(<TimelineCard item={task} find={find} readOnly onEdit={onEdit} />)
  fireEvent.doubleClick(screen.getByText(task.title))
  expect(onEdit).toHaveBeenCalledTimes(1)
  expect(container.querySelector('[data-timeline-task-id]')).toBeNull()
})

it('deadline overdue hides canonical date blobs and renders its red duration dot', () => {
  const { container } = render(<TimelineCard item={{ ...task, deadline_overdue: true, start_date: '2026-10-01', due_date: '2026-10-02' }} find={find} expanded />)
  expect(container.querySelector('.timeline-deadline-overdue-dot')).toBeTruthy()
  expect(screen.queryByText(/Release 2026-10-01/)).toBeNull()
  expect(screen.queryByText(/Due 2026-10-02/)).toBeNull()
})

it('carried-anchor conflicts show canonical original and proposed values before confirmation', async () => {
  const actions = {
    busy: false,
    run: vi.fn().mockRejectedValue({ response: { status: 409, data: {
      conflicts: [{ code: 'after_deadline', original_date: '2026-10-12', proposed_date: '2026-10-15' }],
      decisions: [{ code: 'change_deadline' }],
    } } }),
  }
  render(<AnchorDialog request={{ item: task, date: '2026-10-15' }} actions={actions} onClose={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: 'Anchor to this date' }))
  await screen.findByText(/Canonical date: 2026-10-12 → proposed 2026-10-15/)
  expect(actions.run).toHaveBeenCalledWith('anchor', expect.objectContaining({ item_id: 42, date: '2026-10-15' }))
})

it('navigator selection, tabs, minimize, restore and close remain presentation actions', () => {
  function Harness() {
    const [active, setActive] = React.useState(1)
    const [minimized, setMinimized] = React.useState(false)
    return <TimelineTaskNavigator selectedRoots={roots.slice(0, 2)} rootLeafIndex={index} activeRootId={active}
      currentLeafByRoot={{ 1: 42 }} minimized={minimized} onSetMinimized={setMinimized}
      onSetActiveRoot={setActive} onSelectTask={select} onClose={close} />
  }
  const select = vi.fn(), close = vi.fn()
  render(<Harness />)
  fireEvent.click(screen.getByRole('button', { name: /Canonical task/ }))
  expect(select).toHaveBeenCalledExactlyOnceWith(index.get(1)[0], 1)
  expect(screen.getByRole('button', { name: /Missing task/ }).disabled).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'Minimize task navigator' }))
  expect(screen.queryByText(task.title)).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Root 2' }))
  fireEvent.click(screen.getByRole('button', { name: 'Maximize task navigator' }))
  expect(screen.getByText('Other task')).toBeTruthy()
  expect(screen.getByText(/Completed/)).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Close task navigator' }))
  expect(close).toHaveBeenCalledOnce()
  expect(select).toHaveBeenCalledTimes(1)
})

it.each(['default', 'selected-date'])('%s expansion preserves the 155ms intentional hover state', (expansionVariant) => {
  vi.useFakeTimers()
  const { container } = render(<TimelineCard item={task} find={find} expansionVariant={expansionVariant} expanded={expansionVariant === 'selected-date'} />)
  const card = container.querySelector('article')
  expect(card.classList.contains('timeline-card-hover-intent')).toBe(false)
  expect(card.classList.contains('timeline-card-expanded')).toBe(expansionVariant === 'selected-date')
  fireEvent.mouseEnter(card)
  act(() => vi.advanceTimersByTime(154))
  expect(card.classList.contains('timeline-card-hover-intent')).toBe(false)
  act(() => vi.advanceTimersByTime(1))
  expect(card.classList.contains('timeline-card-expanded')).toBe(true)
  expect(card.classList.contains('timeline-card-hover-intent')).toBe(true)
  fireEvent.mouseLeave(card)
  expect(card.classList.contains('timeline-card-hover-intent')).toBe(false)
  expect(card.classList.contains('timeline-card-expanded')).toBe(expansionVariant === 'selected-date')
})

it('selected-date modifiers follow persistent concentration and disappear during temporary preview', () => {
  vi.useFakeTimers()
  const onEdit = vi.fn()
  const { container } = render(<TimelineBoard scale={makeScale('2026-10-12', 'day')} items={[task]} data={{ timezones: [] }} grouped={false}
    find={find} scrollRef={{ current: null }} onEditTask={onEdit} />)
  const date = container.querySelector('.timeline-date')
  expect(container.querySelector('.timeline-card-selected-date')).toBeNull()
  fireEvent.click(date)
  expect(container.querySelector('.timeline-row-selected-date')).toBeTruthy()
  expect(container.querySelector('.timeline-card-selected-date')).toBeTruthy()
  fireEvent.doubleClick(screen.getByText(task.title))
  expect(onEdit).toHaveBeenCalledWith(42)
  fireEvent.mouseEnter(date)
  act(() => vi.advanceTimersByTime(150))
  expect(container.querySelector('.timeline-card-selected-date')).toBeNull()
  fireEvent.mouseLeave(date)
  expect(container.querySelector('.timeline-card-selected-date')).toBeTruthy()
})

it('constraint previews stay read-only and cannot become navigation targets', () => {
  const onEdit = vi.fn()
  const { container } = render(<TimelineBoard scale={makeScale('2026-10-12', 'day')} items={[{ ...task, scheduled_date: '2026-12-01', start_date: '2026-10-12', due_date: '2026-12-02' }]}
    data={{ timezones: [] }} find={find} scrollRef={{ current: null }} onEditTask={onEdit} />)
  fireEvent.focus(screen.getByLabelText('Preview Canonical task'))
  const card = container.querySelector('article')
  expect(card).toBeTruthy()
  expect(card.classList.contains('timeline-card-selected-date')).toBe(false)
  expect(card.hasAttribute('data-timeline-task-id')).toBe(false)
  fireEvent.doubleClick(screen.getByText(task.title))
  expect(onEdit).not.toHaveBeenCalled()
})


it('page navigation jumps globally, clears search, bypasses type/duration filters and reuses canonical editor ownership', () => {
  const canonical = { ...task, description: 'Canonical details', children: [] }
  const distant = { ...task, scheduled_date: '2027-03-15', description: 'Window projection' }
  pageData.roots = [{ ...roots[0], children: [canonical] }, ...roots.slice(1)]
  pageData.universe = [distant]
  pageData.groups = [{ root: roots[0], items: [distant] }]
  pageData.editor.mockClear(); pageData.run.mockClear(); pageData.windows = []
  localStorage.setItem('arc.timeline.v1.77', JSON.stringify({ type: 'assignments', durations: ['OVER_16_HOURS'], roots: [] }))
  const scroll = vi.fn()
  const originalScroll = HTMLElement.prototype.scrollTo
  const originalIntoView = HTMLElement.prototype.scrollIntoView
  HTMLElement.prototype.scrollTo = scroll
  HTMLElement.prototype.scrollIntoView = vi.fn()
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  try {
    const { container } = render(<TimelinePage />)
    const search = screen.getByLabelText('Timeline search')
    fireEvent.change(search, { target: { value: 'does not match' } })
    fireEvent.click(screen.getByRole('button', { name: 'Root 1' }))
    expect(screen.getByLabelText('Root task navigator')).toBeTruthy()
    expect(pageData.windows.at(-1).from).not.toBe(distant.scheduled_date)
    search.focus()
    fireEvent.click(screen.getByRole('button', { name: 'Next task in Root 1' }))
    expect(search.value).toBe('')
    expect(document.activeElement).toBe(search)
    expect(pageData.windows.at(-1).from).toBe(distant.scheduled_date)
    const card = container.querySelector('[data-timeline-task-id="42"]')
    expect(card.classList.contains('timeline-current-match')).toBe(true)
    expect(pageData.editor).not.toHaveBeenCalled()
    expect(pageData.run).not.toHaveBeenCalled()
    const prefs = JSON.parse(localStorage.getItem('arc.timeline.v1.77'))
    expect(prefs.type).toBe('assignments')
    expect(prefs.durations).toEqual(['OVER_16_HOURS'])
    fireEvent.doubleClick(card)
    expect(pageData.editor.mock.calls.at(-1)[0].editingItem).toBe(canonical)
    fireEvent.click(screen.getByText('Close editor'))
    expect(screen.queryByLabelText('Canonical editor')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Minimize task navigator' }))
    fireEvent.click(screen.getByRole('button', { name: 'Close task navigator' }))
    expect(JSON.parse(localStorage.getItem('arc.timeline.v1.77')).roots).toEqual([1])
    fireEvent.click(screen.getByRole('button', { name: 'Root 2' }))
    expect(screen.getByRole('button', { name: 'Maximize task navigator' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Deselect all' }))
    expect(screen.queryByLabelText('Root task navigator')).toBeNull()
    expect(JSON.parse(localStorage.getItem('arc.timeline.v1.77')).roots).toEqual([])
    expect(JSON.parse(localStorage.getItem('arc.timeline.v1.77')).type).toBe('assignments')
    expect(container.querySelector('[data-timeline-task-id="42"]')).toBeNull()
  } finally {
    HTMLElement.prototype.scrollTo = originalScroll
    HTMLElement.prototype.scrollIntoView = originalIntoView
    vi.unstubAllGlobals()
    localStorage.clear()
  }
})

it('navigator header drags with pointer capture, clamps bounds and ignores control origins', () => {
  const setPosition = vi.fn()
  const { container } = render(<TimelineTaskNavigator selectedRoots={[roots[0]]} rootLeafIndex={index} activeRootId={1}
    currentLeafByRoot={{}} minimized={false} onSetMinimized={vi.fn()} onSetActiveRoot={vi.fn()} onSelectTask={vi.fn()}
    onClose={vi.fn()} position={{ x: 100, y: 100 }} setPosition={setPosition} />)
  const panel = container.querySelector('section')
  const header = container.querySelector('header')
  panel.getBoundingClientRect = () => ({ left: 100, top: 100, width: 340 })
  header.setPointerCapture = vi.fn()
  header.hasPointerCapture = () => true
  header.releasePointerCapture = vi.fn()
  vi.stubGlobal('PointerEvent', MouseEvent)
  try {
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Close task navigator' }), { button: 0, clientX: 110, clientY: 110 })
    fireEvent.pointerMove(header, { clientX: 180, clientY: 180 })
    expect(setPosition).not.toHaveBeenCalled()
    fireEvent.pointerDown(header, { button: 0, clientX: 110, clientY: 110 })
    expect(header.setPointerCapture).toHaveBeenCalledOnce()
    fireEvent.pointerMove(header, { clientX: 180, clientY: 180 })
    expect(setPosition).toHaveBeenLastCalledWith({ x: 170, y: 170 })
    fireEvent.pointerMove(header, { clientX: -1000, clientY: 10000 })
    expect(setPosition).toHaveBeenLastCalledWith({ x: 0, y: window.innerHeight - 96 })
    fireEvent.pointerUp(header)
    expect(header.releasePointerCapture).toHaveBeenCalledOnce()
    fireEvent.pointerMove(header, { clientX: 200, clientY: 200 })
    expect(setPosition).toHaveBeenCalledTimes(2)
  } finally { vi.unstubAllGlobals() }
})

it('Deselect all restores show-all roots and removing the active tab retains another selected root', () => {
  const other = { ...task, id: 44, title: 'Other root task', root: roots[1], scheduled_date: '2027-03-15' }
  const first = { ...task, scheduled_date: '2027-03-15' }
  pageData.roots = [{ ...roots[0], children: [first] }, { ...roots[1], children: [other] }, roots[2]]
  pageData.universe = [first, other]
  pageData.groups = [{ root: roots[0], items: [first] }, { root: roots[1], items: [other] }]
  const originalScroll = HTMLElement.prototype.scrollTo
  HTMLElement.prototype.scrollTo = vi.fn()
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  localStorage.clear()
  try {
    const { container } = render(<TimelinePage />)
    fireEvent.click(screen.getByRole('button', { name: 'Root 1' }))
    fireEvent.click(screen.getByRole('button', { name: 'Next task in Root 1' }))
    expect(container.querySelector('[data-timeline-task-id="44"]')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Root 2' }))
    const selected = screen.getByLabelText('Selected roots')
    expect(selected.querySelector('[aria-pressed="true"]').textContent).toBe('Root 2')
    fireEvent.click(screen.getAllByRole('button', { name: 'Root 2' })[0])
    expect(selected.querySelector('[aria-pressed="true"]').textContent).toBe('Root 1')
    fireEvent.click(screen.getByRole('button', { name: 'Root 2' }))
    fireEvent.click(screen.getByRole('button', { name: 'Deselect all' }))
    expect(container.querySelectorAll('[data-timeline-task-id]').length).toBe(2)
    expect(screen.queryByLabelText('Root task navigator')).toBeNull()
  } finally {
    HTMLElement.prototype.scrollTo = originalScroll
    vi.unstubAllGlobals()
    localStorage.clear()
  }
})

it('long descriptions show a bounded text preview, expand fully and collapse without editing', () => {
  const description = 'First line\n' + 'long <script>plain text</script> '.repeat(12)
  const onEdit = vi.fn()
  const { container } = render(<TimelineCard item={{ ...task, description }} find={find} expanded onEdit={onEdit} />)
  const text = container.querySelector('.timeline-description p')
  expect(text.textContent).toBe(description.slice(0, 140) + '…')
  const more = screen.getByRole('button', { name: 'Show more' })
  fireEvent.click(more)
  expect(text.textContent).toBe(description)
  expect(container.querySelector('script')).toBeNull()
  fireEvent.doubleClick(screen.getByRole('button', { name: 'Show less' }))
  expect(onEdit).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Show less' }))
  expect(text.textContent).toBe(description.slice(0, 140) + '…')
})

it('short and empty descriptions need no expansion control', () => {
  const { container, rerender } = render(<TimelineCard item={{ ...task, description: 'Short description' }} find={find} expanded />)
  expect(screen.getByText('Short description')).toBeTruthy()
  expect(screen.queryByText('Show more')).toBeNull()
  rerender(<TimelineCard item={{ ...task, description: '  \n ' }} find={find} expanded />)
  expect(container.querySelector('.timeline-description')).toBeNull()
})

it('resizing clamps a dragged navigator while preserving a reachable position', () => {
  const setPosition = vi.fn()
  const { container } = render(<TimelineTaskNavigator selectedRoots={[roots[0]]} rootLeafIndex={index} activeRootId={1}
    currentLeafByRoot={{}} minimized={false} onSetMinimized={vi.fn()} onSetActiveRoot={vi.fn()} onSelectTask={vi.fn()}
    onClose={vi.fn()} position={{ x: 500, y: 500 }} setPosition={setPosition} />)
  container.querySelector('section').getBoundingClientRect = () => ({ width: 340 })
  vi.stubGlobal('innerWidth', 400); vi.stubGlobal('innerHeight', 400)
  try {
    fireEvent(window, new Event('resize'))
    expect(setPosition).toHaveBeenLastCalledWith({ x: 60, y: 304 })
  } finally { vi.unstubAllGlobals() }
})

it('completed saved roots leave the effective selection and navigator without rewriting preferences', () => {
  const first = { ...task, scheduled_date: '2027-03-15' }
  const other = { ...first, id: 44, root: roots[1], title: 'Other leaf' }
  pageData.roots = [{ ...roots[0], children: [first] }, { ...roots[1], children: [other] }, roots[2]]
  pageData.universe = [first, other]
  pageData.groups = [{ root: roots[0], items: [first] }, { root: roots[1], items: [other] }]
  localStorage.setItem('arc.timeline.v1.77', JSON.stringify({ roots: [1] }))
  const originalScroll = HTMLElement.prototype.scrollTo
  HTMLElement.prototype.scrollTo = vi.fn()
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  try {
    const { container, rerender } = render(<TimelinePage />)
    fireEvent.click(screen.getByRole('button', { name: 'Root 2' }))
    fireEvent.click(screen.getByRole('button', { name: 'Next task in Root 2' }))
    pageData.roots = pageData.roots.map((root) => root.id === 2 ? { ...root, is_completed: true } : root)
    rerender(<TimelinePage />)
    expect(screen.queryByRole('button', { name: 'Root 2' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Next task in Root 2' })).toBeNull()
    expect(screen.getByLabelText('Selected roots').querySelector('[aria-pressed="true"]').textContent).toBe('Root 1')
    expect(container.querySelector('.timeline-current-match')).toBeNull()
    expect(JSON.parse(localStorage.getItem('arc.timeline.v1.77')).roots).toEqual([1, 2])
    pageData.roots = pageData.roots.map((root) => ({ ...root, is_completed: true }))
    rerender(<TimelinePage />)
    expect(screen.queryByLabelText('Root task navigator')).toBeNull()
    expect(container.querySelectorAll('[data-timeline-task-id]').length).toBe(2)
  } finally { HTMLElement.prototype.scrollTo = originalScroll; vi.unstubAllGlobals(); localStorage.clear() }
})


it('Monk dropdown shares toolbar click-to-pin, selection and dismissal', async () => {
  const { default: Toolbar } = await vi.importActual('./TimelineToolbar')
  const nav = {
    active: false,
    count: 0,
    index: -1,
    toggle() {},
    navigate() {},
  }

  pageData.setFlavour.mockResolvedValue(undefined)

  render(
    <Toolbar
      find={{ ...find, query: '' }}
      actions={{ history: { data: {} } }}
      anchor="2026-10-12"
      zoom="day"
      options={{
        type: 'all',
        durations: [],
        grouped: true,
        completed: false,
      }}
      anchorNav={nav}
      overloadNav={nav}
      infeasibleNav={nav}
    />,
  )

  const trigger = screen.getByRole('button', {
    name: 'Scheduler settings',
  })

  fireEvent.click(trigger)
  expect(trigger.getAttribute('aria-expanded')).toBe('true')

  fireEvent.mouseLeave(trigger.parentElement)
  expect(trigger.getAttribute('aria-expanded')).toBe('true')

  fireEvent.click(trigger)
  expect(trigger.getAttribute('aria-expanded')).toBe('false')

  fireEvent.click(trigger)
  fireEvent.click(screen.getByRole('button', { name: 'Locked-in' }))

  await waitFor(() => {
    expect(pageData.setFlavour).toHaveBeenCalledWith('lock-in')
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
  })

  fireEvent.click(trigger)
  fireEvent.click(screen.getByRole('button', { name: 'Monk' }))

  await waitFor(() => {
    expect(pageData.setFlavour).toHaveBeenCalledWith('monk')
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
  })

  fireEvent.click(trigger)
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(trigger.getAttribute('aria-expanded')).toBe('false')

  fireEvent.click(trigger)
  fireEvent.pointerDown(document.body)
  expect(trigger.getAttribute('aria-expanded')).toBe('false')
})

it('Monk dropdown remains open if saving fails', async () => {
  const { default: Toolbar } = await vi.importActual('./TimelineToolbar')
  const nav = {
    active: false,
    count: 0,
    index: -1,
    toggle() {},
    navigate() {},
  }

  pageData.setFlavour.mockRejectedValueOnce(new Error('Save failed'))

  render(
    <Toolbar
      find={{ ...find, query: '' }}
      actions={{ history: { data: {} } }}
      anchor="2026-10-12"
      zoom="day"
      options={{
        type: 'all',
        durations: [],
        grouped: true,
        completed: false,
      }}
      anchorNav={nav}
      overloadNav={nav}
      infeasibleNav={nav}
    />,
  )

  const trigger = screen.getByRole('button', {
    name: 'Scheduler settings',
  })

  fireEvent.click(trigger)
  fireEvent.click(screen.getByRole('button', { name: 'Locked-in' }))

  await waitFor(() => {
    expect(pageData.setFlavour).toHaveBeenCalled()
  })

  expect(trigger.getAttribute('aria-expanded')).toBe('true')
  expect(screen.getByRole('button', { name: 'Monk' })).toBeTruthy()
})


it('root positions initialize from visible tasks and explicit independent positions survive async refresh', () => {
  const today = todayKey()
  const leaf = (id, scheduled_date, root = roots[0]) => ({ ...task, id, render_id: undefined, title: `Leaf ${id}`, scheduled_date, root })
  const leaves = [leaf(40, '2020-01-01'), leaf(42, today), leaf(43, '2030-01-01')]
  const otherLeaves = [leaf(50, today, roots[1]), leaf(51, '2030-01-02', roots[1])]
  pageData.roots = [{ ...roots[0], children: leaves }, { ...roots[1], children: otherLeaves }, roots[2]]
  pageData.universe = [...leaves, ...otherLeaves]
  pageData.groups = [{ root: roots[0], items: leaves }, { root: roots[1], items: otherLeaves }]
  localStorage.clear()
  const originalScroll = HTMLElement.prototype.scrollTo
  HTMLElement.prototype.scrollTo = vi.fn()
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  try {
    const { container, rerender } = render(<TimelinePage />)
    fireEvent.click(screen.getByRole('button', { name: 'Root 1' }))
    expect(screen.getByText('2/3')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Next task in Root 1' }))
    expect(screen.getByText('3/3')).toBeTruthy()
    pageData.groups = [{ root: roots[0], items: [{ ...leaves[2] }] }]
    rerender(<TimelinePage />)
    expect(screen.getByText('3/3')).toBeTruthy()
    expect(container.querySelector('.timeline-task-navigator-list [aria-current="true"]').textContent).toContain('Leaf 43')
    fireEvent.click(screen.getByRole('button', { name: 'Root 2' }))
    fireEvent.click(screen.getByRole('button', { name: 'Previous task in Root 2' }))
    expect(screen.getByText('1/2')).toBeTruthy()
    expect(screen.getByText('3/3')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Next task in Root 1' }))
    expect(screen.getByText('1/3')).toBeTruthy()
    expect(pageData.windows.at(-1).from).toBe('2020-01-01')
    pageData.groups = [{ root: roots[0], items: [leaf(42, addDays(today, 14))] }]
    fireEvent.click(screen.getByRole('button', { name: 'Next date window' }))
    expect(screen.getByText('2/3')).toBeTruthy()
  } finally { HTMLElement.prototype.scrollTo = originalScroll; vi.unstubAllGlobals(); localStorage.clear() }
})

it('navigator arrow keys stay local while board navigation and input protection remain intact', () => {
  const leaf = { ...task, scheduled_date: todayKey() }
  pageData.roots = [{ ...roots[0], children: [leaf] }]
  pageData.universe = [leaf]
  pageData.groups = [{ root: roots[0], items: [leaf] }]
  localStorage.clear()
  const originalScroll = HTMLElement.prototype.scrollTo
  HTMLElement.prototype.scrollTo = vi.fn()
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  try {
    const { container } = render(<TimelinePage />)
    fireEvent.click(screen.getByRole('button', { name: 'Root 1' }))
    const from = pageData.windows.at(-1).from
    const navigatorButton = container.querySelector('.timeline-task-navigator-list button')
    navigatorButton.focus()
    for (const key of ['ArrowRight', 'ArrowLeft']) {
      fireEvent.keyDown(navigatorButton.querySelector('span'), { key })
      expect(pageData.windows.at(-1).from).toBe(from)
    }
    const board = screen.getByLabelText('Timeline')
    board.focus()
    fireEvent.keyDown(board, { key: 'ArrowRight' })
    expect(pageData.windows.at(-1).from > from).toBe(true)
    fireEvent.keyDown(board, { key: 'ArrowLeft' })
    expect(pageData.windows.at(-1).from).toBe(from)
    const input = screen.getByLabelText('Timeline search')
    input.focus()
    for (const key of ['ArrowRight', 'ArrowLeft']) {
      fireEvent.keyDown(input, { key })
      expect(pageData.windows.at(-1).from).toBe(from)
    }
  } finally { HTMLElement.prototype.scrollTo = originalScroll; vi.unstubAllGlobals(); localStorage.clear() }
})

it('dragging and viewport resizing reserve measured header and tabs plus sixteen pixels', () => {
  const setPosition = vi.fn()
  const { container } = render(<TimelineTaskNavigator selectedRoots={[roots[0]]} rootLeafIndex={index} activeRootId={1}
    currentLeafByRoot={{}} minimized={false} onSetMinimized={vi.fn()} onSetActiveRoot={vi.fn()} onSelectTask={vi.fn()}
    onClose={vi.fn()} position={{ x: 100, y: 100 }} setPosition={setPosition} />)
  const panel = container.querySelector('section')
  const header = container.querySelector('header')
  const tabs = container.querySelector('.timeline-task-navigator-tabs')
  panel.getBoundingClientRect = () => ({ left: 100, top: 100, width: 340 })
  Object.defineProperty(header, 'offsetHeight', { value: 64 })
  Object.defineProperty(tabs, 'offsetHeight', { value: 52 })
  header.setPointerCapture = vi.fn()
  header.hasPointerCapture = () => true
  header.releasePointerCapture = vi.fn()
  vi.stubGlobal('PointerEvent', MouseEvent)
  try {
    fireEvent.pointerDown(header, { button: 0, clientX: 110, clientY: 110 })
    fireEvent.pointerMove(header, { clientX: 110, clientY: 10000 })
    expect(setPosition).toHaveBeenLastCalledWith({ x: 100, y: window.innerHeight - 132 })
    expect(panel.style.getPropertyValue('--timeline-navigator-min-height')).toBe('132px')
    fireEvent.pointerUp(header)
    vi.stubGlobal('innerWidth', 400); vi.stubGlobal('innerHeight', 200)
    fireEvent(window, new Event('resize'))
    expect(setPosition).toHaveBeenLastCalledWith({ x: 60, y: 68 })
    expect(panel.style.getPropertyValue('--timeline-navigator-min-height')).toBe('132px')
  } finally { vi.unstubAllGlobals() }
})


it('calendar opens on the Timeline anchor month', async () => {
  const { default: Toolbar } = await vi.importActual('./TimelineToolbar')

  const nav = {
    active: false,
    count: 0,
    index: -1,
    toggle() {},
    navigate() {},
  }

  const jump = vi.fn()

  render(
    <Toolbar
      find={{ ...find, query: '' }}
      actions={{ busy: false, history: { data: {} } }}
      anchor="2027-02-15"
      zoom="day"
      setZoom={vi.fn()}
      navigate={vi.fn()}
      jump={jump}
      options={{
        type: 'all',
        durations: [],
        grouped: true,
        completed: false,
      }}
      update={vi.fn()}
      anchorNav={nav}
      overloadNav={nav}
      infeasibleNav={nav}
    />,
  )

  fireEvent.click(screen.getByRole('button', {
    name: 'Jump to date',
  }))

  expect(screen.getByText('February 2027')).toBeTruthy()

  fireEvent.click(screen.getByRole('button', {
    name: '2027-02-20',
  }))

  expect(jump).toHaveBeenCalledWith('2027-02-20')

  expect(
    screen.getByRole('button', {
      name: 'Jump to date',
    }).getAttribute('aria-expanded'),
  ).toBe('false')
})


it('shared toolbar dropdown waits for hover intent and supports pinning', async () => {
  const { default: Toolbar } = await vi.importActual('./TimelineToolbar')

  vi.useFakeTimers()

  const nav = {
    active: false,
    count: 0,
    index: -1,
    toggle: vi.fn(),
    navigate: vi.fn(),
  }

  render(
    <Toolbar
      find={{ ...find, query: '' }}
      actions={{ busy: false, history: { data: {} } }}
      anchor="2026-10-17"
      zoom="day"
      setZoom={vi.fn()}
      navigate={vi.fn()}
      jump={vi.fn()}
      options={{
        type: 'all',
        durations: [],
        grouped: true,
        completed: false,
      }}
      update={vi.fn()}
      anchorNav={nav}
      overloadNav={nav}
      infeasibleNav={nav}
    />,
  )

  const trigger = screen.getByRole('button', { name: 'Item type' })
  const host = trigger.parentElement

  fireEvent.mouseEnter(host)

  act(() => vi.advanceTimersByTime(219))
  expect(trigger.getAttribute('aria-expanded')).toBe('false')

  fireEvent.mouseLeave(host)
  act(() => vi.advanceTimersByTime(500))
  expect(trigger.getAttribute('aria-expanded')).toBe('false')

  fireEvent.mouseEnter(host)
  act(() => vi.advanceTimersByTime(220))
  expect(trigger.getAttribute('aria-expanded')).toBe('true')

  fireEvent.mouseLeave(host)
  expect(trigger.getAttribute('aria-expanded')).toBe('false')

  fireEvent.click(trigger)
  expect(trigger.getAttribute('aria-expanded')).toBe('true')

  fireEvent.mouseLeave(host)
  expect(trigger.getAttribute('aria-expanded')).toBe('true')

  fireEvent.click(trigger)
  expect(trigger.getAttribute('aria-expanded')).toBe('false')

  fireEvent.click(trigger)
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(trigger.getAttribute('aria-expanded')).toBe('false')
})

it('Estimated Duration supports multiple selections without dismissing', async () => {
  const { default: Toolbar } = await vi.importActual('./TimelineToolbar')

  const nav = {
    active: false,
    count: 0,
    index: -1,
    toggle: vi.fn(),
    navigate: vi.fn(),
  }

  const update = vi.fn()

  render(
    <Toolbar
      find={{ ...find, query: '' }}
      actions={{ busy: false, history: { data: {} } }}
      anchor="2026-10-17"
      zoom="day"
      setZoom={vi.fn()}
      navigate={vi.fn()}
      jump={vi.fn()}
      options={{
        type: 'all',
        durations: [],
        grouped: true,
        completed: false,
      }}
      update={update}
      anchorNav={nav}
      overloadNav={nav}
      infeasibleNav={nav}
    />,
  )

  const trigger = screen.getByRole('button', {
    name: 'Estimated duration',
  })

  fireEvent.click(trigger)
  expect(trigger.getAttribute('aria-expanded')).toBe('true')

  const options = screen.getAllByRole('button', {
    pressed: true,
  }).filter((button) => button.hasAttribute('data-dropdown-select'))

  expect(options.length).toBe(6)

  fireEvent.click(options[0])
  expect(trigger.getAttribute('aria-expanded')).toBe('true')
  expect(update).toHaveBeenCalledWith({
    durations: expect.not.arrayContaining(['UNDER_20_MINUTES']),
  })

  fireEvent.click(options[1])
  expect(trigger.getAttribute('aria-expanded')).toBe('true')
  expect(update).toHaveBeenCalledTimes(2)

  fireEvent.pointerDown(document.body)
  expect(trigger.getAttribute('aria-expanded')).toBe('false')
})

it('calendar month navigation keeps the dropdown open', async () => {
  const { default: Toolbar } = await vi.importActual('./TimelineToolbar')

  const nav = {
    active: false,
    count: 0,
    index: -1,
    toggle: vi.fn(),
    navigate: vi.fn(),
  }

  const jump = vi.fn()

  render(
    <Toolbar
      find={{ ...find, query: '' }}
      actions={{ busy: false, history: { data: {} } }}
      anchor="2026-10-17"
      zoom="day"
      setZoom={vi.fn()}
      navigate={vi.fn()}
      jump={jump}
      options={{
        type: 'all',
        durations: [],
        grouped: true,
        completed: false,
      }}
      update={vi.fn()}
      anchorNav={nav}
      overloadNav={nav}
      infeasibleNav={nav}
    />,
  )

  const trigger = screen.getByRole('button', {
    name: 'Jump to date',
  })

  fireEvent.click(trigger)
  expect(screen.getByText('October 2026')).toBeTruthy()

  fireEvent.click(screen.getByRole('button', {
    name: 'Next month',
  }))

  expect(screen.getByText('November 2026')).toBeTruthy()
  expect(trigger.getAttribute('aria-expanded')).toBe('true')

  fireEvent.click(screen.getByRole('button', {
    name: '2026-11-12',
  }))

  expect(jump).toHaveBeenCalledWith('2026-11-12')
  expect(trigger.getAttribute('aria-expanded')).toBe('false')
})
