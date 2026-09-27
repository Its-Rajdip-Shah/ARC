import { useMemo, useRef, useState } from 'react'
import { useAuthStore } from '../../stores/authStore'
import { usePlanningTree } from '../../hooks/usePlanningTree'
import useTimelinePreferences from './useTimelinePreferences'
import TimelineSidebar from './TimelineSidebar'
import { useTimeline } from '../../hooks/useTimeline'
import usePriorityFind from '../planner/hooks/usePriorityFind'
import useTimelineActions from './useTimelineActions'
import TimelineToolbar from './TimelineToolbar'
import TimelineBoard from './TimelineBoard'
import CapacityPanel from './CapacityPanel'
import { makeScale, shiftDate, todayKey } from './timelineDates'
import '../planner/components/PriorityPanel.css'
import './Timeline.css'

export default function TimelinePage() {
  const userId = useAuthStore((state) => state.user?.id)
  return <TimelineContent key={userId ?? 'anonymous'} userId={userId} />
}

function TimelineContent({ userId }) {
  const [anchor, setAnchor] = useState(todayKey)
  const [options, update] = useTimelinePreferences(userId)
  const zoom = options.zoom
  const tree = usePlanningTree()
  const roots = tree.data ?? []
  const selectedRoots = useMemo(() => tree.data
    ? options.roots.filter((id) => tree.data.some((root) => root.id === id))
    : options.roots, [tree.data, options.roots])
  const [contextOpen, setContextOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const scrollRef = useRef(null)
  const scale = useMemo(() => makeScale(anchor, zoom), [anchor, zoom])
  const query = useTimeline({ from: scale.from, to: scale.to })
  const actions = useTimelineActions()
  const allItems = useMemo(() => (query.data?.groups ?? []).flatMap((group) => group.items.map((item) => ({ ...item, root: group.root }))), [query.data])
  const items = useMemo(() => allItems.filter((item) =>
    (options.completed || !item.is_completed) &&
    (options.type === 'all' || item.item_type === (options.type === 'assignments' ? 'ASSIGNMENT' : 'TASK')) &&
    (options.duration === 'all' ||
      (options.duration === 'short' && item.duration_category === 'UNDER_20_MIN') ||
      (options.duration === 'medium' && item.duration_category === 'MIN_20_TO_60') ||
      (options.duration === 'long' && item.duration_category === 'OVER_60_MIN')) &&
    (!selectedRoots.length || selectedRoots.includes(item.root.id)))
    .sort((a, b) => (a.scheduled_date ?? '9999').localeCompare(b.scheduled_date ?? '9999') || (a.priority_position ?? Infinity) - (b.priority_position ?? Infinity) || a.id - b.id), [allItems, options, selectedRoots])
  const findRows = useMemo(() => items.map((item) => ({ ...item, item_id: item.id })), [items])
  const paths = useMemo(() => new Map(items.map((item) => [item.id, [{ title: item.root.title }, ...(item.hierarchy_path ?? [])]])), [items])
  const find = usePriorityFind(findRows, paths)
  function jump(date = todayKey()) {
    setAnchor(date)
    scrollRef.current?.scrollTo({ left: 0, top: 0 })
  }
  return <div className="timeline-page">
    <TimelineSidebar roots={roots} selected={selectedRoots} loading={tree.isPending} error={tree.isError} retry={() => tree.refetch()}
      toggle={(id) => update({ roots: selectedRoots.includes(id) ? selectedRoots.filter((root) => root !== id) : [...selectedRoots, id] })} />
    <h1 className="timeline-heading arc-display">Timeline</h1>
    <TimelineToolbar find={find} actions={actions} anchor={anchor} zoom={zoom} setZoom={(value) => { update({ zoom: value }); scrollRef.current?.scrollTo({ left: 0 }) }}
      navigate={(amount) => jump(shiftDate(anchor, zoom, amount))} jump={jump} options={options} update={update}
      contextOpen={contextOpen} toggleContext={() => setContextOpen((value) => !value)}
      settingsOpen={settingsOpen} toggleSettings={() => setSettingsOpen((value) => !value)} />
    {actions.error && <p className="timeline-message timeline-error" role="alert">{actions.error}</p>}
    {actions.history.isError && <p className="timeline-message" role="alert">History is unavailable. <button onClick={() => actions.history.refetch()}>Retry history</button></p>}
    {settingsOpen && query.data?.capacities && <CapacityPanel capacities={query.data.capacities} actions={actions} close={() => setSettingsOpen(false)} />}
    {contextOpen && <section className="timeline-context-panel" aria-label="Context ranges">
      <strong>Context ranges</strong>
      {(query.data?.timezones ?? []).map((zone) => <p key={zone.id}>{zone.title} · {zone.start_date} – {zone.end_date}</p>)}
      {!query.data?.timezones?.length && <p>No context ranges in this window.</p>}
      <small>Range editing is not available yet.</small>
    </section>}
    {query.isPending ? <p className="timeline-message" role="status">Loading Timeline…</p>
      : query.isError ? <p className="timeline-message timeline-error" role="alert">Timeline could not load. <button onClick={() => query.refetch()}>Retry</button></p>
        : <>
          {query.data.conflicts?.length > 0 && <details className="timeline-message"><summary>{query.data.conflicts.length} scheduling issue(s)</summary>
            <ul>{query.data.conflicts.map((conflict) => <li key={conflict.item_id + conflict.code}>{allItems.find((item) => item.id === conflict.item_id)?.title ?? 'Item ' + conflict.item_id}: {conflict.code.replaceAll('_', ' ')}</li>)}</ul>
          </details>}
          {!items.length && <p className="timeline-message">No visible items in this range. Change dates or enable completed items.</p>}
          <TimelineBoard scale={scale} items={items} data={query.data} grouped={options.grouped} find={find} actions={actions} scrollRef={scrollRef} />
        </>}
  </div>
}
