import { useState } from 'react'

export default function TimelineDescription({ description, maxCharacters = 140 }) {
  const [expanded, setExpanded] = useState(false)
  if (!description?.trim()) return null
  const long = description.length > maxCharacters
  return (
    <div className="timeline-description">
      <p>{long && !expanded ? `${description.slice(0, maxCharacters)}…` : description}</p>
      {long && (
        <button type="button" aria-expanded={expanded}
          onDoubleClick={(event) => event.stopPropagation()}
          onClick={(event) => { event.stopPropagation(); setExpanded((value) => !value) }}>
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
  )
}
