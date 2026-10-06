import { useEffect, useMemo } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'

import { deleteItem, moveItem } from '../../../api/planning'
import PlannerTreeItem from './PlannerTreeItem'
import PlannerDnd from '../../../dnd/planner/PlannerDnd'
import {
  applyPlannerMove,
  flattenPlanningTree,
  projectPlannerDrop,
  removePlannerItem,
} from '../../../dnd/planner/plannerProjection'
import {
  createSerialActionQueue,
} from '../../../lib/latestIntentQueue'


const plannerStructuralRequests =
  createSerialActionQueue(
    async (action) => {
      if (
        action.type ===
        'move'
      ) {
        return moveItem(
          action.itemId,
          {
            parent_id:
              action.parentId,

            sibling_order:
              action.siblingOrder,

            adopt_child_ids:
              action.adoptChildIds
              ?? [],
          },
        )
      }

      if (
        action.type ===
        'delete'
      ) {
        return deleteItem(
          action.itemId,
        )
      }

      throw new Error(
        `Unknown Planner structural action: ${action.type}`,
      )
    },
  )

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
    () =>
      flattenPlanningTree(
        displayItems,
      ),
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

  const deleteMutation = useMutation({
    mutationFn({
      promise,
    }) {
      return promise
    },

    onSuccess(
      _,
      {
        itemId,
      },
    ) {
      if (
        itemId ===
        panelOwnerId
      ) {
        onPanelOwnerDeleted?.()
      }
    },

    async onSettled() {
      await plannerStructuralRequests.whenIdle()

      void Promise.all([
        queryClient.invalidateQueries({
          queryKey: [
            'planning',
            'tree',
          ],
        }),

        queryClient.invalidateQueries({
          queryKey: [
            'planning',
            'priority',
          ],
        }),

        queryClient.invalidateQueries({
          queryKey: [
            'planning',
            'history',
          ],
        }),
      ])
    },
  })


  function currentPlanningTree() {
    return (
      queryClient.getQueryData(
        [
          'planning',
          'tree',
        ],
      )
      ?? items
    )
  }


  function requestDelete(itemId) {
    /*
     * Deletion is visually immediate. The server remains canonical and the
     * authoritative tree is refreshed after all queued structural actions.
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
        removePlannerItem(
          tree,
          itemId,
        ),
    )

    const promise =
      plannerStructuralRequests.push({
        type:
          'delete',

        itemId,
      })

    deleteMutation.mutate({
      itemId,
      promise,
    })
  }


  const moveMutation = useMutation({
    mutationFn({
      promise,
    }) {
      return promise
    },

    async onSettled() {
      /*
       * Do not let the response for an older structural action refetch over
       * newer optimistic intent. Refresh only when the FIFO queue is empty.
       */
      await plannerStructuralRequests.whenIdle()

      void Promise.all([
        queryClient.invalidateQueries({
          queryKey: [
            'planning',
            'tree',
          ],
        }),

        queryClient.invalidateQueries({
          queryKey: [
            'planning',
            'priority',
          ],
          refetchType:
            'all',
        }),

        queryClient.invalidateQueries({
          queryKey: [
            'planning',
            'history',
          ],
        }),
      ])
    },
  })



  function persistPlannerMove(
    intent,
  ) {
    /*
     * dnd-kit removes its transform immediately after DragEnd. Write the
     * projected hierarchy into React Query before that frame can render the
     * old server tree. This is what removes Planner's snap-back.
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
        applyPlannerMove(
          tree,
          intent,
        ),
    )

    const promise =
      plannerStructuralRequests.push({
        type:
          'move',

        itemId:
          intent.itemId,

        parentId:
          intent.parentId,

        siblingOrder:
          intent.siblingOrder,

        adoptChildIds:
          intent.adoptChildIds
          ?? [],
      })

    moveMutation.mutate({
      promise,
    })
  }

  function indentItem(itemId) {
    const sourceItems =
      currentPlanningTree()

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

    const context = findSiblingContext(
      sourceItems,
    )

    if (!context) {
      return
    }

    const { siblings, index } = context

    /*
     * Roots are fixed at depth 0.
     * They can never be indented beneath another root.
     */
    if (
      siblings ===
      sourceItems
    ) {
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

    persistPlannerMove({
      type:
        'planner-move',

      itemId:
        item.id,

      parentId:
        previousSibling.id,

      siblingOrder,
    })
  }

  function outdentItem(
    itemId,
  ) {
    const sourceItems =
      currentPlanningTree()

    const flat =
      flattenPlanningTree(
        sourceItems,
      )

    const active =
      flat.find(
        (item) =>
          item.id === itemId,
      )

    if (
      !active
      || active.depth === 0
    ) {
      return
    }

    const intent =
      projectPlannerDrop({
        items: flat,
        activeId: itemId,
        overId: itemId,
        depthDelta: -1,
      })

    if (
      !intent
      || intent.depth >=
        active.depth
    ) {
      return
    }

    persistPlannerMove(
      intent,
    )
  }

  useEffect(() => {
    function clearPlannerShortcutFocus() {
      const activeElement =
        document.activeElement

      if (
        activeElement instanceof HTMLElement
        && activeElement !== document.body
      ) {
        activeElement.blur()
      }
    }

    function handleTreeKeyboardShortcut(event) {
      const target = event.target

      const isEditing =
        target instanceof HTMLElement
        && (
          target.tagName === 'INPUT'
          || target.tagName === 'TEXTAREA'
          || target.tagName === 'SELECT'
          || target.isContentEditable
        )

      if (
        isEditing
        || hoveredItemId == null
      ) {
        return
      }

      if (
        event.key === 'Backspace'
        || event.key === 'Delete'
      ) {
        /*
         * Cmd/Ctrl + Delete keeps the existing destructive shortcut.
         * Plain Delete/Backspace means one-level outdent.
         */
        if (
          event.metaKey
          || event.ctrlKey
        ) {
          event.preventDefault()
          clearPlannerShortcutFocus()

          requestDelete(
            hoveredItemId,
          )
          return
        }

        event.preventDefault()
        clearPlannerShortcutFocus()

        outdentItem(
          hoveredItemId,
        )
        return
      }

      if (
        event.key === 'Tab'
        && !event.shiftKey
      ) {
        event.preventDefault()
        clearPlannerShortcutFocus()

        indentItem(
          hoveredItemId,
        )
      }
    }

    window.addEventListener(
      'keydown',
      handleTreeKeyboardShortcut,
    )

    return () => {
      window.removeEventListener(
        'keydown',
        handleTreeKeyboardShortcut,
      )
    }
  })


  return (
    <PlannerDnd
      items={flattenedItems}
      onMove={persistPlannerMove}
    >
      {({
        activeId,
        projection,
        dragDescendantIds,
      }) => {
        const dragDescendantSet =
          new Set(
            dragDescendantIds,
          )

        /*
         * Descendants disappear visually while their parent is dragged, as
         * intended by the Planner preview contract.
         *
         * CRITICAL: their DOM rows stay mounted and retain their exact height.
         * This makes dragging a parent mechanically identical to dragging a
         * leaf. The presence/size/depth of its subtree cannot mutate dnd-kit's
         * coordinate system after DragStart.
         */
        const visibleRows =
          activeId == null
            ? flattenedItems
            : flattenedItems.filter(
                (item) =>
                  !dragDescendantSet.has(
                    item.id,
                  ),
              )

        return (
        <ul
          aria-label="Planning hierarchy"
          className="m-0 list-none p-0"
        >
          {visibleRows.map((item) => (
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
              /*
               * Never mutate the active sortable row's layout depth during
               * pointer movement.
               *
               * The dragged card itself follows pointer X and therefore
               * previews indentation naturally. Changing padding here fed the
               * projection back into dnd-kit's geometry and caused
               * sibling/child flicker around the threshold.
               */
              depth={item.depth}
              previewDepth={
                item.id === activeId
                && projection
                  ? projection.depth
                  : null
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
        )
      }}
    </PlannerDnd>
  )
}
