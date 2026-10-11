import { addDays } from '../timeline/timelineDates.js'
import { bucketForCandidate } from './focusModel.js'

export const addDaysIso = addDays


export function makeQueueGroups(
  rows,
  today,
) {
  const dates =
    new Set([
      today,
      addDaysIso(
        today,
        1,
      ),
    ])

  for (const row of rows) {
    if (row.scheduled_date) {
      dates.add(
        row.scheduled_date,
      )
    }
  }

  return [
    ...dates,
  ]
    .sort()
    .map(
      (date) => ({
        date,

        rows:
          rows.filter(
            (row) =>
              row.scheduled_date
              === date,
          ),
      }),
    )
}


export function flattenQueue(
  groups,
) {
  const flattened = []

  for (const group of groups) {
    group.rows.forEach(
      (
        row,
        localIndex,
      ) => {
        flattened.push({
          row,
          date:
            group.date,
          localPosition:
            localIndex + 1,
          globalPosition:
            flattened.length + 1,
        })
      },
    )
  }

  return flattened
}


export function queuePositionMap(
  groups,
) {
  return new Map(
    flattenQueue(
      groups,
    ).map(
      (entry) => [
        entry.row.item_id,
        entry.globalPosition,
      ],
    ),
  )
}


export function findQueuePosition(
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


export function changedQueueItemIds(
  beforeGroups,
  afterGroups,
) {
  const before =
    new Map(
      flattenQueue(
        beforeGroups,
      ).map(
        (entry) => [
          entry.row.item_id,
          {
            date:
              entry.date,

            localPosition:
              entry.localPosition,
          },
        ],
      ),
    )

  const after =
    new Map(
      flattenQueue(
        afterGroups,
      ).map(
        (entry) => [
          entry.row.item_id,
          {
            date:
              entry.date,

            localPosition:
              entry.localPosition,
          },
        ],
      ),
    )

  const changed =
    new Set()

  for (
    const [
      itemId,
      beforePosition,
    ]
    of before
  ) {
    const afterPosition =
      after.get(
        itemId,
      )

    if (!afterPosition) {
      continue
    }

    if (
      beforePosition.date
        !== afterPosition.date
      || beforePosition.localPosition
        !== afterPosition.localPosition
    ) {
      changed.add(
        itemId,
      )
    }
  }

  return changed
}


export function queueItemPositionChanged(
  beforeGroups,
  afterGroups,
  itemId,
) {
  const before =
    findQueuePosition(
      beforeGroups,
      itemId,
    )

  const after =
    findQueuePosition(
      afterGroups,
      itemId,
    )

  if (
    !before
    || !after
  ) {
    return false
  }

  return (
    before.date
      !== after.date
    || before.index
      !== after.index
  )
}



export function moveQueueItem(
  groups,
  itemId,
  targetDate,
  targetPosition,
) {
  const source =
    findQueuePosition(
      groups,
      itemId,
    )

  if (!source) {
    return groups
  }

  const next =
    groups.map(
      (group) => ({
        ...group,
        rows: [
          ...group.rows,
        ],
      }),
    )

  const sourceGroup =
    next.find(
      (group) =>
        group.date
        === source.date,
    )

  const targetGroup =
    next.find(
      (group) =>
        group.date
        === targetDate,
    )

  if (
    !sourceGroup
    || !targetGroup
  ) {
    return groups
  }

  const [row] =
    sourceGroup.rows.splice(
      source.index,
      1,
    )

  if (!row) {
    return groups
  }

  const insertion =
    Math.max(
      0,
      Math.min(
        targetGroup.rows.length,
        targetPosition - 1,
      ),
    )

  targetGroup.rows.splice(
    insertion,
    0,
    row,
  )

  return next
}


export function moveQueueItemByGlobalPosition(
  groups,
  itemId,
  targetGlobalPosition,
) {
  const flattened =
    flattenQueue(
      groups,
    )

  const sourceIndex =
    flattened.findIndex(
      (entry) =>
        entry.row.item_id
        === itemId,
    )

  if (sourceIndex === -1) {
    return groups
  }

  const bounded =
    Math.max(
      1,
      Math.min(
        flattened.length,
        targetGlobalPosition,
      ),
    )

  if (
    sourceIndex + 1
    === bounded
  ) {
    return groups
  }

  const moving =
    flattened[
      sourceIndex
    ]

  const remaining =
    flattened.filter(
      (entry) =>
        entry.row.item_id
        !== itemId,
    )

  const insertionIndex =
    bounded - 1

  if (!remaining.length) {
    return moveQueueItem(
      groups,
      itemId,
      moving.date,
      1,
    )
  }

  let targetDate
  let targetLocalPosition

  const previous =
    insertionIndex > 0
      ? remaining[
          insertionIndex - 1
        ]
        ?? null
      : null

  const next =
    insertionIndex
      < remaining.length
      ? remaining[
          insertionIndex
        ]
        ?? null
      : null

  /*
   * A requested global rank can land exactly on:
   *
   *   last TODAY | first TOMORROW
   *
   * Both dates touch the same flattened insertion gap.
   *
   * When the moving task already belongs to one of those dates, preserve
   * that date instead of silently migrating across the boundary.
   */
  const ambiguousDateBoundary =
    previous
    && next
    && previous.date
      !== next.date
    && (
      moving.date
        === previous.date
      || moving.date
        === next.date
    )

  if (ambiguousDateBoundary) {
    targetDate =
      moving.date

    if (
      moving.date
      === previous.date
    ) {
      targetLocalPosition =
        remaining.filter(
          (entry) =>
            entry.date
            === targetDate,
        ).length
        + 1
    } else {
      targetLocalPosition =
        1
    }
  } else if (
    insertionIndex
    >= remaining.length
  ) {
    const reference =
      remaining[
        remaining.length - 1
      ]

    targetDate =
      reference.date

    targetLocalPosition =
      remaining.filter(
        (entry) =>
          entry.date
          === targetDate,
      ).length + 1
  } else {
    const reference =
      remaining[
        insertionIndex
      ]

    targetDate =
      reference.date

    targetLocalPosition =
      remaining
        .slice(
          0,
          insertionIndex,
        )
        .filter(
          (entry) =>
            entry.date
            === targetDate,
        )
        .length
      + 1
  }

  return moveQueueItem(
    groups,
    itemId,
    targetDate,
    targetLocalPosition,
  )
}


export function changesForTouchedRows(
  groups,
  touchedIds,
  dirtyDates,
  intents = null,
) {
  const changes = []

  for (const group of groups) {
    if (
      !dirtyDates.has(
        group.date,
      )
    ) {
      continue
    }

    group.rows.forEach(
      (
        row,
        index,
      ) => {
        const touched =
          touchedIds.has(
            row.item_id,
          )

        if (!touched) return

        const intent = intents?.get(row.item_id)
        if (intent) {
          changes.push({ ...intent })
          return
        }

        changes.push({
          item_id:
            row.item_id,
          date:
            group.date,
          order:
            index + 1,
        })
      },
    )
  }

  return changes
}



export function moveQueueItemToSlot(
  groups,
  itemId,
  targetDate,
  slotIndex,
) {
  const source =
    findQueuePosition(
      groups,
      itemId,
    )

  if (!source) {
    return groups
  }

  const next =
    groups.map(
      (group) => ({
        ...group,
        rows: [
          ...group.rows,
        ],
      }),
    )

  const sourceGroup =
    next.find(
      (group) =>
        group.date
        === source.date,
    )

  const targetGroup =
    next.find(
      (group) =>
        group.date
        === targetDate,
    )

  if (
    !sourceGroup
    || !targetGroup
  ) {
    return groups
  }

  const [row] =
    sourceGroup.rows.splice(
      source.index,
      1,
    )

  if (!row) {
    return groups
  }

  let requestedInsertion =
    slotIndex

  if (
    source.date
    === targetDate
    && source.index
    < requestedInsertion
  ) {
    requestedInsertion -= 1
  }

  const insertion =
    Math.max(
      0,
      Math.min(
        targetGroup.rows.length,
        requestedInsertion,
      ),
    )

  targetGroup.rows.splice(
    insertion,
    0,
    row,
  )

  return next
}


// Resolve only the directly moved task against canonical and pending slots.
// Reuse the canonical Focus bucket projection, including residual work.
export function directMovementIntent(groups, itemId, intents = new Map()) {
  const entries = flattenQueue(groups)
  const moving = entries.find(({ row }) => row.item_id === itemId)
  if (!moving) return null
  const bucket = bucketForCandidate(moving.row)?.id
  const occupied = new Set()
  for (const { row } of entries) {
    if (row.item_id === itemId || bucketForCandidate(row)?.id !== bucket) continue
    const pending = intents.get(row.item_id)
    const date = pending?.date ?? row.manual_requested_date
    const order = pending?.order ?? row.manual_requested_order
    if (date === moving.date && order != null) occupied.add(order)
  }
  let order = moving.localPosition
  if (occupied.has(order)) {
    // Match sticky carry-forward's existing lowest-free-positive convention.
    order = 1
    while (occupied.has(order)) order += 1
  }
  return { item_id: itemId, date: moving.date, order }
}
