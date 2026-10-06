import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { expect, test } from '@playwright/test'

// Allow cold local backend startup/scheduling; assertions still await real events.
test.setTimeout(60_000)

const repoRoot = path.resolve(process.cwd(), '..')
const batchUrl = '**/api/planning/focus/anchor/batch/'
const list = page => page.locator('.focus-manager-list')
const titles = page => list(page).locator('.focus-task-copy strong')
const row = (page, title) => list(page).locator('.focus-queue-row').filter({ has: page.getByText(title, { exact: true }) })
const expectQueue = (page, expected) => expect(titles(page)).toHaveText(expected)
const attach = (name, data) => test.info().attach(name, { body: JSON.stringify(data, null, 2), contentType: 'application/json' })

async function canonical(page) {
  return page.evaluate(async () => {
    const { queryClient } = await import('/src/lib/queryClient.js')
    await queryClient.refetchQueries({ queryKey: ['planning', 'focus'] })
    // Let query notifications and React's reconciliation effect reach the DOM.
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    return queryClient.getQueryData(['planning', 'focus'])
  })
}
async function openQueue(page) {
  await page.getByRole('button', { name: 'Open BOSS FIGHTS queue', exact: true }).click()
  await expect(list(page)).toBeVisible()
}
async function authenticate(page, scenario) {
  execFileSync(path.join(repoRoot, 'backend/.venv/bin/python'), [path.join(repoRoot, 'backend/tests/e2e/seed_focus_browser.py'), scenario], {
    cwd: path.join(repoRoot, 'backend'), env: { ...process.env, DATABASE_URL: 'sqlite:////tmp/arc_focus_browser_e2e.sqlite3' },
  })
  const session = JSON.parse(fs.readFileSync(path.join(repoRoot, 'frontend/e2e/.focus-e2e-session.json'), 'utf8'))
  // Bootstrap a disposable authenticated session after hydration has finished.
  // Avoid exercising dev StrictMode's duplicate refresh-token rotation here.
  await page.goto('/login')
  await expect(page.getByText('Loading ARC…', { exact: true })).toHaveCount(0)
  await page.evaluate(async session => {
    const { useAuthStore } = await import('/src/stores/authStore.js')
    const { getMe } = await import('/src/api/auth.js')
    useAuthStore.getState().setSession(session)
    useAuthStore.getState().setUser(await getMe())
    history.pushState({}, '', '/focus')
    window.dispatchEvent(new PopStateEvent('popstate'))
  }, session)
  await expect(page.getByRole('region', { name: 'Focus choices' })).toBeVisible()
  const data = await canonical(page)
  expect(data.candidates.every(candidate => candidate.duration_category === 'UNDER_4_HOURS')).toBe(true)
  await attach('initial-canonical', data)
  await openQueue(page)
  return data
}
function ordered(data) {
  return [...data.candidates].sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date) || a.execution_rank - b.execution_rank).map(candidate => candidate.title)
}
function changes(data, names, date) {
  return names.map((title, index) => ({ item_id: data.candidates.find(candidate => candidate.title === title).item_id, date, order: index + 1 }))
}
// Hold actual backend responses, preserving scheduler execution and payloads.
async function holdSaves(page) {
  const saves = []
  await page.route(batchUrl, async route => {
    const payload = route.request().postDataJSON()
    const response = await route.fetch()
    const body = await response.json()
    let release
    const gate = new Promise(resolve => { release = resolve })
    saves.push({ payload, body, status: response.status(), release })
    await gate
    await route.fulfill({ response })
  })
  return saves
}
async function waitSave(saves, index, expected) {
  await expect.poll(() => saves.length, { timeout: 15_000 }).toBe(index + 1)
  const save = saves[index]
  await attach(`save-${index + 1}`, { payload: save.payload, status: save.status, response: save.body })
  expect(save.status).toBe(200)
  expect(save.payload).toEqual({ changes: expected })
  return save
}
async function release(page, save) {
  // Observe acknowledgement as an event: queued B may immediately supersede
  // canonical A in the cache, while C correctly remains visible in the manager.
  await page.evaluate(async expected => {
    const { queryClient } = await import('/src/lib/queryClient.js')
    window.__focusAcknowledged = false
    window.__unsubscribeFocusAck = queryClient.getQueryCache().subscribe(event => {
      if (JSON.stringify(event.query.queryKey) === JSON.stringify(['planning', 'focus'])
          && JSON.stringify(event.query.state.data) === JSON.stringify(expected)) {
        window.__focusAcknowledged = true
      }
    })
  }, save.body.focus)
  const received = page.waitForResponse(response => response.url().endsWith('/focus/anchor/batch/') && response.request().method() === 'POST')
  save.release()
  await (await received).finished()
  if (page.__clockPaused) await page.clock.runFor(1)
  await expect.poll(() => page.evaluate(() => window.__focusAcknowledged)).toBe(true)
  await page.evaluate(() => window.__unsubscribeFocusAck())
}
async function durable(page, expected) {
  await expect(page.locator('.focus-autosave-status')).toHaveCount(0)
  await expectQueue(page, expected)
  const data = await canonical(page)
  await attach('durable-canonical', data)
  expect(ordered(data)).toEqual(expected)
  await expectQueue(page, expected)
  await page.getByRole('button', { name: 'Close queue manager', exact: true }).click()
  await openQueue(page)
  await expectQueue(page, expected)
  return data
}
async function assertMembership(page, data) {
  for (const candidate of data.candidates) {
    const group = row(page, candidate.title).locator('xpath=ancestor::section')
    const peers = data.candidates.filter(other => other.scheduled_date === candidate.scheduled_date)
    await expect(group.locator('.focus-task-copy strong')).toHaveText(peers.sort((a, b) => a.execution_rank - b.execution_rank).map(other => other.title))
  }
}
async function dragStart(page, title) {
  const source = row(page, title)
  await source.scrollIntoViewIfNeeded()
  const grip = await source.getByRole('button', { name: `Reorder ${title}`, exact: true }).boundingBox()
  const box = await source.boundingBox()
  const x = grip.x + grip.width / 2, y = grip.y + grip.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x, y - 10, { steps: 3 })
  await expect(page.locator('.focus-queue-drag-overlay')).toBeVisible()
  return { x, y, centerX: box.x + box.width / 2, centerY: box.y + box.height / 2 }
}
async function dragTo(page, sourceTitle, targetTitle, boundary = false) {
  const origin = await dragStart(page, sourceTitle)
  const target = boundary ? row(page, sourceTitle).locator('xpath=ancestor::section').locator('.focus-date-heading-drop') : row(page, targetTitle)
  const box = await target.boundingBox()
  // Collision uses the active card center, not the pointer on its grip.
  await page.mouse.move(origin.x + box.x + box.width / 2 - origin.centerX, origin.y + box.y + box.height / 2 - origin.centerY, { steps: 12 })
  await page.mouse.up()
}
async function singleMove(page, initial, final, expectedChanges, action) {
  await expectQueue(page, initial)
  const saves = await holdSaves(page)
  await action()
  await expectQueue(page, final)
  const save = await waitSave(saves, 0, expectedChanges)
  expect(ordered(save.body.focus)).toEqual(final)
  await release(page, save)
  const result = await durable(page, final)
  await assertMembership(page, result)
  expect(saves).toHaveLength(1)
  return result
}
for (const mode of ['arrow', 'rank input']) {
  test(`A/B ${mode}: anchored 1,2,3,4 remains 1,3,2,4`, async ({ page }) => {
    const data = await authenticate(page, 'anchored-four-clean')
    const final = ['1', '3', '2', '4']
    const result = await singleMove(page, ['1', '2', '3', '4'], final, changes(data, final, data.today), async () => {
      if (mode === 'arrow') await page.getByRole('button', { name: 'Move 3 up', exact: true }).click()
      else {
        await page.getByRole('button', { name: 'Edit queue position 3 for 3', exact: true }).click()
        const input = page.getByRole('textbox', { name: 'Queue position for 3', exact: true })
        await input.fill('2')
        await input.press('Enter')
      }
    })
    for (const [index, title] of final.entries()) expect(result.candidates.find(candidate => candidate.title === title)).toMatchObject({ manual_requested_date: data.today, manual_requested_order: index + 1 })
  })
}
test('captured corrupted fixture remains a rendering calibration', async ({ page }) => {
  await authenticate(page, 'anchored-four-corrupted')
  await expectQueue(page, ['1', '4', '3', '2'])
})
test('C same-date automatic Google above Timeline; untouched rows keep semantics', async ({ page }) => {
  const data = await authenticate(page, 'unanchored-real')
  const first = ['Timeline View', 'google authentication set up']
  const untouched = ['Untouched Timeline anchor', 'Untouched automatic']
  const final = [first[1], first[0], ...untouched]
  const date = data.candidates.find(candidate => candidate.title === first[0]).scheduled_date
  const result = await singleMove(page, [...first, ...untouched], final, changes(data, final.slice(0, 2), date), () => dragTo(page, first[1], first[0]))
  expect(result.candidates.find(candidate => candidate.title === first[1])).toMatchObject({ manual_requested_date: date, manual_requested_order: 1 })
  for (const title of untouched) {
    const before = data.candidates.find(candidate => candidate.title === title)
    expect(result.candidates.find(candidate => candidate.title === title)).toMatchObject({ manual_requested_date: before.manual_requested_date, manual_requested_order: before.manual_requested_order })
  }
})
test('D Admin crosses date at rank 13 then occupies exact rank 11', async ({ page }) => {
  const data = await authenticate(page, 'cross-date-real')
  const preceding = Array.from({ length: 10 }, (_, index) => `Preceding ${index + 1}`)
  const initial = [...preceding, 'Timeline View', 'google authentication set up', 'Admin View']
  await expectQueue(page, initial)
  const date = data.candidates.find(candidate => candidate.title === 'Timeline View').scheduled_date
  const saves = await holdSaves(page)
  await dragTo(page, 'Admin View', null, true)
  await expectQueue(page, initial)
  const admin = data.candidates.find(candidate => candidate.title === 'Admin View')
  const first = await waitSave(saves, 0, [{ item_id: admin.item_id, date, order: 3 }])
  expect(ordered(first.body.focus)).toEqual(initial)
  await release(page, first)
  const moved = await durable(page, initial)
  expect(moved.candidates.find(candidate => candidate.title === 'Admin View')).toMatchObject({ scheduled_date: date, manual_requested_date: date, manual_requested_order: 3 })
  await assertMembership(page, moved)
  for (const title of ['Timeline View', 'google authentication set up']) {
    expect(moved.candidates.find(candidate => candidate.title === title)).toMatchObject({
      scheduled_date: date, manual_requested_date: date, manual_requested_order: null,
    })
  }
  await dragTo(page, 'Admin View', 'Timeline View')
  const final = [...preceding, 'Admin View', 'Timeline View', 'google authentication set up']
  await expectQueue(page, final)
  const second = await waitSave(saves, 1, changes(data, final.slice(10), date))
  expect(ordered(second.body.focus)).toEqual(final)
  await release(page, second)
  const result = await durable(page, final)
  await expect(row(page, 'Admin View').getByRole('button', { name: 'Edit queue position 11 for Admin View', exact: true })).toBeVisible()
  await assertMembership(page, result)
})
for (const triple of [false, true]) {
  test(`E rapid moves: ${triple ? 'A in flight, B queued, C debounced' : 'A in flight, B debounced'}`, async ({ page }) => {
    const data = await authenticate(page, 'anchored-four-clean')
    await expectQueue(page, ['1', '2', '3', '4'])
    await page.clock.install()
    await page.clock.pauseAt(new Date())
    page.__clockPaused = true
    const saves = await holdSaves(page)
    const move = title => page.getByRole('button', { name: `Move ${title} up`, exact: true }).click()
    const a = ['1', '3', '2', '4'], b = ['1', '3', '4', '2'], c = ['3', '1', '4', '2']
    await move('3')
    await expectQueue(page, a)
    await page.clock.runFor(180)
    const first = await waitSave(saves, 0, changes(data, a, data.today))
    expect(ordered(first.body.focus)).toEqual(a)
    await move('4')
    await expectQueue(page, b)
    if (triple) {
      await page.clock.runFor(180)
      await move('3')
      await expectQueue(page, c)
    }
    await release(page, first)
    await expectQueue(page, triple ? c : b)
    if (!triple) await page.clock.runFor(180)
    const second = await waitSave(saves, 1, changes(data, b, data.today))
    expect(ordered(second.body.focus)).toEqual(b)
    await release(page, second)
    await expectQueue(page, triple ? c : b)
    if (triple) {
      expect(saves).toHaveLength(2)
      await page.clock.runFor(180)
      const third = await waitSave(saves, 2, changes(data, c, data.today))
      expect(ordered(third.body.focus)).toEqual(c)
      await release(page, third)
    }
    await page.clock.resume()
    page.__clockPaused = false
    const result = await durable(page, triple ? c : b)
    await assertMembership(page, result)
    expect(saves).toHaveLength(triple ? 3 : 2)
  })
}
for (const cancel of [false, true]) {
  test(`F canonical update during active drag: ${cancel ? 'cancel resumes reconciliation' : 'drop uses stable baseline'}`, async ({ page }) => {
    const data = await authenticate(page, 'active-drag')
    await expectQueue(page, ['A', 'B', 'C'])
    const origin = await dragStart(page, 'C')
    const external = await page.evaluate(async payload => {
      const { anchorFocusBatch } = await import('/src/api/planning.js')
      return anchorFocusBatch(payload)
    }, { changes: changes(data, ['B', 'A', 'C'], data.today) })
    await attach('external-update', external)
    expect(ordered(external.focus)).toEqual(['B', 'A', 'C'])
    const updated = await canonical(page)
    expect(ordered(updated)).toEqual(['B', 'A', 'C'])
    await expectQueue(page, ['A', 'B', 'C'])
    if (cancel) {
      await page.keyboard.press('Escape')
      await page.mouse.up()
      await durable(page, ['B', 'A', 'C'])
    } else {
      const saves = await holdSaves(page)
      const target = await row(page, 'A').boundingBox()
      await page.mouse.move(origin.x + target.x + target.width / 2 - origin.centerX, origin.y + target.y + target.height / 2 - origin.centerY, { steps: 12 })
      await page.mouse.up()
      await expectQueue(page, ['C', 'A', 'B'])
      const save = await waitSave(saves, 0, changes(data, ['C', 'A', 'B'], data.today))
      expect(ordered(save.body.focus)).toEqual(['C', 'A', 'B'])
      await release(page, save)
      await durable(page, ['C', 'A', 'B'])
    }
  })
}
