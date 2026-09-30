export function planningRowId(
  row,
) {
  return (
    row.item_id
    ?? row.id
  )
}

export function planningSearchText(
  row,
  path,
  includePath,
) {
  const tagText =
    (row.tags ?? [])
      .map(
        (tag) =>
          tag?.name
          ?? tag,
      )
      .join(
        ' | ',
      )

  return [
    ...(
      includePath
        ? (
            path
            ?? []
          ).map(
            (item) =>
              item.title,
          )
        : []
    ),

    row.title,
    row.description,
    tagText,
    row.item_type,
    row.duration_category,
  ]
    .filter(
      Boolean,
    )
    .join(
      ' | ',
    )
    .toLocaleLowerCase()
}
