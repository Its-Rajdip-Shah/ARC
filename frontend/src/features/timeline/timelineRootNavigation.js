/** Adapt canonical hierarchy and the global task universe for navigation only. */
export function findTreeItemById(roots, id) {
  if (id == null) return null
  for (const item of roots) {
    if (Number(item.id) === Number(id)) return item
    const child = findTreeItemById(item.children ?? [], id)
    if (child) return child
  }
  return null
}

export function deriveRootNavigationDate(item) {
  if (!item) return null
  return (item.is_completed
    ? item.completed_display_date ?? item.scheduled_date
    : item.scheduled_date) ?? null
}

export function buildRootLeafIndex(roots, universeItems, includeCompleted) {
  const universe = new Map(universeItems.map((item) => [Number(item.id), item]))
  const index = new Map()
  for (const root of roots) {
    const entries = []
    function visit(item) {
      if (item.children?.length) {
        item.children.forEach(visit)
        return
      }
      if (!['TASK', 'ASSIGNMENT'].includes(item.item_type)) return
      const row = universe.get(Number(item.id))
      if (!row || (!includeCompleted && row.is_completed)) return
      const date = deriveRootNavigationDate(row)
      entries.push({
        id: Number(item.id), rootId: root.id, title: row.title,
        date, isCompleted: Boolean(row.is_completed), missingSchedule: date == null,
      })
    }
    visit(root)
    entries.sort((a, b) => {
      if (a.date == null) return b.date == null ? a.id - b.id : 1
      if (b.date == null) return -1
      return (a.date < b.date ? -1 : a.date > b.date ? 1 : 0) || a.id - b.id
    })
    index.set(root.id, entries)
  }
  return index
}

export function stepRootLeaf(entries, currentId, direction) {
  const navigable = entries.filter((entry) => entry.date != null)
  if (!navigable.length) return null
  const current = currentId == null ? -1 : navigable.findIndex((entry) => entry.id === Number(currentId))
  if (current < 0) return direction > 0 ? navigable[0] : navigable.at(-1)
  return navigable[(current + direction + navigable.length) % navigable.length]
}

/** Choose a current leaf from the rendered date window without making a jump. */
export function findInitialVisibleRootLeaf(entries, visibleTaskItems, visibleDateKeys) {
  const navigable = entries.filter((entry) => entry.date != null)
    .slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0) || a.id - b.id)
  if (!navigable.length) return null
  const dates = visibleDateKeys.filter(Boolean).slice().sort()
  if (!dates.length) return navigable[0]
  const from = dates[0], to = dates.at(-1)
  const byId = new Map(navigable.map((entry) => [entry.id, entry]))
  // Input order is the board's ordering for equal dates, including session clones.
  const visible = visibleTaskItems.map((item, order) => ({ order, entry: byId.get(Number(item.id)) }))
    .filter(({ entry }) => entry?.date != null && entry.date >= from && entry.date <= to)
    .sort((a, b) => (a.entry.date < b.entry.date ? -1 : a.entry.date > b.entry.date ? 1 : 0) || a.order - b.order)
  if (visible.length) return visible[0].entry
  return navigable.find((entry) => entry.date >= from) ?? navigable.at(-1)
}
