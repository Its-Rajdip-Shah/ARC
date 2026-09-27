// Date-only arithmetic uses UTC internally, independent of DST and browser offset.
export const DAY = 86400000
export const COLUMN_WIDTH = 112
export const parseDate = (value) => new Date(value + 'T00:00:00Z')
export const dateKey = (date) => date.toISOString().slice(0, 10)
export function todayKey() {
  const now = new Date()
  return dateKey(new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())))
}
export const addDays = (key, days) => dateKey(new Date(+parseDate(key) + days * DAY))
export const formatDate = (key, options) => parseDate(key).toLocaleDateString(undefined, { ...options, timeZone: 'UTC' })
function monday(key) {
  return addDays(key, -((parseDate(key).getUTCDay() + 6) % 7))
}
export function shiftDate(key, zoom, amount) {
  if (zoom !== 'month') return addDays(key, amount * (zoom === 'week' ? 7 : 1))
  const date = parseDate(key)
  const day = date.getUTCDate()
  date.setUTCDate(1)
  date.setUTCMonth(date.getUTCMonth() + amount)
  const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate()
  date.setUTCDate(Math.min(day, last))
  return dateKey(date)
}
function weekNumber(key) {
  const thursday = parseDate(addDays(monday(key), 3))
  return Math.ceil(((thursday - Date.UTC(thursday.getUTCFullYear(), 0, 1)) / DAY + 1) / 7)
}
export function makeScale(anchor, zoom) {
  const start = zoom === 'month' ? anchor.slice(0, 7) + '-01' : zoom === 'week' ? monday(anchor) : anchor
  const count = zoom === 'day' ? 14 : zoom === 'week' ? 8 : 12
  const columnWidth = zoom === 'month' ? 280 : zoom === 'week' ? 168 : COLUMN_WIDTH
  const columns = Array.from({ length: count }, (_, index) => {
    const from = shiftDate(start, zoom, index)
    const next = shiftDate(start, zoom, index + 1)
    const to = addDays(next, -1)
    return {
      from, to,
      title: zoom === 'day' ? formatDate(from, { weekday: 'short' }) : zoom === 'week' ? 'W' + weekNumber(from) : formatDate(from, { month: 'short' }),
      subtitle: zoom === 'day' ? formatDate(from, { day: 'numeric' }) : zoom === 'week' ? formatDate(from, { day: 'numeric', month: 'short' }) + '–' + formatDate(to, { day: 'numeric', month: 'short' }) : from.slice(0, 4),
    }
  })
  return { from: start, to: columns.at(-1).to, columns, columnWidth, width: count * columnWidth }
}
// All temporal geometry projects dates proportionally within their column.
// "end" projects the following day boundary for inclusive contextual ranges.
export function positionOf(key, scale, edge = 'start') {
  const index = scale.columns.findIndex((column) => key >= column.from && key <= column.to)
  if (index === -1) return key < scale.from ? 0 : scale.width
  const column = scale.columns[index]
  const duration = parseDate(addDays(column.to, 1)) - parseDate(column.from)
  const boundary = edge === 'end' ? addDays(key, 1) : key
  const fraction = (parseDate(boundary) - parseDate(column.from)) / duration
  return (index + fraction) * scale.columnWidth
}

export function intervalGeometry(start, end, scale, endEdge = 'start') {
  if (!start || !end || start > end || start > scale.to || end < scale.from) return null
  const left = positionOf(start, scale)
  return { left, width: positionOf(end, scale, endEdge) - left }
}
export const inRange = (key, scale) => Boolean(key && key >= scale.from && key <= scale.to)
export const BUCKETS = [
  { key: 'UNDER_20_MIN', field: 'under_20', label: 'Under 20 minutes', dots: '·' },
  { key: 'MIN_20_TO_60', field: 'minutes_20_to_60', label: '20–60 minutes', dots: '··' },
  { key: 'OVER_60_MIN', field: 'over_60', label: 'Over 60 minutes', dots: '···' },
]
export function occupancy(items) {
  const counts = new Map()
  for (const item of items) {
    // Match the server: eligible active work and completed execution consume slots.
    if (!item.scheduled_date || (!item.is_completed && item.priority_position == null)) continue
    const key = item.scheduled_date + ':' + item.duration_category
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return counts
}
/* ---- Timezone interval-lane packing ---- */
export function packLanes(timezones, scale) {
  const visible = timezones
    .filter((zone) => intervalGeometry(zone.start_date, zone.end_date, scale, 'end'))
    .map((zone) => ({ ...zone }))
    .sort((a, b) => a.start_date.localeCompare(b.start_date) || a.end_date.localeCompare(b.end_date))
  const lanes = []
  const assignments = []
  for (const zone of visible) {
    let placed = -1
    for (let i = 0; i < lanes.length; i++) {
      if (lanes[i] < zone.start_date) { placed = i; break }
    }
    if (placed === -1) { placed = lanes.length; lanes.push('') }
    lanes[placed] = zone.end_date
    assignments.push({ zone, lane: placed })
  }
  return { assignments, laneCount: lanes.length }
}

// Only neighbouring rows can share a visible boundary; the row gap separates
// non-neighbouring lanes. Greedy colouring never changes temporal packing.
export function colourZones(assignments, scale) {
  const coloured = []
  return assignments.map((assignment) => {
    const interval = intervalGeometry(assignment.zone.start_date, assignment.zone.end_date, scale, 'end')
    const neighbours = coloured.filter((other) =>
      Math.abs(other.lane - assignment.lane) <= 1 &&
      interval.left <= other.interval.left + other.interval.width + 1e-9 &&
      other.interval.left <= interval.left + interval.width + 1e-9)
    const used = new Set(neighbours.map((other) => other.colour))
    let colour = 0
    while (used.has(colour)) colour++
    // Dense intersections can need more than three colours. Reuse the least
    // frequent neighbour colour as a bounded-palette fallback.
    if (colour >= 3) {
      const counts = [0, 1, 2].map((value) => neighbours.filter((other) => other.colour === value).length)
      colour = counts.indexOf(Math.min(...counts))
    }
    const result = { ...assignment, interval, colour }
    coloured.push(result)
    return result
  })
}

// Collision width only, never task duration. Actual cards may be narrower.
export const TASK_CARD_COLLISION_WIDTH = 285
export const TASK_COLLISION_GAP = 12
export const TASK_MARKER_RADIUS = 8

export function taskGeometry(item, scale) {
  const card = inRange(item.scheduled_date, scale)
    ? { left: positionOf(item.scheduled_date, scale), width: TASK_CARD_COLLISION_WIDTH }
    : null
  const start = item.start_date || (item.due_date ? item.scheduled_date : null)
  const end = item.due_date || (item.start_date ? item.scheduled_date : null)
  const constraint = start && end
    ? intervalGeometry(start < end ? start : end, start < end ? end : start, scale)
    : null
  const markers = ['start_date', 'due_date'].filter((field) => inRange(item[field], scale)).map((field) => {
    const x = positionOf(item[field], scale)
    return { field, x, popped: Boolean(card && x >= card.left - TASK_MARKER_RADIUS && x <= card.left + card.width + TASK_MARKER_RADIUS) }
  })
  const extents = [
    ...(card ? [[card.left, card.left + card.width]] : []),
    ...(constraint ? [[constraint.left, constraint.left + constraint.width]] : []),
    ...markers.map(({ x }) => [x - TASK_MARKER_RADIUS, x + TASK_MARKER_RADIUS]),
  ]
  if (!extents.length) return null
  // Temporal segments are clipped by intervalGeometry. Keep the card's visible
  // overhang (the board reserves room for it) in collision calculations.
  return { card, constraint, markers, left: Math.max(0, Math.min(...extents.map(([left]) => left)) - TASK_COLLISION_GAP / 2), right: Math.max(...extents.map(([, right]) => right)) + TASK_COLLISION_GAP / 2 }
}

export function packTaskLanes(items, scale) {
  const entries = items.map((item) => ({ item, geometry: taskGeometry(item, scale) }))
    .filter(({ geometry }) => geometry)
    .sort((a, b) => a.geometry.left - b.geometry.left || a.geometry.right - b.geometry.right || String(a.item.id).localeCompare(String(b.item.id)))
  const lanes = []
  const ends = []
  for (const entry of entries) {
    let lane = ends.findIndex((end) => end < entry.geometry.left)
    if (lane === -1) { lane = lanes.length; lanes.push([]) }
    lanes[lane].push(entry)
    ends[lane] = entry.geometry.right
  }
  return lanes
}

export function itemsInPeriod(items, column) {
  if (!column) return items

  return items.filter(
    (item) =>
      item.scheduled_date &&
      item.scheduled_date >= column.from &&
      item.scheduled_date <= column.to,
  )
}

export function concentratedItems(items, hoveredColumn, selectedColumn) {
  const activeColumn = hoveredColumn ?? selectedColumn
  return activeColumn ? itemsInPeriod(items, activeColumn) : items
}

export function isPersistentConcentration(hoveredColumn, selectedColumn) {
  return selectedColumn !== null && hoveredColumn === null
}

