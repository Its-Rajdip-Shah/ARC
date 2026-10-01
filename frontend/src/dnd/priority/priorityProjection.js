/*
 * Priority-specific drop semantics.
 *
 * Priority is one flat execution-order list. A drop therefore means:
 *
 *   active item -> position currently occupied by over item
 *
 * No hierarchy, bucket or timeline semantics are allowed in this module.
 */
export function projectPriorityDrop(
  rows,
  activeId,
  overId,
) {
  if (
    overId == null
    || activeId == null
    || activeId === overId
  ) {
    return null
  }

  const target =
    rows.find(
      (row) =>
        row.item_id ===
        overId,
    )

  if (!target) {
    return null
  }

  return {
    type:
      'priority-reorder',

    itemId:
      activeId,

    position:
      target.position,
  }
}
