import { useEffect, useMemo, useState } from 'react'
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { useMutation, useQueryClient } from '@tanstack/react-query'

import { deleteItem, moveItem } from '../../../api/planning'
import PlannerTreeItem from './PlannerTreeItem'

const INDENT_WIDTH = 42

function filterCompletedItems(items) {
  return items
    .filter((item) => !item.is_completed)
    .map((item) => ({
      ...item,
      children: filterCompletedItems(item.children ?? []),
    }))
}

function searchPlanningTree(items, rawQuery) {
  const query = rawQuery.trim().toLowerCase()
  const matchedIds = new Set()

  if (!query) {
    return {
      items,
      matchedIds,
    }
  }

  function matches(item) {
    const title = String(item.title ?? '').toLowerCase()
    const description = String(
      item.description ?? '',
    ).toLowerCase()

    const tags = (item.tags ?? [])
      .map((tag) =>
        String(tag.name ?? '').toLowerCase(),
      )
      .join(' ')

    return (
      title.includes(query) ||
      description.includes(query) ||
      tags.includes(query)
    )
  }

  // Pass 1: identify direct matches.
  function collectMatches(nodes) {
    for (const item of nodes) {
      if (matches(item)) {
        matchedIds.add(item.id)
      }

      collectMatches(item.children ?? [])
    }
  }

  collectMatches(items)

  /*
   * Pass 2:
   *
   * Direct match:
   *   keep its entire subtree.
   *
   * Non-match:
   *   retain only children whose branches contain a match.
   *
   * This preserves ancestors while removing unrelated branches.
   */
  function filterBranch(item) {
    if (matchedIds.has(item.id)) {
      return item
    }

    const children = (item.children ?? [])
      .map(filterBranch)
      .filter(Boolean)

    if (children.length === 0) {
      return null
    }

    return {
      ...item,
      children,
    }
  }

  return {
    items: items
      .map(filterBranch)
      .filter(Boolean),
    matchedIds,
  }
}

function flattenTree(items, parentId = null, depth = 0) {
  return items.flatMap((item) => [
    {
      ...item,
      parentId,
      depth,
    },
    ...flattenTree(item.children ?? [], item.id, depth + 1),
  ])
}

function getDescendantIds(flatItems, itemId) {
  const index = flatItems.findIndex((item) => item.id === itemId)

  if (index === -1) {
    return []
  }

  const depth = flatItems[index].depth
  const descendants = []

  for (let i = index + 1; i < flatItems.length; i += 1) {
    if (flatItems[i].depth <= depth) {
      break
    }

    descendants.push(flatItems[i].id)
  }

  return descendants
}

function getProjection({
  items,
  activeId,
  overId,
  dropSide,
  dragOffset,
}) {
  const activeItem = items.find((item) => item.id === activeId)

  if (!activeItem) {
    return null
  }

  /*
   * Moving a parent moves its whole subtree.
   * Remove that entire subtree before calculating the destination.
   */
  const descendantIds = new Set(
    getDescendantIds(items, activeId),
  )

  const remainingItems = items.filter(
    (item) =>
      item.id !== activeId &&
      !descendantIds.has(item.id),
  )

  const overIndex = remainingItems.findIndex(
    (item) => item.id === overId,
  )

  /*
   * If we're still over the active item itself, there is no meaningful
   * insertion target yet.
   */
  if (overIndex === -1) {
    return {
      depth: activeItem.depth,
      parentId: activeItem.parentId,
      siblingOrder: null,
    }
  }

  /*
   * This is the important part:
   *
   * upper half of target => insert BEFORE it
   * lower half of target => insert AFTER it
   *
   * Therefore upward/downward movement is symmetric.
   */
  const insertionIndex =
    dropSide === 'after'
      ? overIndex + 1
      : overIndex

  const previousItem =
    insertionIndex > 0
      ? remainingItems[insertionIndex - 1]
      : null

  const nextItem =
    insertionIndex < remainingItems.length
      ? remainingItems[insertionIndex]
      : null

  const depthChange = Math.round(
    dragOffset / INDENT_WIDTH,
  )

  let projectedDepth =
    activeItem.depth + depthChange

  const maxDepth = previousItem
    ? previousItem.depth + 1
    : 0

  /*
   * If the next visible item is nested, we cannot suddenly become
   * shallower than its structural context permits.
   */
  const minDepth = nextItem
    ? Math.max(0, nextItem.depth - 1)
    : 0

  projectedDepth = Math.max(
    minDepth,
    Math.min(projectedDepth, maxDepth),
  )

  let parentId = null

  if (projectedDepth > 0) {
    for (
      let i = insertionIndex - 1;
      i >= 0;
      i -= 1
    ) {
      const candidate = remainingItems[i]

      if (candidate.depth === projectedDepth - 1) {
        parentId = candidate.id
        break
      }
    }

    if (parentId == null) {
      projectedDepth = 0
    }
  }

  /*
   * sibling_order is the position among DIRECT children of parentId,
   * not the flattened-tree index.
   */
  let siblingOrder = 1

  for (let i = 0; i < insertionIndex; i += 1) {
    if (remainingItems[i].parentId === parentId) {
      siblingOrder += 1
    }
  }

  return {
    depth: projectedDepth,
    parentId,
    siblingOrder,
  }
}

function getLocalDateString() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

function filterOverdueTree(items, today) {
  const matchedIds = new Set()

  function filterBranch(item) {
    const filteredChildren = (item.children ?? [])
      .map(filterBranch)
      .filter(Boolean)

    const isOverdue =
      !item.completed &&
      Boolean(item.due_date) &&
      item.due_date < today

    if (isOverdue) {
      matchedIds.add(item.id)
    }

    if (!isOverdue && filteredChildren.length === 0) {
      return null
    }

    return {
      ...item,
      children: filteredChildren,
    }
  }

  return {
    items: items.map(filterBranch).filter(Boolean),
    matchedIds,
  }
}

export default function PlannerTree({
  items,
  selectedItemId,
  panelOwnerId,
  onPanelOwnerDeleted,
  hoveredItemId,
  showAllDetails,
  showCheckboxes,
  showCompleted,
  searchQuery,
  showOverdue,
  onHoverItem,
  onSelectItem,
  onEditItem,
  onCreateNested,
}) {
  const queryClient = useQueryClient()

  const [activeId, setActiveId] = useState(null)
  const [overId, setOverId] = useState(null)
  const [dropSide, setDropSide] = useState('before')
  const [horizontalOffset, setHorizontalOffset] = useState(0)

  const completionFilteredItems = useMemo(
    () =>
      showCompleted
        ? items
        : filterCompletedItems(items),
    [items, showCompleted],
  )

  const searchResult = useMemo(() => {
    const query = (searchQuery ?? '').trim()

    // Explicit text search takes precedence over the Overdue view.
    if (query.length > 0) {
      return searchPlanningTree(items, query)
    }

    if (showOverdue) {
      return filterOverdueTree(
        items,
        getLocalDateString(),
      )
    }

    return searchPlanningTree(
      completionFilteredItems,
      '',
    )
  }, [
    items,
    completionFilteredItems,
    searchQuery,
    showOverdue,
  ])

  const displayItems = searchResult.items
  const searchMatchedIds = searchResult.matchedIds

  const flattenedItems = useMemo(
    () => flattenTree(displayItems),
    [displayItems],
  )

  const parentIds = useMemo(
    () =>
      new Set(
        flattenedItems
          .map((item) => item.parentId)
          .filter((id) => id != null),
      ),
    [flattenedItems],
  )

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        delay: 220,
        tolerance: 5,
      },
    }),
  )

  const deleteMutation = useMutation({
    mutationFn: deleteItem,

    onSuccess: async (_, deletedItemId) => {
      // If the deleted task owns Edit/Add, cancel that panel.
      if (deletedItemId === panelOwnerId) {
        onPanelOwnerDeleted?.()
      }

      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['planning', 'tree'],
        }),
        queryClient.invalidateQueries({
          queryKey: ['planning', 'priority'],
        }),
        queryClient.invalidateQueries({
          queryKey: ['planning', 'history'],
        }),
      ])
    },
  })

  function requestDelete(itemId) {
    if (deleteMutation.isPending) {
      return
    }

    deleteMutation.mutate(itemId)
  }

  const moveMutation = useMutation({
    mutationFn: ({ id, payload }) =>
      moveItem(id, payload),

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

  const projection =
    activeId && overId
      ? getProjection({
          items: flattenedItems,
          activeId,
          overId,
          dropSide,
          dragOffset: horizontalOffset,
        })
      : null

  function indentItem(itemId) {
    if (moveMutation.isPending) {
      return
    }

    /*
     * Find item in the REAL nested tree and return its direct
     * siblings. This avoids deriving structural relationships
     * from the flattened DnD representation.
     */
    function findSiblingContext(nodes) {
      for (let index = 0; index < nodes.length; index += 1) {
        const node = nodes[index]

        if (node.id === itemId) {
          return {
            siblings: nodes,
            index,
          }
        }

        const result = findSiblingContext(node.children ?? [])

        if (result) {
          return result
        }
      }

      return null
    }

    const context = findSiblingContext(items)

    if (!context) {
      return
    }

    const { siblings, index } = context

    /*
     * Roots are fixed at depth 0.
     * They can never be indented beneath another root.
     */
    if (siblings === items) {
      return
    }

    /*
     * First task among its siblings cannot indent because there
     * is no sibling directly above it.
     *
     * This applies equally to roots and nested tasks.
     */
    if (index === 0) {
      return
    }

    const item = siblings[index]
    const previousSibling = siblings[index - 1]

    /*
     * Become the BOTTOMMOST child of the sibling directly above.
     *
     * sibling_order is 1-based in this API, matching getProjection().
     *
     * Moving the parent item automatically carries its existing
     * descendants because their parent relationships do not change.
     */
    const siblingOrder =
      (previousSibling.children?.length ?? 0) + 1

    moveMutation.mutate({
      id: item.id,
      payload: {
        parent_id: previousSibling.id,
        sibling_order: siblingOrder,
      },
    })
  }

  function outdentItem(itemId) {
    if (moveMutation.isPending) {
      return
    }

    /*
     * Find the item in the REAL nested tree.
     *
     * We need:
     * - the item itself
     * - its parent
     * - the parent's siblings
     * - the parent's position among those siblings
     */
    function findContext(nodes, parent = null, parentSiblings = null) {
      for (let index = 0; index < nodes.length; index += 1) {
        const node = nodes[index]

        if (node.id === itemId) {
          return {
            item: node,
            parent,
            parentSiblings,
          }
        }

        const result = findContext(
          node.children ?? [],
          node,
          nodes,
        )

        if (result) {
          return result
        }
      }

      return null
    }

    const context = findContext(items)

    if (!context) {
      return
    }

    const {
      item,
      parent,
      parentSiblings,
    } = context

    // Root tasks cannot be outdented.
    if (!parent || !parentSiblings) {
      return
    }

    /*
     * Find where the parent currently sits among its siblings.
     * The outdented item will be inserted immediately after it.
     */
    const parentIndex = parentSiblings.findIndex(
      (candidate) => candidate.id === parent.id,
    )

    if (parentIndex === -1) {
      return
    }

    /*
     * Determine the grandparent.
     *
     * If parentSiblings === items, the parent is a root,
     * therefore the outdented item becomes a root too.
     */
    function findParentId(nodes, targetId, parentId = null) {
      for (const node of nodes) {
        if (node.id === targetId) {
          return parentId
        }

        const result = findParentId(
          node.children ?? [],
          targetId,
          node.id,
        )

        if (result !== undefined) {
          return result
        }
      }

      return undefined
    }

    const grandparentId = findParentId(items, parent.id)

    if (grandparentId === undefined) {
      return
    }

    /*
     * sibling_order is 1-based.
     *
     * parentIndex is 0-based, so:
     *
     * parent index 0 → parent order 1
     * outdented item → order 2
     *
     * Hence parentIndex + 2.
     */
    moveMutation.mutate({
      id: item.id,
      payload: {
        parent_id: grandparentId,
        sibling_order: parentIndex + 2,
      },
    })
  }

  function resetDrag() {
    setActiveId(null)
    setOverId(null)
    setDropSide('before')
    setHorizontalOffset(0)
  }

  useEffect(() => {
    function handleTreeKeyboardShortcut(event) {
      const target = event.target

      const isEditing =
        target instanceof HTMLElement &&
        (
          target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable
        )

      if (isEditing || hoveredItemId == null) {
        return
      }

      if (
        event.key === 'Backspace' ||
        event.key === 'Delete'
      ) {
        // Cmd/Ctrl + Delete = delete the hovered task.
        if (event.metaKey || event.ctrlKey) {
          event.preventDefault()
          requestDelete(hoveredItemId)
          return
        }

        // Plain Delete/Backspace = outdent one level.
        event.preventDefault()
        outdentItem(hoveredItemId)
        return
      }

      if (event.key === 'Tab' && !event.shiftKey) {
        event.preventDefault()
        indentItem(hoveredItemId)
      }
    }

    window.addEventListener('keydown', handleTreeKeyboardShortcut)

    return () => {
      window.removeEventListener(
        'keydown',
        handleTreeKeyboardShortcut,
      )
    }
  }, [
    hoveredItemId,
    flattenedItems,
    moveMutation.isPending,
    deleteMutation.isPending,
    panelOwnerId,
  ])

  function handleDragStart({ active }) {
    setActiveId(active.id)
    setOverId(active.id)
    setDropSide('before')
  }

  function handleDragMove({ active, over, delta }) {
    setHorizontalOffset(delta.x)

    if (!over) {
      return
    }

    setOverId(over.id)

    /*
     * Compare the centre of the dragged rectangle with the centre
     * of the current target.
     *
     * Above centre => BEFORE
     * Below centre => AFTER
     */
    const translatedRect = active.rect.current.translated
    const overRect = over.rect

    if (!translatedRect || !overRect) {
      return
    }

    const activeCenterY =
      translatedRect.top + translatedRect.height / 2

    const overCenterY =
      overRect.top + overRect.height / 2

    setDropSide(
      activeCenterY < overCenterY
        ? 'before'
        : 'after',
    )
  }

  function handleDragOver({ over }) {
    if (over) {
      setOverId(over.id)
    }
  }

  function handleDragCancel() {
    resetDrag()
  }

  function handleDragEnd({ active, over }) {
    if (!over) {
      resetDrag()
      return
    }

    const finalProjection = getProjection({
      items: flattenedItems,
      activeId: active.id,
      overId: over.id,
      dropSide,
      dragOffset: horizontalOffset,
    })

    resetDrag()

    if (
      !finalProjection ||
      finalProjection.siblingOrder == null
    ) {
      return
    }

    console.log('ARC DROP DEBUG', {
      activeId: active.id,
      overId: over.id,
      dropSide,
      original: flattenedItems.find((item) => item.id === active.id),
      projection: finalProjection,
    })

    moveMutation.mutate({
      id: active.id,
      payload: {
        parent_id: finalProjection.parentId,
        sibling_order: finalProjection.siblingOrder,
      },
    })
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragMove={handleDragMove}
      onDragOver={handleDragOver}
      onDragCancel={handleDragCancel}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={flattenedItems.map((item) => item.id)}
        strategy={verticalListSortingStrategy}
      >
        <ul
          aria-label="Planning hierarchy"
          className="m-0 list-none p-0"
        >
          {flattenedItems.map((item) => (
            <div

              data-arc-tree-row

              data-depth={item.depth}

              data-parent-id={item.parentId ?? ""}

              data-item-id={item.id}

              key={item.id}
              className={
                item.depth === 0 &&
                flattenedItems[0]?.id !== item.id
                  ? 'mt-[4.5em]'
                  : ''
              }

            >

              <PlannerTreeItem
              item={item}
              depth={
                item.id === activeId && projection
                  ? projection.depth
                  : item.depth
              }
              selectedItemId={selectedItemId}
          panelOwnerId={panelOwnerId}
          onDeleteItem={requestDelete}
              hoveredItemId={hoveredItemId}
              showAllDetails={showAllDetails}
              showCheckboxes={showCheckboxes}
          searchMatchedIds={searchMatchedIds}
              isRoot={item.depth === 0}
              hasChildren={parentIds.has(item.id)}
              onHoverItem={onHoverItem}
              onSelectItem={onSelectItem}
              onEditItem={onEditItem}
              onCreateNested={onCreateNested}
              dndEnabled
              flat
            />

            </div>
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  )
}
