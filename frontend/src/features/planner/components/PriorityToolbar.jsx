import { ArrowUp, ArrowDown, Search, X, Undo2, Redo2 } from 'lucide-react'

export default function PriorityToolbar({ find, canUndo, canRedo, onUndo, onRedo, busy, findLabel = 'Find in shown priority tasks', toolsLabel = 'Priority tools' }) {
  return (
    <div className="priority-toolbar" role="group" aria-label={toolsLabel}>
      <Search size={15} aria-hidden="true" className="shrink-0 text-arc-blue-light" />
      <input type="search" value={find.query} placeholder="Find in shown tasks…" aria-label={findLabel}
        onChange={(event) => find.changeQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') { event.preventDefault(); find.navigate(event.shiftKey ? -1 : 1) }
          if (event.key === 'Escape') { event.preventDefault(); find.changeQuery('') }
        }} />
      <span className="priority-find-count" role="status" aria-live="polite">
        {find.query.trim() ? `${find.index + 1} / ${find.matches.length}` : ''}
      </span>
      <button type="button" className="priority-action" aria-label="Previous match" disabled={!find.matches.length} onClick={() => find.navigate(-1)}><ArrowUp size={15} /></button>
      <button type="button" className="priority-action" aria-label="Next match" disabled={!find.matches.length} onClick={() => find.navigate(1)}><ArrowDown size={15} /></button>
      {find.query && <button type="button" className="priority-action" aria-label="Clear find" onClick={() => find.changeQuery('')}><X size={15} /></button>}
      <span className="mx-1 h-5 border-l border-white/10" />
      <button type="button" className="priority-action" aria-label="Undo" disabled={!canUndo || busy} onClick={onUndo}><Undo2 size={18} /></button>
      <button type="button" className="priority-action" aria-label="Redo" disabled={!canRedo || busy} onClick={onRedo}><Redo2 size={18} /></button>
    </div>
  )
}
