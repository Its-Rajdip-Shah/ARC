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
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import {
  ArrowDown,
  ArrowUp,
  Search,
  X,
} from 'lucide-react'

import {
  CSS,
} from '@dnd-kit/utilities'

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
  changedQueueItemIds,
  changesForTouchedRows,
  findQueuePosition,
  flattenQueue,
  makeQueueGroups,
  moveQueueItem,
  moveQueueItemByGlobalPosition,
  moveQueueItemToSlot,
  queueItemPositionChanged,
  queuePositionMap,
} from './focusQueueModel'
import {
  projectFocusDrop,
} from '../../dnd/focus/focusProjection'

import FocusConflictDialog from './FocusConflictDialog'
import FocusQueueRow from './FocusQueueRow'
import FocusTaskRow from './FocusTaskRow'


const AUTOSAVE_DELAY_MS = 180



function focusCollisionDetection(
  args,
) {
  /*
   * Date boundaries are structural landmarks, not hard collision walls.
   *
   * Previously ANY rectangle intersection with TODAY/TOMORROW immediately
   * overrode nearby task targets. That made a dragged card snap back as soon
   * as its edge merely touched a heading.
   *
   * All sortable landmarks now compete using one closest-center rule.
   */
  return closestCenter(
    args,
  )
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


function SortableDateBoundary({
  id,
  disabled,
  children,
}) {
  const {
    setNodeRef,
    transform,
    transition,
    isOver,
  } =
    useSortable({
      id,
      disabled,
    })

  return (
    <div
      ref={setNodeRef}
      className={[
        'focus-date-heading-drop',
        isOver
          ? 'is-over'
          : '',
      ].join(' ')}
      style={{
        transform:
          CSS.Translate.toString(
            transform,
          ),
        transition,
      }}
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

  const saveInFlightRef =
    useRef(false)

  const queuedSaveRef =
    useRef(null)

  const dragOriginRef =
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
      dragOriginRef.current != null
      || touchedIds.size
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
    // Ending a gesture must retry any canonical update deferred by the ref.
    draggedItemId,
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

  function buildSaveRequest(
    nextGroups,
    nextTouched,
    nextDirtyDates,
  ) {
    return {
      changes:
        buildChanges(
          nextGroups,
          nextTouched,
          nextDirtyDates,
        ),

      optimisticOrderIds:
        flattenQueue(
          nextGroups,
        ).map(
          (entry) =>
            entry.row.item_id,
        ),
    }
  }


  function performSave(
    request,
  ) {
    const changes =
      request?.changes
      ?? []

    if (!changes.length) {
      if (
        !saveInFlightRef.current
      ) {
        setSaving(false)
        clearIntent()
      }

      return
    }

    if (
      saveInFlightRef.current
    ) {
      /*
       * Only the newest not-yet-started queue arrangement matters. The
       * currently running canonical request is allowed to finish.
       */
      queuedSaveRef.current =
        request

      return
    }

    saveInFlightRef.current =
      true

    setSaving(true)
    setLocalError('')

    batch.mutate(
      {
        changes,

        optimisticOrderIds:
          request
            .optimisticOrderIds,
      },
      {
        onSuccess() {
          saveInFlightRef.current =
            false

          setConflict(null)

          const queued =
            queuedSaveRef.current

          queuedSaveRef.current =
            null

          if (queued) {
            performSave(
              queued,
            )

            return
          }

          /*
           * A newer movement may already exist in latestSaveRef while its
           * debounce timer has not fired yet.
           *
           * In that case this response acknowledges only the older request.
           * Clearing intent here would erase the newer visible movement before
           * it ever reaches the backend.
           *
           * Keep `saving` true as the reconciliation guard and allow the
           * newer request's existing debounce timer to start its save.
           */
          const latest =
            latestSaveRef.current

          if (
            latest
            && latest !== request
          ) {
            return
          }

          setSaving(false)
          clearIntent()
        },

        onError(error) {
          saveInFlightRef.current =
            false

          setSaving(false)

          const data =
            error?.response
              ?.data

          if (
            error?.response
              ?.status === 409
            && data?.conflicts
          ) {
            /*
             * Warning/confirmation remains synchronous. Newer local intent is
             * retained but cannot pass this canonical decision boundary.
             */
            setConflict({
              data,
              changes,

              optimisticOrderIds:
                request
                  .optimisticOrderIds,
            })

            return
          }

          queuedSaveRef.current =
            null

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

    const request =
      buildSaveRequest(
        nextGroups,
        nextTouched,
        nextDirtyDates,
      )

    latestSaveRef.current =
      request

    saveTimerRef.current =
      setTimeout(
        () => {
          saveTimerRef.current =
            null

          performSave(
            latestSaveRef.current
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
    /*
     * A Focus move changes more than the grabbed card.
     *
     * Every row whose date/local slot changed is part of the explicit
     * ordering action. Rows outside that displaced span remain automatic.
     *
     * Example:
     *
     *   1, 3, 2, 4
     *        ↓ move 2 to position 2
     *   1, 2, 3, 4
     *
     * Changed set = {2, 3}.
     *
     * Sending only {2} leaves task 3's resulting slot unspecified.
     * Sending the entire bucket would incorrectly anchor untouched 1 and 4.
     */
    const displacedIds =
      changedQueueItemIds(
        groups,
        nextGroups,
      )

    const nextTouched =
      new Set(
        touchedIds,
      )

    for (
      const displacedId
      of displacedIds
    ) {
      nextTouched.add(
        displacedId,
      )
    }

    /*
     * Defensive guarantee: a genuine movement must always include the item
     * the user directly acted on.
     */
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
      || conflict
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

  function moveWithinDate(
    itemId,
    delta,
  ) {
    if (
      interactionBusy
      || conflict
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

    const group =
      groups.find(
        (candidate) =>
          candidate.date
          === source.date,
      )

    if (!group) {
      return
    }

    const targetPosition =
      Math.max(
        1,
        Math.min(
          group.rows.length,
          source.index + 1 + delta,
        ),
      )

    const nextGroups =
      moveQueueItem(
        groups,
        itemId,
        source.date,
        targetPosition,
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

    commitMovement(
      nextGroups,
      itemId,
      source.date,
      source.date,
    )
  }


  function projectionForEvent(
    currentGroups,
    active,
    over,
  ) {
    if (!over) {
      return null
    }

    const translated =
      active.rect.current
        .translated

    const initial =
      active.rect.current
        .initial

    return projectFocusDrop({
      groups:
        currentGroups,

      activeId:
        active.id,

      overId:
        over.id,

      movingUp:
        Boolean(
          translated
          && initial
          && translated.top
            < initial.top
        ),
    })
  }

  function groupsForProjection(
    originGroups,
    activeId,
    projection,
  ) {
    if (!projection) {
      return originGroups
    }

    /*
     * projectFocusDrop() intentionally describes TASK collisions using the
     * hovered sortable row's occupied index.
     *
     * moveQueueItemToSlot() intentionally accepts an insertion gap measured
     * against the immutable pre-removal queue.
     *
     * For a same-date downward movement those coordinate systems differ by
     * exactly one:
     *
     *   A B C
     *   drag A into B's occupied slot
     *
     *   occupied slot = 1
     *   insertion gap = 2
     *
     * Convert exactly once here. The queue model then performs its existing
     * source-removal adjustment exactly once.
     *
     * Upward moves already share the same numeric coordinate. Cross-date
     * targets do not contain the moving row, so no source-removal offset is
     * required there.
     */
    const source =
      findQueuePosition(
        originGroups,
        activeId,
      )

    let insertionSlot =
      projection.slotIndex

    if (
      source
      && source.date
        === projection.date
      && source.index
        < projection.slotIndex
    ) {
      insertionSlot += 1
    }

    return moveQueueItemToSlot(
      originGroups,
      activeId,
      projection.date,
      insertionSlot,
    )
  }

  function resetDragState() {
    dragOriginRef.current =
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
     * Keep queue structure stable for the entire gesture.
     *
     * The previous implementation called setGroups() on every pointer
     * movement. That changed the same layout dnd-kit was actively measuring,
     * producing a feedback loop:
     *
     * measure -> reorder DOM -> remeasure -> project again.
     *
     * One global SortableContext now owns visual displacement. During drag we
     * only remember semantic intent.
     */
    const projection =
      projectionForEvent(
        origin.groups,
        active,
        over,
      )

    if (projection) {
      dragProjectionRef.current =
        projection
    }
  }

  function handleDragCancel() {
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
     * Persist the latest semantic projection measured against the immutable
     * DragStart layout.
     *
     * There is no preview-on-preview arithmetic anymore, so the release
     * target cannot drift because an earlier preview changed the geometry.
     */
    /*
     * The release event is authoritative.
     *
     * A collision target can change after the last onDragMove callback.
     * Recalculate from onDragEnd first so persistence describes the place
     * where the user actually released the card.
     *
     * The stored projection is only a fallback for an end event without a
     * usable target.
     */
    const projection =
      projectionForEvent(
        origin.groups,
        active,
        over,
      )
      ?? dragProjectionRef.current

    const nextGroups =
      groupsForProjection(
        origin.groups,
        active.id,
        projection,
      )

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
    queuedSaveRef.current =
      null

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

    performSave({
      changes:
        resolved,

      optimisticOrderIds:
        conflict
          .optimisticOrderIds
        ?? [],
    })
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
          onDragOver={
            handleDragMove
          }
          onDragCancel={
            handleDragCancel
          }
          onDragEnd={
            handleDragEnd
          }
        >
          <SortableContext
            items={
              displayGroups.flatMap(
                (group) => [
                  `date-boundary:${group.date}`,
                  ...group.rows.map(
                    (candidate) =>
                      candidate.item_id,
                  ),
                ],
              )
            }
            strategy={
              verticalListSortingStrategy
            }
          >
          <div className="focus-manager-list">
            {displayGroups.map(
              (group) => (
                <section
                  key={group.date}
                  className="focus-date-group"
                >
                  <SortableDateBoundary
                    id={`date-boundary:${group.date}`}
                    disabled={
                      interactionBusy
                      || conflict
                    }
                  >
                    <h3>
                      {dateGroupLabel(
                        group.date,
                        data.today,
                      )}
                    </h3>
                  </SortableDateBoundary>

                  <div className="focus-date-group-rows">
                    {group.rows.map(
                      (candidate, localIndex) => (
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
                            localPosition={
                              localIndex + 1
                            }
                            localCount={
                              group.rows.length
                            }
                            onMoveWithinDate={
                              moveWithinDate
                            }
                            disabled={
                              interactionBusy
                              || conflict
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
                  || conflict
                }
                className="focus-queue-final-drop-zone"
              />
            )}
          </div>
          </SortableContext>

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
