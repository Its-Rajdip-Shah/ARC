export function errorMessage(error) {
  return (
    error?.response?.data?.error?.message ||
    error?.message ||
    'Request failed'
  )
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
