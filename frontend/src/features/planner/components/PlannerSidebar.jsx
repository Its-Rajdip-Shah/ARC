import {
  useEffect,
  useState,
} from 'react'

import {
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useMutation, useQueryClient } from '@tanstack/react-query'

import arcLogo from '../../../assets/brand/arc-logo.svg'
import { createItem, moveItem } from '../../../api/planning'

import PlannerSidebarDnd from '../../../dnd/planner/PlannerSidebarDnd'

import {
  reorderPlannerSidebarRoots,
} from '../../../dnd/planner/plannerSidebarProjection'

import {
  createSerialActionQueue,
} from '../../../lib/latestIntentQueue'
import { subjectLabel } from '../../../lib/subjectLabel'


const plannerSidebarRootRequests =
  createSerialActionQueue(
    async ({
      id,
      siblingOrder,
    }) =>
      moveItem(id, {
        parent_id: null,
        sibling_order: siblingOrder,
      }),
  )

function SortableRoot({
  root,
  onNavigate,
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: root.id,
  })

  const style = {
    transform: CSS.Transform.toString(
      transform
        ? {
            ...transform,
            scaleX: 1,
            scaleY: 1,
          }
        : null,
    ),
    transition,
    zIndex: isDragging ? 20 : undefined,
    position: 'relative',
  }

  return (
    <button
      ref={setNodeRef}
      data-arc-planner-sidebar-root-id={root.id}
      type="button"
      title={root.title}
      aria-label={root.title}
      onClick={() => onNavigate?.(root.id)}
      style={style}
      className={`
        block w-full min-w-0 rounded-arc-sm
        px-3 py-2 text-left
        text-sm whitespace-normal break-words text-arc-text
        touch-none select-none
        transition-colors
        hover:bg-white/5
        ${isDragging ? 'opacity-70' : ''}
      `}
      {...attributes}
      {...listeners}
    >
      {subjectLabel(root.title)}
    </button>
  )
}


export default function PlannerSidebar({
  roots = [],
  showOverdue = false,
  onToggleOverdue,
  onNavigateToRoot,
}) {
  const [isCreating, setIsCreating] = useState(false)
  const [subjectsOpen, setSubjectsOpen] = useState(false)
  const [title, setTitle] = useState('')
  const queryClient = useQueryClient()

  /*
   * Exactly like Priority:
   *
   * local ordered state owns presentation while server reconciliation is
   * happening. Authoritative query data is not allowed to snap the card back
   * underneath an active persistence chain.
   */
  const [
    displayedRoots,
    setDisplayedRoots,
  ] =
    useState(roots)

  const [
    reconcilingRoots,
    setReconcilingRoots,
  ] =
    useState(false)

  useEffect(() => {
    if (!reconcilingRoots) {
      setDisplayedRoots(
        roots,
      )
    }
  }, [
    roots,
    reconcilingRoots,
  ])

  const createRootMutation = useMutation({
    mutationFn: (rootTitle) =>
      createItem({
        item_type: 'GOAL',
        title: rootTitle,
        parent: null,
      }),

    onSuccess: async () => {
      setTitle('')
      setIsCreating(false)

      await queryClient.invalidateQueries({
        queryKey: ['planning', 'tree'],
      })
    },
  })

  function handleRootMove(
    itemId,
    position,
  ) {
    /*
     * Priority's essential behavior:
     *
     * own the visible result immediately before dnd-kit removes transforms.
     */
    setDisplayedRoots(
      (current) =>
        reorderPlannerSidebarRoots(
          current,
          itemId,
          position,
        ),
    )

    /*
     * Keep the shared Planner tree visually coherent too, but sidebar display
     * correctness no longer depends on React Query cache timing.
     */
    queryClient.setQueryData(
      [
        'planning',
        'tree',
      ],
      (tree) =>
        reorderPlannerSidebarRoots(
          tree ?? roots,
          itemId,
          position,
        ),
    )

    setReconcilingRoots(
      true,
    )

    plannerSidebarRootRequests
      .push({
        id:
          itemId,

        siblingOrder:
          position,
      })
      .then(
        async () => {
          /*
           * Each queued action gets a promise. Only the final completed action
           * owns reconciliation.
           */
          if (
            plannerSidebarRootRequests
              .isRunning()
          ) {
            return
          }

          await Promise.all([
            queryClient.invalidateQueries({
              queryKey: [
                'planning',
                'tree',
              ],
            }),

            queryClient.invalidateQueries({
              queryKey: [
                'planning',
                'history',
              ],
            }),
          ])

          setReconcilingRoots(
            false,
          )
        },
        async () => {
          if (
            plannerSidebarRootRequests
              .isRunning()
          ) {
            return
          }

          /*
           * A failed final request must reconcile back to canonical server
           * truth rather than leaving an optimistic lie on screen.
           */
          await Promise.all([
            queryClient.invalidateQueries({
              queryKey: [
                'planning',
                'tree',
              ],
            }),

            queryClient.invalidateQueries({
              queryKey: [
                'planning',
                'history',
              ],
            }),
          ])

          setReconcilingRoots(
            false,
          )
        },
      )
  }

  function handleSubmit(event) {
    event.preventDefault()

    const trimmedTitle = title.trim()

    if (!trimmedTitle || createRootMutation.isPending) {
      return
    }

    createRootMutation.mutate(trimmedTitle)
  }

  function cancelCreate() {
    if (createRootMutation.isPending) {
      return
    }

    setTitle('')
    setIsCreating(false)
  }

  return (
    <aside
      className="
        flex w-full flex-col overflow-y-auto overscroll-contain
        border-white/10 bg-arc-surface px-5
        max-md:border-b max-md:pt-20 max-md:pb-3
        md:sticky md:top-0 md:z-30 md:h-screen md:w-arc-sidebar md:shrink-0
        md:border-r md:pb-6 md:pt-5
      "
    >
      <img
        src={arcLogo}
        alt="ARC"
        className="hidden h-auto w-[92px] md:block"
      />

      <nav aria-label="Planner navigation" className="md:mt-20">
        <div className="mb-3 flex items-center gap-2 px-3">
          <h2 className="hidden text-[22px] font-bold tracking-[0.12em] text-arc-text-secondary md:block">
            Subjects
          </h2>

          <button
            type="button"
            className="
              flex min-h-11 flex-1 items-center justify-between
              py-2 text-left text-[22px] font-bold tracking-[0.12em]
              text-arc-text-secondary
              md:hidden
            "
            aria-expanded={subjectsOpen}
            aria-controls="planner-subjects"
            onClick={() => setSubjectsOpen((open) => !open)}
          >
            Subjects
            <span aria-hidden="true" className="text-sm tracking-normal">
              {subjectsOpen ? '▾' : '▸'}
            </span>
          </button>

          <button
            type="button"
            aria-label="Add root"
            onClick={() => {
              setSubjectsOpen(true)
              setIsCreating(true)
            }}
            className={`
              flex h-6 w-6 items-center justify-center
              rounded-arc-sm bg-arc-accent
              text-lg leading-none text-arc-bg
              transition-[filter] hover:brightness-110
              ${subjectsOpen ? '' : 'max-md:hidden'}
            `}
          >
            +
          </button>
        </div>

        <div
          id="planner-subjects"
          className={subjectsOpen ? 'space-y-1' : 'hidden space-y-1 md:block'}
        >
          <button
            type="button"
            aria-pressed={showOverdue}
            onClick={onToggleOverdue}
            className={`
              block w-full rounded-arc-sm px-3 py-2 text-left
              text-sm text-arc-danger-light transition-colors
              hover:bg-white/5
              ${showOverdue ? 'bg-white/10 font-semibold' : ''}
            `}
          >
            Overdue
          </button>

          {isCreating && (
            <form onSubmit={handleSubmit} className="px-3 py-1">
              <input
                autoFocus
                type="text"
                value={title}
                disabled={createRootMutation.isPending}
                placeholder="Subject name..."
                aria-label="Root name"
                onChange={(event) => setTitle(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    cancelCreate()
                  }
                }}
                onBlur={() => {
                  if (!title.trim()) {
                    cancelCreate()
                  }
                }}
                className="
                  w-full rounded-[7px] border border-[#2e286b]
                  bg-[#383969] px-2 py-1.5
                  text-sm text-arc-text outline-none
                  placeholder:text-[#7e79bf]
                  focus:border-[#7c9cde]
                "
              />

              {createRootMutation.isError && (
                <p className="mt-1 text-xs text-arc-danger-light">
                  Could not create root.
                </p>
              )}
            </form>
          )}

          <PlannerSidebarDnd
            roots={displayedRoots}
            onMove={handleRootMove}
          >
            {displayedRoots.map((root) => (
              <SortableRoot
                key={root.id}
                root={root}
                onNavigate={onNavigateToRoot}
              />
            ))}
          </PlannerSidebarDnd>
        </div>
      </nav>
    </aside>
  )
}
