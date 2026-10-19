import { useEffect, useMemo, useRef, useState } from 'react'
import { usePriorityOrder, useReorderPriority } from '../../../hooks/usePriorityOrder'
import { usePlanningTree } from '../../../hooks/usePlanningTree'
import PriorityCard from './PriorityCard'
import PriorityToolbar from './PriorityToolbar'
import usePriorityFind from '../hooks/usePriorityFind'
import {
  reorderPriorityRows,
} from '../../../lib/planningOptimistic'
import PriorityDnd from '../../../dnd/priority/PriorityDnd'
import './PriorityPanel.css'

const EMPTY = []

function clearHoverTimer(timer) {
  window.clearTimeout(timer.current)
  timer.current = null
}

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
  const [hoveredRoot, setHoveredRoot] = useState(null)
  const touchInteraction = useRef(false)
  const hoverTimer = useRef(null)

  useEffect(() => {
    function handleKeyDown(event) {
      touchInteraction.current = false
      if (event.key === 'Escape') {
        clearHoverTimer(hoverTimer)
        setHoveredRoot(null)
      }
    }
    window.addEventListener('keydown', handleKeyDown, true)
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true)
      clearHoverTimer(hoverTimer)
    }
  }, [])
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
  const committedRoot = columns.some((root) => root.id === selectedRoot) ? selectedRoot : null
  // Both previews and committed selections use the same row filter below.
  const displayedRoot = hoveredRoot ?? committedRoot
  const activeRoot = columns.some((root) => root.id === displayedRoot) ? displayedRoot : null
  const visibleRows = useMemo(() => activeRoot === null ? rows : rows.filter((row) => row.root.id === activeRoot), [rows, activeRoot])
  const find = usePriorityFind(visibleRows, paths)
  const { isSuccess, reset } = reorder
  useEffect(() => {
    if (!isSuccess) return
    const timeout = window.setTimeout(reset, 2200)
    return () => window.clearTimeout(timeout)
  }, [isSuccess, reset])
  const columnIndex = new Map(columns.map((root, index) => [root.id, index]))
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

  return (
    <>
      <div className="priority-toolbar-area">
        <PriorityToolbar find={find} canUndo={canUndo} canRedo={canRedo} onUndo={onUndo} onRedo={onRedo} busy={busy} />
        <div className="priority-feedback" role="status" aria-live="polite">
          {!reconciling && reorder.isSuccess ? 'Priority saved.' : ''}
        </div>
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
            <div className="priority-columns"
              onPointerDownCapture={(event) => { touchInteraction.current = event.pointerType === 'touch' }}
              onPointerLeave={() => {
                clearHoverTimer(hoverTimer)
                setHoveredRoot(null)
              }}
              onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) {
                  clearHoverTimer(hoverTimer)
                  setHoveredRoot(null)
                }
              }}>
              <span className="priority-order-label">Order</span>
              {columns.map((root, index) => (
                <button key={root.id} type="button" className="priority-column"
                  aria-pressed={committedRoot === root.id}
                  onPointerEnter={(event) => {
                    clearHoverTimer(hoverTimer)
                    if (event.pointerType !== 'touch' && window.matchMedia('(hover: hover)').matches) {
                      hoverTimer.current = window.setTimeout(() => {
                        hoverTimer.current = null
                        setHoveredRoot(root.id)
                      }, 400)
                    }
                  }}
                  onPointerLeave={() => clearHoverTimer(hoverTimer)}
                  onFocus={() => {
                    clearHoverTimer(hoverTimer)
                    if (!touchInteraction.current) setHoveredRoot(root.id)
                  }}
                  onClick={() => {
                    clearHoverTimer(hoverTimer)
                    setSelectedRoot(committedRoot === root.id ? null : root.id)
                    setHoveredRoot(null)
                  }}
                  style={{ left: `calc(var(--number-width) + ${index} * var(--column-width))` }}>
                  <span>{root.title}</span>
                </button>
              ))}
            </div>
            <div className="priority-guides" aria-hidden="true">
              {columns.map((root, index) => <span key={root.id} style={{ left: `calc(var(--number-width) + ${index} * var(--column-width))` }} />)}
            </div>
            <PriorityDnd
              rows={visibleRows}
              onMove={move}
            >
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
            </PriorityDnd>
          </div>
        </div>
      )}
    </>
  )
}

export default function PriorityPanel(history) {
  return (
    <section id="priority-panel" aria-label="Priority" className="priority-panel">
      <PriorityContent {...history} />
    </section>
  )
}
