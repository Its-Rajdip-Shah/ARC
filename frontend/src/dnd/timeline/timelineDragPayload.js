export const ARC_TIMELINE_ITEM_MIME =
  'application/x-arc-item'


export function writeTimelineDragItem(
  dataTransfer,
  itemId,
) {
  dataTransfer.effectAllowed =
    'move'

  const value =
    String(
      itemId,
    )

  dataTransfer.setData(
    ARC_TIMELINE_ITEM_MIME,
    value,
  )

  /*
   * text/plain preserves the existing browser fallback/debug behavior.
   */
  dataTransfer.setData(
    'text/plain',
    value,
  )
}


export function readTimelineDragItem(
  dataTransfer,
) {
  const raw =
    dataTransfer.getData(
      ARC_TIMELINE_ITEM_MIME,
    )

  const itemId =
    Number(
      raw,
    )

  if (
    !Number.isSafeInteger(
      itemId,
    )
  ) {
    return null
  }

  return itemId
}


export function hasTimelineDragItem(
  dataTransfer,
) {
  return Array.from(
    dataTransfer.types,
  ).includes(
    ARC_TIMELINE_ITEM_MIME,
  )
}
