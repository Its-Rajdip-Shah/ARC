function findQueuePosition(
  groups,
  itemId,
) {
  for (const group of groups) {
    const index =
      group.rows.findIndex(
        (row) =>
          row.item_id
          === itemId,
      )

    if (index !== -1) {
      return {
        date:
          group.date,

        index,
      }
    }
  }

  return null
}


export function projectFocusDrop({
  groups,
  activeId,
  overId,
  movingUp = false,
}) {
  if (
    !Array.isArray(groups)
    || overId == null
  ) {
    return null
  }

  const targetId =
    String(overId)

  /*
   * A date heading is the one canonical boundary between adjacent days.
   *
   * Moving down across it:
   *   prepend to the date below.
   *
   * Moving up across it:
   *   append to the date above.
   */
  if (
    targetId.startsWith(
      'date-boundary:',
    )
  ) {
    const targetDate =
      targetId.slice(
        'date-boundary:'.length,
      )

    const groupIndex =
      groups.findIndex(
        (group) =>
          group.date
          === targetDate,
      )

    if (groupIndex === -1) {
      return null
    }

    if (
      groupIndex > 0
      && movingUp
    ) {
      const previous =
        groups[
          groupIndex - 1
        ]

      return {
        date:
          previous.date,

        slotIndex:
          previous.rows.length,
      }
    }

    return {
      date:
        targetDate,

      slotIndex: 0,
    }
  }

  if (
    targetId.startsWith(
      'queue-end:',
    )
  ) {
    const targetDate =
      targetId.slice(
        'queue-end:'.length,
      )

    const targetGroup =
      groups.find(
        (group) =>
          group.date
          === targetDate,
      )

    if (!targetGroup) {
      return null
    }

    return {
      date:
        targetDate,

      slotIndex:
        targetGroup.rows.length,
    }
  }

  const target =
    findQueuePosition(
      groups,
      overId,
    )

  if (!target) {
    return null
  }

  if (
    activeId
    === overId
  ) {
    return {
      date:
        target.date,

      slotIndex:
        target.index,
    }
  }

  /*
   * Task targets use occupied-slot semantics.
   *
   * dnd-kit's verticalListSortingStrategy visually moves the active item
   * into the hovered sortable item's occupied position. Persistence must use
   * that same destination.
   *
   * Previously Focus interpreted the exact same visual target again using
   * active/target midpoints. That allowed:
   *
   *   visual preview: move before target
   *   persisted slot: after target
   *
   * and adjacent upward drags could become exact no-ops.
   *
   * Explicit date boundaries and queue-end zones still represent gaps.
   */
  return {
    date:
      target.date,

    slotIndex:
      target.index,
  }
}
