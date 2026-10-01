/*
 * Planner sidebar is one flat root-order list.
 *
 * This deliberately mirrors Priority:
 *
 *   active root -> position currently occupied by over root
 */
export function projectPlannerSidebarDrop(
  roots,
  activeId,
  overId,
) {
  if (
    activeId == null
    || overId == null
    || activeId === overId
  ) {
    return null
  }

  const targetIndex =
    roots.findIndex(
      (root) =>
        root.id === overId,
    )

  if (targetIndex === -1) {
    return null
  }

  return {
    type:
      'planner-sidebar-root-reorder',

    itemId:
      activeId,

    position:
      targetIndex + 1,
  }
}


export function reorderPlannerSidebarRoots(
  roots,
  itemId,
  requestedPosition,
) {
  if (
    !Array.isArray(roots)
    || roots.length === 0
  ) {
    return roots
  }

  const sourceIndex =
    roots.findIndex(
      (root) =>
        root.id === itemId,
    )

  if (sourceIndex === -1) {
    return roots
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
    return roots
  }

  const position =
    Math.max(
      1,
      Math.min(
        roots.length,
        Math.trunc(
          numericPosition,
        ),
      ),
    )

  const next = [
    ...roots,
  ]

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

  return next
}
