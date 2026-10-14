import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, test } from 'node:test'
import { createServer } from 'vite'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  addDays,
  todayKey,
  makeScale,
  packLanes,
  colourZones,
  taskGeometry,
  packTaskLanes,
  TASK_CARD_COLLISION_WIDTH,
  TASK_COLLISION_GAP,
  positionOf,
  intervalGeometry,
  itemsInPeriod,
  concentratedItems,
  isPersistentConcentration,
} from './timelineDates.js'

let server
let Board
let Navigator

before(async () => {
  server = await createServer({
    configFile: false,
    server: { middlewareMode: true, hmr: false, ws: false },
    optimizeDeps: { noDiscovery: true, include: [] },
    appType: 'custom',
    plugins: [(await import('@vitejs/plugin-react')).default()],
  })
  const mod = await server.ssrLoadModule('/src/features/timeline/TimelineBoard.jsx')
  Board = mod.default
  Navigator = (await server.ssrLoadModule('/src/features/timeline/TimelineTaskNavigator.jsx')).default
})

after(async () => {
  await server?.close()
})

const base = {
  id: 1,
  title: 'Assignment',
  root: { id: 2, title: 'Root' },
  hierarchy_path: [],
  item_type: 'ASSIGNMENT',
  duration_category: 'UNDER_1_HOUR',
  is_completed: false,
  start_date: '2026-09-20',
  scheduled_date: '2026-09-21',
  due_date: '2026-09-24',
  submission_url: 'https://example.com/submit',
}

function render(patch = {}, opts = {}) {
  return renderToStaticMarkup(
    React.createElement(Board, {
      scale: opts.scale ?? makeScale('2026-09-19', 'day'),
      items: opts.items ?? [{ ...base, ...patch }],
      data:
        opts.data ??
        {
          timezones:
            opts.timezones ??
            [],
        },
      grouped: opts.grouped ?? false,
      scrollRef: null,
      find: {
        matchIds: new Set(),
        registerCard() {},
      },
      actions: { busy: false },
    }),
  )
}

test('execution and marker positions use their own dates', () => {
  const html = render()

  assert.match(html, /timeline-card-position" style="left:224px"/)
  assert.match(html, /timeline-release(?: timeline-marker-popped)?" style="left:112px"/)
  assert.match(html, /timeline-due(?: timeline-marker-popped)?" style="left:560px"/)
  assert.match(html, /timeline-constraint-line" style="left:112px;width:448px"/)
  assert.match(html, /href="https:\/\/example.com\/submit" target="_blank"/)

  assert.match(
    render({ due_date: '2026-09-25' }),
    /timeline-card-position" style="left:224px"/,
  )
})

test('same-day release, execution and deadline retain both markers', () => {
  const html = render({
    start_date: base.scheduled_date,
    due_date: base.scheduled_date,
  })

  assert.match(
    html,
    /timeline-card-marker timeline-release" style="left:0"/,
  )
  assert.match(
    html,
    /timeline-card-marker timeline-due" style="left:0"/,
  )
  assert.match(html, /timeline-card-position" style="left:224px"/)
  assert.match(html, /timeline-row-constrained/)
})

test('one-sided constraints connect to execution without inventing endpoints', () => {
  const release = render({ due_date: null })
  assert.match(release, /timeline-release/)
  assert.doesNotMatch(release, /timeline-due/)
  assert.match(release, /timeline-constraint-line/)

  const due = render({ start_date: null })
  assert.match(due, /timeline-due/)
  assert.doesNotMatch(due, /timeline-release/)
  assert.match(due, /timeline-constraint-line/)
})

test('crossing intervals clip without manufactured endpoint dots', () => {
  const html = render({
    start_date: '2026-09-01',
    due_date: '2026-11-01',
  })

  assert.match(
    html,
    /timeline-constraint-line" style="left:0;width:1568px"/,
  )
  assert.doesNotMatch(html, /timeline-release|timeline-due/)

  assert.match(
    render({ start_date: '2026-09-01' }),
    /timeline-due(?: timeline-marker-popped)?" style="left:560px"/,
  )
})

test('out-of-range execution renders no card and no unplaced panel', () => {
  for (const scheduled_date of [null, '2026-11-01']) {
    const html = render({ scheduled_date })

    assert.doesNotMatch(html, /timeline-card-position/)
    assert.doesNotMatch(html, /timeline-unplaced/)

    // Visible release/deadline information may still occupy its constraint lane.
    assert.match(html, /timeline-constraint-line/)
  }
})

test('unconstrained tasks do not reserve a marker lane', () => {
  const html = render({
    start_date: null,
    due_date: null,
  })

  assert.doesNotMatch(html, /timeline-row-constrained/)
  assert.match(html, /timeline-card-position" style="left:224px"/)
})

test('date headers render as buttons for click-to-focus', () => {
  const html = render()
  assert.match(html, /<button[^>]*class="timeline-date/)
})

test('contextual range lane packing: non-overlapping ranges share one lane', () => {
  const scale = makeScale('2026-09-14', 'day')
  const zones = [
    {
      id: 1,
      title: 'Week 7',
      start_date: '2026-09-14',
      end_date: '2026-09-20',
    },
    {
      id: 2,
      title: 'Week 8',
      start_date: '2026-09-21',
      end_date: '2026-09-27',
    },
  ]

  const { assignments, laneCount } = packLanes(zones, scale)

  assert.equal(laneCount, 1)
  assert.equal(assignments.length, 2)
  assert.equal(assignments[0].lane, 0)
  assert.equal(assignments[1].lane, 0)
})

test('contextual range lane packing: overlapping ranges use separate lanes', () => {
  const scale = makeScale('2026-09-01', 'month')
  const zones = [
    {
      id: 1,
      title: 'Semester 2',
      start_date: '2026-08-03',
      end_date: '2026-11-08',
    },
    {
      id: 2,
      title: 'Week 7',
      start_date: '2026-09-14',
      end_date: '2026-09-20',
    },
    {
      id: 3,
      title: 'Week 8',
      start_date: '2026-09-21',
      end_date: '2026-09-27',
    },
    {
      id: 4,
      title: 'Mid-semester break',
      start_date: '2026-09-28',
      end_date: '2026-10-04',
    },
  ]

  const { assignments, laneCount } = packLanes(zones, scale)

  assert.equal(laneCount, 2)

  assert.equal(assignments[0].zone.title, 'Semester 2')
  assert.equal(assignments[0].lane, 0)

  for (let i = 1; i < assignments.length; i++) {
    assert.equal(
      assignments[i].lane,
      1,
      assignments[i].zone.title + ' should be in lane 1',
    )
  }
})


test('scale widths and board columns agree for every zoom', () => {
  for (const [zoom, width, count] of [['day', 112, 14], ['week', 168, 8], ['month', 280, 12]]) {
    const scale = makeScale('2026-09-19', zoom)
    assert.equal(scale.columnWidth, width)
    assert.equal(scale.width, width * count)
    assert.ok(render({}, { scale }).includes('--timeline-column:' + width + 'px'))
  }
})

test('day positions remain exact day boundaries', () => {
  const scale = makeScale('2026-09-19', 'day')
  assert.equal(positionOf('2026-09-20', scale), 112)
  assert.equal(positionOf('2026-09-21', scale), 224)
  assert.equal(positionOf('2026-09-24', scale), 560)
  assert.equal(positionOf('2026-09-20', scale, 'end'), 224)
})

test('week dates advance proportionally within the same week', () => {
  const scale = makeScale('2026-09-19', 'week')
  assert.equal(positionOf('2026-09-14', scale), 0)
  assert.equal(positionOf('2026-09-15', scale), 24)
  assert.equal(positionOf('2026-09-20', scale), 144)
  assert.equal(positionOf('2026-09-21', scale), 168)
  assert.equal(positionOf('2026-09-15', scale, 'end'), 48)
  assert.equal(positionOf('2026-09-20', scale, 'end'), 168)
})

test('month positions respect actual month lengths and end edges', () => {
  for (const [anchor, middle, last, days] of [
    ['2026-09-01', '2026-09-16', '2026-09-30', 30],
    ['2026-10-01', '2026-10-16', '2026-10-31', 31],
    ['2024-02-01', '2024-02-16', '2024-02-29', 29],
  ]) {
    const scale = makeScale(anchor, 'month')
    assert.equal(positionOf(anchor, scale), 0)
    assert.ok(Math.abs(positionOf(middle, scale) - 15 / days * 280) < 1e-9)
    assert.ok(Math.abs(positionOf(last, scale) - (days - 1) / days * 280) < 1e-9)
    assert.ok(positionOf(middle, scale) < positionOf(last, scale))
    assert.ok(Math.abs(positionOf(middle, scale, 'end') - 16 / days * 280) < 1e-9)
    assert.equal(positionOf(last, scale, 'end'), 280)
  }
})

test('proportional constraint intervals share endpoint geometry and clipping', () => {
  for (const zoom of ['day', 'week', 'month']) {
    const scale = makeScale('2026-09-19', zoom)
    const start = '2026-09-19'
    const end = '2026-09-20'
    const interval = intervalGeometry(start, end, scale)
    assert.equal(interval.left, positionOf(start, scale))
    assert.ok(interval.width > 0)
    assert.ok(Math.abs(interval.left + interval.width - positionOf(end, scale)) < 1e-9)
    const inclusive = intervalGeometry(start, end, scale, 'end')
    assert.ok(Math.abs(inclusive.left + inclusive.width - positionOf('2026-09-21', scale)) < 1e-9)
    assert.deepEqual(intervalGeometry('2020-01-01', '2030-01-01', scale),
      { left: 0, width: scale.width })
  }
})

test('month context ranges use actual inclusive dates across month boundaries', () => {
  const scale = makeScale('2026-09-01', 'month')
  for (const [start, end, left, right] of [
    ['2026-11-02', '2026-11-08', 560 + 280 / 30, 560 + 8 / 30 * 280],
    ['2026-09-28', '2026-10-04', 27 / 30 * 280, 280 + 4 / 31 * 280],
    ['2026-09-14', '2026-09-20', 13 / 30 * 280, 20 / 30 * 280],
  ]) {
    const geometry = intervalGeometry(start, end, scale, 'end')
    assert.ok(Math.abs(geometry.left - left) < 1e-9)
    assert.ok(Math.abs(geometry.left + geometry.width - right) < 1e-9)
  }
  const first = intervalGeometry('2026-09-14', '2026-09-20', scale, 'end')
  const next = intervalGeometry('2026-09-21', '2026-09-27', scale, 'end')
  assert.equal(first.left + first.width, next.left)
})

test('inclusive ranges clip to visible scale boundaries at every zoom', () => {
  for (const zoom of ['day', 'week', 'month']) {
    const scale = makeScale('2026-09-19', zoom)
    assert.equal(positionOf(scale.to, scale, 'end'), scale.width)
    assert.deepEqual(intervalGeometry('2020-01-01', '2030-01-01', scale, 'end'),
      { left: 0, width: scale.width })
    assert.equal(intervalGeometry('2020-01-01', '2020-01-02', scale, 'end'), null)
    assert.equal(intervalGeometry('2030-01-01', '2030-01-02', scale, 'end'), null)
  }
})

test('context range retains the full title in its hover tooltip', () => {
  const html = render({}, { timezones: [{
    id: 1, title: 'Mid-semester break', start_date: '2026-09-20', end_date: '2026-09-21',
  }] })
  assert.match(html, /title="Mid-semester break: 2026-09-20 – 2026-09-21"/)
})

test('context lanes use intrinsic shared row heights and three-line labels', () => {
  const css = readFileSync(new URL('./Timeline.css', import.meta.url), 'utf8')
  const lanes = css.match(/\.timeline-zone-lanes \{([^}]+)\}/)[1]
  const zone = css.match(/\.timeline-zone \{([^}]+)\}/)[1]
  const label = css.match(/\.timeline-zone-label \{([^}]+)\}/)[1]
  assert.match(lanes, /display: grid/)
  assert.match(lanes, /grid-auto-rows: max-content/)
  assert.match(lanes, /align-items: stretch/)
  assert.doesNotMatch(lanes, /height:/)
  assert.match(lanes, /--zone-lane-gap: 4px/)
  assert.match(lanes, /row-gap: var\(--zone-lane-gap\)/)
  assert.match(zone, /box-sizing: border-box/)
  assert.match(zone, /grid-column: 1/)
  assert.doesNotMatch(zone, /(?:^|;)\s*(?:height|position|top):/)
  assert.match(label, /white-space: normal/)
  assert.match(label, /overflow-wrap: anywhere/)
  assert.match(label, /-webkit-line-clamp: 3/)
  assert.match(label, /overflow: hidden/)
})

test('packed lanes retain actual interval widths for natural Day and Month wrapping', () => {
  const timezones = [
    { id: 1, title: 'Semester 2', start_date: '2026-09-01', end_date: '2026-11-30' },
    { id: 2, title: 'Week 7', start_date: '2026-09-21', end_date: '2026-09-27' },
    { id: 3, title: 'Mid-semester break', start_date: '2026-09-28', end_date: '2026-10-04' },
  ]
  for (const zoom of ['day', 'month']) {
    const scale = makeScale('2026-09-21', zoom)
    const html = render({}, { scale, timezones })
    const { assignments } = packLanes(timezones, scale)
    const styles = [...html.matchAll(/class="timeline-zone"[^>]*style="([^"]+)"/g)].map((match) => Object.fromEntries(match[1].split(';').map((entry) => entry.split(':'))))
    for (const [index, { zone, lane }] of assignments.entries()) {
      const { left, width } = intervalGeometry(zone.start_date, zone.end_date, scale, 'end')
      assert.equal(parseFloat(styles[index].width), width)
      assert.equal(parseFloat(styles[index]['margin-left']), left)
      assert.equal(Number(styles[index]['grid-row']), lane + 1)
    }
    assert.equal(assignments[1].lane, assignments[2].lane)
    assert.notEqual(assignments[0].lane, assignments[1].lane)
    assert.match(html, /class="timeline-zone-label">Mid-semester break<\/span>/)
    const interval = intervalGeometry(timezones[2].start_date, timezones[2].end_date, scale, 'end')
    assert.ok(zoom === 'day' ? interval.width === 784 : interval.width < 65)
  }
})

test('context colours distinguish adjacent chains and reuse colours after gaps', () => {
  const scale = makeScale('2026-09-01', 'month')
  const zones = [
    { id: 1, start_date: '2026-09-01', end_date: '2026-09-07' },
    { id: 2, start_date: '2026-09-08', end_date: '2026-09-14' },
    { id: 3, start_date: '2026-09-15', end_date: '2026-09-21' },
    { id: 4, start_date: '2026-09-25', end_date: '2026-09-27' },
  ]
  const packed = packLanes(zones, scale).assignments
  const coloured = colourZones(packed, scale)
  assert.deepEqual(coloured.map(({ colour }) => colour), [0, 1, 0, 0])
  assert.deepEqual(colourZones(packed, scale), coloured)
  assert.deepEqual(coloured.map(({ lane }) => lane), packed.map(({ lane }) => lane))
  const overlapping = colourZones(packLanes([
    { id: 0, start_date: '2026-09-01', end_date: '2026-09-30' }, ...zones,
  ], scale).assignments, scale)
  assert.deepEqual(overlapping.map(({ colour }) => colour), [0, 1, 2, 0, 0])
})

test('browser lays out compact variable lanes, gaps and actual-width wrapping', { skip: process.env.TIMELINE_BROWSER_TESTS !== '1' }, async (t) => {
  const { existsSync, mkdtempSync, writeFileSync, rmSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const { execFileSync } = await import('node:child_process')
  const chrome = process.env.CHROME_BIN
  if (!chrome || !existsSync(chrome)) {
    return t.skip(
      'Set CHROME_BIN to a Chromium-compatible browser executable to run browser layout assertions',
    )
  }
  const dir = mkdtempSync(join(tmpdir(), 'timeline-layout-'))
  try {
    const css = readFileSync(new URL('./Timeline.css', import.meta.url), 'utf8')
    const zone = (row, width, title) => `<div class="timeline-zone" style="grid-row:${row};width:${width}px"><span class="timeline-zone-label">${title}</span></div>`
    const cases = [
      zone(1, 100, 'Week 7'),
      zone(1, 100, 'Week 7') + zone(2, 100, 'Week 8'),
      zone(1, 100, 'one') + zone(2, 100, 'one<br>two') + zone(2, 100, 'short') + zone(3, 100, 'one<br>two<br>three<br>four'),
      ...['day', 'month'].map((zoom) => zone(1, intervalGeometry('2026-09-28', '2026-10-04', makeScale('2026-09-21', zoom), 'end').width, 'Mid-semester break')),
    ]
    const path = join(dir, 'fixture.html')
    writeFileSync(path, `<style>${css} body {font-family:Arial}</style>${cases.map((html) => `<div class="timeline-zone-lanes">${html}</div>`).join('')}<script>document.body.dataset.results=JSON.stringify([...document.querySelectorAll('.timeline-zone-lanes')].map(el=>({height:el.getBoundingClientRect().height,zones:[...el.children].map(z=>z.getBoundingClientRect().height)})))</script>`)
    const html = execFileSync(chrome, ['--headless', '--no-sandbox', '--disable-gpu', '--no-first-run', `--user-data-dir=${join(dir, 'profile')}`, '--dump-dom', `file://${path}`], { encoding: 'utf8', timeout: 30000, stdio: ['ignore', 'pipe', 'pipe'] })
    const results = JSON.parse(html.match(/data-results="([^"]+)"/)[1].replaceAll('&quot;', '"'))
    assert.deepEqual(results[0], { height: 18, zones: [18] })
    assert.deepEqual(results[1], { height: 40, zones: [18, 18] })
    assert.deepEqual(results[2], { height: 98, zones: [18, 30, 30, 42] })
    assert.equal(results[3].height, 18)
    assert.ok(results[4].height > 18 && results[4].height <= 42)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('task footprints combine card, constraints, markers and collision clearance', () => {
  const scale = makeScale('2026-09-19', 'day')
  const plain = { ...base, start_date: null, due_date: null }
  const g = taskGeometry(plain, scale)
  assert.equal(g.card.left, 224)
  assert.equal(g.card.width, TASK_CARD_COLLISION_WIDTH)
  assert.equal(g.left, 218)
  assert.equal(g.right, 515)
  const release = taskGeometry({ ...plain, start_date: '2026-09-20' }, scale)
  assert.deepEqual(release.constraint, { left: 112, width: 112 })
  assert.equal(release.left, 98)
  assert.equal(release.right, 515)
  const due = taskGeometry({ ...plain, due_date: '2026-09-24' }, scale)
  assert.deepEqual(due.constraint, { left: 224, width: 336 })
  assert.equal(due.right, 574)
  const both = taskGeometry(base, scale)
  assert.equal(both.left, 98)
  assert.equal(both.right, 574)
  const clipped = taskGeometry({ ...base, scheduled_date: '2030-01-01', start_date: '2020-01-01', due_date: '2030-01-02' }, scale)
  assert.deepEqual(clipped.constraint, { left: 0, width: scale.width })
  assert.equal(clipped.left, 0)
  assert.equal(clipped.markers.length, 0)
  assert.equal(clipped.card, null)
})

test('task interval partitioning is deterministic and uses minimum lanes', () => {
  const scale = makeScale('2026-09-19', 'day')
  const task = (id, day, completed = false) => ({ ...base, id, start_date: null, due_date: null, scheduled_date: '2026-09-' + day, is_completed: completed })
  const items = [task(1, 19), task(2, 20), task(3, 22, true), task(4, 23)]
  const lanes = packTaskLanes(items, scale)
  assert.equal(lanes.length, 2)
  assert.deepEqual(lanes.map((lane) => lane.map(({ item }) => item.id)), [[1, 3], [2, 4]])
  assert.deepEqual(packTaskLanes([...items].reverse(), scale), lanes)
  assert.equal(packTaskLanes([items[0], items[2]], scale).length, 1)
  assert.equal(packTaskLanes([items[0], items[1]], scale).length, 2)
  const html = render({}, { items: [items[0], items[2]] })
  assert.equal([...html.matchAll(/class="timeline-row"/g)].length, 1)
  assert.match(html, /class="timeline-task timeline-completed(?:\s|")/)
  assert.doesNotMatch(html, /class="timeline-row[^"]*timeline-completed/)
  const groupedItems = [items[0], { ...items[1], root: { id: 3, title: 'Other root' } }]
  assert.equal([...render({}, { items: groupedItems, grouped: true }).matchAll(/class="timeline-root"/g)].length, 2)
})

test('occluded endpoints retain date X with independent card-relative markers', () => {
  const item = { ...base, start_date: '2026-09-21', due_date: '2026-09-22' }
  const geometry = taskGeometry(item, makeScale('2026-09-19', 'day'))

  assert.deepEqual(
    geometry.markers.map(({ x, popped }) => [x, popped]),
    [[224, true], [336, true]],
  )

  const html = render(item)

  const cardLeft = Number(
    html.match(/timeline-card-position" style="left:([\d.-]+)px/)?.[1],
  )
  const releaseLocalLeft = Number(
    html.match(/timeline-card-marker timeline-release" style="left:([\d.-]+)/)?.[1],
  )
  const dueLocalLeft = Number(
    html.match(/timeline-card-marker timeline-due" style="left:([\d.-]+)/)?.[1],
  )

  assert.equal(cardLeft + releaseLocalLeft, geometry.markers[0].x)
  assert.equal(cardLeft + dueLocalLeft, geometry.markers[1].x)

})

test('constraint-only one-sided intervals expose a focusable delayed preview trigger', () => {
  const html = render(
    {
      ...base,
      title: 'Assignment',
      scheduled_date: '2026-10-10',
      start_date: '2026-09-20',
      due_date: null,
    },
  )

  /*
   * Hover-intent previews are deliberately not mounted during the static
   * render.  The constraint surface itself must remain keyboard focusable;
   * TimelineBoard mounts the read-only card when that surface receives
   * focus, or after the pointer dwell delay.
   */
  assert.match(
    html,
    /class="timeline-constraint-preview"/,
  )

  assert.match(
    html,
    /tabindex="0"/,
  )

  assert.match(
    html,
    /aria-label="Preview Assignment"/,
  )

  assert.doesNotMatch(
    html,
    /disabled="" aria-label="Complete Assignment"/,
  )
})


test('period concentration uses scheduled date only and includes boundaries', () => {
  const column = { from: '2026-09-20', to: '2026-09-22' }

  const items = [
    { id: 1, scheduled_date: '2026-09-19', start_date: '2026-09-20', due_date: '2026-09-22' },
    { id: 2, scheduled_date: '2026-09-20' },
    { id: 3, scheduled_date: '2026-09-21' },
    { id: 4, scheduled_date: '2026-09-22' },
    { id: 5, scheduled_date: '2026-09-23', start_date: '2026-09-21', due_date: '2026-09-21' },
    { id: 6, scheduled_date: null, start_date: '2026-09-20', due_date: '2026-09-22' },
  ]

  assert.deepEqual(
    itemsInPeriod(items, column).map((item) => item.id),
    [2, 3, 4],
  )
})

test('no active period preserves the complete item universe', () => {
  const items = [
    { id: 1, scheduled_date: '2026-09-20' },
    { id: 2, scheduled_date: '2026-09-21' },
  ]

  assert.equal(concentratedItems(items, null, null), items)
})

test('hovered period temporarily overrides selected period', () => {
  const items = [
    { id: 1, scheduled_date: '2026-09-20' },
    { id: 2, scheduled_date: '2026-09-21' },
    { id: 3, scheduled_date: '2026-09-22' },
  ]

  const selected = { from: '2026-09-20', to: '2026-09-20' }
  const hovered = { from: '2026-09-22', to: '2026-09-22' }

  assert.deepEqual(
    concentratedItems(items, hovered, selected).map((item) => item.id),
    [3],
  )

  assert.deepEqual(
    concentratedItems(items, null, selected).map((item) => item.id),
    [1],
  )
})

test('empty concentrated period contains no unrelated work', () => {
  const items = [
    { id: 1, scheduled_date: '2026-09-20' },
    { id: 2, scheduled_date: '2026-09-21' },
  ]

  assert.deepEqual(
    concentratedItems(
      items,
      { from: '2026-09-30', to: '2026-09-30' },
      null,
    ),
    [],
  )
})

test('persistent concentration exists only without hover override', () => {
  const selected = { from: '2026-09-20', to: '2026-09-20' }
  const hovered = { from: '2026-09-21', to: '2026-09-21' }

  assert.equal(isPersistentConcentration(null, null), false)
  assert.equal(isPersistentConcentration(hovered, null), false)
  assert.equal(isPersistentConcentration(null, selected), true)
  assert.equal(isPersistentConcentration(hovered, selected), false)
})


test('secondary scheduler sessions never duplicate canonical constraint markers', () => {
  const scale = makeScale('2026-09-19', 'day')

  const primary = taskGeometry(
    {
      ...base,
      scheduled_date: '2026-09-21',
      start_date: '2026-09-20',
      due_date: '2026-09-24',
      show_constraints: true,
    },
    scale,
  )

  const secondary = taskGeometry(
    {
      ...base,
      render_id: '1:2026-09-22:2',
      scheduled_date: '2026-09-22',
      start_date: '2026-09-20',
      due_date: '2026-09-24',
      show_constraints: false,
    },
    scale,
  )

  assert.ok(primary.constraint)
  assert.equal(primary.markers.length, 2)

  assert.ok(secondary.card)
  assert.equal(secondary.constraint, null)
  assert.deepEqual(secondary.markers, [])

  // Its collision footprint is now execution-card-only as well.
  assert.equal(
    secondary.left,
    Math.max(
      0,
      secondary.card.left - TASK_COLLISION_GAP / 2,
    ),
  )
})


test('due-only unscheduled work never renders an orphan floating endpoint', () => {
  const scale = makeScale('2026-09-19', 'day')

  const geometry = taskGeometry(
    {
      ...base,
      scheduled_date: null,
      start_date: null,
      due_date: '2026-09-24',
      show_constraints: true,
    },
    scale,
  )

  assert.equal(
    geometry,
    null,
  )
})


test('offscreen execution plus visible deadline keeps a real clipped line and endpoint', () => {
  const scale = makeScale('2026-09-19', 'day')

  const geometry = taskGeometry(
    {
      ...base,
      scheduled_date: '2026-09-10',
      start_date: null,
      due_date: '2026-09-24',
      show_constraints: true,
    },
    scale,
  )

  assert.ok(
    geometry.constraint,
  )

  assert.equal(
    geometry.markers.length,
    1,
  )

  assert.equal(
    geometry.markers[0].field,
    'due_date',
  )
})


test('date headers surface explicit overload and engine infeasible states', () => {
  const future = addDays(todayKey(), 7)
  const html = render(
    {},
    {
      scale: makeScale(future, 'day'),
      data: {
        timezones: [],
        overload_dates: [
          future,
        ],
        scheduler: {
          daily_load: [
            {
              scheduled_date:
                addDays(future, 1),
              hours:
                '9.0000',
              status:
                'infeasible',
            },
          ],
        },
      },
    },
  )

  assert.match(
    html,
    /timeline-date-overloaded/,
  )

  assert.match(
    html,
    /timeline-date-infeasible/,
  )
})

test('historical scheduling indicators are hidden while task cards remain visible', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-11T12:00:00Z') })
  const today = todayKey()

  for (const offset of [-1, 0, 1]) {
    const date = addDays(today, offset)

    for (const status of ['overloaded', 'infeasible']) {
      const title = `Task on ${date} with ${status}`
      const html = render(
        {
          title,
          scheduled_date: date,
          start_date: null,
          due_date: null,
        },
        {
          scale: makeScale(date, 'day'),
          data: {
            timezones: [],
            overload_dates: [date],
            scheduler: {
              daily_load: [{ scheduled_date: date, hours: '9.0000', status }],
            },
          },
        },
      )

      if (offset < 0) {
        assert.doesNotMatch(html, /timeline-date-overloaded/)
        assert.doesNotMatch(html, /timeline-date-infeasible/)
      } else {
        assert.match(html, /timeline-date-overloaded/)
        if (status === 'infeasible') {
          assert.match(html, /timeline-date-infeasible/)
        }
      }

      assert.match(html, /timeline-card-position/)
      assert.ok(html.includes(title))
    }
  }
})


test('default board keeps its geometry and has no selected-date modifiers', () => {
  const html = render()
  assert.doesNotMatch(html, /timeline-(?:card|row)-selected-date/)
  assert.match(html, /timeline-card-position" style="left:224px"/)
  assert.match(render({ start_date: base.scheduled_date, due_date: base.scheduled_date }), /timeline-row-constrained/)
  assert.match(html, /data-timeline-task-id="1"/)
})

test('all rows top-align while selected-date anchor expansion rules stay scoped', () => {
  const css = readFileSync(new URL('./Timeline.css', import.meta.url), 'utf8')
  assert.match(css.match(/\.timeline-row \{([^}]+)\}/)[1], /align-items: start/)
  assert.doesNotMatch(css, /\.timeline-row-selected-date \{ align-items:/)
  assert.match(css, /\.timeline-card-expanded \.timeline-anchor-button,\s*\.timeline-anchor-visible \{/)
  const scoped = css.slice(css.indexOf('/* Selected-date emphasis'))
  assert.doesNotMatch(scoped, /!important|scaleY|translateY|position: absolute/)
  assert.match(scoped, /\.timeline-card-selected-date\.timeline-card-hover-intent/)
  assert.doesNotMatch(scoped, /\.timeline-card-selected-date:hover/)
})


test('compact root controller and navigator scroll constraints stay feature-scoped', () => {
  const css = readFileSync(new URL('./Timeline.css', import.meta.url), 'utf8')
  assert.match(css.match(/\.timeline-root-navigation \{([^}]+)\}/)[1], /flex-wrap: nowrap/)
  assert.match(css.match(/\.timeline-root-navigation-count \{([^}]+)\}/)[1], /white-space: nowrap/)
  assert.match(css.match(/\.timeline-root-navigation-arrow \{([^}]+)\}/)[1], /flex: 0 0 22px/)
  const navigator = css.match(/\.timeline-task-navigator \{([^}]+)\}/)[1]
  assert.match(navigator, /max-height: max\(var\(--timeline-navigator-min-height, 96px\), min\(68dvh, calc\(100dvh - var\(--timeline-navigator-top/)
  const list = css.match(/\.timeline-task-navigator-list \{([^}]+)\}/)[1]
  assert.match(list, /min-height: 0/)
  assert.match(list, /overflow-y: auto/)
  assert.match(css, /\.timeline-task-navigator-header \{ flex-shrink: 0/)
})

test('browser keeps ordinary card tops and popped markers stationary during details and description expansion', { skip: process.env.TIMELINE_BROWSER_TESTS !== '1' }, async () => {
  const { chromium } = await import('@playwright/test')
  const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN })
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 800 } })
    const css = readFileSync(new URL('./Timeline.css', import.meta.url), 'utf8')
    const items = [
      { ...base, id: 1, start_date: null, due_date: null, scheduled_date: '2026-09-19', description: 'Description\n'.repeat(60) },
      { ...base, id: 2, title: 'Neighbor', start_date: null, due_date: null, scheduled_date: '2026-09-24' },
    ]
    const ordinary = render({}, { items })
    const marked = render({ start_date: base.scheduled_date, due_date: '2026-09-22' })
    await page.setContent(`<style>${css}</style><div style="display:flex;align-items:flex-start"><div id="ordinary">${ordinary}</div><div id="marked">${marked}</div></div>`)
    const positions = () => page.evaluate(() => ({
      cards: [...document.querySelectorAll('#ordinary article')].map((node) => ({ top: node.getBoundingClientRect().top, height: node.getBoundingClientRect().height })),
      markedTop: document.querySelector('#marked article').getBoundingClientRect().top,
      markers: [...document.querySelectorAll('#marked .timeline-card-marker')].map((node) => ({ top: node.getBoundingClientRect().top, left: node.getBoundingClientRect().left })),
    }))
    const before = await positions()
    await page.evaluate(() => document.querySelectorAll('article').forEach((node) => node.classList.add('timeline-card-expanded')))
    const expanded = await positions()
    assert.equal(expanded.cards[0].top, before.cards[0].top)
    assert.equal(expanded.cards[1].top, before.cards[1].top)
    assert.ok(expanded.cards[0].height > before.cards[0].height)
    assert.equal(expanded.markedTop, before.markedTop)
    assert.deepEqual(expanded.markers, before.markers)
    assert.equal(before.markers.length, 2)
    assert.ok(expanded.markers.every((marker) => marker.top < expanded.markedTop))
    await page.evaluate(() => {
      document.querySelector('#ordinary .timeline-description p').textContent = 'Full description\n'.repeat(60)
    })
    const full = await positions()
    assert.equal(full.cards[0].top, before.cards[0].top)
    assert.equal(full.cards[1].top, before.cards[1].top)
    assert.ok(full.cards[0].height > expanded.cards[0].height)
    assert.deepEqual(full.markers, before.markers)
    const navigatorProps = {
      selectedRoots: [base.root], activeRootId: base.root.id, currentLeafByRoot: {},
      rootLeafIndex: new Map([[base.root.id, Array.from({ length: 100 }, (_, id) => ({ id, title: `Task ${id}`, date: '2026-09-21' }))]]),
      position: { x: 700, y: 600 }, minimized: false,
    }
    await page.setContent(`<style>${css}</style>${renderToStaticMarkup(React.createElement(Navigator, navigatorProps))}`)
    const panelGeometry = await page.evaluate(() => {
      const panel = document.querySelector('.timeline-task-navigator')
      const list = document.querySelector('.timeline-task-navigator-list')
      return { bottom: panel.getBoundingClientRect().bottom, height: panel.getBoundingClientRect().height, listHeight: list.clientHeight, scrollHeight: list.scrollHeight }
    })
    assert.ok(panelGeometry.bottom <= 800)
    assert.ok(panelGeometry.height <= 200)
    assert.ok(panelGeometry.listHeight > 0)
    assert.ok(panelGeometry.scrollHeight > panelGeometry.listHeight)
    await page.setContent(`<style>${css}</style>${renderToStaticMarkup(React.createElement(Navigator, { ...navigatorProps, minimized: true }))}`)
    assert.ok(await page.locator('.timeline-task-navigator').evaluate((node) => node.getBoundingClientRect().height) < 120)
  } finally { await browser.close() }
})
