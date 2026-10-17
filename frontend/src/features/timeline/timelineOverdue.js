// Match Planner's overdue classification without modifying canonical task data.
// Deadline overdue takes precedence when a task qualifies for both categories.
export function classifyTimelineOverdue(item, today) {
  const actionable = item.item_type === 'TASK' || item.item_type === 'ASSIGNMENT'
  if (!actionable || item.is_completed) return null

  const deadline = item.deadline_overdue === true ||
    (Boolean(item.due_date) && item.due_date < today)

  if (deadline) return 'deadline'

  const origin = item.manual_anchor_origin_date
  const age = origin
    ? Math.floor(
        (Date.parse(`${today}T00:00:00Z`) -
          Date.parse(`${origin}T00:00:00Z`)) / 86400000,
      )
    : null

  const carried = item.active_carried_anchor === true || (
    Boolean(item.manual_requested_date && origin) &&
    age >= 1 &&
    age <= 3
  )

  const expired = item.expired_anchor_history === true ||
    Boolean(item.expired_manual_requested_date) ||
    age >= 4

  return carried || expired ? 'anchor' : null
}
