/**
 * Identify a parent that becomes actionable after its final
 * unfinished direct child is completed.
 *
 * This is a pure transition detector. It does not mutate the
 * planning tree or change scheduling state.
 */
export function newlyActionableParent(
  beforeTree,
  afterTree,
  completedChildId,
) {
  function findWithParent(nodes, targetId, parent = null) {
    for (const node of nodes ?? []) {
      if (node.id === targetId) {
        return { node, parent }
      }

      const found = findWithParent(
        node.children,
        targetId,
        node,
      )

      if (found) return found
    }

    return null
  }

  const before = findWithParent(
    beforeTree,
    completedChildId,
  )

  const after = findWithParent(
    afterTree,
    completedChildId,
  )

  if (!before?.parent || !after?.parent) {
    return null
  }

  if (before.parent.id !== after.parent.id) {
    return null
  }

  if (before.node.is_completed) {
    return null
  }

  if (!after.node.is_completed) {
    return null
  }

  const beforeParent = before.parent
  const afterParent = after.parent

  if (
    beforeParent.is_completed ||
    afterParent.is_completed
  ) {
    return null
  }

  const beforeChildren = beforeParent.children ?? []
  const afterChildren = afterParent.children ?? []

  if (
    beforeChildren.length === 0 ||
    afterChildren.length === 0
  ) {
    return null
  }

  const hadUnfinishedChildren = beforeChildren.some(
    (child) => !child.is_completed,
  )

  const allChildrenFinished = afterChildren.every(
    (child) => child.is_completed,
  )

  if (
    !hadUnfinishedChildren ||
    !allChildrenFinished
  ) {
    return null
  }

  return {
    id: afterParent.id,
    title: afterParent.title,
    duration_category: afterParent.duration_category,
  }
}
