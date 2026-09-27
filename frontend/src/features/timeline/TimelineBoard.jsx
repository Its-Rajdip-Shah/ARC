import { useCallback, useRef, useState } from 'react'
import {
  inRange,
  intervalGeometry,
  packLanes,
  colourZones,
  packTaskLanes,
  TASK_CARD_COLLISION_WIDTH,
  todayKey,
  concentratedItems,
  isPersistentConcentration,
} from './timelineDates'
import TimelineCard from './TimelineCard'

function Constraint({ item, geometry, scale, find, actions, flat }) {
  const { constraint, markers, card } = geometry
  const safeUrl = /^https?:\/\//i.test(item.submission_url ?? '') ? item.submission_url : null
  return <div className="timeline-constraints">
    {constraint && <span className="timeline-constraint-line" style={constraint} />}
    {markers.filter(({ popped }) => !popped).map(({ field, x }) => {
      const release = field === 'start_date'
      const Tag = !release && safeUrl ? 'a' : 'span'
      return <span key={field}>
        <Tag className={'timeline-marker ' + (release ? 'timeline-release' : 'timeline-due')}
          style={{ left: x }} title={(release ? 'Release: ' : 'Due: ') + item[field]}
          role={Tag === 'span' ? 'img' : undefined}
          aria-label={(release ? 'Release: ' : 'Due: ') + item[field] + (Tag === 'a' ? ' · Open submission in new tab' : '')}
          {...(Tag === 'a' ? { href: safeUrl, target: '_blank', rel: 'noopener noreferrer' } : {})} />
      </span>
    })}
    {!card && constraint && <div className="timeline-constraint-preview" tabIndex={0}
      aria-label={'Preview ' + item.title} style={{ left: constraint.left, width: Math.max(1, constraint.width) }}>
      <div className="timeline-preview-card" style={{ left: Math.max(0, Math.min(constraint.left, scale.width - TASK_CARD_COLLISION_WIDTH)) - constraint.left }}>
        <TimelineCard item={item} find={find} actions={actions} flat={flat} readOnly />
      </div>
    </div>}
  </div>
}

export default function TimelineBoard({
  scale,
  items,
  data,
  grouped,
  find,
  actions,
  scrollRef,
}) {
  const cardRefs = useRef(new Map())
  const [previewColumn, setPreviewColumn] = useState(null)
  const [selectedColumn, setSelectedColumn] = useState(null)

  const registerRef = useCallback((id, node) => {
    if (node) cardRefs.current.set(id, node)
    else cardRefs.current.delete(id)
  }, [])

  const handleColumnClick = useCallback((column) => {
    setSelectedColumn((current) =>
      current?.from === column.from && current?.to === column.to
        ? null
        : column,
    )
  }, [])

  const visibleItems = concentratedItems(
    items,
    previewColumn,
    selectedColumn,
  )
  const persistentConcentration = isPersistentConcentration(
    previewColumn,
    selectedColumn,
  )

  const rootGroups = new Map()

  for (const item of visibleItems) {
    if (!rootGroups.has(item.root.id)) {
      rootGroups.set(item.root.id, [])
    }
    rootGroups.get(item.root.id).push(item)
  }

  const groups = grouped ? [...rootGroups.values()] : [visibleItems]

  const { assignments: rangeAssignments, laneCount } = packLanes(
    data.timezones ?? [],
    scale,
  )

  return (
    <div
      className="timeline-scroll"
      ref={scrollRef}
      tabIndex={0}
      aria-label="Scrollable Timeline"
    >
      <div
        className="timeline-board"
        style={{
          width: scale.width + 300,
          '--timeline-column': scale.columnWidth + 'px',
          '--timeline-width': scale.width + 'px',
        }}
      >
        <div className="timeline-axis" style={{ width: scale.width }}>
          {scale.columns.map((column) => (
            <button
              type="button"
              className={
                'timeline-date ' +
                (inRange(todayKey(), {
                  from: column.from,
                  to: column.to,
                })
                  ? 'timeline-current-date'
                  : '')
              }
              key={column.from}
              onMouseEnter={() => setPreviewColumn(column)}
              onMouseLeave={() => setPreviewColumn(null)}
              onFocus={() => setPreviewColumn(column)}
              onBlur={() => setPreviewColumn(null)}
              onClick={() => handleColumnClick(column)}
              aria-pressed={
                selectedColumn?.from === column.from &&
                selectedColumn?.to === column.to
              }
              title={'Focus ' + column.title + ' ' + column.subtitle}
            >
              <strong>{column.title}</strong>
              <span>{column.subtitle}</span>
            </button>
          ))}
        </div>

        {laneCount > 0 && (
          <div
            className="timeline-zone-lanes"
          >
            {colourZones(rangeAssignments, scale).map(({ zone, lane, colour }) => {
              const interval = intervalGeometry(
                zone.start_date,
                zone.end_date,
                scale,
                'end',
              )

              return (
                interval && (
                  <div
                    className="timeline-zone"
                    data-colour={colour}
                    key={zone.id}
                    style={{ width: interval.width, marginLeft: interval.left, gridRow: lane + 1 }}
                    title={
                      zone.title +
                      ': ' +
                      zone.start_date +
                      ' – ' +
                      zone.end_date
                    }
                  >
                    <span className="timeline-zone-label">{zone.title}</span>
                  </div>
                )
              )
            })}
          </div>
        )}

        {groups
          .filter((group) => group.length)
          .map((group) => {
            const lanes = packTaskLanes(group, scale)
            if (!lanes.length) return null

            return (
              <section key={grouped ? group[0].root.id : 'flat'}>
                {grouped && (
                  <h2 className="timeline-root">{group[0].root.title}</h2>
                )}

                {lanes.map((lane, index) => (
                  <div className={lane.some(({ geometry }) => geometry.markers.some(({ popped }) => popped)) ? 'timeline-row timeline-row-constrained' : 'timeline-row'} key={index}>
                    {lane.map(({ item, geometry }) => <div className={'timeline-task ' + (item.is_completed ? 'timeline-completed' : '')} key={item.id}>
                      <Constraint item={item} geometry={geometry} scale={scale} find={find} actions={actions} flat={!grouped} />
                      {geometry.card && <div className="timeline-card-position" style={{ left: geometry.card.left }} ref={(node) => registerRef(item.id, node)}>
                        <TimelineCard
                          item={item}
                          find={find}
                          actions={actions}
                          flat={!grouped}
                          expanded={persistentConcentration}
                        />
                        {geometry.markers.filter(({ popped }) => popped).map(({ field, x }) => {
                          const release = field === 'start_date'
                          const safeUrl = /^https?:\/\//i.test(item.submission_url ?? '') ? item.submission_url : null
                          const Tag = !release && safeUrl ? 'a' : 'span'
                          return <Tag
                            key={field}
                            className={'timeline-marker timeline-card-marker ' + (release ? 'timeline-release' : 'timeline-due')}
                            style={{ left: x - geometry.card.left }}
                            title={(release ? 'Release: ' : 'Due: ') + item[field]}
                            role={Tag === 'span' ? 'img' : undefined}
                            aria-label={(release ? 'Release: ' : 'Due: ') + item[field] + (Tag === 'a' ? ' · Open submission in new tab' : '')}
                            {...(Tag === 'a' ? { href: safeUrl, target: '_blank', rel: 'noopener noreferrer' } : {})}
                          />
                        })}
                      </div>}
                    </div>)}
                  </div>
                ))}
              </section>
            )
          })}
      </div>
    </div>
  )
}
