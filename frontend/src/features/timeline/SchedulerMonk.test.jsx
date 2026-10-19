import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { readFileSync } from 'node:fs'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import SchedulerRunButton from './SchedulerRunButton'
import SchedulerAura from './SchedulerAura'
import TimelineSidebar from './TimelineSidebar'
import FocusSchedulerMascot from '../focus/FocusSchedulerMascot'
import FocusPage from '../focus/FocusPage'
import PlannerPage from '../planner/PlannerPage'
import { AURA_PARTICLES, orbitalTravel, particlePosition } from './schedulerAuraMotion'

const api = vi.hoisted(() => ({
  reschedule: vi.fn(),
  settings: vi.fn(),
  updateSettings: vi.fn(),
  focus: {},
}))
vi.mock('../../api/planning', async (original) => ({
  ...await original(),
  rescheduleTimeline: (...args) => api.reschedule(...args),
  getSchedulerSettings: (...args) => api.settings(...args),
  updateSchedulerSettings: (...args) => api.updateSettings(...args),
  getHistoryStatus: async () => ({ can_undo: false, can_redo: false }),
}))
vi.mock('../../hooks/useFocus', async (original) => ({
  ...await original(),
  useFocus: () => api.focus,
}))
vi.mock('../../hooks/usePlanningTree', () => ({ usePlanningTree: () => ({ data: [] }) }))
vi.mock('../planner/components/PlannerTree', () => ({ default: () => <div>Tree</div> }))
vi.mock('../planner/components/PriorityPanel', () => ({ default: () => <div>Priority</div> }))

let client, reduced, mediaListener, frames, nextFrame
beforeEach(() => {
  api.focus = { data: { candidates: [], today: '2026-10-12' }, isLoading: false, isError: false }
  reduced = false
  frames = new Map()
  nextFrame = 0
  api.settings.mockResolvedValue({ flavour: 'monk' })
  api.updateSettings.mockResolvedValue({ flavour: 'lock-in' })
  api.reschedule.mockResolvedValue({ changed_ids: [] })
  vi.stubGlobal('matchMedia', () => ({
    get matches() { return reduced },
    addEventListener: (_type, callback) => { mediaListener = callback },
    removeEventListener: vi.fn(),
  }))
  vi.stubGlobal('requestAnimationFrame', (callback) => { frames.set(++nextFrame, callback); return nextFrame })
  vi.stubGlobal('cancelAnimationFrame', (id) => frames.delete(id))
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
})
afterEach(() => { cleanup(); client.clear(); vi.useRealTimers(); vi.unstubAllGlobals() })
function wrap(element) { return <QueryClientProvider client={client}>{element}</QueryClientProvider> }
function advance(time) {
  const callbacks = [...frames.values()]
  frames.clear()
  act(() => callbacks.forEach((callback) => callback(time)))
}
const runtime = { configured: true, flavour: 'monk' }

it('keeps idle, delayed hover, keyboard focus and scheduling precedence without changing actions', () => {
  vi.useFakeTimers()
  const run = vi.fn().mockResolvedValue({})
  const { container, rerender } = render(wrap(<SchedulerRunButton runtime={runtime} actions={{ run }} />))
  const button = screen.getByRole('button', { name: 'Reschedule Timeline using Monk' })
  const state = () => container.querySelector('.scheduler-aura').className
  expect(state()).toContain('idle')
  fireEvent.mouseEnter(button)
  act(() => vi.advanceTimersByTime(145))
  expect(state()).toContain('hover')
  fireEvent.focus(button)
  fireEvent.mouseLeave(button)
  expect(state()).toContain('hover')
  fireEvent.blur(button)
  expect(state()).toContain('idle')
  fireEvent.click(button)
  expect(run).toHaveBeenCalledExactlyOnceWith('reschedule')
  fireEvent.focus(button)
  rerender(wrap(<SchedulerRunButton runtime={runtime} actions={{ run, schedulerBusy: true }} />))
  expect(state()).toContain('scheduling')
  expect(button.disabled).toBe(true)
  fireEvent.click(button)
  expect(run).toHaveBeenCalledTimes(1)
  rerender(wrap(<SchedulerRunButton runtime={runtime} actions={{ run, schedulerBusy: false }} />))
  expect(state()).toContain('hover')
})

it('Command-click switches Monk to Locked-In and automatically reschedules', async () => {
  const run = vi.fn().mockResolvedValue({})
  render(wrap(<SchedulerRunButton runtime={runtime} actions={{ run }} />))

  fireEvent.click(
    screen.getByRole('button', { name: 'Reschedule Timeline using Monk' }),
    { metaKey: true },
  )

  await waitFor(() => {
    expect(api.updateSettings).toHaveBeenCalledWith({
      flavour: 'lock-in',
    })
    expect(api.reschedule).toHaveBeenCalledTimes(1)
  })

  expect(run).not.toHaveBeenCalled()
})

it('Command-click switches Locked-In back to Monk', async () => {
  api.settings.mockResolvedValue({ flavour: 'lock-in' })
  api.updateSettings.mockResolvedValue({ flavour: 'monk' })

  const run = vi.fn().mockResolvedValue({})

  render(wrap(
    <SchedulerRunButton
      runtime={{ configured: true, flavour: 'lock-in' }}
      actions={{ run }}
    />,
  ))

  fireEvent.click(
    screen.getByRole('button', { name: 'Reschedule Timeline using Locked-In' }),
    { metaKey: true },
  )

  await waitFor(() => {
    expect(api.updateSettings).toHaveBeenCalledWith({
      flavour: 'monk',
    })
    expect(api.reschedule).toHaveBeenCalledTimes(1)
  })

  expect(run).not.toHaveBeenCalled()
})

it('failed Command-click announces error without rescheduling', async () => {
  api.updateSettings.mockRejectedValueOnce(
    new Error('Mode update unavailable'),
  )

  const run = vi.fn().mockResolvedValue({})
  render(wrap(<SchedulerRunButton runtime={runtime} actions={{ run }} />))

  fireEvent.click(
    screen.getByRole('button', { name: 'Reschedule Timeline using Monk' }),
    { metaKey: true },
  )

  expect(
    (await screen.findByRole('alert')).textContent,
  ).toContain('Mode update unavailable')

  expect(run).not.toHaveBeenCalled()
  expect(api.reschedule).not.toHaveBeenCalled()
})

it('retains legacy busy fallback and scheduler-settings mutation detection', async () => {
  const run = vi.fn()
  const { container, rerender } = render(wrap(<SchedulerRunButton runtime={runtime} actions={{ run, busy: true }} />))
  expect(container.querySelector('.scheduler-aura-scheduling')).toBeTruthy()
  rerender(wrap(<SchedulerRunButton runtime={runtime} actions={{ run, busy: false }} />))
  let finish
  const mutation = client.getMutationCache().build(client, {
    mutationKey: ['planning', 'scheduler-settings', 'update'],
    mutationFn: () => new Promise((resolve) => { finish = resolve }),
  })
  let pending
  await act(async () => { pending = mutation.execute() })
  await waitFor(() => expect(screen.getByRole('button').disabled).toBe(true))
  expect(container.querySelector('.scheduler-aura-scheduling')).toBeTruthy()
  await act(async () => { finish(); await pending })
  await waitFor(() => expect(screen.getByRole('button').disabled).toBe(false))
})

it('breathes 24–29px radially, retains each angle and staggers the field', () => {
  const phases = new Set()
  for (const p of AURA_PARTICLES) {
    const time = ((Math.PI - p.phase + Math.PI * 2) % (Math.PI * 2)) * p.period / (Math.PI * 2)
    const peak = particlePosition(p, 'hover', time)
    expect(Math.hypot(peak.x, peak.y)).toBeCloseTo(p.radius + p.excursion)
    expect(Math.hypot(peak.x, peak.y)).toBeGreaterThanOrEqual(60 - 1e-10)
    expect(Math.hypot(peak.x, peak.y)).toBeLessThanOrEqual(70 + 1e-10)
    const idle = particlePosition(p, 'rest', 0)
    expect(peak.x * idle.y - peak.y * idle.x).toBeCloseTo(0)
    expect(peak.x * idle.x + peak.y * idle.y).toBeGreaterThan(0)
    phases.add(p.phase)
  }
  expect(phases.size).toBe(56)
})

it('orbits in both directions with radial variation and smooth bounded acceleration', () => {
  const speed = (time) => (orbitalTravel(time + 0.001) - orbitalTravel(time)) / 0.001
  expect(speed(0)).toBeCloseTo(0.7, 2)
  expect(speed(1)).toBeGreaterThan(speed(0))
  expect(speed(4)).toBeGreaterThan(speed(1))
  expect(speed(50)).toBeCloseTo(5.0)
  expect(speed(50)).toBeLessThanOrEqual(5.00001)
  expect(new Set(AURA_PARTICLES.map((p) => p.direction)).size).toBe(2)
  for (const p of AURA_PARTICLES) {
    const a = particlePosition(p, 'scheduling', 0), b = particlePosition(p, 'scheduling', 1)
    expect(Math.abs(a.x * b.y - a.y * b.x)).toBeGreaterThan(1)
    expect(Math.hypot(a.x, a.y)).not.toBeCloseTo(Math.hypot(b.x, b.y))
  }
})

it('blends transitions without jumps, continues idle and cleans up frames', () => {
  const { container, rerender, unmount } = render(<SchedulerAura state="hover" />)
  advance(0); advance(16); advance(32)
  const particle = container.querySelector('i'), before = particle.style.transform
  rerender(<SchedulerAura state="scheduling" />)
  expect(particle.style.transform).toBe(before)
  advance(48)
  expect(particle.style.transform).toBe(before)
  advance(64)
  expect(particle.style.transform).not.toBe(before)
  const orbit = particle.style.transform
  rerender(<SchedulerAura state="idle" />)
  expect(particle.style.transform).toBe(orbit)
  for (let time = 80; time <= 2000; time += 16) advance(time)
  expect(frames.size).toBe(1)
  unmount()
  expect(frames.size).toBe(0)
})

it('keeps idle drift subtle, periodic and bidirectional without full revolutions', () => {
  expect(new Set(AURA_PARTICLES.map((p) => p.idlePeriod)).size).toBeGreaterThan(1)
  for (const p of AURA_PARTICLES) {
    expect(p.idlePeriod).toBeGreaterThanOrEqual(5)
    expect(p.idlePeriod).toBeLessThanOrEqual(9)
    const radialOffsets = [], angularOffsets = []
    for (let step = 0; step <= 200; step++) {
      const seconds = p.idlePeriod * step / 100
      const position = particlePosition(p, 'idle', seconds)
      const angle = Math.atan2(position.y, position.x) - p.angle
      const drift = Math.atan2(Math.sin(angle), Math.cos(angle)) * 180 / Math.PI
      radialOffsets.push(Math.hypot(position.x, position.y) - p.radius)
      angularOffsets.push(drift)
      expect(Math.abs(radialOffsets.at(-1))).toBeLessThanOrEqual(5 + 1e-10)
      expect(Math.abs(drift)).toBeLessThanOrEqual(7 + 1e-10)
    }
    expect(Math.max(...radialOffsets)).toBeGreaterThan(2.99)
    expect(Math.min(...radialOffsets)).toBeLessThan(-2.99)
    expect(Math.max(...angularOffsets)).toBeGreaterThan(3.99)
    expect(Math.min(...angularOffsets)).toBeLessThan(-3.99)
    const first = particlePosition(p, 'idle', 0)
    for (const cycles of [1, 1000]) {
      const repeated = particlePosition(p, 'idle', p.idlePeriod * cycles)
      expect(repeated.x).toBeCloseTo(first.x, 8)
      expect(repeated.y).toBeCloseTo(first.y, 8)
    }
  }
})

it('animates idle continuously without restarting on unchanged props', () => {
  const { container, rerender, unmount } = render(<SchedulerAura state="idle" />)
  advance(0)
  for (let time = 16; time <= 2000; time += 16) advance(time)
  const before = container.querySelector('i').style.transform
  const queued = [...frames.keys()]
  rerender(<SchedulerAura state="idle" />)
  expect([...frames.keys()]).toEqual(queued)
  for (let time = 2016; time <= 4000; time += 16) advance(time)
  expect(container.querySelector('i').style.transform).not.toBe(before)
  expect(frames.size).toBe(1)
  unmount()
  expect(frames.size).toBe(0)
})

it('preserves the exact hover and scheduling paths independently of idle motion', () => {
  for (const p of AURA_PARTICLES) {
    for (const seconds of [0, 0.5, 2, 8, 30]) {
      const hoverRadius = p.radius + p.excursion * (1 - Math.cos(seconds * Math.PI * 2 / p.period + p.phase)) / 2
      expect(particlePosition(p, 'hover', seconds)).toEqual({
        x: Math.cos(p.angle) * hoverRadius, y: Math.sin(p.angle) * hoverRadius,
      })
      const angle = p.angle + p.direction * p.speed * orbitalTravel(seconds)
      const radius = p.radius + 7 * Math.sin(seconds * 1.4 + p.phase)
      expect(particlePosition(p, 'scheduling', seconds)).toEqual({
        x: Math.cos(angle) * radius, y: Math.sin(angle) * radius,
      })
    }
  }
})

it('renders static reduced-motion states and responds to preference changes', () => {
  reduced = true
  const { container, rerender } = render(<SchedulerAura state="hover" />)
  const first = container.querySelector('i').style.transform
  expect(frames.size).toBe(0)
  rerender(<SchedulerAura state="idle" />)
  expect(container.querySelector('i').style.transform).toBe(first)
  expect(frames.size).toBe(0)
  rerender(<SchedulerAura state="scheduling" />)
  expect(container.querySelector('i').style.transform).toBe(first)
  expect(frames.size).toBe(0)
  reduced = false
  act(() => mediaListener())
  expect(frames.size).toBe(1)
  reduced = true
  act(() => mediaListener())
  expect(frames.size).toBe(0)
})

it('renders one shared trigger in Timeline and preserves its supplied action', () => {
  const run = vi.fn().mockResolvedValue({})
  const { container } = render(wrap(<TimelineSidebar roots={[]} selected={[]} schedulerRuntime={runtime} actions={{ run }} />))
  expect(container.querySelectorAll('.timeline-scheduler-run')).toHaveLength(1)
  fireEvent.click(screen.getByRole('button', { name: 'Reschedule Timeline using Monk' }))
  expect(run).toHaveBeenCalledExactlyOnceWith('reschedule')
})

it('renders one Focus trigger and retains mutation key, busy state and invalidation', async () => {
  let finish
  api.reschedule.mockImplementation(() => new Promise((resolve) => { finish = resolve }))
  const invalidate = vi.spyOn(client, 'invalidateQueries')
  const { container } = render(wrap(<FocusSchedulerMascot />))
  const button = await screen.findByRole('button', { name: 'Reschedule Timeline using Monk' })
  expect(container.querySelectorAll('.focus-scheduler-mascot .timeline-scheduler-run')).toHaveLength(1)
  fireEvent.click(button)
  await waitFor(() => expect(button.disabled).toBe(true))
  expect(container.querySelector('.scheduler-aura-scheduling')).toBeTruthy()
  expect(client.isMutating({ mutationKey: ['planning', 'scheduler', 'reschedule'] })).toBe(1)
  fireEvent.click(button)
  expect(api.reschedule).toHaveBeenCalledTimes(1)
  await act(async () => finish({ changed_ids: [] }))
  await waitFor(() => expect(button.disabled).toBe(false))
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ['planning'] })
})

it('integrates exactly one Monk in Planner and keeps it out of Priority', async () => {
  const { container, unmount } = render(wrap(<MemoryRouter initialEntries={['/planner']}><PlannerPage /></MemoryRouter>))
  const button = await screen.findByRole('button', { name: 'Reschedule Timeline using Monk' })
  expect(container.querySelectorAll('.planner-scheduler-mascot .timeline-scheduler-run')).toHaveLength(1)
  fireEvent.click(button)
  await waitFor(() => expect(api.reschedule).toHaveBeenCalledTimes(1))
  unmount()
  const priority = render(wrap(<MemoryRouter initialEntries={['/priority']}><PlannerPage /></MemoryRouter>))
  expect(priority.container.querySelectorAll('.timeline-scheduler-run')).toHaveLength(0)
})


it('increases the shared Monk and aura scale by 20% across all views', () => {
  const stylesheet = document.createElement('style')
  stylesheet.textContent = readFileSync('src/features/timeline/SchedulerAura.css', 'utf8')
  document.head.append(stylesheet)
  try {
    const { container } = render(wrap(<SchedulerRunButton runtime={runtime} actions={{ run: vi.fn() }} />))
    const button = container.querySelector('.timeline-scheduler-run')
    const visual = button.querySelector('.scheduler-visual')
    const scale = Number(getComputedStyle(document.documentElement).getPropertyValue('--scheduler-scale'))
    expect(scale).toBeCloseTo(1.15 * 1.2)
    expect(getComputedStyle(visual).transform).toContain('scale(var(--scheduler-scale))')
    expect(getComputedStyle(visual).width).toBe('160px')
    expect(getComputedStyle(visual).height).toBe('160px')
    expect(visual.querySelector('.scheduler-aura')).toBeTruthy()
    expect(visual.querySelector('.timeline-scheduler-art img')).toBeTruthy()
    expect(getComputedStyle(button).width).toBe('var(--scheduler-footprint)')
    expect(getComputedStyle(button).height).toBe('var(--scheduler-footprint)')
    expect(getComputedStyle(button).maxWidth).toBe('100%')
    const maxRadius = Math.max(...AURA_PARTICLES.map((p) => p.radius + p.excursion + p.size / 2 + 4))
    expect(maxRadius * scale).toBeLessThan(160 * scale / 2)
  } finally {
    stylesheet.remove()
  }
})

it.each(['loading', 'error', 'empty', 'populated'])('keeps exactly one scheduler in the Focus %s page', async (state) => {
  api.focus.isLoading = state === 'loading'
  api.focus.isError = state === 'error'
  if (state === 'populated') {
    api.focus.data.candidates = [{ item_id: 101, title: 'Focus task', focus_bucket: 'quick' }]
  }
  const { container } = render(wrap(<FocusPage />))
  const button = await screen.findByRole('button', { name: 'Reschedule Timeline using Monk' })
  expect(container.querySelectorAll('.focus-scheduler-mascot .timeline-scheduler-run')).toHaveLength(1)
  expect(container.querySelector('.focus-content').contains(button)).toBe(false)
  if (state === 'loading') expect(screen.getByRole('status').textContent).toContain('Loading Focus')
  if (state === 'error') expect(screen.getByRole('alert').textContent).toContain('could not be loaded')
  if (state === 'empty') expect(screen.getByText('Nothing is scheduled yet.')).toBeTruthy()
  if (state === 'populated') expect(screen.getByText('Focus task')).toBeTruthy()
  fireEvent.click(button)
  await waitFor(() => expect(api.reschedule).toHaveBeenCalledTimes(1))
})


it('anchors the sole Focus scheduler bottom-left outside the scrolling task area', async () => {
  const stylesheet = document.createElement('style')
  stylesheet.textContent = readFileSync('src/features/timeline/SchedulerAura.css', 'utf8')
    + readFileSync('src/features/focus/Focus.css', 'utf8')
  document.head.append(stylesheet)
  try {
    api.focus.data.candidates = [{ item_id: 101, title: 'Focus task', focus_bucket: 'quick' }]
    const { container } = render(wrap(<FocusPage />))
    await screen.findByRole('button', { name: 'Reschedule Timeline using Monk' })
    const dock = container.querySelector('.focus-scheduler-mascot')
    const content = container.querySelector('.focus-content')
    const page = container.querySelector('.focus-page')
    expect(getComputedStyle(page).paddingLeft).toBe('0px')
    expect(getComputedStyle(page).paddingTop).toBe('80px')
    expect(getComputedStyle(page).height).toBe('100dvh')
    // jsdom drops min() sizing declarations, so retain this width contract
    // alongside the rendered page's auto margins and zero left reservation.
    expect(stylesheet.textContent).toContain('.focus-content {\n  width: min(720px, calc(100% - 32px));')
    expect(getComputedStyle(content).marginLeft).toBe('auto')
    expect(getComputedStyle(content).marginRight).toBe('auto')
    expect(content.contains(screen.getByRole('heading', { name: 'FOCUS' }))).toBe(true)
    expect(content.contains(screen.getByRole('searchbox'))).toBe(true)
    expect(content.contains(screen.getByText('Focus task'))).toBe(true)
    expect(getComputedStyle(dock).position).toBe('fixed')
    expect(getComputedStyle(dock).left).toBe('0px')
    expect(getComputedStyle(dock).bottom).toBe('var(--scheduler-dock-bottom)')
    expect(getComputedStyle(dock).width).toBe('var(--scheduler-dock-width)')
    expect(getComputedStyle(content).overflowY).toBe('auto')
    content.scrollTop = 300
    fireEvent.scroll(content)
    expect(container.querySelectorAll('.timeline-scheduler-run')).toHaveLength(1)
    expect(container.querySelector('.focus-content').contains(dock)).toBe(false)
    expect(getComputedStyle(dock).position).toBe('fixed')
    expect(getComputedStyle(dock).getPropertyValue('--scheduler-art-size')).toBe('')
  } finally {
    stylesheet.remove()
  }
})
