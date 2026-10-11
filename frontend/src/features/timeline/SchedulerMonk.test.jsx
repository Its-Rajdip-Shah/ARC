import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import SchedulerRunButton from './SchedulerRunButton'
import SchedulerAura from './SchedulerAura'
import TimelineSidebar from './TimelineSidebar'
import FocusSchedulerMascot from '../focus/FocusSchedulerMascot'
import PlannerPage from '../planner/PlannerPage'
import { AURA_PARTICLES, orbitalTravel, particlePosition } from './schedulerAuraMotion'

const api = vi.hoisted(() => ({ reschedule: vi.fn(), settings: vi.fn() }))
vi.mock('../../api/planning', async (original) => ({
  ...await original(),
  rescheduleTimeline: (...args) => api.reschedule(...args),
  getSchedulerSettings: (...args) => api.settings(...args),
  getHistoryStatus: async () => ({ can_undo: false, can_redo: false }),
}))
vi.mock('../../hooks/usePlanningTree', () => ({ usePlanningTree: () => ({ data: [] }) }))
vi.mock('../planner/components/PlannerTree', () => ({ default: () => <div>Tree</div> }))
vi.mock('../planner/components/PriorityPanel', () => ({ default: () => <div>Priority</div> }))

let client, reduced, mediaListener, frames, nextFrame
beforeEach(() => {
  reduced = false
  frames = new Map()
  nextFrame = 0
  api.settings.mockResolvedValue({ flavour: 'monk' })
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
    const idle = particlePosition(p, 'idle', 0)
    expect(peak.x * idle.y - peak.y * idle.x).toBeCloseTo(0)
    expect(peak.x * idle.x + peak.y * idle.y).toBeGreaterThan(0)
    phases.add(p.phase)
  }
  expect(phases.size).toBe(56)
})

it('orbits in both directions with radial variation and smooth bounded acceleration', () => {
  const speed = (time) => (orbitalTravel(time + 0.001) - orbitalTravel(time)) / 0.001
  expect(speed(0)).toBeCloseTo(0.35, 2)
  expect(speed(1)).toBeGreaterThan(speed(0))
  expect(speed(4)).toBeGreaterThan(speed(1))
  expect(speed(50)).toBeCloseTo(2.1)
  expect(speed(50)).toBeLessThanOrEqual(2.10001)
  expect(new Set(AURA_PARTICLES.map((p) => p.direction)).size).toBe(2)
  for (const p of AURA_PARTICLES) {
    const a = particlePosition(p, 'scheduling', 0), b = particlePosition(p, 'scheduling', 1)
    expect(Math.abs(a.x * b.y - a.y * b.x)).toBeGreaterThan(1)
    expect(Math.hypot(a.x, a.y)).not.toBeCloseTo(Math.hypot(b.x, b.y))
  }
})

it('blends transitions without jumps, settles idle and cleans up frames', () => {
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
  expect(frames.size).toBe(0)
  unmount()
  expect(frames.size).toBe(0)
})

it('renders static reduced-motion states and responds to preference changes', () => {
  reduced = true
  const { container, rerender } = render(<SchedulerAura state="hover" />)
  const first = container.querySelector('i').style.transform
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
