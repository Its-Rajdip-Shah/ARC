const EM_DASH = '\u2014'
const SPACED_HYPHEN = ' - '

export function subjectLabel(title) {
  const text = typeof title === 'string' ? title : ''
  const emDash = text.indexOf(EM_DASH)
  const hyphen = text.indexOf(SPACED_HYPHEN)
  const cuts = [emDash, hyphen].filter((index) => index !== -1)

  if (cuts.length === 0) {
    return text
  }

  const index = Math.min(...cuts)
  const separatorLength = text.startsWith(EM_DASH, index) ? EM_DASH.length : SPACED_HYPHEN.length
  const name = text.slice(index + separatorLength).trim()

  return name || text
}
