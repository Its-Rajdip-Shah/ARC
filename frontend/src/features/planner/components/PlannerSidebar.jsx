import { useState } from 'react'
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useMutation, useQueryClient } from '@tanstack/react-query'

import arcLogo from '../../../assets/brand/arc-logo.svg'
import { createItem, moveItem } from '../../../api/planning'

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
      type="button"
      title={root.title}
      onClick={() => onNavigate?.(root.id)}
      style={style}
      className={`
        block w-full rounded-arc-sm
        px-3 py-2 text-left
        text-sm text-arc-text
        touch-none select-none
        transition-colors
        hover:bg-white/5
        ${isDragging ? 'opacity-70' : ''}
      `}
      {...attributes}
      {...listeners}
    >
      {root.title.length > 30
        ? `${root.title.slice(0, 30)}...`
        : root.title}
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
  const [title, setTitle] = useState('')
  const queryClient = useQueryClient()

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 4,
      },
    }),
  )


  const moveRootMutation = useMutation({
    mutationFn: ({ id, siblingOrder }) =>
      moveItem(id, {
        parent_id: null,
        sibling_order: siblingOrder,
      }),

    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['planning', 'tree'],
        }),
        queryClient.invalidateQueries({
          queryKey: ['planning', 'history'],
        }),
      ])
    },

  })

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

  function handleRootDragEnd(event) {
    const { active, over } = event

    if (
      moveRootMutation.isPending ||
      !over ||
      active.id === over.id
    ) {
      return
    }

    const oldIndex = roots.findIndex(
      (root) => root.id === active.id,
    )

    const newIndex = roots.findIndex(
      (root) => root.id === over.id,
    )

    if (
      oldIndex === -1 ||
      newIndex === -1 ||
      oldIndex === newIndex
    ) {
      return
    }

    /*
     * dnd-kit has already shown the user the prospective
     * position visually.
     *
     * Persist that final 1-based root sibling position.
     * parent_id remains null, so this is ONLY a root reorder.
     */
    moveRootMutation.mutate({
      id: active.id,
      siblingOrder: newIndex + 1,
    })
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
        sticky top-0 z-30 flex h-screen w-arc-sidebar shrink-0
        flex-col overflow-y-auto overscroll-contain
        border-r border-white/10 bg-arc-surface
        px-5 pb-6 pt-5
      "
    >
      <img
        src={arcLogo}
        alt="ARC"
        className="h-auto w-[92px]"
      />

      <nav aria-label="Planner navigation" className="mt-20">
        <div className="mb-3 flex items-center gap-2 px-3">
          <h2 className="text-[22px] font-bold tracking-[0.12em] text-arc-text-secondary">
            ROOTS
          </h2>

          <button
            type="button"
            aria-label="Add root"
            onClick={() => setIsCreating(true)}
            className="
              flex h-6 w-6 items-center justify-center
              rounded-arc-sm bg-arc-accent
              text-lg leading-none text-arc-bg
              transition-[filter] hover:brightness-110
            "
          >
            +
          </button>
        </div>

        <div className="space-y-1">
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
                placeholder="Root name..."
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

          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleRootDragEnd}
          >
            <SortableContext
              items={roots.map((root) => root.id)}
              strategy={verticalListSortingStrategy}
            >
              {roots.map((root) => (
                <SortableRoot
                  key={root.id}
                  root={root}
                  onNavigate={onNavigateToRoot}
                />
              ))}
            </SortableContext>
          </DndContext>
        </div>
      </nav>
    </aside>
  )
}
