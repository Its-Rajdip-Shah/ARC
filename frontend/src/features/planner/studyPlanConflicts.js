/** Live conflict labels. Weekday 0 is Monday, matching the study-plan API. */

function minutes(value) {
  const [hour, minute] = String(value || '').slice(0, 5).split(':').map(Number)
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null
  return hour * 60 + minute
}

function weekdayMonday(isoDate) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate || '')
  if (!match) return null
  const day = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
  if (Number.isNaN(day.getTime())) return null
  return (day.getUTCDay() + 6) % 7
}

function insideAvailability(session, availability) {
  const start = minutes(session.start_time)
  const duration = Number(session.duration_minutes)
  const weekday = weekdayMonday(session.date)
  if (start == null || weekday == null || !Number.isInteger(duration) || duration < 1) {
    return false
  }
  const end = start + duration
  if (end > 24 * 60) return false
  return (availability || []).some((window) => (
    window.weekday === weekday
    && start >= minutes(window.start)
    && end <= minutes(window.end)
  ))
}

export function sessionConflicts(session, availability) {
  const flags = []
  if (!insideAvailability(session, availability)) flags.push('outside_availability')
  if (session.due_date && session.date > session.due_date) flags.push('after_deadline')
  return flags
}
