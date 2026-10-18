import React from 'react'
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import DependencyGraphModal, { edgeGeometry, GAP_X, graphLayout } from './DependencyGraphModal'
import * as api from '../../../api/planning'

vi.mock('../../../api/planning', () => ({ getDependencyGraph: vi.fn() }))

const task = { id: 3, title: 'Current task', item_type: 'TASK' }
const graph = { nodes: [{ id: 1, title: 'Very long prerequisite title that must be clipped inside its card', item_type: 'TASK' }, { id: 2, title: 'Second prerequisite', item_type: 'TASK' }, task, { id: 4, title: 'Follow-up', item_type: 'TASK' }], edges: [{ prerequisite_id: 1, dependent_id: 3 }, { prerequisite_id: 2, dependent_id: 3 }, { prerequisite_id: 3, dependent_id: 4 }] }
const STORAGE_KEY = 'arc.dependencyGraphModal.size.v1'
const originalViewport = { width: window.innerWidth, height: window.innerHeight }

function setViewport(width, height) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width })
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: height })
}

function mount(data = graph, onClose = vi.fn()) {
  api.getDependencyGraph.mockResolvedValue(data)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={client}><DependencyGraphModal task={task} onClose={onClose} /></QueryClientProvider>)
  return onClose
}

afterEach(() => { cleanup(); window.localStorage.clear(); setViewport(originalViewport.width, originalViewport.height); vi.clearAllMocks() })

test('uses a deterministic top-to-bottom layout for branching and merging without overlaps', () => {
  const nodes = graph.nodes
  const first = graphLayout(nodes, graph.edges)
  const second = graphLayout(nodes, graph.edges)
  expect([...first.positions.entries()]).toEqual([...second.positions.entries()])
  expect(first.positions.get(1).y).toBeLessThan(first.positions.get(3).y)
  expect(first.positions.get(2).y).toBeLessThan(first.positions.get(3).y)
  expect(first.positions.get(3).y).toBeLessThan(first.positions.get(4).y)
  expect(first.positions.get(1).x).not.toBe(first.positions.get(2).x)
  expect(GAP_X).toBe(44)
  expect(first.width).toBe(56 * 2 + 2 * 224 + GAP_X)
  const cyclic = graphLayout([{ id: 8 }, { id: 9 }], [{ prerequisite_id: 8, dependent_id: 9 }, { prerequisite_id: 9, dependent_id: 8 }])
  expect(cyclic.positions.size).toBe(2)
})

test('renders compact cards, explicit arrow geometry, a both-axis viewport, and no zoom controls', async () => {
  mount()
  await screen.findByLabelText('Dependency graph')
  const viewport = screen.getByTestId('dependency-graph-viewport')
  expect(viewport.className).toContain('overflow-x-auto')
  expect(viewport.className).toContain('overflow-y-auto')
  expect(screen.getByTestId('dependency-node-3').className).toContain('bg-[#c9dd75]')
  expect(screen.getByTestId('dependency-node-1').querySelector('span').className).toContain('truncate')
  expect(screen.queryByText('#3 · task')).toBeNull()
  expect(document.querySelectorAll('path[marker-end], marker').length).toBe(0)
  expect(document.querySelectorAll('polygon').length).toBe(3)
  expect(screen.queryByRole('button', { name: /zoom|fit graph/i })).toBeNull()
})

test('anchors explicit arrowhead tips at card tops and joins paths at their bases', () => {
  const layout = graphLayout(graph.nodes, graph.edges)
  for (const edge of graph.edges) {
    const from = layout.positions.get(edge.prerequisite_id)
    const to = layout.positions.get(edge.dependent_id)
    const geometry = edgeGeometry(from, to)
    expect(geometry.tip).toEqual({ x: to.x + 112, y: to.y })
    expect(geometry.d).toMatch(new RegExp(`M ${from.x + 112} ${from.y + 92}`))
    expect(geometry.d.endsWith(`${geometry.base.x} ${geometry.base.y}`)).toBe(true)
    const [tip, baseLeft, baseRight] = geometry.points.split(' ').map((point) => point.split(',').map(Number))
    expect(tip).toEqual([geometry.tip.x, geometry.tip.y])
    expect(baseLeft[1]).toBe(geometry.base.y)
    expect(baseRight[1]).toBe(geometry.base.y)
  }
})

test('renders ancestry and bottom hover/focus descriptions without moving cards', async () => {
  const detailed = {
    nodes: [
      { id: 1, title: 'Duplicate', item_type: 'TASK', ancestry: [{ id: 11, title: 'Project' }, { id: 12, title: 'Assignment' }], description: 'A very long description that remains in an overlay rather than changing graph geometry.'.repeat(3) },
      { id: 3, title: 'Duplicate', item_type: 'TASK', ancestry: [], description: '' },
    ],
    edges: [{ prerequisite_id: 1, dependent_id: 3 }],
  }
  mount(detailed)
  await screen.findByLabelText('Dependency graph')
  const node = screen.getByTestId('dependency-node-1')
  const before = node.getAttribute('style')
  expect(screen.getByText('Project / Assignment')).toBeTruthy()
  expect(screen.getByText('Root level')).toBeTruthy()
  expect(screen.queryByText('#1 · task')).toBeNull()
  expect(node.getAttribute('aria-label')).toContain('task ID 1')
  const description = screen.getByTestId('dependency-description-1')
  expect(description.className).toContain('top-full')
  expect(description.className).not.toContain('left-[calc(100%+12px)]')
  expect(description.className).toContain('opacity-0')
  expect(screen.queryByTestId('dependency-description-3')).toBeNull()
  fireEvent.mouseEnter(node)
  fireEvent.focus(node)
  expect(description.className).toContain('group-hover:visible')
  expect(description.className).toContain('group-focus:visible')
  expect(node.getAttribute('style')).toBe(before)
})

test('pans the scrollable canvas only from the empty diagram surface', async () => {
  mount()
  const viewport = await screen.findByTestId('dependency-graph-viewport')
  Object.defineProperty(viewport, 'scrollLeft', { value: 100, writable: true })
  Object.defineProperty(viewport, 'scrollTop', { value: 80, writable: true })
  fireEvent.pointerDown(viewport, { button: 0, pointerId: 1, clientX: 30, clientY: 40 })
  fireEvent.pointerMove(viewport, { pointerId: 1, clientX: 10, clientY: 20 })
  expect(viewport.scrollLeft).toBe(120)
  expect(viewport.scrollTop).toBe(100)
})

test('keeps loading, error, empty, close, Escape, and backdrop behavior', async () => {
  api.getDependencyGraph.mockReturnValue(new Promise(() => {}))
  const onClose = vi.fn()
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={client}><DependencyGraphModal task={task} onClose={onClose} /></QueryClientProvider>)
  expect(screen.getByRole('status')).toBeTruthy()
  cleanup()
  mount({ nodes: [task], edges: [] }, onClose)
  expect(await screen.findByText('This task has no dependencies.')).toBeTruthy()
  fireEvent.keyDown(window, { key: 'Escape' })
  fireEvent.mouseDown(screen.getByRole('dialog'))
  expect(onClose).toHaveBeenCalledTimes(1)
  fireEvent.mouseDown(screen.getByRole('presentation'))
  expect(onClose).toHaveBeenCalledTimes(2)
  cleanup()
  api.getDependencyGraph.mockRejectedValue(new Error('offline'))
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><DependencyGraphModal task={task} onClose={vi.fn()} /></QueryClientProvider>)
  expect(await screen.findByRole('alert')).toBeTruthy()
})

test('portals a fixed, viewport-centered modal to document.body', () => {
  const host = document.createElement('div')
  document.body.appendChild(host)
  api.getDependencyGraph.mockReturnValue(new Promise(() => {}))
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><DependencyGraphModal task={task} onClose={vi.fn()} /></QueryClientProvider>, { container: host })
  const backdrop = screen.getByRole('presentation')
  expect(backdrop.parentElement).toBe(document.body)
  expect(backdrop.className).toContain('fixed')
  expect(backdrop.className).toContain('items-center')
  expect(backdrop.className).toContain('justify-center')
})

test('resizes the centered modal and persists the completed size', async () => {
  setViewport(1600, 1000)
  mount()
  await screen.findByLabelText('Dependency graph')
  const modal = screen.getByTestId('dependency-graph-modal')
  const handle = screen.getByTestId('dependency-graph-resize-handle')
  fireEvent.pointerDown(handle, { pointerId: 8, clientX: 100, clientY: 100 })
  fireEvent.pointerMove(window, { pointerId: 8, clientX: 220, clientY: 80 })
  fireEvent.pointerUp(window, { pointerId: 8 })
  expect(modal.style.width).toBe('1080px')
  expect(modal.style.height).toBe('740px')
  expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY))).toEqual({ width: 1080, height: 740 })
})

test('restores persisted dimensions after closing and reopening', async () => {
  setViewport(1600, 1000)
  const onClose = mount()
  await screen.findByLabelText('Dependency graph')
  fireEvent.pointerDown(screen.getByTestId('dependency-graph-resize-handle'), { pointerId: 5, clientX: 10, clientY: 10 })
  fireEvent.pointerMove(window, { pointerId: 5, clientX: 110, clientY: 110 })
  fireEvent.pointerUp(window, { pointerId: 5 })
  fireEvent.click(screen.getByRole('button', { name: 'Close dependency graph' }))
  expect(onClose).toHaveBeenCalledOnce()
  cleanup()
  mount()
  await screen.findByLabelText('Dependency graph')
  const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY))
  expect(screen.getByTestId('dependency-graph-modal').style.width).toBe(`${stored.width}px`)
  expect(screen.getByTestId('dependency-graph-modal').style.height).toBe(`${stored.height}px`)
})

test('ignores invalid saved dimensions and clamps oversized restored dimensions', () => {
  setViewport(1600, 1000)
  window.localStorage.setItem(STORAGE_KEY, 'not-json')
  api.getDependencyGraph.mockReturnValue(new Promise(() => {}))
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><DependencyGraphModal task={task} onClose={vi.fn()} /></QueryClientProvider>)
  expect(screen.getByTestId('dependency-graph-modal').style.width).toBe('960px')
  cleanup()
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ width: 9000, height: 9000 }))
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><DependencyGraphModal task={task} onClose={vi.fn()} /></QueryClientProvider>)
  const modal = screen.getByTestId('dependency-graph-modal')
  expect(modal.style.width).toBe('1576px')
  expect(modal.style.height).toBe('976px')
})

test('constrains the restored modal when the browser viewport changes', () => {
  setViewport(1600, 1000)
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ width: 1200, height: 800 }))
  api.getDependencyGraph.mockReturnValue(new Promise(() => {}))
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><DependencyGraphModal task={task} onClose={vi.fn()} /></QueryClientProvider>)
  setViewport(700, 600)
  fireEvent(window, new Event('resize'))
  const modal = screen.getByTestId('dependency-graph-modal')
  expect(modal.style.width).toBe('676px')
  expect(modal.style.height).toBe('576px')
})
