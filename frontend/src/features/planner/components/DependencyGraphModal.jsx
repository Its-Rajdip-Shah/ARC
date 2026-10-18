import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { getDependencyGraph } from '../../../api/planning'

const NODE_WIDTH = 224
const NODE_HEIGHT = 92
const GAP_X = 44
const GAP_Y = 76
const PADDING = 56
const SIZE_STORAGE_KEY = 'arc.dependencyGraphModal.size.v1'
const MIN_WIDTH = 480
const MIN_HEIGHT = 360
const VIEWPORT_GUTTER = 24
const compareIds = (left, right) => Number(left) - Number(right)

function availableSize() {
  return {
    width: Math.max(0, window.innerWidth - VIEWPORT_GUTTER),
    height: Math.max(0, window.innerHeight - VIEWPORT_GUTTER),
  }
}

function clampSize(size) {
  const available = availableSize()
  const minimumWidth = Math.min(MIN_WIDTH, available.width)
  const minimumHeight = Math.min(MIN_HEIGHT, available.height)
  return {
    width: Math.min(Math.max(Number(size.width) || minimumWidth, minimumWidth), available.width),
    height: Math.min(Math.max(Number(size.height) || minimumHeight, minimumHeight), available.height),
  }
}

function initialSize() {
  const available = availableSize()
  const fallback = { width: Math.min(960, available.width), height: Math.min(760, available.height) }
  try {
    const stored = JSON.parse(window.localStorage.getItem(SIZE_STORAGE_KEY))
    if (!stored || !Number.isFinite(stored.width) || !Number.isFinite(stored.height)) return fallback
    return clampSize(stored)
  } catch {
    return fallback
  }
}

function persistSize(size) {
  try {
    window.localStorage.setItem(SIZE_STORAGE_KEY, JSON.stringify(size))
  } catch {
    // Storage can be unavailable in private browsing or restricted contexts.
  }
}

// Stable layered layout: prerequisites stay above dependents. Cycles get a final layer.
function graphLayout(nodes, edges) {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const outgoing = new Map(nodes.map((node) => [node.id, []]))
  const incoming = new Map(nodes.map((node) => [node.id, []]))
  const indegree = new Map(nodes.map((node) => [node.id, 0]))
  for (const edge of edges) {
    if (!byId.has(edge.prerequisite_id) || !byId.has(edge.dependent_id)) continue
    outgoing.get(edge.prerequisite_id).push(edge.dependent_id)
    incoming.get(edge.dependent_id).push(edge.prerequisite_id)
    indegree.set(edge.dependent_id, indegree.get(edge.dependent_id) + 1)
  }
  const queue = [...nodes].filter((node) => indegree.get(node.id) === 0).sort((a, b) => compareIds(a.id, b.id))
  const level = new Map(nodes.map((node) => [node.id, 0]))
  const ordered = []
  while (queue.length) {
    const node = queue.shift()
    ordered.push(node.id)
    for (const dependentId of outgoing.get(node.id).sort(compareIds)) {
      level.set(dependentId, Math.max(level.get(dependentId), level.get(node.id) + 1))
      indegree.set(dependentId, indegree.get(dependentId) - 1)
      if (indegree.get(dependentId) === 0) { queue.push(byId.get(dependentId)); queue.sort((a, b) => compareIds(a.id, b.id)) }
    }
  }
  const cyclic = [...nodes].filter((node) => !ordered.includes(node.id)).sort((a, b) => compareIds(a.id, b.id))
  const cycleLevel = Math.max(0, ...[...level.values()]) + (ordered.length ? 1 : 0)
  cyclic.forEach((node) => { level.set(node.id, cycleLevel); ordered.push(node.id) })
  const layers = new Map()
  for (const id of ordered) { const layer = level.get(id); if (!layers.has(layer)) layers.set(layer, []); layers.get(layer).push(id) }
  const orderedLayers = [...layers.entries()].sort(([left], [right]) => left - right)
  // Two deterministic barycentric sweeps reduce crossings while preserving a simple flowchart.
  for (let pass = 0; pass < 2; pass += 1) {
    const rank = new Map()
    orderedLayers.forEach(([, ids]) => ids.forEach((id, index) => rank.set(id, index)))
    orderedLayers.slice(1).forEach(([, ids]) => ids.sort((left, right) => {
      const center = (id) => { const values = incoming.get(id).map((parent) => rank.get(parent)).filter(Number.isFinite); return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : rank.get(id) }
      return center(left) - center(right) || compareIds(left, right)
    }))
  }
  const widestLayer = Math.max(1, ...orderedLayers.map(([, ids]) => ids.length))
  const positions = new Map()
  orderedLayers.forEach(([layer, ids]) => {
    const canvasWidth = widestLayer * NODE_WIDTH + Math.max(0, widestLayer - 1) * GAP_X
    const rowWidth = ids.length * NODE_WIDTH + Math.max(0, ids.length - 1) * GAP_X
    ids.forEach((id, index) => positions.set(id, { x: PADDING + (canvasWidth - rowWidth) / 2 + index * (NODE_WIDTH + GAP_X), y: PADDING + layer * (NODE_HEIGHT + GAP_Y) }))
  })
  return { positions, width: PADDING * 2 + widestLayer * NODE_WIDTH + Math.max(0, widestLayer - 1) * GAP_X, height: PADDING * 2 + Math.max(1, orderedLayers.length) * NODE_HEIGHT + Math.max(0, orderedLayers.length - 1) * GAP_Y }
}

function edgeGeometry(from, to) {
  const startX = from.x + NODE_WIDTH / 2; const startY = from.y + NODE_HEIGHT
  const tipX = to.x + NODE_WIDTH / 2; const tipY = to.y; const bend = Math.max(28, (tipY - startY) / 2)
  // The terminal tangent of the cubic is controlTwo -> tip. Shorten the path to
  // the triangle base so its stroke meets the explicit arrowhead without a gap.
  const tangentX = tipX - tipX; const tangentY = tipY - (tipY - bend)
  const tangentLength = Math.hypot(tangentX, tangentY) || 1
  const unitX = tangentX / tangentLength; const unitY = tangentY / tangentLength
  const arrowLength = 10; const arrowHalfWidth = 5
  const baseX = tipX - unitX * arrowLength; const baseY = tipY - unitY * arrowLength
  const controlTwoX = baseX - unitX * bend; const controlTwoY = baseY - unitY * bend
  const normalX = -unitY; const normalY = unitX
  return {
    d: `M ${startX} ${startY} C ${startX} ${startY + bend}, ${controlTwoX} ${controlTwoY}, ${baseX} ${baseY}`,
    points: `${tipX},${tipY} ${baseX + normalX * arrowHalfWidth},${baseY + normalY * arrowHalfWidth} ${baseX - normalX * arrowHalfWidth},${baseY - normalY * arrowHalfWidth}`,
    tip: { x: tipX, y: tipY },
    base: { x: baseX, y: baseY },
  }
}

function edgePath(from, to) { return edgeGeometry(from, to).d }

export default function DependencyGraphModal({ task, onClose }) {
  const graph = useQuery({ queryKey: ['planning', 'dependency-graph', task.id], queryFn: () => getDependencyGraph(task.id) })
  const viewportRef = useRef(null)
  const resizeRef = useRef(null)
  const [pan, setPan] = useState(null)
  const [size, setSize] = useState(initialSize)
  const layout = useMemo(() => graphLayout(graph.data?.nodes ?? [], graph.data?.edges ?? []), [graph.data])
  useEffect(() => { function onKeyDown(event) { if (event.key === 'Escape') onClose() }; window.addEventListener('keydown', onKeyDown); return () => window.removeEventListener('keydown', onKeyDown) }, [onClose])
  useEffect(() => {
    function constrainToViewport() { setSize((current) => clampSize(current)) }
    window.addEventListener('resize', constrainToViewport)
    return () => window.removeEventListener('resize', constrainToViewport)
  }, [])
  useEffect(() => {
    function moveResize(event) {
      const resize = resizeRef.current
      if (!resize) return
      setSize(clampSize({ width: resize.width + event.clientX - resize.x, height: resize.height + event.clientY - resize.y }))
    }
    function finishResize() {
      if (!resizeRef.current) return
      resizeRef.current = null
      setSize((current) => { persistSize(current); return current })
    }
    window.addEventListener('pointermove', moveResize)
    window.addEventListener('pointerup', finishResize)
    window.addEventListener('pointercancel', finishResize)
    return () => { window.removeEventListener('pointermove', moveResize); window.removeEventListener('pointerup', finishResize); window.removeEventListener('pointercancel', finishResize) }
  }, [])
  useEffect(() => { const viewport = viewportRef.current; const position = layout.positions.get(task.id); if (!viewport || !position) return; viewport.scrollLeft = Math.max(0, position.x + NODE_WIDTH / 2 - viewport.clientWidth / 2); viewport.scrollTop = Math.max(0, position.y + NODE_HEIGHT / 2 - viewport.clientHeight / 2) }, [layout, task.id])
  function startPan(event) { if (event.button !== 0 || event.target.closest('button, article')) return; event.currentTarget.setPointerCapture?.(event.pointerId); setPan({ x: event.clientX, y: event.clientY, left: event.currentTarget.scrollLeft, top: event.currentTarget.scrollTop }) }
  function movePan(event) { if (!pan) return; event.currentTarget.scrollLeft = pan.left - (event.clientX - pan.x); event.currentTarget.scrollTop = pan.top - (event.clientY - pan.y) }
  function startResize(event) {
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture?.(event.pointerId)
    resizeRef.current = { x: event.clientX, y: event.clientY, width: size.width, height: size.height }
  }
  const modal = <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#080716]/45 p-3 backdrop-blur-md" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section data-testid="dependency-graph-modal" role="dialog" aria-modal="true" aria-labelledby="dependency-graph-title" className="relative flex flex-col overflow-hidden rounded-3xl border border-white/15 border-t-white/45 border-l-white/35 border-r-white/12 border-b-white/10 bg-[#242044]/58 text-white shadow-[0_8px_24px_rgba(5,4,25,0.28),0_28px_72px_rgba(3,2,18,0.52),inset_1px_1px_0_rgba(255,255,255,0.16),inset_-1px_-1px_0_rgba(12,9,42,0.2)] backdrop-blur-2xl" style={{ width: size.width, height: size.height, maxWidth: 'calc(100vw - 24px)', maxHeight: 'calc(100vh - 24px)' }}>
      <header className="flex items-center justify-between border-b border-white/10 bg-white/[0.025] px-5 py-3"><h2 id="dependency-graph-title" className="text-base font-semibold tracking-wide">Dependencies</h2><button type="button" aria-label="Close dependency graph" onClick={onClose} className="rounded-lg p-1.5 text-white/70 transition hover:bg-white/10 hover:text-white"><X size={20} /></button></header>
      <div className="min-h-0 flex-1 p-3 sm:p-4">
        {graph.isLoading && <p role="status" className="grid h-full place-items-center text-sm text-white/65">Loading dependency graph…</p>}
        {graph.isError && <p role="alert" className="grid h-full place-items-center text-sm text-red-200">Could not load the dependency graph. <button type="button" onClick={() => graph.refetch()} className="ml-1 underline">Retry</button></p>}
        {graph.isSuccess && graph.data.edges.length === 0 && <p className="grid h-full place-items-center text-sm text-white/65">This task has no dependencies.</p>}
        {graph.isSuccess && graph.data.edges.length > 0 && <div ref={viewportRef} data-testid="dependency-graph-viewport" className="h-full overflow-x-auto overflow-y-auto rounded-2xl border border-white/12 border-t-white/20 bg-[#0c0b1e]/42 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] touch-pan-x touch-pan-y" onPointerDown={startPan} onPointerMove={movePan} onPointerUp={() => setPan(null)} onPointerCancel={() => setPan(null)}>
          <div aria-label="Dependency graph" className="relative" style={{ width: layout.width, height: layout.height }}>
            <svg aria-hidden="true" className="pointer-events-none absolute inset-0 z-0 overflow-visible" viewBox={`0 0 ${layout.width} ${layout.height}`} width={layout.width} height={layout.height}>{graph.data.edges.map((edge) => { const from = layout.positions.get(edge.prerequisite_id); const to = layout.positions.get(edge.dependent_id); if (!from || !to) return null; const geometry = edgeGeometry(from, to); const key = `${edge.prerequisite_id}-${edge.dependent_id}`; return <g key={key} data-testid={`dependency-edge-${key}`}><path d={geometry.d} fill="none" stroke="#aebeff" strokeWidth="2.25" /><polygon data-testid={`dependency-arrowhead-${key}`} points={geometry.points} fill="#aebeff" /></g> })}</svg>
            {graph.data.nodes.map((node) => { const position = layout.positions.get(node.id); if (!position) return null; const highlighted = node.id === task.id; const ancestry = (node.ancestry ?? []).map((ancestor) => ancestor.title || 'Untitled task').join(' / '); const description = node.description?.trim(); return <article key={node.id} data-testid={`dependency-node-${node.id}`} tabIndex={0} aria-label={`${node.title || 'Untitled task'}, ${ancestry || 'Root level'}, task ID ${node.id}`} className={`group absolute z-10 flex h-[92px] w-56 flex-col justify-center rounded-2xl border px-4 shadow-lg outline-none transition focus:z-30 hover:z-30 focus-visible:ring-2 focus-visible:ring-white/90 ${highlighted ? 'border-[#e7f6a7] bg-[#c9dd75] text-[#191b35]' : 'border-[#8298ef]/70 bg-[#353879] text-white'}`} style={{ left: position.x, top: position.y }} title={`${node.title || 'Untitled task'} · ${ancestry || 'Root level'} · #${node.id}`}><span className="truncate text-sm font-semibold">{node.title || 'Untitled task'}</span><span className={`mt-1 truncate text-xs ${highlighted ? 'text-[#343747]/80' : 'text-[#dce2ff]/80'}`} title={ancestry || 'Root-level task'}>{ancestry || 'Root level'}</span>{description && <span data-testid={`dependency-description-${node.id}`} role="tooltip" className={`invisible absolute left-0 top-full z-40 -mt-px max-h-40 w-56 translate-y-1 overflow-y-auto rounded-b-2xl border px-3 py-2 text-xs leading-5 opacity-0 shadow-[0_14px_28px_rgba(5,4,25,0.38)] transition-[opacity,transform,visibility] duration-200 motion-reduce:transition-none group-hover:visible group-hover:translate-y-0 group-hover:opacity-100 group-focus:visible group-focus:translate-y-0 group-focus:opacity-100 ${highlighted ? 'border-[#e7f6a7]/70 bg-[#dceba3] text-[#191b35]' : 'border-[#8298ef]/70 bg-[#2b2e69] text-white'}`}>{description}</span>}</article> })}
          </div>
        </div>}
      </div>
      <div data-testid="dependency-graph-resize-handle" aria-label="Resize dependency graph" className="absolute bottom-1 right-1 h-5 w-5 cursor-se-resize touch-none opacity-60 transition hover:opacity-100" onPointerDown={startResize}>
        <span className="absolute bottom-1 right-1 h-2.5 w-2.5 border-b-2 border-r-2 border-white/70" />
      </div>
    </section>
  </div>
  return createPortal(modal, document.body)
}

export { GAP_X, graphLayout, edgeGeometry, edgePath }
