import {
  useSortable,
} from '@dnd-kit/sortable'
import {
  CSS,
} from '@dnd-kit/utilities'
import {
  ArrowDown,
  ArrowUp,
  GripVertical,
} from 'lucide-react'

import EditablePosition from '../../components/student/EditablePosition'
import FocusTaskRow from './FocusTaskRow'


export default function FocusQueueRow({
  candidate,
  position,
  count,
  disabled,
  onMoveGlobal,
  matched = false,
  currentMatch = false,
  ...taskProps
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } =
    useSortable({
      id:
        candidate.item_id,
      disabled,
    })

  return (
    <div
      ref={setNodeRef}
      className={[
        'focus-queue-row',
        isDragging
          ? 'is-dragging'
          : '',
        matched
          ? 'is-search-match'
          : '',
        currentMatch
          ? 'is-current-match'
          : '',
      ].join(' ')}
      style={{
        transform:
          CSS.Translate.toString(
            transform,
          ),
        transition,
        zIndex:
          isDragging
            ? 80
            : undefined,
      }}
    >
      <div className="focus-queue-controls">
        <button
          ref={setActivatorNodeRef}
          type="button"
          className="focus-queue-grip"
          disabled={disabled}
          aria-label={`Reorder ${candidate.title}`}
          {...attributes}
          {...listeners}
        >
          <GripVertical size={16} />
        </button>

        <EditablePosition
          itemId={candidate.item_id}
          title={candidate.title}
          position={position}
          count={count}
          disabled={disabled}
          onMove={onMoveGlobal}
          ariaPrefix="Queue position"
          buttonTitle="Edit queue position"
          className="focus-queue-number"
        />

        <div className="focus-queue-arrows">
          <button
            type="button"
            disabled={
              disabled
              || position === 1
            }
            aria-label={`Move ${candidate.title} up`}
            onClick={() =>
              onMoveGlobal(
                candidate.item_id,
                position - 1,
              )
            }
          >
            <ArrowUp size={13} />
          </button>

          <button
            type="button"
            disabled={
              disabled
              || position === count
            }
            aria-label={`Move ${candidate.title} down`}
            onClick={() =>
              onMoveGlobal(
                candidate.item_id,
                position + 1,
              )
            }
          >
            <ArrowDown size={13} />
          </button>
        </div>
      </div>

      <FocusTaskRow
        candidate={candidate}
        {...taskProps}
      />
    </div>
  )
}
