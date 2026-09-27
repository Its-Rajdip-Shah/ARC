import { useState } from 'react'

const defaults = { zoom: 'day', type: 'all',
  duration: 'all', grouped: true, completed: false, roots: [] }
export function readTimelinePreferences(userId) {
  if (userId == null) return { ...defaults }
  try {
    const value = JSON.parse(localStorage.getItem('arc.timeline.v1.' + userId)) ?? {}
    return {
      zoom: ['day', 'week', 'month'].includes(value.zoom) ? value.zoom : defaults.zoom,
      type: ['all', 'tasks', 'assignments'].includes(value.type) ? value.type : defaults.type,
      duration: ['all', 'short', 'medium', 'long'].includes(value.duration) ? value.duration : defaults.duration,
      grouped: typeof value.grouped === 'boolean' ? value.grouped : defaults.grouped,
      completed: typeof value.completed === 'boolean' ? value.completed : defaults.completed,
      roots: Array.isArray(value.roots) ? [...new Set(value.roots.filter(Number.isSafeInteger))] : [],
    }
  } catch { return { ...defaults } }
}
export default function useTimelinePreferences(userId) {
  const [preferences, setPreferences] = useState(() => readTimelinePreferences(userId))
  function update(patch) {
    const next = { ...preferences, ...patch }
    setPreferences(next)
    if (userId != null) {
      try { localStorage.setItem('arc.timeline.v1.' + userId, JSON.stringify(next)) }
      catch { /* Storage may be unavailable; keep the in-memory preference. */ }
    }
  }
  return [preferences, update]
}
