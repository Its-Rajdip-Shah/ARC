import {
  ArrowDown,
  ArrowUp,
  Redo2,
  Search,
  Undo2,
  X,
} from 'lucide-react'

export default function SearchToolbar({
  find,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  busy,
  findLabel,
  toolsLabel,
  placeholder,
  className,
  arrowKeyNavigation = false,
}) {
  function handleKeyDown(
    event,
  ) {
    if (
      event.key
      === 'Enter'
    ) {
      event.preventDefault()

      find.navigate(
        event.shiftKey
          ? -1
          : 1,
      )

      return
    }

    if (
      arrowKeyNavigation
      && event.key
        === 'ArrowDown'
    ) {
      event.preventDefault()
      find.navigate(1)
      return
    }

    if (
      arrowKeyNavigation
      && event.key
        === 'ArrowUp'
    ) {
      event.preventDefault()
      find.navigate(-1)
      return
    }

    if (
      event.key
      === 'Escape'
    ) {
      event.preventDefault()
      find.changeQuery('')
    }
  }

  return (
    <div
      className={className}
      role="group"
      aria-label={toolsLabel}
    >
      <Search
        size={15}
        aria-hidden="true"
        className="shrink-0 text-arc-blue-light"
      />

      <input
        type="search"
        value={find.query}
        placeholder={placeholder}
        aria-label={findLabel}
        onChange={(event) =>
          find.changeQuery(
            event.target.value,
          )
        }
        onKeyDown={
          handleKeyDown
        }
      />

      <span
        className="priority-find-count"
        role="status"
        aria-live="polite"
      >
        {find.query.trim()
          ? `${find.index + 1} / ${find.matches.length}`
          : ''}
      </span>

      <button
        type="button"
        className="priority-action"
        aria-label="Previous match"
        disabled={
          !find.matches.length
        }
        onClick={() =>
          find.navigate(-1)
        }
      >
        <ArrowUp
          size={15}
        />
      </button>

      <button
        type="button"
        className="priority-action"
        aria-label="Next match"
        disabled={
          !find.matches.length
        }
        onClick={() =>
          find.navigate(1)
        }
      >
        <ArrowDown
          size={15}
        />
      </button>

      {find.query && (
        <button
          type="button"
          className="priority-action"
          aria-label="Clear find"
          onClick={() =>
            find.changeQuery('')
          }
        >
          <X
            size={15}
          />
        </button>
      )}

      <span
        className="mx-1 h-5 border-l border-white/10"
      />

      <button
        type="button"
        className="priority-action"
        aria-label="Undo"
        disabled={
          !canUndo
          || busy
        }
        onClick={
          onUndo
        }
      >
        <Undo2
          size={18}
        />
      </button>

      <button
        type="button"
        className="priority-action"
        aria-label="Redo"
        disabled={
          !canRedo
          || busy
        }
        onClick={
          onRedo
        }
      >
        <Redo2
          size={18}
        />
      </button>
    </div>
  )
}
