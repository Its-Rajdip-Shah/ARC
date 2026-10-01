export const PLANNER_INDENT_WIDTH =
  42


/*
 * Convert raw horizontal pointer movement into a stable hierarchy-depth
 * delta.
 *
 * A normal round(x / width) boundary chatters when the pointer sits near
 * half an indent. Use a Schmitt-trigger style dead-zone instead:
 *
 *   depth 0 -> depth 1 only after ~65% of one indent
 *   depth 1 -> depth 0 only after returning below ~35%
 *
 * Once a depth is selected, small pointer jitter cannot immediately undo it.
 */
export function stablePlannerDepthDelta(
  horizontalOffset,
  previousDelta = 0,
  indentWidth =
    PLANNER_INDENT_WIDTH,
) {
  let delta =
    previousDelta

  const upperFraction =
    0.65

  const lowerFraction =
    0.65

  while (
    horizontalOffset >=
    (
      delta
      + upperFraction
    )
    * indentWidth
  ) {
    delta += 1
  }

  while (
    horizontalOffset <=
    (
      delta
      - lowerFraction
    )
    * indentWidth
  ) {
    delta -= 1
  }

  return delta
}


export function flattenPlanningTree(
  items,
  parentId = null,
  depth = 0,
) {
  return items.flatMap(
    (item) => [
      {
        ...item,
        parentId,
        depth,
      },

      ...flattenPlanningTree(
        item.children ?? [],
        item.id,
        depth + 1,
      ),
    ],
  )
}


export function plannerDescendantIds(
  items,
  itemId,
) {
  const index =
    items.findIndex(
      (item) =>
        item.id === itemId,
    )

  if (index === -1) {
    return []
  }

  const depth =
    items[index].depth

  const result = []

  for (
    let cursor =
      index + 1;

    cursor < items.length;

    cursor += 1
  ) {
    const item =
      items[cursor]

    if (
      item.depth <= depth
    ) {
      break
    }

    result.push(
      item.id,
    )
  }

  return result
}


function descendantIds(
  items,
  itemId,
) {
  return new Set(
    plannerDescendantIds(
      items,
      itemId,
    ),
  )
}


function arrayMove(
  items,
  from,
  to,
) {
  const next =
    [...items]

  const [moved] =
    next.splice(
      from,
      1,
    )

  next.splice(
    to,
    0,
    moved,
  )

  return next
}


function parentForProjectedDepth(
  reordered,
  activeIndex,
  depth,
) {
  if (
    depth === 0
  ) {
    return null
  }

  const previous =
    activeIndex > 0
      ? reordered[
          activeIndex - 1
        ]
      : null

  if (!previous) {
    return null
  }

  if (
    previous.depth ===
    depth - 1
  ) {
    return previous.id
  }

  if (
    previous.depth ===
    depth
  ) {
    return previous.parentId
  }

  for (
    let index =
      activeIndex - 1;

    index >= 0;

    index -= 1
  ) {
    const candidate =
      reordered[index]

    if (
      candidate.depth ===
      depth
    ) {
      return candidate.parentId
    }

    if (
      candidate.depth <
      depth
    ) {
      break
    }
  }

  return null
}


function siblingOrder(
  reordered,
  activeIndex,
  parentId,
) {
  let order = 1

  for (
    let index = 0;
    index < activeIndex;
    index += 1
  ) {
    if (
      reordered[index]
        .parentId ===
      parentId
    ) {
      order += 1
    }
  }

  return order
}


export function projectPlannerGap({
  items,
  activeId,
  gapIndex,
  horizontalOffset = 0,
  depthDelta = null,
  indentWidth =
    PLANNER_INDENT_WIDTH,
}) {
  const active =
    items.find(
      (item) =>
        item.id === activeId,
    )

  if (!active) {
    return null
  }

  const descendants =
    descendantIds(
      items,
      activeId,
    )

  /*
   * Pointer placement is represented by a gap among STATIONARY rows.
   * The moving parent and every existing descendant are absent.
   */
  const stationaryItems =
    items.filter(
      (item) =>
        item.id !== activeId
        && !descendants.has(
          item.id,
        ),
    )

  const boundedGap =
    Math.max(
      0,
      Math.min(
        Number(gapIndex) || 0,
        stationaryItems.length,
      ),
    )

  const reordered =
    [...stationaryItems]

  reordered.splice(
    boundedGap,
    0,
    active,
  )

  const projectedIndex =
    boundedGap

  const previous =
    projectedIndex > 0
      ? reordered[
          projectedIndex - 1
        ]
      : null

  const dragDepth =
    depthDelta
    ?? Math.round(
      horizontalOffset
      / indentWidth,
    )

  let desiredDepth =
    active.depth
    + dragDepth

  /*
   * Actual top-level ARC roots themselves may never be nested.
   */
  if (
    active.parentId == null
  ) {
    desiredDepth = 0
  }

  const maxDepth =
    previous
      ? previous.depth + 1
      : 0

  let depth =
    Math.max(
      0,
      Math.min(
        desiredDepth,
        maxDepth,
      ),
    )

  if (
    active.parentId == null
  ) {
    depth = 0
  }

  let parentId =
    parentForProjectedDepth(
      reordered,
      projectedIndex,
      depth,
    )

  if (
    depth > 0
    && parentId == null
  ) {
    depth = 0
    parentId = null
  }

  /*
   * Preserve preorder when outdenting over immediately-following
   * deeper branches.
   */
  const adoptChildIds = []

  for (
    let index =
      projectedIndex + 1;

    index < reordered.length;

    index += 1
  ) {
    const candidate =
      reordered[index]

    if (
      candidate.depth <= depth
    ) {
      break
    }

    if (
      candidate.depth ===
      depth + 1
    ) {
      adoptChildIds.push(
        candidate.id,
      )
    }
  }

  return {
    type:
      'planner-move',

    itemId:
      activeId,

    parentId,

    siblingOrder:
      siblingOrder(
        reordered,
        projectedIndex,
        parentId,
      ),

    depth,

    gapIndex:
      boundedGap,

    adoptChildIds,
  }
}


export function projectPlannerDrop({
  items,
  activeId,
  overId,
  horizontalOffset = 0,
  depthDelta = null,
  indentWidth =
    PLANNER_INDENT_WIDTH,
}) {
  const active =
    items.find(
      (item) =>
        item.id === activeId,
    )

  if (
    !active
    || overId == null
  ) {
    return null
  }

  /*
   * A parent moves together with its subtree.
   *
   * Descendants therefore do not participate as independent sortable
   * destinations while their ancestor is active.
   */
  const descendants =
    descendantIds(
      items,
      activeId,
    )

  const sortableItems =
    items.filter(
      (item) =>
        !descendants.has(
          item.id,
        ),
    )

  const activeIndex =
    sortableItems.findIndex(
      (item) =>
        item.id === activeId,
    )

  const overIndex =
    sortableItems.findIndex(
      (item) =>
        item.id === overId,
    )

  if (
    activeIndex === -1
    || overIndex === -1
  ) {
    return null
  }

  /*
   * This is deliberately the same vertical model used by dnd-kit's
   * sortable strategy:
   *
   *     active row -> index represented by overId
   *
   * There is no second custom "before / after" rectangle threshold.
   * The visible sortable slot and the persisted slot are therefore the
   * same thing.
   */
  const reordered =
    arrayMove(
      sortableItems,
      activeIndex,
      overIndex,
    )

  const projectedIndex =
    reordered.findIndex(
      (item) =>
        item.id === activeId,
    )

  const previous =
    projectedIndex > 0
      ? reordered[
          projectedIndex - 1
        ]
      : null

  const next =
    projectedIndex <
      reordered.length - 1
      ? reordered[
          projectedIndex + 1
        ]
      : null

  const dragDepth =
    depthDelta
    ?? Math.round(
      horizontalOffset
      / indentWidth,
    )

  let desiredDepth =
    active.depth
    + dragDepth

  /*
   * ARC's real top-level roots remain roots.
   * Ordinary Planner tasks inside those roots are free to indent/outdent.
   */
  if (
    active.parentId == null
  ) {
    desiredDepth = 0
  }

  const maxDepth =
    previous
      ? previous.depth + 1
      : 0

  /*
   * A shallower projection is valid even when the following visible row is
   * deeper. In that case the following deeper branch becomes part of the
   * moved item's future subtree.
   *
   * Previously next.depth was used as the minimum depth. That prevented
   * precisely this operation:
   *
   *   1
   *     ...
   *       active
   *     following
   *
   * drag active left beside 1:
   *
   *   1
   *   active
   *     following
   */
  const minDepth = 0

  let depth =
    Math.max(
      minDepth,
      Math.min(
        desiredDepth,
        maxDepth,
      ),
    )

  if (
    active.parentId == null
  ) {
    depth = 0
  }

  /*
   * Preserve preorder when a row is outdented past rows that visually follow
   * it.
   *
   * Every immediately-following row deeper than the projected depth belongs
   * to the future descendant region. Only rows exactly one level deeper need
   * a new parent; their own descendants move with them automatically.
   */
  const adoptChildIds = []

  for (
    let index =
      projectedIndex + 1;

    index < reordered.length;

    index += 1
  ) {
    const candidate =
      reordered[index]

    if (
      candidate.depth <= depth
    ) {
      break
    }

    if (
      candidate.depth ===
      depth + 1
    ) {
      adoptChildIds.push(
        candidate.id,
      )
    }
  }

  let parentId =
    parentForProjectedDepth(
      reordered,
      projectedIndex,
      depth,
    )

  if (
    depth > 0
    && parentId == null
  ) {
    depth = 0
    parentId = null
  }

  return {
    type:
      'planner-move',

    itemId:
      activeId,

    parentId,

    siblingOrder:
      siblingOrder(
        reordered,
        projectedIndex,
        parentId,
      ),

    depth,

    adoptChildIds,
  }
}


function removeTreeItem(
  nodes,
  itemId,
) {
  let removed = null

  const next = []

  for (const node of nodes) {
    if (
      node.id === itemId
    ) {
      removed = node
      continue
    }

    const childResult =
      removeTreeItem(
        node.children ?? [],
        itemId,
      )

    if (
      childResult.removed
    ) {
      removed =
        childResult.removed
    }

    next.push({
      ...node,

      children:
        childResult.nodes,
    })
  }

  return {
    nodes: next,
    removed,
  }
}


function containsId(
  node,
  itemId,
) {
  if (
    node.id === itemId
  ) {
    return true
  }

  return (
    node.children
    ?? []
  ).some(
    (child) =>
      containsId(
        child,
        itemId,
      ),
  )
}


function insertTreeItem(
  nodes,
  parentId,
  siblingOrderValue,
  moved,
) {
  if (
    parentId == null
  ) {
    const result =
      [...nodes]

    const index =
      Math.max(
        0,
        Math.min(
          siblingOrderValue - 1,
          result.length,
        ),
      )

    result.splice(
      index,
      0,
      moved,
    )

    return {
      nodes: result,
      inserted: true,
    }
  }

  let inserted = false

  const next =
    nodes.map(
      (node) => {
        if (
          node.id === parentId
        ) {
          const children =
            [
              ...(node.children
                ?? []),
            ]

          const index =
            Math.max(
              0,
              Math.min(
                siblingOrderValue - 1,
                children.length,
              ),
            )

          children.splice(
            index,
            0,
            moved,
          )

          inserted = true

          return {
            ...node,
            children,
          }
        }

        const childResult =
          insertTreeItem(
            node.children ?? [],
            parentId,
            siblingOrderValue,
            moved,
          )

        if (
          childResult.inserted
        ) {
          inserted = true

          return {
            ...node,

            children:
              childResult.nodes,
          }
        }

        return node
      },
    )

  return {
    nodes: next,
    inserted,
  }
}


function findTreeItem(
  nodes,
  itemId,
) {
  for (const node of nodes) {
    if (
      node.id === itemId
    ) {
      return node
    }

    const found =
      findTreeItem(
        node.children ?? [],
        itemId,
      )

    if (found) {
      return found
    }
  }

  return null
}


function applySinglePlannerMove(
  tree,
  itemId,
  parentId,
  siblingOrderValue,
) {
  const removed =
    removeTreeItem(
      tree,
      itemId,
    )

  if (!removed.removed) {
    return tree
  }

  if (
    parentId != null
    && containsId(
      removed.removed,
      parentId,
    )
  ) {
    return tree
  }

  const inserted =
    insertTreeItem(
      removed.nodes,
      parentId,
      siblingOrderValue,
      removed.removed,
    )

  return inserted.inserted
    ? inserted.nodes
    : tree
}


export function applyPlannerMove(
  tree,
  intent,
) {
  if (
    !Array.isArray(tree)
    || !intent
  ) {
    return tree
  }

  let result =
    applySinglePlannerMove(
      tree,
      intent.itemId,
      intent.parentId,
      intent.siblingOrder,
    )

  if (result === tree) {
    return tree
  }

  /*
   * Existing children of the moved row stay first. Adopted following branches
   * are appended in their visible preorder.
   */
  for (
    const childId
    of intent.adoptChildIds ?? []
  ) {
    const parent =
      findTreeItem(
        result,
        intent.itemId,
      )

    if (!parent) {
      return tree
    }

    const nextOrder =
      (
        parent.children?.length
        ?? 0
      )
      + 1

    result =
      applySinglePlannerMove(
        result,
        childId,
        intent.itemId,
        nextOrder,
      )
  }

  return result
}


export function removePlannerItem(
  tree,
  itemId,
) {
  if (
    !Array.isArray(tree)
  ) {
    return tree
  }

  let changed = false

  const next =
    tree
      .filter(
        (item) => {
          if (
            item.id === itemId
          ) {
            changed = true
            return false
          }

          return true
        },
      )
      .map(
        (item) => {
          const children =
            removePlannerItem(
              item.children ?? [],
              itemId,
            )

          if (
            children !==
            item.children
          ) {
            changed = true

            return {
              ...item,
              children,
            }
          }

          return item
        },
      )

  return changed
    ? next
    : tree
}
