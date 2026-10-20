import { readFileSync } from 'node:fs'
import React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, expect, test, vi } from 'vitest'
import PlannerSidebar from './PlannerSidebar'

const clients = []
afterEach(() => {
  cleanup()
  clients.splice(0).forEach((client) => client.clear())
})

function mount(count, props = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  clients.push(client)
  const roots = Array.from({ length: count }, (_, index) => ({ id: index + 1, title: `Subject ${index + 1}` }))
  return render(
    <QueryClientProvider client={client}>
      <PlannerSidebar
        roots={roots}
        scheduler={
          <div className="planner-scheduler-mascot" data-testid="monk-dock">
            <button style={{ width: 'var(--scheduler-footprint)', height: 'var(--scheduler-footprint)', flexShrink: 0 }}>Monk dock fixture</button>
          </div>
        }
        {...props}
      />
    </QueryClientProvider>,
  )
}

test('keeps Overdue outside the subject scroller so a short sidebar cannot cover it', () => {
  const { container } = mount(3)
  const list = container.querySelector('#planner-subjects')
  expect(list.contains(screen.getByRole('button', { name: 'Overdue' }))).toBe(false)
  const css = readFileSync('src/features/timeline/SchedulerAura.css', 'utf8').replace(/\r\n/g, '\n')
  expect(css).toMatch(/@media \(max-height: 640px\)[\s\S]*--scheduler-footprint: 96px/)
})

test.each([2, 60])('keeps logo, Roots controls and Monk outside the root scroller (%s roots)', (count) => {
  const navigate = vi.fn()
  const { container } = mount(count, { onNavigateToRoot: navigate })
  const list = container.querySelector('#planner-subjects')
  expect(list.contains(screen.getByAltText('ARC'))).toBe(false)
  expect(list.contains(screen.getByRole('button', { name: 'Add root' }))).toBe(false)
  expect(list.contains(screen.getByTestId('monk-dock'))).toBe(false)
  expect(list.querySelectorAll('[data-arc-planner-sidebar-root-id]')).toHaveLength(count)
  fireEvent.click(screen.getByRole('button', { name: `Subject ${count}` }))
  expect(navigate).toHaveBeenCalledWith(count)
})

test('retains mobile collapse and add-root expansion', () => {
  const { container } = mount(2)
  const toggle = screen.getByRole('button', { name: 'Roots' })
  const list = container.querySelector('#planner-subjects')
  expect(toggle.getAttribute('aria-expanded')).toBe('false')
  expect(list.classList.contains('hidden')).toBe(true)
  fireEvent.click(toggle)
  expect(toggle.getAttribute('aria-expanded')).toBe('true')
  expect(list.classList.contains('hidden')).toBe(false)
  fireEvent.click(toggle)
  fireEvent.click(screen.getByRole('button', { name: 'Add root' }))
  expect(toggle.getAttribute('aria-expanded')).toBe('true')
  expect(screen.getByRole('textbox', { name: 'Root name' })).toBeTruthy()
})

// Opt in to real layout checks with SIDEBAR_BROWSER_TESTS=1. The dock fixture
// uses the unchanged production dock CSS and footprint, isolating scheduling.
test.runIf(process.env.SIDEBAR_BROWSER_TESTS === '1')('browser: only roots scroll, the final root is clickable, and Planner scrolls independently', async () => {
  const { chromium } = await import('@playwright/test')
  const { compile } = await import('@tailwindcss/node')
  const { readFileSync } = await import('node:fs')
  const { resolve } = await import('node:path')
  const source = readFileSync(resolve('src/index.css'), 'utf8').replace(/@import url\([^;]+;/, '')
  const compiler = await compile(source, { base: resolve('src'), onDependency() {} })
  const dockCss = readFileSync(resolve('src/features/timeline/SchedulerAura.css'), 'utf8')
  const logo = `data:image/svg+xml;base64,${Buffer.from(readFileSync(resolve('src/assets/brand/arc-logo.svg'))).toString('base64')}`
  const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN })
  try {
    for (const width of [1024, 390]) {
      for (const count of [2, 60]) {
        const { container } = mount(count)
        fireEvent.click(screen.getByRole('button', { name: 'Roots' }))
        const sidebar = container.querySelector('aside').cloneNode(true)
        sidebar.querySelector('img').src = logo
        const candidates = [...sidebar.querySelectorAll('[class]'), sidebar].flatMap((node) => [...node.classList])
        const css = compiler.build([...candidates, 'flex', 'flex-col', 'md:flex-row', 'min-w-0', 'flex-1'])
        const page = await browser.newPage({ viewport: { width, height: 800 } })
        await page.setContent(`<style>${css}\n${dockCss}</style><div class="flex flex-col md:flex-row">${sidebar.outerHTML}<main class="min-w-0 flex-1"><div style="height:2400px">Planner content</div></main></div>`)
        await page.evaluate(() => {
          document.querySelectorAll('[data-arc-planner-sidebar-root-id]').forEach((node) => {
            node.addEventListener('click', () => { document.body.dataset.clicked = node.dataset.arcPlannerSidebarRootId })
          })
        })
        const geometry = () => page.evaluate(() => {
          const aside = document.querySelector('aside')
          const list = document.querySelector('#planner-subjects')
          const rect = (selector) => {
            const box = document.querySelector(selector).getBoundingClientRect()
            return { top: box.top, bottom: box.bottom }
          }
          return {
            logo: rect('img'), heading: rect('nav > div'), monk: rect('[data-testid="monk-dock"]'),
            list: rect('#planner-subjects'), aside: rect('aside'),
            scrollTop: list.scrollTop, scrollHeight: list.scrollHeight, clientHeight: list.clientHeight,
            sidebarScroll: aside.scrollTop, overflow: getComputedStyle(aside).overflowY,
            documentWidth: document.documentElement.scrollWidth,
          }
        })
        const before = await geometry()
        expect(before.overflow).toBe('clip')
        expect(before.aside.bottom - before.aside.top).toBeLessThanOrEqual(800)
        expect(before.list.bottom).toBeLessThanOrEqual(before.monk.top)
        expect(before.monk.bottom).toBeLessThanOrEqual(before.aside.bottom)
        expect(before.documentWidth).toBeLessThanOrEqual(width)
        if (count === 2) expect(before.scrollHeight).toBe(before.clientHeight)
        else expect(before.scrollHeight).toBeGreaterThan(before.clientHeight)
        await page.locator('#planner-subjects').evaluate((node) => { node.scrollTop = node.scrollHeight })
        const after = await geometry()
        expect(after.logo).toEqual(before.logo)
        expect(after.heading).toEqual(before.heading)
        expect(after.monk).toEqual(before.monk)
        expect(after.sidebarScroll).toBe(0)
        if (count === 60) expect(after.scrollTop).toBeGreaterThan(0)
        await page.locator(`[data-arc-planner-sidebar-root-id="${count}"]`).click()
        expect(await page.locator('body').getAttribute('data-clicked')).toBe(String(count))
        if (width === 1024) {
          await page.evaluate(() => window.scrollTo(0, 400))
          const scrolled = await geometry()
          expect(scrolled.scrollTop).toBe(after.scrollTop)
          expect(scrolled.logo).toEqual(before.logo)
          expect(scrolled.heading).toEqual(before.heading)
          expect(scrolled.monk).toEqual(before.monk)
          expect(await page.evaluate(() => window.scrollY)).toBe(400)
        }
        await page.close()
        cleanup()
      }
    }
  } finally {
    await browser.close()
  }
}, 30000)


test('Overdue child links select the requested section accessibly', () => {
  const navigate = vi.fn()
  mount(1, {
    showOverdue: true,
    activeOverdueSection: 'deadline',
    onNavigateToOverdueSection: navigate,
  })
  const deadline = screen.getByRole('button', { name: 'Deadline' })
  const anchor = screen.getByRole('button', { name: 'Anchor' })
  expect(deadline.getAttribute('aria-current')).toBe('location')
  expect(anchor.hasAttribute('aria-current')).toBe(false)
  fireEvent.click(anchor)
  expect(navigate).toHaveBeenCalledWith('anchor')
})
