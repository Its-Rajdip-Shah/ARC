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
  projectPlannerSidebarDrop,
} from './plannerSidebarProjection'


/*
 * Flat root sorting mechanics intentionally mirror PriorityDnd.
 *
 * Sidebar owns only the meaning of the resulting root position.
 */
export default function PlannerSidebarDnd({
  roots,
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
      projectPlannerSidebarDrop(
        roots,
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
          roots.map(
            (root) =>
              root.id,
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
