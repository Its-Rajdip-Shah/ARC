const ENTITIES = [
  ['&nbsp;', ' '],
  ['&lt;', '<'],
  ['&gt;', '>'],
  ['&quot;', '"'],
  ['&#39;', "'"],
  ['&amp;', '&'],
]

export function plainText(value) {
  if (value == null) return ''

  let text = String(value).replace(/<[^>]*>/g, ' ')
  for (const [entity, decoded] of ENTITIES) {
    text = text.replaceAll(entity, decoded)
  }
  return text.replace(/\s+/g, ' ').trim()
}
