import { useAuthStore } from '../stores/authStore.js'

/** Scheduling calendar date; missing or unsupported account zones use UTC. */
export function userDateKey(at = new Date(), timeZone = useAuthStore.getState().user?.time_zone) {
  let formatter
  try {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timeZone || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit',
    })
  } catch {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit',
    })
  }
  const parts = Object.fromEntries(formatter.formatToParts(at).map(({ type, value }) => [type, value]))
  return `${parts.year}-${parts.month}-${parts.day}`
}
