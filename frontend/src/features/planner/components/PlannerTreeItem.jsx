import { useEffect, useRef, useState } from 'react'
import {
  Check,
  GripVertical,
  Plus,
  Pencil,
  Trash2,
  ChevronDown,
} from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useSortable } from '@dnd-kit/sortable'

import { completeItem, deleteItem, getPlanningTree } from '../../../api/planning'
import { newlyActionableParent } from '../residualEstimatePrompt'
import {
  createLatestIntentQueue,
  createSerialActionQueue,
} from '../../../lib/latestIntentQueue'
import {
  patchPlanningTreeCompletion,
} from '../../../lib/planningOptimistic'
import { plainText } from '../../../lib/plainText'


const plannerCompletionRequests =
  createSerialActionQueue(
    ({
      itemId,
      completed,
    }) =>
      completeItem(
        itemId,
        {
          completed,
        },
      ),
  )


export default function PlannerTreeItem({
  editLocked = false,
  saveStatus = null,
  item,
  depth = 0,
  previewDepth = null,
  selectedItemId,
  panelOwnerId,
  hoveredItemId,
  showAllDetails = false,
  showCheckboxes = true,
  searchMatchedIds,
  onDeleteItem,
  onHoverItem,
  onSelectItem,
  onEditItem,
  onCreateDependency,
  onCreateNested,
  onResidualEstimatePrompt,
  dndEnabled = true,
}) {
  const provisional = Boolean(item.is_provisional)
  const queryClient = useQueryClient()
  const clickTimerRef = useRef(null)

  const completionBeforeRef = useRef(null)
  const completionChildIdRef = useRef(null)

  const completionDesiredRef =
    useRef(
      Boolean(
        item.is_completed,
      ),
    )

  const completionQueueRef =
    useRef(null)

  if (
    completionQueueRef.current
    === null
  ) {
    completionQueueRef.current =
      createLatestIntentQueue(
        (completed) =>
          plannerCompletionRequests.push({
            itemId:
              item.id,

            completed,
          }),
      )
  }

  const isSelected = selectedItemId === item.id
  const isHovered = hoveredItemId === item.id

  // Click selection is retained internally for dragging,
  // but visual selection exists only while the row is hovered.
  const [localDetailsOpen, setLocalDetailsOpen] = useState(false)
  const singleClickTimerRef = useRef(null)

  const isActive = isHovered
  const isPanelOwner = panelOwnerId === item.id
  const isSearchMatch =
    searchMatchedIds?.has(item.id) ?? false

  const showDetails =
    showAllDetails ||
    localDetailsOpen ||
    isSearchMatch

  const descriptionText = plainText(item.description)

  useEffect(() => {
    if (!isHovered) {
      return
    }

    function handleDetailsShortcut(event) {
      const target = event.target

      // Never steal keyboard input while the user is typing.
      if (
        target instanceof HTMLElement &&
        (
          target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable
        )
      ) {
        return
      }

      if (
        event.key.toLowerCase() === 'd' &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey
      ) {
        event.preventDefault()
        setLocalDetailsOpen((value) => !value)
      }
    }

    window.addEventListener('keydown', handleDetailsShortcut)

    return () => {
      window.removeEventListener('keydown', handleDetailsShortcut)
    }
  }, [isHovered])


  const indent = depth * 42

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: item.id,
    disabled: !dndEnabled || provisional,
  })

  const completionMutation =
    useMutation({
      mutationKey: [
        'planning',
        'scheduler',
        'planner',
        'complete',
        item.id,
      ],

      mutationFn({
        promise,
      }) {
        return promise
      },

      async onSuccess() {
        await plannerCompletionRequests.whenIdle()

        const before = completionBeforeRef.current
        const childId = completionChildIdRef.current

        if (!before || childId == null) return

        try {
          const confirmedTree = await getPlanningTree()

          // A newer completion/reopening request must not leave a stale prompt.
          await plannerCompletionRequests.whenIdle()

          const candidate = newlyActionableParent(
            before,
            confirmedTree,
            childId,
          )

          if (candidate) {
            const latestTree = await getPlanningTree()
            const stillActionable = newlyActionableParent(
              before,
              latestTree,
              childId,
            )

            if (stillActionable) {
              onResidualEstimatePrompt?.(stillActionable)
            }
          }
        } catch {
          // Completion succeeded; a prompt-read failure must not undo it.
        }
      },

      async onSettled() {
        completionBeforeRef.current = null
        completionChildIdRef.current = null

        await plannerCompletionRequests.whenIdle()

        void queryClient.invalidateQueries({
          queryKey: ['planning'],
        })
      },
    })

  useEffect(() => {
    if (
      !completionQueueRef
        .current
        .isRunning()
    ) {
      completionDesiredRef.current =
        Boolean(
          item.is_completed,
        )
    }
  }, [
    item.is_completed,
  ])

  function queueCompletion() {
    if (provisional) return
    const completed =
      !completionDesiredRef
        .current

    completionDesiredRef.current =
      completed

    if (!completionQueueRef.current.isRunning()) {
      completionBeforeRef.current =
        queryClient.getQueryData(['planning', 'tree']) ?? null
      completionChildIdRef.current = item.id
    }

    /*
     * React Query cache is presentation state only. The canonical mutation is
     * still performed by Django and the synchronous scheduler.
     */
    void queryClient.cancelQueries({
      queryKey: [
        'planning',
        'tree',
      ],
    })

    queryClient.setQueryData(
      [
        'planning',
        'tree',
      ],
      (tree) =>
        patchPlanningTreeCompletion(
          tree,
          item.id,
          completed,
        ),
    )

    const queue =
      completionQueueRef
        .current

    const wasRunning =
      queue.isRunning()

    const promise =
      queue.push(
        completed,
      )

    if (wasRunning) {
      return
    }

    completionMutation.mutate({
      promise,
    })
  }

  useEffect(() => {
    if (!isDragging) {
      return
    }

    if (clickTimerRef.current) {
      clearTimeout(clickTimerRef.current)
      clickTimerRef.current = null
    }
  }, [isDragging])

  useEffect(() => {
    return () => {
      if (clickTimerRef.current) {
        clearTimeout(clickTimerRef.current)
      }
    }
  }, [])

  const deleteMutation = useMutation({
    mutationFn: () => deleteItem(item.id),

    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['planning', 'tree'],
      })

      await queryClient.invalidateQueries({
        queryKey: ['planning', 'priority'],
      })

      await queryClient.invalidateQueries({
        queryKey: ['planning', 'history'],
      })
    },
  })

  function handleDelete(event) {
    event.stopPropagation()
    if (provisional) return

    if (onDeleteItem) {
      onDeleteItem(item.id)
      return
    }

    // Fallback for isolated rendering.
    if (!deleteMutation.isPending) {
      deleteMutation.mutate()
    }
  }

  function handleCompletion(event) {
    event.stopPropagation()

    queueCompletion()
  }

  return (
    <li
      ref={setNodeRef}
      data-planner-item-id={item.id}
      className="relative scroll-mt-[150px]"
      style={{
        /*
         * Planner uses translation-only movement.
         *
         * Descendants are intentionally hidden while their parent is dragged,
         * but they remain structurally attached and reappear after DragEnd.
         */
        transform:
          transform
            ? `translate3d(${
                transform.x ?? 0
              }px, ${
                transform.y ?? 0
              }px, 0)`
            : undefined,

        transition,

        opacity: isDragging ? 0.5 : 1,
        zIndex: isDragging ? 20 : undefined,
      }}
    >
      {Array.from({ length: depth }).map((_, index) => (
        <span
          key={index}
          aria-hidden="true"
          className="
            pointer-events-none absolute bottom-0 top-0
            w-[2px] bg-[#7c9cde]/50
          "
          style={{
            left: `${index * 42 + 33}px`,
          }}
        />
      ))}

      <div
        data-arc-planner-card-id={item.id}
        {...attributes}
        {...listeners}
        onMouseEnter={() => onHoverItem?.(item.id)}
        onMouseLeave={() => onHoverItem?.(null)}
        className={`
          relative flex min-h-[36px] items-center
          cursor-grab touch-none active:cursor-grabbing
        `}
        style={{
          paddingLeft: `${indent}px`,
        }}
      >
        {item.deadline_overdue === true && !item.is_completed && (
          <i
            className="pointer-events-none absolute top-1/2 z-20 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#e0b84f] bg-[#e0b84f]"
            role="img"
            aria-label="Deadline overdue"
            data-arc-overdue-marker
            style={{
              left: depth === 0 ? '0px' : `${(depth - 1) * 42 + 33}px`,
            }}
          />
        )}
        {isDragging && previewDepth != null && (
          <>
            <span
              aria-hidden="true"
              className="
                pointer-events-none absolute inset-y-0
                z-30 w-[2px] bg-[#c3d19b]
              "
              style={{
                left:
                  depth === 0
                    ? '0px'
                    : `${(depth - 1) * 42 + 33}px`,
              }}
            />

            {previewDepth > 1 && (
              <span
                aria-hidden="true"
                className="
                  pointer-events-none absolute inset-y-0
                  z-30 w-[2px] bg-[#7c9cde]/60
                "
                style={{
                  left:
                    depth === 0
                      ? '-42px'
                      : `${
                          (depth - 1) * 42
                          + 33
                          - 42
                        }px`,
                }}
              />
            )}
          </>
        )}

        {isSearchMatch ? (
          <div
            aria-hidden="true"
            className="
              pointer-events-none absolute inset-y-0 right-0
              bg-[#e0b84f]/35
            "
            style={{
              left:
                depth === 0
                  ? '0px'
                  : `${(depth - 1) * 42 + 33}px`,
            }}
          />
        ) : (
          (isActive || isPanelOwner) && (
            <div
              aria-hidden="true"
              className="
                pointer-events-none absolute inset-y-0 right-0
                bg-[#204566]
              "
              style={{
                left:
                  depth === 0
                    ? '0px'
                    : `${(depth - 1) * 42 + 33}px`,
              }}
            />
          )
        )}

        {showCheckboxes && (
<button
          type="button"
          aria-label={
            item.is_completed
              ? `Reopen ${item.title}`
              : `Mark ${item.title} complete`
          }
          disabled={provisional}
          aria-pressed={item.is_completed}
          aria-busy={completionMutation.isPending}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={handleCompletion}
          className={`
            relative z-10
            flex h-[25px] w-[33px] shrink-0
            items-center justify-center
            rounded-[10px]
            border-2 border-[#7c9cde]
            transition-colors
            ${
              item.is_completed
                ? 'bg-[#7c9cde] text-[#171a36]'
                : 'bg-transparent text-transparent hover:bg-[#7c9cde]/20'
            }
          `}
        >
          {item.is_completed && (
            <Check size={17} strokeWidth={2.5} />
          )}
        </button>
        )}

        {(saveStatus || provisional) && (
          <span
            role="status"
            aria-label={
              saveStatus === 'confirmed'
                ? 'Changes saved'
                : provisional
                  ? 'Creating item'
                  : 'Saving changes'
            }
            title={saveStatus === 'confirmed' ? 'Saved' : 'Saving'}
            className={`
              pointer-events-none
              relative z-10
              ml-1 flex h-[20px] w-[20px]
              shrink-0 items-center justify-center
              rounded-full border
              transition-colors duration-200
              ${
                saveStatus === 'confirmed'
                  ? 'border-[#7c9cde] bg-[#7c9cde] text-[#171a36]'
                  : 'border-[#7c9cde] bg-transparent text-[#7c9cde]'
              }
            `}
          >
            <Check size={13} strokeWidth={2.2} aria-hidden="true" />
          </span>
        )}

        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()

            if (provisional) return
            if (event.detail !== 1) {
              return
            }

            // Cmd-click on macOS / Ctrl-click elsewhere = add child.
            if (event.metaKey || event.ctrlKey) {
              if (singleClickTimerRef.current) {
                window.clearTimeout(singleClickTimerRef.current)
                singleClickTimerRef.current = null
              }

              if (!provisional) onCreateNested?.(item)
              return
            }

            // Ordinary single-click still toggles completion.
            singleClickTimerRef.current = window.setTimeout(() => {
              handleCompletion(event)
              singleClickTimerRef.current = null
            }, 220)
          }}
          onDoubleClick={(event) => {
            event.stopPropagation()

            if (singleClickTimerRef.current) {
              window.clearTimeout(singleClickTimerRef.current)
              singleClickTimerRef.current = null
            }

            if (!provisional && !editLocked) onEditItem?.(item)
          }}
          className={`
            relative z-10 min-w-0 flex-1 truncate
            px-[7px] py-2 text-left
            ${
              depth === 0
                ? 'text-[18px] font-bold'
                : 'text-[15px]'
            }
            ${
              item.is_completed
                ? 'text-white/50 line-through'
                : 'text-white'
            }
          `}
        >
          {item.title}
        </button>

        {isActive && (
          <div
            className="
              relative z-10 mr-1
              flex shrink-0 items-center gap-[3px]
            "
          >
            <span
              aria-hidden="true"
              className="
                pointer-events-none
                flex h-[22px] w-[18px]
                items-center justify-center
                text-[#7c9cde]
              "
            >
              <GripVertical size={17} strokeWidth={1.8} />
            </span>

            <button
              type="button"
              aria-label={
                localDetailsOpen
                  ? `Hide details for ${item.title}`
                  : `Show details for ${item.title}`
              }
              aria-expanded={showDetails}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation()
                setLocalDetailsOpen((value) => !value)
              }}
              className={`
                flex h-[18px] w-[18px]
                items-center justify-center
                rounded-[5px] transition-colors
                ${
                  showDetails
                    ? 'bg-[#7c9cde] text-[#171a36]'
                    : 'text-[#7c9cde] hover:bg-white/10'
                }
              `}
            >
              <ChevronDown
                size={15}
                strokeWidth={2}
                className={`
                  transition-transform duration-150
                  ${showDetails ? 'rotate-180' : ''}
                `}
              />
            </button>

            <button
              type="button"
              disabled={provisional}
              aria-label={`Create nested item under ${item.title}`}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation()
                if (!provisional) onCreateNested?.(item)
              }}
              className="
                flex h-[18px] w-[18px]
                items-center justify-center
                rounded-[5px]
                bg-[#7c9cde]
                text-[#171a36]
              "
            >
              <Plus size={14} strokeWidth={2} />
            </button>

            <button
              type="button"
              disabled={provisional || editLocked}
              aria-label={`Edit ${item.title}`}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation()
                if (!provisional && !editLocked) onEditItem?.(item)
              }}
              className="
                flex h-[18px] w-[21px]
                items-center justify-center
                rounded-[5px]
                bg-[#c3d19b]
                text-[#171a36]
              "
            >
              <Pencil size={14} strokeWidth={1.8} />
            </button>

            <button
              type="button"
              disabled={provisional}
              aria-label={`Create dependency for ${item.title}`}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation()
                if (!provisional) onCreateDependency?.(item)
              }}
              className="flex h-[18px] w-[18px] items-center justify-center rounded-[5px] text-[#c3d19b] hover:bg-white/10"
            >
              <span aria-hidden="true">↔</span>
            </button>

            <button
              type="button"
              aria-label={`Delete ${item.title}`}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={handleDelete}
              disabled={provisional || deleteMutation.isPending}
              className="
                flex h-[18px] w-[18px]
                items-center justify-center
                text-[#e87979]
              "
            >
              <Trash2 size={17} strokeWidth={1.7} />
            </button>
          </div>
        )}
      </div>

      {(showDetails || provisional) && (
        <div
          className="
            relative z-10 pb-3 pr-[72px]
            text-[12px] leading-[1.45] text-white/60
          "
          style={{
            paddingLeft: `${indent + 40}px`,
          }}
        >
          {descriptionText && (
            <p className="mb-1 whitespace-pre-wrap text-white/70">
              {descriptionText}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {item.start_date && (
              <span>
                Start: <span className="text-white/80">{item.start_date}</span>
              </span>
            )}

            {item.due_date && (
              <span>
                Due: <span className="text-white/80">{item.due_date}</span>
              </span>
            )}

            {item.duration_category && (
              <span>
                Estimate:{' '}
                <span className="text-white/80">
                  {item.duration_category}
                </span>
              </span>
            )}

            {item.priority_position != null && (
              <span>
                Priority:{' '}
                <span className="text-white/80">
                  {item.priority_position}
                </span>
              </span>
            )}
          </div>

          {item.tags?.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {item.tags.map((tag) => (
                <span
                  key={typeof tag === 'object' ? tag.id : tag}
                  className="
                    rounded-full bg-[#7c9cde]/15
                    px-2 py-[2px] text-[#a9c0ef]
                  "
                >
                  {typeof tag === 'object' ? tag.name : tag}
                </span>
              ))}
            </div>
          )}

          {item.assignment_detail && (
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
              {item.assignment_detail.weight_percent != null && (
                <span>
                  Weight:{' '}
                  <span className="text-white/80">
                    {item.assignment_detail.weight_percent}%
                  </span>
                </span>
              )}

              {item.assignment_detail.submission_url && (
                <span className="max-w-full truncate">
                  Submission:{' '}
                  <span className="text-white/80">
                    {item.assignment_detail.submission_url}
                  </span>
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </li>
  )
}
