import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  patchPlanningTreeCompletion,
  reorderPriorityRows,
} from './planningOptimistic.js'


test(
  'priority optimistic reorder preserves rows and renumbers positions',
  () => {
    const rows = [
      {
        item_id: 1,
        position: 1,
        title: 'A',
      },
      {
        item_id: 2,
        position: 2,
        title: 'B',
      },
      {
        item_id: 3,
        position: 3,
        title: 'C',
      },
    ]

    const result =
      reorderPriorityRows(
        rows,
        1,
        3,
      )

    assert.deepEqual(
      result.map(
        (row) => [
          row.item_id,
          row.position,
        ],
      ),
      [
        [2, 1],
        [3, 2],
        [1, 3],
      ],
    )
  },
)


test(
  'optimistic parent completion completes the visible subtree',
  () => {
    const tree = [
      {
        id: 1,
        is_completed: false,
        children: [
          {
            id: 2,
            is_completed: false,
            children: [],
          },
          {
            id: 3,
            is_completed: false,
            children: [
              {
                id: 4,
                is_completed: false,
                children: [],
              },
            ],
          },
        ],
      },
    ]

    const result =
      patchPlanningTreeCompletion(
        tree,
        1,
        true,
      )

    assert.equal(
      result[0].is_completed,
      true,
    )

    assert.equal(
      result[0]
        .children[0]
        .is_completed,
      true,
    )

    assert.equal(
      result[0]
        .children[1]
        .children[0]
        .is_completed,
      true,
    )
  },
)


test(
  'optimistic reopen changes only the requested item',
  () => {
    const tree = [
      {
        id: 1,
        is_completed: true,
        children: [
          {
            id: 2,
            is_completed: true,
            children: [],
          },
        ],
      },
    ]

    const result =
      patchPlanningTreeCompletion(
        tree,
        1,
        false,
      )

    assert.equal(
      result[0].is_completed,
      false,
    )

    assert.equal(
      result[0]
        .children[0]
        .is_completed,
      true,
    )
  },
)

import { QueryClient } from '@tanstack/react-query'
import { insertPlanningItem, provisionalPlanningItem, protectPlanningCreation } from './planningOptimistic.js'

test('creation uses distinct client IDs and inserts beneath the exact parent', () => {
  const payload = { parent: 1, title: 'Child', tag_ids: [7], due_date: '2026-11-01' }
  const item = provisionalPlanningItem(payload, [{ id: 7, name: 'Study' }])
  assert.match(item.id, /^client:create:/)
  assert.notEqual(item.id, provisionalPlanningItem(payload).id)
  assert.equal(item.priority_position, undefined)
  const tree = insertPlanningItem([{ id: 1, children: [] }], item)
  assert.equal(tree[0].children[0], item)
  assert.equal(insertPlanningItem(tree, item), tree)
  assert.equal(item.tags[0].name, 'Study')
})

test('refetch protection, reconciliation and rollback preserve unrelated cached changes', () => {
  const client = new QueryClient()
  const key = ['planning', 'tree']
  client.setQueryData(key, [{ id: 1, title: 'Original', children: [] }])
  const pending = provisionalPlanningItem({ parent: 1, title: 'Child' })
  const guard = protectPlanningCreation(client, pending)
  client.setQueryData(key, [{ id: 1, title: 'Changed', children: [] }])
  assert.equal(client.getQueryData(key)[0].children[0].id, pending.id)
  guard.reconcile({ id: 99, parent: 1, title: 'Authoritative' })
  assert.equal(client.getQueryData(key)[0].title, 'Changed')
  assert.equal(client.getQueryData(key)[0].children[0].id, 99)
  guard.release()
  const failed = protectPlanningCreation(client, provisionalPlanningItem({ parent: null, title: 'Failed' }))
  failed.remove()
  assert.equal(client.getQueryData(key).length, 1)
  assert.equal(client.getQueryData(key)[0].children[0].id, 99)
  client.clear()
})

import { whenOtherPlanningMutationsIdle } from './planningOptimistic.js'

test('creation refresh waits for unrelated pending optimistic mutations', async () => {
  const client = new QueryClient()
  let finish
  const mutation = client.getMutationCache().build(client, {
    mutationFn: () => new Promise((resolve) => { finish = resolve }),
  })
  const request = mutation.execute()
  let idle = false
  const waiting = whenOtherPlanningMutationsIdle(client).then(() => { idle = true })
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.equal(idle, false)
  finish()
  await request
  await waiting
  assert.equal(idle, true)
  client.clear()
})

test('concurrent creates reconcile independently and clearing the cache detaches their guards', () => {
  const client = new QueryClient()
  const key = ['planning', 'tree']
  client.setQueryData(key, [])
  const first = protectPlanningCreation(client, provisionalPlanningItem({ parent: null, title: 'First' }))
  const second = protectPlanningCreation(client, provisionalPlanningItem({ parent: null, title: 'Second' }))
  client.setQueryData(key, [{ id: 3, title: 'Unrelated', children: [] }])
  first.reconcile({ id: 100, parent: null, title: 'Confirmed' })
  second.remove()
  assert.deepEqual(client.getQueryData(key).map((item) => item.id), [3, 100])
  client.clear()
  assert.equal(first.isActive(), false)
  first.reconcile({ id: 100, parent: null, title: 'Old session' })
  assert.equal(client.getQueryData(key), undefined)
})

test('a stale read that omits the parent still retains the pending child in its known ancestry', async () => {
  const client = new QueryClient()
  const key = ['planning', 'tree']
  client.setQueryData(key, [{ id: 1, parent: null, children: [{ id: 2, parent: 1, children: [] }] }])
  const pending = provisionalPlanningItem({ parent: 2, title: 'Child' })
  const guard = protectPlanningCreation(client, pending)
  await client.fetchQuery({ queryKey: key, queryFn: async () => [] })
  assert.equal(client.getQueryData(key)[0].children[0].children[0].id, pending.id)
  guard.remove()
  client.clear()
})

test('confirmed creation no longer overrides subsequent optimistic deletion', () => {
  const client = new QueryClient()
  const key = ['planning', 'tree']
  const guard = protectPlanningCreation(client, provisionalPlanningItem({ parent: null, title: 'New' }))
  guard.reconcile({ id: 100, parent: null, title: 'Confirmed' })
  client.setQueryData(key, [])
  assert.deepEqual(client.getQueryData(key), [])
  guard.release()
  client.clear()
})

test('intentional ancestor deletion is preserved during child creation and reconciliation', () => {
  const client = new QueryClient()
  const key = ['planning', 'tree']
  client.setQueryData(key, [{ id: 1, parent: null, children: [] }])
  const guard = protectPlanningCreation(client, provisionalPlanningItem({ parent: 1, title: 'Child' }))
  client.setQueryData(key, [])
  guard.reconcile({ id: 2, parent: 1, title: 'Child' })
  assert.deepEqual(client.getQueryData(key), [])
  guard.release()
  client.clear()
})

import { patchPlanningItemFields, restorePlanningItemFields, protectPlanningEdit } from './planningOptimistic.js'

test('nested field patch preserves structure, protected fields and unrelated references', () => {
  const child = { id: 2, parent: 1, title: 'Original', is_completed: true, is_provisional: true, children: [] }
  const other = { id: 3, title: 'Other' }
  const tree = [{ id: 1, children: [child] }, other]
  const next = patchPlanningItemFields(tree, 2, { id: 99, parent: null, children: [{}], is_completed: false, is_provisional: false, title: 'Edited' })
  assert.equal(next[1], other)
  assert.equal(next[0].children[0].children, child.children)
  assert.deepEqual(next[0].children[0], { ...child, title: 'Edited' })
  assert.equal(child.title, 'Original')
  assert.equal(patchPlanningItemFields(tree, 99, {}), tree)
  assert.equal(patchPlanningItemFields(null, 2, {}), null)
})

test('rollback restores only attempted editable fields', () => {
  const tree = [{ id: 1, title: 'Edited', tags: [], description: 'Unrelated', is_completed: true, children: [] }]
  const next = restorePlanningItemFields(tree, 1, { title: 'Original', tags: [{ id: 7 }], description: 'Old', is_completed: false }, { title: 'Edited', tags: [], is_completed: true })
  assert.deepEqual(next[0], { ...tree[0], title: 'Original', tags: [{ id: 7 }] })
})

test('pending edit survives stale reads, preserves CREATE and does not overwrite manual optimistic writes', async () => {
  const client = new QueryClient()
  const key = ['planning', 'tree']
  client.setQueryData(key, [{ id: 1, title: 'Original', children: [] }, { id: 2, title: 'Other' }])
  const creation = protectPlanningCreation(client, provisionalPlanningItem({ parent: 1, title: 'Pending child' }))
  const edit = protectPlanningEdit(client, 1, { title: 'Edited' })
  client.setQueryData(key, (tree) => tree.map((node) => node.id === 1
    ? { ...node, title: 'Manual write', is_completed: true, priority_position: 2 }
    : { ...node, title: 'Other changed' }))
  assert.equal(client.getQueryData(key)[0].title, 'Manual write')
  assert.equal(client.getQueryData(key)[0].is_completed, true)
  assert.equal(client.getQueryData(key)[0].priority_position, 2)
  assert.equal(client.getQueryData(key)[1].title, 'Other changed')
  await client.fetchQuery({ queryKey: key, queryFn: async () => [{ id: 1, title: 'Stale', children: [] }, { id: 2, title: 'Other server' }] })
  assert.equal(client.getQueryData(key)[0].title, 'Edited')
  assert.equal(client.getQueryData(key)[0].children[0].title, 'Pending child')
  assert.equal(client.getQueryData(key)[1].title, 'Other server')
  edit.rollback({ title: 'Original' })
  assert.equal(client.getQueryData(key)[0].title, 'Original')
  assert.equal(client.getQueryData(key)[0].children.length, 1)
  edit.release()
  assert.equal(edit.isActive(), false)
  creation.remove()
  client.clear()
})

test('edit reconciliation preserves structure and never resurrects deleted tasks', async () => {
  const client = new QueryClient()
  const key = ['planning', 'tree']
  client.setQueryData(key, [{ id: 1, parent: null, children: [{ id: 2 }] }])
  const guard = protectPlanningEdit(client, 1, { title: 'Pending' })
  guard.reconcile({ id: 99, parent: 7, children: [], title: 'Server', is_completed: true })
  assert.deepEqual(client.getQueryData(key)[0], { id: 1, parent: null, children: [{ id: 2 }], title: 'Server' })
  guard.release()
  const pending = protectPlanningEdit(client, 1, { title: 'Next' })
  await client.fetchQuery({ queryKey: key, queryFn: async () => [] })
  pending.reconcile({ title: 'Server' })
  pending.rollback({ title: 'Original' })
  assert.deepEqual(client.getQueryData(key), [])
  pending.release()
  client.clear()
})
