import { useEffect, useRef } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

export default function TimelineTaskNavigator({
  selectedRoots, rootLeafIndex, activeRootId, currentLeafByRoot,
  globalNavigation, navigateRoot,
  minimized, onSetMinimized, onSetActiveRoot, onSelectTask, onClose,
  position, setPosition,
}) {
  const drag = useRef(null)
  const panel = useRef(null)
  const root = selectedRoots.find((item) => item.id === activeRootId) ?? selectedRoots[0]
  const entries = rootLeafIndex.get(root?.id) ?? []

  function clampPosition(next) {
    const width = panel.current?.getBoundingClientRect().width ?? 340
    const headerHeight = panel.current?.querySelector('header')?.offsetHeight || 40
    const tabsHeight = panel.current?.querySelector('.timeline-task-navigator-tabs')?.offsetHeight || 40
    const minimumPanelHeight = headerHeight + tabsHeight + 16
    panel.current?.style.setProperty('--timeline-navigator-min-height', `${minimumPanelHeight}px`)
    return {
      x: Math.max(0, Math.min(window.innerWidth - width, next.x)),
      y: Math.max(0, Math.min(window.innerHeight - minimumPanelHeight, next.y)),
    }
  }

  useEffect(() => {
    function resize() {
      const rect = panel.current?.getBoundingClientRect()
      const next = clampPosition(position ?? { x: rect?.left ?? 0, y: rect?.top ?? 0 })
      if (position && setPosition && (next.x !== position.x || next.y !== position.y)) setPosition(next)
    }
    resize()
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [position, setPosition])

  function finishDrag(event) {
    if (!drag.current || drag.current.pointerId !== event.pointerId) return
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    drag.current = null
  }

  return (
    <section ref={panel} className="timeline-task-navigator" aria-label="Root task navigator"
      style={position ? { left: position.x, '--timeline-navigator-top': `${position.y}px`, right: 'auto' } : undefined}>
      <header className="timeline-task-navigator-header"
        onPointerDown={(event) => {
          if (event.button !== 0 || event.target.closest('button, [role="tab"]')) return
          const rect = panel.current.getBoundingClientRect()
          drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, panelX: rect.left, panelY: rect.top }
          event.currentTarget.setPointerCapture(event.pointerId)
          event.preventDefault()
        }}
        onPointerMove={(event) => {
          const origin = drag.current
          if (!origin || origin.pointerId !== event.pointerId) return
          setPosition(clampPosition({
            x: origin.panelX + event.clientX - origin.x,
            y: origin.panelY + event.clientY - origin.y,
          }))
        }}
        onPointerUp={finishDrag} onPointerCancel={finishDrag} onLostPointerCapture={() => { drag.current = null }}>
        <strong>Root tasks</strong>
        <div
          role="group"
          aria-label="Global root task navigation"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            flexShrink: 0,
          }}
        >
          <button
            type="button"
            aria-label="Previous global root task"
            disabled={!globalNavigation?.count}
            onClick={() => globalNavigation?.navigate(-1)}
            style={{ display: 'grid', placeItems: 'center', padding: 4 }}
          >
            <ChevronLeft size={15} />
          </button>
          <span
            aria-live="polite"
            style={{
              fontSize: 12,
              minWidth: '4.5ch',
              textAlign: 'center',
              whiteSpace: 'nowrap',
            }}
          >
            {globalNavigation?.count
              ? `${Math.max(1, globalNavigation.index + 1)}/${globalNavigation.count}`
              : '0/0'}
          </span>
          <button
            type="button"
            aria-label="Next global root task"
            disabled={!globalNavigation?.count}
            onClick={() => globalNavigation?.navigate(1)}
            style={{ display: 'grid', placeItems: 'center', padding: 4 }}
          >
            <ChevronRight size={15} />
          </button>
        </div>
        <button type="button" aria-label={minimized ? 'Maximize task navigator' : 'Minimize task navigator'} onClick={() => onSetMinimized(!minimized)}>{minimized ? '+' : '−'}</button>
        <button type="button" aria-label="Close task navigator" onClick={onClose}>×</button>
      </header>
      <div className="timeline-task-navigator-tabs" role="group" aria-label="Selected roots">
        {selectedRoots.map((item) => {
          const rootEntries = rootLeafIndex.get(item.id) ?? []
          const navigable = rootEntries.filter((entry) => entry.date != null)
          const currentIndex = navigable.findIndex(
            (entry) => entry.id === currentLeafByRoot[item.id],
          )
          const position = navigable.length ? Math.max(1, currentIndex + 1) : 0
          const missing = rootEntries.length - navigable.length

          return (
            <div className="timeline-task-navigator-root" key={item.id}>
              <button
                type="button"
                aria-pressed={item.id === root?.id}
                onClick={() => onSetActiveRoot(item.id)}
                title={item.title}
              >
                {item.title}
              </button>
              <div
                className="timeline-root-navigation"
                role="group"
                aria-label={`Tasks in ${item.title}`}
              >
                <button
                  type="button"
                  className="timeline-root-navigation-arrow"
                  disabled={!navigable.length}
                  aria-label={`Previous task in ${item.title}`}
                  onClick={() => navigateRoot(item.id, -1)}
                >
                  <ChevronLeft size={14} />
                </button>
                <span className="timeline-root-navigation-count">
                  {position}/{navigable.length}
                </span>
                <button
                  type="button"
                  className="timeline-root-navigation-arrow"
                  disabled={!navigable.length}
                  aria-label={`Next task in ${item.title}`}
                  onClick={() => navigateRoot(item.id, 1)}
                >
                  <ChevronRight size={14} />
                </button>
              </div>
              {missing > 0 && (
                <small className="timeline-root-navigation-missing">
                  {missing} schedule unavailable
                </small>
              )}
            </div>
          )
        })}
      </div>
      {!minimized && (
        <div className="timeline-task-navigator-list">
          {!entries.length && <p>No leaf tasks to navigate.</p>}
          {entries.some((entry) => entry.missingSchedule) && <p role="status">Schedule unavailable: unresolved scheduler/navigation data. These tasks cannot be navigated until a schedule is available.</p>}
          {entries.map((entry) => (
            <button type="button" key={entry.id} disabled={entry.missingSchedule}
              aria-current={currentLeafByRoot[root.id] === entry.id ? 'true' : undefined}
              className={entry.isCompleted ? 'timeline-task-navigator-completed' : undefined}
              onClick={() => onSelectTask(entry, root.id)}>
              <span>{entry.title}</span>
              <small>{entry.date ?? 'Schedule unavailable'}{entry.isCompleted ? ' · Completed' : ''}</small>
            </button>
          ))}
        </div>
      )}
    </section>
  )
}
