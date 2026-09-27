import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ArrowDown, ArrowUp, GripVertical } from 'lucide-react'
import PriorityNumber from './PriorityNumber'

export default function PriorityCard({ row, column, ancestors, count, disabled, onMove, matched, currentMatch, registerCard }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: row.item_id,
    disabled,
  })
  return (
    <li ref={setNodeRef} value={row.position}
      className={`priority-row ${isDragging ? 'priority-row-dragging' : ''}`}
      style={{ transform: CSS.Transform.toString(transform), transition, '--root-column': column }}>
      <PriorityNumber row={row} count={count} disabled={disabled} onMove={onMove} />
      <article ref={(node) => registerCard(row.item_id, node)} tabIndex={-1}
        className={`priority-card ${matched ? 'priority-match' : ''} ${currentMatch ? 'priority-current-match' : ''}`}
        aria-label={`${row.title}, ${row.root.title}, priority ${row.position}`}>
        <button ref={setActivatorNodeRef} type="button" {...attributes} {...listeners}
          disabled={disabled} aria-label={`Reorder ${row.title}`} className="priority-grip">
          <GripVertical size={16} aria-hidden="true" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="sr-only">Root: {row.root.title}</p>
          <div className="priority-path">
            {ancestors?.map((ancestor) => (
              <span key={ancestor.id} className="text-arc-text-muted">
                {ancestor.title}<span aria-hidden="true" className="px-2 text-white/30">|</span>
              </span>
            ))}
            <span className="font-semibold text-white">{row.title}</span>
          </div>
        </div>
        <div className="priority-card-arrows">
          <button type="button" className="priority-action" disabled={disabled || row.position === 1}
            aria-label={`Move ${row.title} up`} onClick={() => onMove(row.item_id, row.position - 1)}>
            <ArrowUp size={13} aria-hidden="true" />
          </button>
          <button type="button" className="priority-action" disabled={disabled || row.position === count}
            aria-label={`Move ${row.title} down`} onClick={() => onMove(row.item_id, row.position + 1)}>
            <ArrowDown size={13} aria-hidden="true" />
          </button>
        </div>
      </article>
    </li>
  )
}
