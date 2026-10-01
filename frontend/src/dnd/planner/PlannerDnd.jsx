import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'

import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'

import {
  useRef,
  useState,
} from 'react'

import {
  plannerDescendantIds,
  projectPlannerGap,
  stablePlannerDepthDelta,
} from './plannerProjection'

import {
  plannerVisualGapIndex,
} from './plannerVisualPlacement'


/*
 * Planner is a two-axis editor:
 *
 *   vertical pointer position   -> sibling/order slot
 *   horizontal pointer position -> hierarchy depth
 *
 * Using dnd-kit's closestCenter mixes X into collision selection. That means
 * moving a card left/right can accidentally change overId and therefore
 * reorder it vertically. Compare only vertical centers instead.
 */
function verticalCenterCollision({
  collisionRect,
  droppableContainers,
  droppableRects,
}) {
  const activeCenterY =
    collisionRect.top
    + collisionRect.height / 2

  const collisions = []

  for (
    const container
    of droppableContainers
  ) {
    const rect =
      droppableRects.get(
        container.id,
      )

    if (!rect) {
      continue
    }

    const centerY =
      rect.top
      + rect.height / 2

    collisions.push({
      id:
        container.id,

      data: {
        droppableContainer:
          container,

        value:
          Math.abs(
            activeCenterY
            - centerY,
          ),
      },
    })
  }

  return collisions.sort(
    (a, b) =>
      a.data.value
      - b.data.value,
  )
}


export default function PlannerDnd({
  items,
  onMove,
  children,
}) {
  const [
    activeId,
    setActiveId,
  ] =
    useState(null)

  const [
    projection,
    setProjection,
  ] =
    useState(null)

  const lastProjectionRef =
    useRef(null)

  const depthDeltaRef =
    useRef(0)

  /*
   * Geometry must be sampled after dnd-kit has painted the transforms caused
   * by the latest pointer event.
   *
   * Reading getBoundingClientRect() synchronously inside onDragMove observes
   * the PREVIOUS visual frame. That is the source of the systematic
   * one-position-behind drop.
   */
  const projectionFrameRef =
    useRef(null)

  const dragDescendantIds =
    activeId == null
      ? []
      : plannerDescendantIds(
          items,
          activeId,
        )

  /*
   * A parent must use EXACTLY the same dnd-kit geometry as a leaf.
   *
   * Descendants remain in SortableContext for the entire gesture. Removing
   * them after DragStart changes the list geometry underneath an active
   * pointer gesture and makes parent placement dependent on subtree size.
   *
   * Descendants may be hidden visually by PlannerTree, but geometry stays
   * stable.
   */
  const sortableItems =
    items


  const sensors =
    useSensors(
      useSensor(
        PointerSensor,
        {
          activationConstraint: {
            distance: 4,
          },
        },
      ),
    )

  function reset() {
    if (
      projectionFrameRef.current
      != null
    ) {
      window.cancelAnimationFrame(
        projectionFrameRef.current,
      )

      projectionFrameRef.current =
        null
    }

    setActiveId(null)
    setProjection(null)

    lastProjectionRef.current =
      null

    depthDeltaRef.current =
      0
  }

  function projectionFromEvent(
    event,
  ) {
    const {
      active,
      delta,
    } = event

    const horizontalOffset =
      delta?.x
      ?? 0

    /*
     * Read the actual task-card elements currently visible on screen.
     *
     * These live INSIDE dnd-kit's transformed sortable <li>, so
     * getBoundingClientRect() contains the visual transform.
     *
     * Do not derive persisted vertical placement from event.over.
     */
    const rows =
      Array.from(
        document.querySelectorAll(
          '[data-arc-planner-card-id]',
        ),
      )
        .map(
          (element) => {
            const id =
              Number(
                element.getAttribute(
                  'data-arc-planner-card-id',
                ),
              )

            if (
              !Number.isSafeInteger(
                id,
              )
            ) {
              return null
            }

            const rect =
              element
                .getBoundingClientRect()

            return {
              id,

              centerY:
                rect.top
                + rect.height / 2,
            }
          },
        )
        .filter(Boolean)

    const activeRow =
      rows.find(
        (row) =>
          row.id === active.id,
      )

    if (!activeRow) {
      return (
        lastProjectionRef.current
        ?? null
      )
    }

    const gapIndex =
      plannerVisualGapIndex({
        rows,

        activeId:
          active.id,

        descendantIds:
          plannerDescendantIds(
            items,
            active.id,
          ),

        activeCenterY:
          activeRow.centerY,
      })

    const depthDelta =
      stablePlannerDepthDelta(
        horizontalOffset,
        depthDeltaRef.current,
      )

    depthDeltaRef.current =
      depthDelta

    return projectPlannerGap({
      items,

      activeId:
        active.id,

      gapIndex,

      horizontalOffset,

      depthDelta,
    })
  }

  function updateProjection(
    event,
  ) {
    /*
     * onDragMove/onDragOver fire before React+dnd-kit have necessarily
     * committed the transform generated by that event.
     *
     * Schedule geometry inspection for the next animation frame. At that
     * point the rectangles are the rectangles the user is actually seeing.
     *
     * If several pointer events arrive inside one frame, only the newest one
     * matters.
     */
    if (
      projectionFrameRef.current
      != null
    ) {
      window.cancelAnimationFrame(
        projectionFrameRef.current,
      )
    }

    const eventSnapshot = {
      active: {
        id:
          event.active.id,
      },

      delta: {
        x:
          event.delta?.x
          ?? 0,

        y:
          event.delta?.y
          ?? 0,
      },
    }

    projectionFrameRef.current =
      window.requestAnimationFrame(
        () => {
          projectionFrameRef.current =
            null

          const next =
            projectionFromEvent(
              eventSnapshot,
            )

          if (!next) {
            return
          }

          lastProjectionRef.current =
            next

          setProjection(
            next,
          )
        },
      )
  }

  function handleDragStart({
    active,
  }) {
    setActiveId(
      active.id,
    )

    setProjection(null)

    lastProjectionRef.current =
      null

    depthDeltaRef.current =
      0
  }

  function handleDragEnd(
    event,
  ) {
    /*
     * The last completed animation-frame projection represents the last
     * painted drag state the user actually saw.
     *
     * Do NOT synchronously sample geometry again here: mouse-up itself can
     * arrive before another layout/paint and would recreate the stale-frame
     * bug.
     */
    let finalProjection =
      lastProjectionRef.current

    /*
     * Extremely short drags can end before the first scheduled frame.
     * In that case there was no newer painted preview to preserve, so use the
     * current geometry as a safe fallback.
     */
    if (!finalProjection) {
      finalProjection =
        projectionFromEvent(
          event,
        )
    }

    reset()

    if (!finalProjection) {
      return
    }

    onMove(
      finalProjection,
    )
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={
        verticalCenterCollision
      }
      onDragStart={
        handleDragStart
      }
      onDragMove={
        updateProjection
      }
      onDragOver={
        updateProjection
      }
      onDragCancel={
        reset
      }
      onDragEnd={
        handleDragEnd
      }
    >
      <SortableContext
        items={
          sortableItems.map(
            (item) =>
              item.id,
          )
        }
        strategy={
          verticalListSortingStrategy
        }
      >
        {
          children({
            activeId,
            projection,
            dragDescendantIds,
          })
        }
      </SortableContext>
    </DndContext>
  )
}
