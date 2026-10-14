import test from 'node:test'
import assert from 'node:assert/strict'
import { buildRootLeafIndex, deriveRootNavigationDate, findInitialVisibleRootLeaf, findTreeItemById, stepRootLeaf } from './timelineRootNavigation.js'

const leaf = (id, item_type = 'TASK') => ({ id, title: `Task ${id}`, item_type, children: [] })
const roots = [
  { ...leaf(1, 'GOAL'), children: [{ ...leaf(2), children: [leaf(3), leaf(4, 'ASSIGNMENT')] }, leaf(5, 'GOAL'), leaf(6), leaf(7), leaf(8), leaf(9)] },
  { ...leaf(10, 'GOAL'), children: [leaf(11)] },
]
const universe = [
  { id: 2, title: 'Parent', scheduled_date: '2026-01-01' },
  { id: 3, title: 'Third', scheduled_date: '2026-10-03' },
  { id: 4, title: 'Fourth', scheduled_date: '2026-10-02' },
  { id: 5, title: 'Goal', scheduled_date: '2026-01-01' },
  { id: 6, title: 'Sixth', scheduled_date: '2026-10-02' },
  { id: 7, title: 'Seventh', scheduled_date: null, due_date: '2026-10-01', start_date: '2026-09-01', manual_requested_date: '2026-10-02' },
  { id: 8, title: 'Eighth', is_completed: true, scheduled_date: '2026-10-05', completed_display_date: '2026-10-01' },
  { id: 11, title: 'Other root', scheduled_date: '2026-11-01' },
  { id: 99, title: 'Invisible', scheduled_date: '2026-01-01' },
]

test('only canonical TASK/ASSIGNMENT terminal leaves in the global intersection enter the index', () => {
  assert.deepEqual(buildRootLeafIndex(roots, universe, true).get(1).map((entry) => entry.id), [8, 4, 6, 3, 7])
})
test('structural goals are excluded', () => {
  assert.ok(!buildRootLeafIndex(roots, universe, true).get(1).some((entry) => entry.id === 5))
})
test('actionable parents are excluded', () => {
  assert.ok(!buildRootLeafIndex(roots, universe, true).get(1).some((entry) => entry.id === 2))
})
test('leaf ownership follows the canonical root', () => {
  assert.deepEqual(buildRootLeafIndex(roots, universe, true).get(10), [{ id: 11, rootId: 10, title: 'Other root', date: '2026-11-01', isCompleted: false, missingSchedule: false }])
})
test('sort uses ISO date followed by numeric canonical ID with missing dates last', () => {
  assert.deepEqual(buildRootLeafIndex(roots, universe, false).get(1).map((entry) => entry.id), [4, 6, 3, 7])
})
test('forward and backward wrap preserve canonical identity after list refresh', () => {
  const entries = buildRootLeafIndex(roots, universe, false).get(1)
  assert.equal(stepRootLeaf(entries, 3, 1).id, 4)
  assert.equal(stepRootLeaf(entries, 4, -1).id, 3)
  assert.equal(stepRootLeaf(entries.map((entry) => ({ ...entry })), 6, 1).id, 3)
})
test('first next and previous choose opposite ends without a current item', () => {
  const entries = buildRootLeafIndex(roots, universe, false).get(1)
  assert.equal(stepRootLeaf(entries, null, 1).id, 4)
  assert.equal(stepRootLeaf(entries, undefined, -1).id, 3)
})
test('multiple roots navigate independently', () => {
  const index = buildRootLeafIndex(roots, universe, false)
  assert.equal(stepRootLeaf(index.get(1), 4, 1).id, 6)
  assert.equal(stepRootLeaf(index.get(10), 11, 1).id, 11)
})
test('completed off excludes completed leaves', () => {
  assert.ok(!buildRootLeafIndex(roots, universe, false).get(1).some((entry) => entry.id === 8))
})
test('completed on uses durable completed history before scheduled date', () => {
  assert.equal(buildRootLeafIndex(roots, universe, true).get(1)[0].date, '2026-10-01')
  assert.equal(deriveRootNavigationDate({ is_completed: true, scheduled_date: '2026-10-05' }), '2026-10-05')
})
test('incomplete missing schedule never falls back to deadline, release or manual intent', () => {
  assert.equal(deriveRootNavigationDate(universe.find((item) => item.id === 7)), null)
  assert.equal(deriveRootNavigationDate({ is_completed: false, completed_display_date: '2026-10-01' }), null)
})
test('missing dates remain visible and cannot be navigated', () => {
  const entry = buildRootLeafIndex(roots, universe, false).get(1).at(-1)
  assert.equal(entry.missingSchedule, true)
  assert.equal(entry.date, null)
  assert.equal(stepRootLeaf([entry], null, 1), null)
  assert.equal(stepRootLeaf([], null, -1), null)
})
test('index and stepping leave canonical input arrays and objects unchanged', () => {
  const before = structuredClone({ roots, universe })
  const entries = buildRootLeafIndex(roots, universe, true).get(1)
  const snapshot = structuredClone(entries)
  stepRootLeaf(entries, 4, 1)
  assert.deepEqual({ roots, universe }, before)
  assert.deepEqual(entries, snapshot)
})
test('tree lookup returns the original deeply nested object with numeric identity', () => {
  assert.equal(findTreeItemById(roots, '4'), roots[0].children[0].children[1])
  assert.equal(findTreeItemById(roots, null), null)
  assert.equal(findTreeItemById(roots, 99), null)
})


const navigationEntries = [
  { id: 1, date: '2026-10-01' }, { id: 2, date: '2026-10-10' },
  { id: 3, date: '2026-10-10' }, { id: 4, date: '2026-11-01' }, { id: 5, date: null },
]
test('initial root leaf chooses the leftmost rendered task in the current date window', () => {
  assert.equal(findInitialVisibleRootLeaf(navigationEntries, [
    { id: 4, scheduled_date: '2026-11-01' }, { id: 2, scheduled_date: '2026-10-10' },
    { id: 1, scheduled_date: '2026-10-01' },
  ], ['2026-10-05', '2026-10-20']).id, 2)
})
test('same-date initial candidates follow existing board input ordering', () => {
  assert.equal(findInitialVisibleRootLeaf(navigationEntries, [
    { id: 3, scheduled_date: '2026-10-10' }, { id: 2, scheduled_date: '2026-10-10' },
  ], ['2026-10-05', '2026-10-20']).id, 3)
})
test('no visible root tasks fall forward to the nearest upcoming entry', () => {
  assert.equal(findInitialVisibleRootLeaf(navigationEntries, [{ id: 99, scheduled_date: '2026-10-07' }], ['2026-10-05', '2026-10-20']).id, 2)
})
test('an earlier window picks the first upcoming task and a later window picks the last preceding task', () => {
  assert.equal(findInitialVisibleRootLeaf(navigationEntries, [], ['2026-09-01', '2026-09-20']).id, 1)
  assert.equal(findInitialVisibleRootLeaf(navigationEntries, [], ['2026-12-01', '2026-12-20']).id, 4)
})
test('a visible session cannot replace the canonical navigation date', () => {
  assert.equal(findInitialVisibleRootLeaf(navigationEntries, [{ id: 1, scheduled_date: '2026-10-12' }], ['2026-10-10', '2026-10-20']), navigationEntries[1])
})
test('zero navigable tasks return null and all inputs remain unchanged', () => {
  const snapshot = structuredClone(navigationEntries)
  assert.equal(findInitialVisibleRootLeaf([{ id: 5, date: null }], [], ['2026-10-01']), null)
  findInitialVisibleRootLeaf(navigationEntries, [], ['2026-12-01'])
  assert.deepEqual(navigationEntries, snapshot)
})


test('completed initial position uses completion history for visibility and chronological ordering', () => {
  const completed = { ...leaf(20), is_completed: true, scheduled_date: '2026-12-01', completed_display_date: '2026-10-07' }
  const later = { ...leaf(21), scheduled_date: '2026-10-15' }
  const entries = buildRootLeafIndex([{ ...leaf(19, 'GOAL'), children: [completed, later] }], [completed, later], true).get(19)
  const initial = findInitialVisibleRootLeaf(entries, [later, completed], ['2026-10-05', '2026-10-20'])
  assert.equal(initial.id, completed.id)
  assert.equal(initial.date, completed.completed_display_date)
})
