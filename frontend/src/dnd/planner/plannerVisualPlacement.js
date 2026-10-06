export function plannerVisualGapIndex({
  rows,
  activeId,
  descendantIds = [],
  activeCenterY,
}) {
  const excludedIds =
    new Set([
      activeId,
      ...descendantIds,
    ])

  const stationaryRows =
    rows
      .filter(
        (row) =>
          !excludedIds.has(
            row.id,
          ),
      )
      .sort(
        (left, right) =>
          left.centerY
          - right.centerY,
      )

  let gapIndex = 0

  for (const row of stationaryRows) {
    if (
      activeCenterY >
      row.centerY
    ) {
      gapIndex += 1
    }
  }

  return gapIndex
}
