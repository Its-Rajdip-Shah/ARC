import { useEffect, useMemo, useState } from 'react'
import { DndContext, PointerSensor, KeyboardSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { usePriorityOrder, useReorderPriority } from '../../../hooks/usePriorityOrder'
import { usePlanningTree } from '../../../hooks/usePlanningTree'
import PriorityCard from './PriorityCard'
import PriorityToolbar from './PriorityToolbar'
import usePriorityFind from '../hooks/usePriorityFind'
import {
  reorderPriorityRows,
} from '../../../lib/planningOptimistic'
import './PriorityPanel.css'

const EMPTY = []
const verticalOnly = ({ transform }) => ({ ...transform, x: 0 })

// Read the hierarchy once; root identity and execution positions come from Priority.
function hierarchyContext(tree) {
  const paths = new Map()
  function visit(nodes, ancestors) {
    for (const node of nodes) {
      paths.set(node.id, ancestors.slice(1))
      visit(node.children ?? EMPTY, [...ancestors, node])
    }
  }
  visit(tree, EMPTY)
  return paths
}

function PriorityContent({ canUndo, canRedo, onUndo, onRedo, historyBusy }) {
  const [selectedRoot, setSelectedRoot] = useState(null)
  const priority = usePriorityOrder()
  const tree = usePlanningTree()
  const reorder = useReorderPriority()

  const authoritativeRows =
    priority.data
    ?? EMPTY

  const [
    rows,
    setRows,
  ] =
    useState(
      authoritativeRows,
    )

  useEffect(() => {
    /*
     * Server/query data may only replace the local drag projection after the
     * complete coalesced Priority request chain has settled.
     */
    if (
      !reorder.isPending
    ) {
      setRows(
        authoritativeRows,
      )
    }
  }, [
    authoritativeRows,
    reorder.isPending,
  ])

  const roots = tree.data ?? EMPTY
  const paths = useMemo(() => hierarchyContext(roots), [roots])
  const columns = useMemo(() => {
    const represented = new Map(rows.map((row) => [row.root.id, row.root]))
    // Stable horizontal context follows Planner root order, never execution rank.
    const ordered = roots.filter((root) => represented.has(root.id))
    for (const root of ordered) represented.delete(root.id)
    return [...ordered, ...represented.values()]
  }, [roots, rows])
  const activeRoot = columns.some((root) => root.id === selectedRoot) ? selectedRoot : null
  const visibleRows = useMemo(() => activeRoot === null ? rows : rows.filter((row) => row.root.id === activeRoot), [rows, activeRoot])
  const find = usePriorityFind(visibleRows, paths)
  const { isSuccess, reset } = reorder
  useEffect(() => {
    if (!isSuccess) return
    const timeout = window.setTimeout(reset, 2200)
    return () => window.clearTimeout(timeout)
  }, [isSuccess, reset])
  const columnIndex = new Map(columns.map((root, index) => [root.id, index]))
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  /*
   * Reconciliation no longer freezes Priority interaction.
   *
   * useReorderPriority() serialises requests and keeps only the newest
   * not-yet-started intent while the visible order updates immediately.
   * Undo/redo remain blocking history commands.
   */
  const busy = historyBusy
  const reconciling = reorder.isPending
  const unavailable = priority.isError || tree.isError

  function move(itemId, position) {
    if (
      busy
      || unavailable
    ) {
      return
    }

    /*
     * Own the visual position synchronously before dnd-kit tears down its
     * transform. This removes the one-frame return to the old slot.
     */
    setRows(
      (current) =>
        reorderPriorityRows(
          current,
          itemId,
          position,
        ),
    )

    reorder.mutate({
      item_id:
        itemId,

      new_position:
        position,
    })
  }

  function drop({ active, over }) {
    if (!over || active.id === over.id) return
    const target = rows.find((row) => row.item_id === over.id)
    if (target) move(active.id, target.position)
  }

  return (
    <>
      <header className="priority-heading">
        <h1 id="priority-heading" className="arc-display text-[42px] leading-none sm:text-[52px]">Priority</h1>
      </header>
      <PriorityToolbar find={find} canUndo={canUndo} canRedo={canRedo} onUndo={onUndo} onRedo={onRedo} busy={busy} />
      <div className="priority-feedback" role="status" aria-live="polite">
        {
          !reconciling
          && reorder.isSuccess
            ? 'Priority saved.'
            : ''
        }
      </div>
      {reorder.isError && <p role="alert" className="mx-5 my-3 text-arc-danger-light sm:mx-12">Could not save priority. Your last saved order is shown. Try again.</p>}
      {unavailable ? (
        <div role="alert" className="p-8 text-center">
          <p>Could not load priority or hierarchy context.</p>
          <button type="button" className="mt-4 rounded-arc-control bg-arc-panel px-4 py-2" onClick={() => { priority.refetch(); tree.refetch() }}>Try again</button>
        </div>
      ) : priority.isPending || tree.isPending ? (
        <p role="status" className="p-12 text-center text-arc-text-muted">Loading priority…</p>
      ) : rows.length === 0 ? (
        <div className="p-12 text-center">
          <h2 className="text-lg">Nothing in your priority list yet</h2>
          <p className="mt-2 text-sm text-arc-text-muted">Add an actionable task in Planner. Tasks with unfinished children become eligible once those children are complete.</p>
        </div>
      ) : (
        <div className="priority-scroll" tabIndex={0} aria-label="Priority order by root goal; scroll horizontally for more goals">
          <div className="priority-board" style={{ '--root-count': columns.length }}>
            <div className="priority-columns">
              <span className="priority-order-label">Order</span>
              {columns.map((root, index) => (
                <button type="button" key={root.id} aria-pressed={activeRoot === root.id}
                  title={root.title} onClick={() => setSelectedRoot(activeRoot === root.id ? null : root.id)}
                  className="priority-column" style={{ left: `calc(var(--number-width) + ${index} * var(--column-width))` }}>
                  <span>{root.title}</span>
                </button>
              ))}
            </div>
            <div className="priority-guides" aria-hidden="true">
              {columns.map((root, index) => <span key={root.id} style={{ left: `calc(var(--number-width) + ${index} * var(--column-width))` }} />)}
            </div>
            <DndContext sensors={sensors} collisionDetection={closestCenter} modifiers={[verticalOnly]} onDragEnd={drop}>
              <SortableContext items={visibleRows.map((row) => row.item_id)} strategy={verticalListSortingStrategy}>
                <ol
                  className="relative m-0 list-none p-0 pb-8"
                  aria-label="Global priority order"
                  aria-busy={busy || reconciling}
                >
                  {visibleRows.map((row) => (
                    <PriorityCard key={row.item_id} row={row} column={columnIndex.get(row.root.id)}
                      matched={find.matchIds.has(row.item_id)} currentMatch={find.currentId === row.item_id} registerCard={find.registerCard}
                      ancestors={paths.get(row.item_id)} count={rows.length} disabled={busy || unavailable} onMove={move} />
                  ))}
                </ol>
              </SortableContext>
            </DndContext>
          </div>
        </div>
      )}
    </>
  )
}

export default function PriorityPanel({ isOpen, ...history }) {
  return (
    <aside id="priority-panel" aria-hidden={!isOpen} aria-labelledby="priority-heading"
      className={`priority-panel ${isOpen ? 'priority-panel-open' : ''}`}>
      {isOpen && <PriorityContent {...history} />}
    </aside>
  )
}
