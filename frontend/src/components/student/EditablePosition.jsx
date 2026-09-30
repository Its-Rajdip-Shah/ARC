import {
  useEffect,
  useRef,
  useState,
} from 'react'

export default function EditablePosition({
  itemId,
  title,
  position,
  count,
  disabled,
  onMove,
  ariaPrefix = 'Position',
  buttonTitle = 'Edit position',
  className = 'editable-position',
}) {
  const [
    editing,
    setEditing,
  ] = useState(false)

  const [
    draft,
    setDraft,
  ] = useState('')

  const [
    error,
    setError,
  ] = useState('')

  const inputRef =
    useRef(null)

  const buttonRef =
    useRef(null)

  useEffect(() => {
    if (editing) {
      inputRef.current?.select()
    }
  }, [
    editing,
  ])

  function close() {
    setEditing(false)
    setError('')

    requestAnimationFrame(
      () =>
        buttonRef.current?.focus(),
    )
  }

  function confirm() {
    const value =
      draft.trim()

    const number =
      Number(value)

    if (
      !/^-?\d+$/.test(value)
      || !Number.isSafeInteger(number)
    ) {
      setError(
        'Enter a whole number.',
      )
      return
    }

    const nextPosition =
      Math.max(
        1,
        Math.min(
          count,
          number,
        ),
      )

    close()

    if (
      nextPosition
      !== position
    ) {
      onMove(
        itemId,
        nextPosition,
      )
    }
  }

  return (
    <div className={className}>
      {editing
        ? (
          <>
            <input
              ref={inputRef}
              value={draft}
              inputMode="numeric"
              disabled={disabled}
              aria-label={`${ariaPrefix} for ${title}`}
              aria-invalid={Boolean(error)}
              aria-describedby={`editable-position-help-${itemId}`}
              onClick={(event) =>
                event.stopPropagation()
              }
              onChange={(event) => {
                setDraft(
                  event.target.value,
                )
                setError('')
              }}
              onBlur={() => {
                setEditing(false)
                setError('')
              }}
              onKeyDown={(event) => {
                if (
                  event.key
                  === 'Enter'
                  || event.key
                  === 'Escape'
                ) {
                  event.preventDefault()
                  event.stopPropagation()

                  if (
                    event.key
                    === 'Enter'
                  ) {
                    confirm()
                  } else {
                    close()
                  }
                }
              }}
            />

            <span
              id={`editable-position-help-${itemId}`}
              className="sr-only"
            >
              Enter confirms. Escape or leaving the field cancels.
              Positions are limited to 1 through {count}.
            </span>

            {error && (
              <span
                role="alert"
                className="editable-position-error"
              >
                {error}
              </span>
            )}
          </>
        )
        : (
          <button
            ref={buttonRef}
            type="button"
            disabled={disabled}
            aria-label={`Edit ${ariaPrefix.toLowerCase()} ${position} for ${title}`}
            title={buttonTitle}
            onClick={(event) => {
              event.stopPropagation()
              setDraft(
                String(position),
              )
              setEditing(true)
            }}
          >
            {position}
          </button>
        )}
    </div>
  )
}
