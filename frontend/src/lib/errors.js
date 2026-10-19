function firstFieldMessage(fields) {
  if (typeof fields === 'string' && fields) return fields
  if (Array.isArray(fields)) {
    for (const item of fields) {
      const found = firstFieldMessage(item)
      if (found) return found
    }
    return null
  }
  if (!fields || typeof fields !== 'object') return null
  for (const value of Object.values(fields)) {
    const found = firstFieldMessage(value)
    if (found) return found
  }
  return null
}

export function errorMessage(error, fallback) {
  const data = error?.response?.data
  const fieldMessage = firstFieldMessage(data?.error?.fields)
  if (fieldMessage) return fieldMessage
  if (typeof data?.error?.message === 'string' && data.error.message) {
    return data.error.message
  }
  if (fallback) return fallback
  return error?.message || 'Request failed'
}

export function formatInstant(value) {
  if (!value) return 'Never'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Unknown'
  return date.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}
