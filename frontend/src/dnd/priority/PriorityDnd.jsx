import {
  DndContext,
  closestCenter,
} from '@dnd-kit/core'

import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'

import {
  verticalOnly,
} from '../core/modifiers'

import {
  useSortableSensors,
} from '../core/useSortableSensors'

import {
  projectPriorityDrop,
} from './priorityProjection'


/*
 * Priority owns its complete drag/drop policy here.
 *
 * The caller only supplies:
 *
 *   rows   -> current visible Priority projection
 *   onMove -> canonical intent persistence boundary
 *
 * PriorityPanel should not need to know dnd-kit collision, sensors,
 * modifiers or drop-event interpretation.
 */
export default function PriorityDnd({
  rows,
  onMove,
  children,
}) {
  const sensors =
    useSortableSensors({
      pointerDistance: 6,
    })

  function handleDragEnd({
    active,
    over,
  }) {
    const intent =
      projectPriorityDrop(
        rows,
        active?.id,
        over?.id,
      )

    if (!intent) {
      return
    }

    onMove(
      intent.itemId,
      intent.position,
    )
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={
        closestCenter
      }
      modifiers={[
        verticalOnly,
      ]}
      onDragEnd={
        handleDragEnd
      }
    >
      <SortableContext
        items={
          rows.map(
            (row) =>
              row.item_id,
          )
        }
        strategy={
          verticalListSortingStrategy
        }
      >
        {children}
      </SortableContext>
    </DndContext>
  )
}
