export function reorderPriorityRows(
  rows,
  itemId,
  requestedPosition,
) {
  if (
    !Array.isArray(rows)
    || rows.length === 0
  ) {
    return rows
  }

  const sourceIndex =
    rows.findIndex(
      (row) =>
        row.item_id ===
        itemId,
    )

  if (
    sourceIndex === -1
  ) {
    return rows
  }

  const numericPosition =
    Number(
      requestedPosition,
    )

  if (
    !Number.isFinite(
      numericPosition,
    )
  ) {
    return rows
  }

  const position =
    Math.max(
      1,
      Math.min(
        rows.length,
        Math.trunc(
          numericPosition,
        ),
      ),
    )

  const next =
    [...rows]

  const [
    moved,
  ] =
    next.splice(
      sourceIndex,
      1,
    )

  next.splice(
    position - 1,
    0,
    moved,
  )

  return next.map(
    (
      row,
      index,
    ) => ({
      ...row,
      position:
        index + 1,
    }),
  )
}


function completeWholeSubtree(
  item,
) {
  if (item.is_provisional) return item
  return {
    ...item,

    is_completed:
      true,

    children:
      (
        item.children
        ?? []
      ).map(
        completeWholeSubtree,
      ),
  }
}


export function patchPlanningTreeCompletion(
  nodes,
  itemId,
  completed,
) {
  if (
    !Array.isArray(nodes)
  ) {
    return nodes
  }

  return nodes.map(
    (node) => {
      if (
        node.id ===
        itemId
      ) {
        if (completed) {
          return completeWholeSubtree(
            node,
          )
        }

        return {
          ...node,
          is_completed:
            false,
        }
      }

      return {
        ...node,

        children:
          patchPlanningTreeCompletion(
            node.children
            ?? [],
            itemId,
            completed,
          ),
      }
    },
  )
}


// Client IDs deliberately occupy a different namespace from Django integer IDs.
export function provisionalPlanningItem(payload, tags = []) {
  const { tag_ids = [], ...fields } = payload
  return {
    ...fields,
    id: `client:create:${globalThis.crypto.randomUUID()}`,
    is_provisional: true,
    is_completed: false,
    tags: tags.filter((tag) => tag_ids.includes(tag.id)),
    children: [],
  }
}

function planningItemPath(tree, id) {
  for (const node of tree) {
    if (node.id === id) return [node]
    const path = planningItemPath(node.children ?? [], id)
    if (path) return [node, ...path]
  }
  return null
}

export function insertPlanningItem(tree = [], item) {
  if (planningItemPath(tree, item.id)) return tree
  if (item.parent == null) return [...tree, item]
  let changed = false
  const next = tree.map((node) => {
    const children = node.children ?? []
    let nextChildren
    if (node.id === item.parent) {
      nextChildren = children.some((child) => child.id === item.id) ? children : [...children, item]
    } else {
      nextChildren = insertPlanningItem(children, item)
    }
    if (nextChildren === children) return node
    changed = true
    return { ...node, children: nextChildren }
  })
  return changed ? next : tree
}

// Patch only the operation's own row, never restore a whole-tree snapshot.
export function reconcilePlanningItem(tree = [], id, replacement = null) {
  return tree.flatMap((node) => {
    if (node.id === id) return replacement ? [{ ...replacement, children: replacement.children ?? node.children ?? [] }] : []
    return [{ ...node, children: reconcilePlanningItem(node.children ?? [], id, replacement) }]
  })
}

export function patchPlanningItemFields(tree, id, fields) {
  if (!Array.isArray(tree)) return tree

  let changed = false

  const next = tree.map((node) => {
    if (node.id === id) {
      changed = true

      const {
        id: ignoredId,
        parent: ignoredParent,
        children: ignoredChildren,
        is_completed: ignoredCompleted,
        is_provisional: ignoredProvisional,
        ...editableFields
      } = fields

      return {
        ...node,
        ...editableFields,
        children: node.children,
      }
    }

    const children = patchPlanningItemFields(
      node.children ?? [],
      id,
      fields,
    )

    if (children === (node.children ?? children)) {
      return node
    }

    changed = true

    return {
      ...node,
      children,
    }
  })

  return changed ? next : tree
}

export function restorePlanningItemFields(
  tree,
  id,
  previous,
  attempted,
) {
  if (!Array.isArray(tree)) return tree

  const restored = {}

  for (const key of Object.keys(attempted)) {
    if (
      key === 'id' ||
      key === 'parent' ||
      key === 'children' ||
      key === 'is_completed' ||
      key === 'is_provisional'
    ) {
      continue
    }

    restored[key] = previous[key]
  }

  return patchPlanningItemFields(
    tree,
    id,
    restored,
  )
}

export function protectPlanningEdit(
  queryClient,
  itemId,
  fields,
) {
  const key = ['planning', 'tree']

  let active = true
  let applying = false
  let confirmed = false

  const unsubscribe =
    queryClient.getQueryCache().subscribe((event) => {
      if (
        !active ||
        applying ||
        event.type !== 'updated' ||
        event.query.queryKey.length !== 2 ||
        event.query.queryKey[0] !== 'planning' ||
        event.query.queryKey[1] !== 'tree'
      ) {
        return
      }

      // Manual cache writes belong to other optimistic operations.
      if (event.action.type !== 'success' || event.action.manual) return

      if (confirmed) return

      const tree = event.query.state.data

      if (!Array.isArray(tree)) return

      // Do not resurrect deleted tasks.
      if (!planningItemPath(tree, itemId)) return

      const next = patchPlanningItemFields(
        tree,
        itemId,
        fields,
      )

      if (next === tree) return

      applying = true

      try {
        queryClient.setQueryData(key, next)
      } finally {
        applying = false
      }
    })

  queryClient.setQueryData(
    key,
    (tree) => patchPlanningItemFields(
      tree,
      itemId,
      fields,
    ),
  )

  return {
    isActive() {
      return active
    },

    reconcile(serverFields) {
      if (!active) return

      confirmed = true

      queryClient.setQueryData(
        key,
        (tree) => patchPlanningItemFields(
          tree,
          itemId,
          serverFields,
        ),
      )
    },

    rollback(previous) {
      if (!active) return

      confirmed = true

      queryClient.setQueryData(
        key,
        (tree) => restorePlanningItemFields(
          tree,
          itemId,
          previous,
          fields,
        ),
      )
    },

    release() {
      active = false
      unsubscribe()
    },
  }
}

// Query-cache notifications run synchronously. Reapply missing pending rows before
// observers render a refetch result. This also covers invalidations from other
// Planner mutations without replacing their optimistic cache changes.
export function protectPlanningCreation(queryClient, initialItem) {
  let item = initialItem
  let applying = false
  let active = true
  let confirmed = false
  let parentRemoved = false
  const key = ['planning', 'tree']
  const ancestors = initialItem.parent == null ? []
    : planningItemPath(queryClient.getQueryData(key) ?? [], initialItem.parent) ?? []
  function preserve() {
    if (applying || parentRemoved) return
    const tree = queryClient.getQueryData(key) ?? []
    let next = tree
    // A stale response may omit a recently confirmed parent. Retain the known
    // ancestry of the pending row rather than inventing a fallback relationship.
    for (const ancestor of ancestors) {
      next = insertPlanningItem(next, { ...ancestor, children: [] })
    }
    next = insertPlanningItem(next, item)
    if (next === tree) return
    applying = true
    queryClient.setQueryData(key, next)
    applying = false
  }
  const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
    if (event.query.queryKey.length !== 2 || event.query.queryKey[0] !== 'planning'
      || event.query.queryKey[1] !== 'tree') return
    if (event.type === 'removed') { active = false; unsubscribe() }
    else if (event.type === 'updated' && !confirmed) {
      // An intentional optimistic ancestor deletion owns that subtree. Do not
      // resurrect it; refetches, unlike local writes, still retain known ancestry.
      if (event.action.type === 'success' && event.action.manual && item.parent != null
        && !planningItemPath(event.query.state.data ?? [], item.parent)) parentRemoved = true
      preserve()
    }
  })
  preserve()
  return {
    isActive: () => active,
    reconcile(serverItem) {
      if (!active) return
      confirmed = true
      const oldId = item.id
      item = { ...serverItem, children: serverItem.children ?? [] }
      queryClient.setQueryData(key, (tree) => reconcilePlanningItem(tree, oldId, item))
      preserve()
    },
    remove() {
      unsubscribe()
      if (!active) return
      queryClient.setQueryData(key, (tree) => reconcilePlanningItem(tree, item.id))
    },
    release: unsubscribe,
  }
}


// Structural and completion mutations own their optimistic rows until they
// settle. Creation must not refetch over those unrelated pending intentions.
export function whenOtherPlanningMutationsIdle(queryClient) {
  const cache = queryClient.getMutationCache()
  const busy = () => cache.getAll().some((mutation) => {
    const key = mutation.options.mutationKey ?? []
    return mutation.state.status === 'pending'
      && !(key[0] === 'planning' && key[1] === 'create')
  })
  if (!busy()) return Promise.resolve()
  return new Promise((resolve) => {
    const unsubscribe = cache.subscribe(() => {
      if (!busy()) { unsubscribe(); resolve() }
    })
  })
}
