import React from 'react'
import { fireEvent, render, screen, waitFor, cleanup } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

const api = vi.hoisted(() => ({ createItem: vi.fn(), updateItem: vi.fn(), listTags: vi.fn(), createTag: vi.fn(), listPrerequisites: vi.fn(), listItems: vi.fn(), addPrerequisite: vi.fn(), removePrerequisite: vi.fn() }))
vi.mock('../../../api/planning', () => api)
import CreatePlanningItemPanel from './CreatePlanningItemPanel'
import TaskPrerequisites from './TaskPrerequisites'

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
  expect(screen.queryByRole('button', { name: 'Prerequisites' })).toBeNull()
})


test('editor omits prerequisites while canonical save still invalidates planning', async () => {
  const onUpdated = vi.fn()
  const cache = mount({ editingItem: item, onUpdated })
  const invalidate = vi.spyOn(cache, 'invalidateQueries')
  expect(screen.queryByRole('button', { name: 'Prerequisites' })).toBeNull()
  const save = screen.getByText('SAVE')
  expect(screen.queryByText('Prerequisites are saved in a separate workflow.')).toBeNull()
  fireEvent.click(save)
  await waitFor(() => expect(onUpdated).toHaveBeenCalledOnce())
  expect(api.updateItem).toHaveBeenCalledWith(item.id, expect.objectContaining({ title: item.title }))
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ['planning'] })
})


const estimates = [
  ['UNDER_20_MINUTES', '<20m'], ['UNDER_1_HOUR', '<1h'], ['UNDER_4_HOURS', '<4h'],
  ['UNDER_8_HOURS', '<8h'], ['UNDER_16_HOURS', '<16h'], ['OVER_16_HOURS', '>16h'],
]

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
  await waitFor(() => expect(api.updateItem).toHaveBeenCalledWith(item.id, expect.objectContaining({ duration_category })))
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
