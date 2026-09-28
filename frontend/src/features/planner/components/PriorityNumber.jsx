import { useEffect, useRef, useState } from 'react'

export default function PriorityNumber({ row, count, disabled, onMove }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')
  const inputRef = useRef(null)
  const buttonRef = useRef(null)

  useEffect(() => {
    if (editing) inputRef.current?.select()
  }, [editing])

  function close() {
    setEditing(false)
    setError('')
    requestAnimationFrame(() => buttonRef.current?.focus())
  }

  function confirm() {
    const value = draft.trim()
    const number = Number(value)
    if (!/^-?\d+$/.test(value) || !Number.isSafeInteger(number)) {
      setError('Enter a whole number.')
      return
    }
    const position = Math.max(1, Math.min(count, number))
    close()
    if (position !== row.position) onMove(row.item_id, position)
  }

  return (
    <div className="priority-number">
      {editing ? (
        <>
          <input ref={inputRef} value={draft} inputMode="numeric" disabled={disabled}
            aria-label={`Global priority for ${row.title}`}
            aria-invalid={Boolean(error)} aria-describedby={`priority-number-help-${row.item_id}`}
            onChange={(event) => { setDraft(event.target.value); setError('') }}
            onBlur={() => { setEditing(false); setError('') }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === 'Escape') {
                event.preventDefault()
                event.stopPropagation()
                if (event.key === 'Enter') confirm()
                else close()
              }
            }} />
          <span id={`priority-number-help-${row.item_id}`} className="sr-only">Enter confirms, Escape or leaving the field cancels. Positions are limited to 1 through {count}.</span>
          {error && <span role="alert" className="priority-number-error">{error}</span>}
        </>
      ) : (
        <button ref={buttonRef} type="button" disabled={disabled}
          aria-label={`Edit priority ${row.position} for ${row.title}`} title="Edit global priority"
          onClick={() => { setDraft(String(row.position)); setEditing(true) }}>
          {row.position}
        </button>
      )}
    </div>
  )
}
