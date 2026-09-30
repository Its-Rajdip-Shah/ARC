import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  rectIntersection,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import {
  ArrowDown,
  ArrowUp,
  Search,
  X,
} from 'lucide-react'

import {
  useBatchAnchorFocus,
} from '../../hooks/useFocus'
import useFocusFind from './useFocusFind'
import {
  FOCUS_BUCKETS,
  ancestorLabel,
  candidatesForBucket,
  dateGroupLabel,
  hierarchyPaths,
} from './focusModel'
import {
  changesForTouchedRows,
  findQueuePosition,
  makeQueueGroups,
  moveQueueItemByGlobalPosition,
  moveQueueItemToSlot,
  queueItemPositionChanged,
  queuePositionMap,
} from './focusQueueModel'
import FocusConflictDialog from './FocusConflictDialog'
import FocusQueueRow from './FocusQueueRow'
import FocusTaskRow from './FocusTaskRow'


const AUTOSAVE_DELAY_MS = 180



function focusCollisionDetection(
  args,
) {
  const dateBoundaries =
    args.droppableContainers.filter(
      (container) =>
        String(
          container.id,
        ).startsWith(
          'date-boundary:',
        ),
    )

  const boundaryHits =
    rectIntersection({
      ...args,
      droppableContainers:
        dateBoundaries,
    })

  if (
    boundaryHits.length
    > 0
  ) {
    return boundaryHits
  }

  const ordinaryTargets =
    args.droppableContainers.filter(
      (container) =>
        !String(
          container.id,
        ).startsWith(
          'date-boundary:',
        ),
    )

  return closestCenter({
    ...args,
    droppableContainers:
      ordinaryTargets,
  })
}



function QueueDropZone({
  id,
  disabled,
  className,
  children = null,
}) {
  const {
    isOver,
    setNodeRef,
  } =
    useDroppable({
      id,
      disabled,
    })

  return (
    <div
      ref={setNodeRef}
      className={[
        className,
        isOver
          ? 'is-over'
          : '',
      ].join(' ')}
    >
      {children}
    </div>
  )
}


export default function FocusQueueManager({
  bucketId,
  data,
  globalFind,
  pinnedItemIds,
  onTogglePinned,
  onSetCurrent,
  onComplete,
  onClose,
  onAutomatic,
  currentBusy,
  completionBusy,
  planningBusy,
}) {
  const managerRef =
    useRef(null)

  const saveTimerRef =
    useRef(null)

  const latestSaveRef =
    useRef(null)

  const dragOriginRef =
    useRef(null)

  const dragPreviewGroupsRef =
    useRef(null)

  const dragProjectionRef =
    useRef(null)


  const bucket =
    FOCUS_BUCKETS.find(
      (candidate) =>
        candidate.id
        === bucketId,
    )

  const batch =
    useBatchAnchorFocus()

  const rows =
    useMemo(
      () =>
        bucket
          ? candidatesForBucket(
              data?.candidates,
              bucket,
            )
          : [],
      [
        data?.candidates,
        bucket,
      ],
    )

  const searchPaths =
    useMemo(
      () =>
        hierarchyPaths(
          rows,
        ),
      [
        rows,
      ],
    )

  const localFind =
    useFocusFind(
      rows,
      searchPaths,
    )

  const initialGroups =
    useMemo(
      () =>
        makeQueueGroups(
          rows,
          data.today,
        ),
      [
        rows,
        data.today,
      ],
    )

  const [
    groups,
    setGroups,
  ] =
    useState(
      initialGroups,
    )

  const [
    touchedIds,
    setTouchedIds,
  ] =
    useState(
      () => new Set(),
    )

  const [
    dirtyDates,
    setDirtyDates,
  ] =
    useState(
      () => new Set(),
    )


  const [
    localError,
    setLocalError,
  ] =
    useState('')

  const [
    saving,
    setSaving,
  ] =
    useState(false)

  const [
    conflict,
    setConflict,
  ] =
    useState(null)

  const [
    draggedItemId,
    setDraggedItemId,
  ] =
    useState(null)

  useEffect(() => {
    if (
      touchedIds.size
      || saving
      || conflict
    ) {
      return
    }

    setGroups(
      initialGroups,
    )
  }, [
    conflict,
    initialGroups,
    saving,
    touchedIds,
  ])

  useEffect(
    () => () => {
      if (
        saveTimerRef.current
      ) {
        clearTimeout(
          saveTimerRef.current,
        )
      }
    },
    [],
  )

  const globalCurrentId =
    globalFind?.currentId

  useEffect(() => {
    if (!globalCurrentId) {
      return
    }

    requestAnimationFrame(
      () => {
        managerRef.current
          ?.querySelector(
            `[data-focus-item-id="${globalCurrentId}"]`,
          )
          ?.scrollIntoView({
            block:
              'nearest',
          })
      },
    )
  }, [
    globalCurrentId,
  ])


  const sensors =
    useSensors(
      useSensor(
        PointerSensor,
        {
          activationConstraint: {
            distance: 6,
          },
        },
      ),

      useSensor(
        KeyboardSensor,
        {
          coordinateGetter:
            sortableKeyboardCoordinates,
        },
      ),
    )

  if (!bucket) {
    return null
  }

  const displayGroups =
    groups

  const positions =
    queuePositionMap(
      displayGroups,
    )

  const totalRows =
    positions.size

  const draggedCandidate =
    draggedItemId == null
      ? null
      : rows.find(
          (candidate) =>
            candidate.item_id
            === draggedItemId,
        )
        ?? null



  const interactionBusy =
    planningBusy

  function clearIntent() {
    setTouchedIds(
      new Set(),
    )

    setDirtyDates(
      new Set(),
    )

    latestSaveRef.current =
      null
  }

  function rollback() {
    setGroups(
      initialGroups,
    )

    clearIntent()
  }

  function buildChanges(
    nextGroups,
    nextTouched,
    nextDirtyDates,
  ) {
    return changesForTouchedRows(
      nextGroups,
      nextTouched,
      nextDirtyDates,
    )
  }

  function performSave(
    changes,
  ) {
    if (!changes.length) {
      clearIntent()
      return
    }

    setSaving(true)
    setLocalError('')

    batch.mutate(
      {
        changes,
      },
      {
        onSuccess() {
          setSaving(false)
          setConflict(null)
          clearIntent()
        },

        onError(error) {
          setSaving(false)

          const data =
            error?.response
              ?.data

          if (
            error?.response
              ?.status === 409
            && data?.conflicts
          ) {
            setConflict({
              data,
              changes,
            })

            return
          }

          setLocalError(
            data?.detail
            ?? 'ARC could not save this queue change.',
          )

          rollback()
        },
      },
    )
  }

  function scheduleAutosave(
    nextGroups,
    nextTouched,
    nextDirtyDates,
  ) {
    if (
      saveTimerRef.current
    ) {
      clearTimeout(
        saveTimerRef.current,
      )
    }

    const changes =
      buildChanges(
        nextGroups,
        nextTouched,
        nextDirtyDates,
      )

    latestSaveRef.current =
      changes

    saveTimerRef.current =
      setTimeout(
        () => {
          saveTimerRef.current =
            null

          performSave(
            latestSaveRef.current
            ?? [],
          )
        },
        AUTOSAVE_DELAY_MS,
      )
  }

  function commitMovement(
    nextGroups,
    itemId,
    sourceDate,
    targetDate,
  ) {
    const nextTouched =
      new Set(
        touchedIds,
      )

    nextTouched.add(
      itemId,
    )

    const nextDirty =
      new Set(
        dirtyDates,
      )

    nextDirty.add(
      sourceDate,
    )

    nextDirty.add(
      targetDate,
    )

    setGroups(
      nextGroups,
    )

    setTouchedIds(
      nextTouched,
    )

    setDirtyDates(
      nextDirty,
    )

    setLocalError('')

    scheduleAutosave(
      nextGroups,
      nextTouched,
      nextDirty,
    )
  }

  function moveGlobal(
    itemId,
    position,
  ) {
    if (
      interactionBusy
      || saving
    ) {
      return
    }

    const source =
      findQueuePosition(
        groups,
        itemId,
      )

    if (!source) {
      return
    }

    const nextGroups =
      moveQueueItemByGlobalPosition(
        groups,
        itemId,
        position,
      )

    if (
      !queueItemPositionChanged(
        groups,
        nextGroups,
        itemId,
      )
    ) {
      return
    }

    const destination =
      findQueuePosition(
        nextGroups,
        itemId,
      )

    if (!destination) {
      return
    }

    commitMovement(
      nextGroups,
      itemId,
      source.date,
      destination.date,
    )
  }

  function activeCenterY(
    active,
  ) {
    const translated =
      active.rect.current
        .translated

    if (!translated) {
      return null
    }

    return (
      translated.top
      + translated.height / 2
    )
  }

  function projectionForDrop(
    currentGroups,
    active,
    over,
  ) {
    if (!over) {
      return null
    }

    const overId =
      String(
        over.id,
      )

    const centerY =
      activeCenterY(
        active,
      )

    /*
     * A date heading is one actual boundary between two days.
     *
     * Pointer / dragged-card centre above the heading centre:
     *   -> append to previous day.
     *
     * Pointer / dragged-card centre below the heading centre:
     *   -> prepend to this day.
     *
     * This makes crossing the marker symmetric and predictable.
     */
    if (
      overId.startsWith(
        'date-boundary:',
      )
    ) {
      const targetDate =
        overId.slice(
          'date-boundary:'.length,
        )

      const groupIndex =
        currentGroups.findIndex(
          (group) =>
            group.date
            === targetDate,
        )

      if (groupIndex === -1) {
        return null
      }

      const translated =
        active.rect.current
          .translated

      const initial =
        active.rect.current
          .initial

      const movingUp =
        Boolean(
          translated
          && initial
          && translated.top
            < initial.top
        )

      /*
       * rectIntersection means the dragged CARD itself has now
       * physically touched the date marker.
       *
       * Moving upward:
       *   the card's top edge reaches the marker and the task
       *   belongs at the end of the previous date.
       *
       * Moving downward:
       *   the card's bottom edge reaches the marker and the task
       *   belongs at the beginning of the date below.
       *
       * Ordinary task-to-task sorting below this branch continues
       * using the existing centre-based logic unchanged.
       */
      if (
        groupIndex > 0
        && movingUp
      ) {
        const previous =
          currentGroups[
            groupIndex - 1
          ]

        return {
          date:
            previous.date,

          slotIndex:
            previous.rows.length,
        }
      }

      return {
        date:
          targetDate,

        slotIndex:
          0,
      }
    }

    /*
     * Only the bottom of the final date needs a separate end target.
     * Every intermediate boundary is represented by the next heading.
     */
    if (
      overId.startsWith(
        'queue-end:',
      )
    ) {
      const targetDate =
        overId.slice(
          'queue-end:'.length,
        )

      const targetGroup =
        currentGroups.find(
          (group) =>
            group.date
            === targetDate,
        )

      if (!targetGroup) {
        return null
      }

      return {
        date:
          targetDate,

        slotIndex:
          targetGroup.rows.length,
      }
    }

    const target =
      findQueuePosition(
        currentGroups,
        over.id,
      )

    if (!target) {
      return null
    }

    if (
      active.id
      === over.id
    ) {
      return {
        date:
          target.date,

        slotIndex:
          target.index,
      }
    }

    const overCenter =
      over.rect
        ? (
            over.rect.top
            + over.rect.height / 2
          )
        : null

    const dropAfter =
      (
        centerY != null
        && overCenter != null
        && centerY
          >= overCenter
      )

    return {
      date:
        target.date,

      slotIndex:
        target.index
        + (
          dropAfter
            ? 1
            : 0
        ),
    }
  }

  function groupsForProjection(
    originGroups,
    activeId,
    projection,
  ) {
    if (!projection) {
      return originGroups
    }

    return moveQueueItemToSlot(
      originGroups,
      activeId,
      projection.date,
      projection.slotIndex,
    )
  }

  function resetDragState() {
    dragOriginRef.current =
      null

    dragPreviewGroupsRef.current =
      null

    dragProjectionRef.current =
      null

    setDraggedItemId(
      null,
    )
  }

  function handleDragStart({
    active,
  }) {
    const source =
      findQueuePosition(
        groups,
        active.id,
      )

    if (!source) {
      return
    }

    dragOriginRef.current = {
      groups,
      sourceDate:
        source.date,
    }

    dragPreviewGroupsRef.current =
      groups

    dragProjectionRef.current = {
      date:
        source.date,

      slotIndex:
        source.index,
    }

    setDraggedItemId(
      active.id,
    )
  }

  function handleDragMove({
    active,
    over,
  }) {
    const origin =
      dragOriginRef.current

    if (
      !origin
      || !over
    ) {
      return
    }

    /*
     * Resolve collision against the layout currently visible to the user,
     * but always rebuild the next preview from the immutable drag origin.
     *
     * This prevents preview-on-preview drift and means a quick drag is
     * handled on the same event stream as a slow drag.
     */
    const collisionGroups =
      dragPreviewGroupsRef.current
      ?? origin.groups

    const projection =
      projectionForDrop(
        collisionGroups,
        active,
        over,
      )

    if (!projection) {
      return
    }

    const nextGroups =
      groupsForProjection(
        origin.groups,
        active.id,
        projection,
      )

    dragProjectionRef.current =
      projection

    dragPreviewGroupsRef.current =
      nextGroups

    setGroups(
      nextGroups,
    )
  }

  function handleDragCancel() {
    const origin =
      dragOriginRef.current

    if (origin) {
      setGroups(
        origin.groups,
      )
    }

    resetDragState()
  }

  function handleDragEnd({
    active,
    over,
  }) {
    const origin =
      dragOriginRef.current

    if (!origin) {
      resetDragState()
      return
    }

    /*
     * The visible preview is authoritative.
     *
     * handleDragMove() already computes the exact queue arrangement
     * shown on screen and stores it synchronously in
     * dragPreviewGroupsRef.current.
     *
     * Do NOT reinterpret the drop again here from `over`, because the
     * preview has already changed the sortable layout. A second
     * projection can therefore translate the visible final index back
     * through original-layout slot arithmetic and commit a different
     * position from the one the user actually saw.
     *
     * What the user sees at release is exactly what gets persisted.
     */
    const nextGroups =
      dragPreviewGroupsRef.current
      ?? origin.groups

    const changed =
      queueItemPositionChanged(
        origin.groups,
        nextGroups,
        active.id,
      )

    const destination =
      findQueuePosition(
        nextGroups,
        active.id,
      )

    resetDragState()

    if (
      !changed
      || !destination
    ) {
      /*
       * Exact original position:
       * no autosave,
       * no API request,
       * no scheduler run.
       */
      setGroups(
        origin.groups,
      )

      return
    }

    commitMovement(
      nextGroups,
      active.id,
      origin.sourceDate,
      destination.date,
    )
  }


  function requestClose() {
    if (
      conflict
      || saving
    ) {
      return
    }

    if (
      saveTimerRef.current
    ) {
      clearTimeout(
        saveTimerRef.current,
      )

      saveTimerRef.current =
        null

      performSave(
        latestSaveRef.current
        ?? [],
      )

      return
    }

    onClose()
  }

  function cancelConflict() {
    setConflict(null)
    rollback()
  }

  function resolveConflict(
    decisions,
  ) {
    if (!conflict) {
      return
    }

    const resolved =
      conflict.changes.map(
        (change) => {
          const extra = {}

          for (
            const decision
            of decisions
          ) {
            if (
              decision.item_id
              != null
              && decision.item_id
              !== change.item_id
            ) {
              continue
            }

            extra[
              decision.code
            ] = true
          }

          return {
            ...change,
            ...extra,
          }
        },
      )

    setConflict(null)

    performSave(
      resolved,
    )
  }

  function searchKeyDown(
    event,
  ) {
    if (
      event.key
      === 'ArrowDown'
    ) {
      event.preventDefault()
      localFind.navigate(1)
      return
    }

    if (
      event.key
      === 'ArrowUp'
    ) {
      event.preventDefault()
      localFind.navigate(-1)
      return
    }

    if (
      event.key
      === 'Enter'
    ) {
      event.preventDefault()

      localFind.navigate(
        event.shiftKey
          ? -1
          : 1,
      )

      return
    }

    if (
      event.key
      === 'Escape'
    ) {
      event.preventDefault()
      localFind.changeQuery('')
    }
  }

  return (
    <>
      <aside
        ref={managerRef}
        className="focus-manager"
        aria-label={`${bucket.label} queue manager`}
      >
        <header>
          <button
            type="button"
            className="focus-manager-close"
            aria-label="Close queue manager"
            onClick={requestClose}
          >
            <X size={21} />
          </button>

          <h2>
            {bucket.label}
          </h2>

          <p>
            Scheduled queue
          </p>

          {saving && (
            <span className="focus-autosave-status">
              Saving…
            </span>
          )}
        </header>

        <div className="focus-manager-search">
          <Search size={16} />

          <input
            type="search"
            value={localFind.query}
            onChange={(event) =>
              localFind.changeQuery(
                event.target.value,
              )
            }
            onKeyDown={searchKeyDown}
            placeholder={`Find in ${bucket.label.toLowerCase()}…`}
            aria-label={`Find in ${bucket.label}`}
          />

          <span className="focus-find-count">
            {localFind.query.trim()
              ? `${localFind.index + 1} / ${localFind.matches.length}`
              : ''}
          </span>

          <button
            type="button"
            aria-label="Previous match"
            disabled={!localFind.matches.length}
            onClick={() =>
              localFind.navigate(-1)
            }
          >
            <ArrowUp size={14} />
          </button>

          <button
            type="button"
            aria-label="Next match"
            disabled={!localFind.matches.length}
            onClick={() =>
              localFind.navigate(1)
            }
          >
            <ArrowDown size={14} />
          </button>
        </div>

        {localError && (
          <div
            className="focus-queue-error"
            role="alert"
          >
            {localError}
          </div>
        )}

        <DndContext
          sensors={sensors}
          collisionDetection={
            focusCollisionDetection
          }
          autoScroll={false}
          onDragStart={
            handleDragStart
          }
          onDragMove={
            handleDragMove
          }
          onDragCancel={
            handleDragCancel
          }
          onDragEnd={
            handleDragEnd
          }
        >
          <div className="focus-manager-list">
            {displayGroups.map(
              (group) => (
                <section
                  key={group.date}
                  className="focus-date-group"
                >
                  <QueueDropZone
                    id={`date-boundary:${group.date}`}
                    disabled={
                      interactionBusy
                      || saving
                    }
                    className="focus-date-heading-drop"
                  >
                    <h3>
                      {dateGroupLabel(
                        group.date,
                        data.today,
                      )}
                    </h3>
                  </QueueDropZone>

                  <SortableContext
                    items={
                      group.rows.map(
                        (candidate) =>
                          candidate.item_id,
                      )
                    }
                    strategy={
                      verticalListSortingStrategy
                    }
                  >
                    <div className="focus-date-group-rows">
                      {group.rows.map(
                        (candidate) => (
                          <FocusQueueRow
                            key={
                              candidate.item_id
                            }
                            candidate={
                              candidate
                            }
                            position={
                              positions.get(
                                candidate.item_id,
                              )
                            }
                            count={
                              totalRows
                            }
                            disabled={
                              interactionBusy
                              || saving
                            }
                            onMoveGlobal={
                              moveGlobal
                            }
                            today={
                              data.today
                            }
                            pinned={
                              pinnedItemIds.has(
                                candidate.item_id,
                              )
                            }
                            onTogglePinned={
                              onTogglePinned
                            }
                            onSetCurrent={
                              onSetCurrent
                            }
                            onComplete={
                              onComplete
                            }
                            onAutomatic={
                              onAutomatic
                            }
                            currentBusy={
                              currentBusy
                            }
                            completionBusy={
                              completionBusy
                            }
                            planningBusy={
                              planningBusy
                            }
                            matched={
                              localFind.matchIds.has(
                                candidate.item_id,
                              )
                              || Boolean(
                                globalFind?.matchIds.has(
                                  candidate.item_id,
                                ),
                              )
                            }
                            currentMatch={
                              localFind.currentId
                              === candidate.item_id
                              || globalFind?.currentId
                              === candidate.item_id
                            }
                            registerCard={
                              localFind.registerCard
                            }
                            detailControl="button"
                          />
                        ),
                      )}
                    </div>
                  </SortableContext>

                </section>
              ),
            )}

            {displayGroups.length > 0 && (
              <QueueDropZone
                id={`queue-end:${
                  displayGroups[
                    displayGroups.length - 1
                  ].date
                }`}
                disabled={
                  interactionBusy
                  || saving
                }
                className="focus-queue-final-drop-zone"
              />
            )}
          </div>

          <DragOverlay
            zIndex={1000}
            dropAnimation={null}
          >
            {draggedCandidate && (
              <div
                className="focus-queue-row focus-queue-drag-overlay"
                aria-hidden="true"
              >
                <div className="focus-queue-controls" />

                <FocusTaskRow
                  candidate={draggedCandidate}
                  today={data.today}
                  pinned={
                    pinnedItemIds.has(
                      draggedCandidate.item_id,
                    )
                  }
                  onTogglePinned={onTogglePinned}
                  onSetCurrent={onSetCurrent}
                  onComplete={onComplete}
                  onAutomatic={onAutomatic}
                  currentBusy
                  completionBusy
                  planningBusy
                  detailControl="button"
                />
              </div>
            )}
          </DragOverlay>
        </DndContext>
      </aside>

      <FocusConflictDialog
        conflict={conflict}
        onCancel={cancelConflict}
        onResolve={resolveConflict}
      />
    </>
  )
}
