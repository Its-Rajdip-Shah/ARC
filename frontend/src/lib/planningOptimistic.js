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
